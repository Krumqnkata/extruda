// SPDX-License-Identifier: AGPL-3.0-or-later
// Tools for finished models from elsewhere: convert, check and repair, orient, cut to fit the bed.
import { download, fileSafe, objectsTo3MF, partsToSTL, to3MF, toOBJ, zipFiles } from '../core/export';
import { arrangeOnPlates, type PlateModel } from '../core/layout';
import { parseFile } from '../core/loadMesh';
import { build, toTriMesh } from '../core/manifold';
import { meshStats, type Part, type TriMesh } from '../core/mesh';
import { analyzeMesh, overhangMap, repairMesh, thinWallMap, toSolid, type FaceMap, type MeshReport } from '../core/meshcheck';
import { applyMatrix, cutToFit, mirrorMatrix, orientChoices, quarterTurn, scaleMatrix, settleOnBed, type OrientChoice } from '../core/meshops';
import { parseHash } from '../core/share';
import { Viewer, type ViewPart } from '../core/viewer';
import { fmt, t, tr } from '../i18n';
import { button, check, debounce, el, hint, number, persisted, range, save, section, segmented, type Ctl } from '../ui/form';
import { icons } from '../ui/icons';
import { toolShell } from '../ui/modelTool';
import { bedControls, bedSize, PLATE_DEFAULTS, type PlateState } from '../ui/plate';

type Tab = 'convert' | 'check' | 'orient' | 'cut';

const TABS: { id: Tab; label: readonly [string, string] }[] = [
  { id: 'convert', label: ['Convert', 'Конвертор'] },
  { id: 'check', label: ['Check & repair', 'Проверка и поправка'] },
  { id: 'orient', label: ['Orient', 'Ориентация'] },
  { id: 'cut', label: ['Cut to fit', 'Рязане'] },
];

const DEFAULTS = {
  ...PLATE_DEFAULTS,
  scale: 100,
  mirrorX: false,
  mirrorY: false,
  simplify: 0,
  map: 'none',
  overhangLimit: 45,
  minWall: 0.8,
  bedZ: 250,
  dowels: true,
  dowel: 5,
  clearance: 0.3,
};
type State = typeof DEFAULTS & PlateState;

const MODEL_COLOR = '#94a3b8';

// The open model stays in memory while moving between tools and languages. It is never stored or uploaded.
let session: { name: string; original: TriMesh; base: TriMesh } | undefined;

const baseName = () => fileSafe((session?.name ?? 'model').replace(/\.[^.]+$/, ''));

export function mount(container: HTMLElement): () => void {
  const tab = (TABS.find((x) => x.id === parseHash(location.hash).path.split('/')[1]) ?? TABS[0]).id;
  const state = persisted('mesh', DEFAULTS) as State;
  const shell = toolShell(t('tool.mesh.title'), t('tool.mesh.desc'));
  shell.root.classList.add('analyzer');
  container.append(shell.root);
  const viewer = new Viewer(shell.host);
  let disposed = false;
  let current: TriMesh | undefined; // the model after the convert settings
  let cutModels: PlateModel[] = [];
  let generation = 0;

  const setStatus = (msg: string, kind: 'ok' | 'busy' | 'error' = 'ok') => {
    shell.status.textContent = msg;
    shell.status.dataset.kind = kind;
  };
  const describe = (mesh: TriMesh) => {
    const s = meshStats(mesh);
    return t('s.ready', { tris: s.triangles.toLocaleString(), x: fmt(s.size[0]), y: fmt(s.size[1]), z: fmt(s.size[2]) });
  };
  const notClosed = tr(['This model is not a closed solid. Repair it first under Check & repair.', 'Този модел не е затворено тяло. Първо го поправи в Проверка и поправка.']);

  /** Runs slow work after the status has had a chance to paint. */
  const work = (job: () => Promise<void> | void) => {
    const gen = ++generation;
    setStatus(t('s.building'), 'busy');
    setTimeout(async () => {
      if (disposed || gen !== generation) return;
      try {
        await job();
      } catch (err) {
        console.error(err);
        setStatus(t('s.error', { msg: err instanceof Error ? err.message : String(err) }), 'error');
      }
    }, 16);
  };

  const showPlain = (mesh: TriMesh, fit = true) => {
    viewer.setParts([{ name: session?.name ?? 'Model', color: MODEL_COLOR, mesh }], { fit });
  };

  // ------------------------------------------------------------ convert

  const applySettings = async (): Promise<TriMesh | undefined> => {
    if (!session) return undefined;
    let mesh = session.base;
    if (state.scale !== 100) mesh = applyMatrix(mesh, scaleMatrix(state.scale / 100));
    if (state.mirrorX) mesh = applyMatrix(mesh, mirrorMatrix(0));
    if (state.mirrorY) mesh = applyMatrix(mesh, mirrorMatrix(1));
    if (state.simplify > 0) {
      const source = mesh;
      const reduced = await build((m) => {
        const solid = toSolid(m, source);
        return solid ? toTriMesh(solid.simplify(state.simplify)) : undefined;
      });
      if (!reduced) throw new Error(notClosed);
      mesh = reduced;
    }
    return settleOnBed(mesh);
  };

  const refreshConvert = (fit = false) =>
    work(async () => {
      current = await applySettings();
      if (!current || disposed) return;
      showPlain(current, fit);
      setStatus(describe(current));
    });
  const scheduleConvert = debounce(() => refreshConvert(), 200);

  const turn = (axis: 0 | 1 | 2) => {
    if (!session) return;
    session.base = applyMatrix(session.base, quarterTurn(axis));
    refreshConvert(true);
  };

  // ------------------------------------------------------------ check

  const reportBox = el('div', { class: 'results' });
  const mapNote = el('p', { class: 'hint' });

  const renderReport = (r: MeshReport) => {
    const row = (label: readonly [string, string], value: number, bad: boolean) =>
      el('div', { class: 'result' }, el('span', {}, tr(label)), el('output', { class: bad ? 'result-value bad' : 'result-value' }, value.toLocaleString()));
    reportBox.replaceChildren(
      el('p', { class: r.closed && r.outwardFacing ? 'verdict' : 'verdict is-bad' }, r.closed && r.outwardFacing
        ? tr(['Closed solid: ready to slice.', 'Затворено тяло: готово за слайсър.'])
        : tr(['This model has problems.', 'Този модел има проблеми.'])),
      row(['Triangles', 'Триъгълници'], r.triangles, false),
      row(['Separate bodies', 'Отделни тела'], r.bodies, false),
      row(['Open edges (holes)', 'Отворени ръбове (дупки)'], r.openEdges, r.openEdges > 0),
      row(['Edges shared by 3+ faces', 'Ръбове на 3+ стени'], r.overusedEdges, r.overusedEdges > 0),
      row(['Flipped neighbours', 'Обърнати съседи'], r.flippedEdges, r.flippedEdges > 0),
      row(['Empty triangles', 'Празни триъгълници'], r.degenerate, r.degenerate > 0),
    );
    if (!r.outwardFacing) reportBox.append(hint(tr(['The surface is inside out.', 'Повърхността е обърната навътре.'])));
  };

  const refreshCheck = (fit = false) =>
    work(async () => {
      if (!session) return;
      const mesh = session.base;
      renderReport(analyzeMesh(mesh));
      let map: FaceMap | undefined;
      if (state.map === 'overhang') map = overhangMap(settleOnBed(mesh), state.overhangLimit);
      if (state.map === 'thin') {
        map = await build((m) => {
          const solid = toSolid(m, mesh);
          return solid ? thinWallMap(solid, mesh, state.minWall) : undefined;
        });
        if (!map) throw new Error(notClosed);
      }
      if (disposed) return;
      if (map) {
        const part: ViewPart = { name: 'Map', color: MODEL_COLOR, mesh: map.mesh, colors: map.colors, lit: true };
        viewer.setParts([part], { fit });
        mapNote.textContent = tr([`Marked in red: ${fmt(map.flagged / 100)} cm², ${fmt(map.share * 100, 0)}% of the surface.`, `В червено: ${fmt(map.flagged / 100)} cm², ${fmt(map.share * 100, 0)}% от повърхността.`]);
      } else {
        showPlain(settleOnBed(mesh), fit);
        mapNote.textContent = '';
      }
      current = settleOnBed(mesh);
      setStatus(describe(current));
    });
  const scheduleCheck = debounce(() => refreshCheck(), 250);

  const repair = () =>
    work(async () => {
      if (!session) return;
      const source = session.base;
      const result = await build((m) => repairMesh(m, source));
      if (result.ok && result.mesh) {
        session.base = result.mesh;
        refreshCheck();
        // refreshCheck replaces the status; say what happened in the note after it finishes.
        repairNote.textContent = tr([
          `Repaired: ${result.holes} hole(s) closed, ${result.flipped} triangle(s) turned, ${result.removed} removed.`,
          `Поправено: затворени дупки ${result.holes}, обърнати триъгълници ${result.flipped}, премахнати ${result.removed}.`,
        ]);
      } else {
        repairNote.textContent = tr([
          'This model cannot be repaired automatically, so nothing was changed. Try a modelling program such as Blender or Meshmixer.',
          'Този модел не може да се поправи автоматично, затова нищо не е променено. Опитай с програма за моделиране като Blender или Meshmixer.',
        ]);
        setStatus(tr(['Repair failed.', 'Поправката не успя.']), 'error');
      }
    });
  const repairNote = el('p', { class: 'hint', role: 'status' });

  // ------------------------------------------------------------ orient

  const choicesBox = el('div', { class: 'orient-list' });

  const refreshOrient = (fit = false) =>
    work(async () => {
      if (!session) return;
      const mesh = session.base;
      const choices: OrientChoice[] = await build((m) => orientChoices(m, mesh));
      if (disposed) return;
      choicesBox.replaceChildren(
        ...choices.map((c, i) =>
          el(
            'div',
            { class: 'orient-choice' },
            el('strong', {}, i === 0 ? tr(['Best', 'Най-добра']) : tr([`Option ${i + 1}`, `Вариант ${i + 1}`])),
            el('p', { class: 'hint' }, tr([
              `Needs support: ${fmt(c.overhang / 100)} cm². On the bed: ${fmt(c.contact / 100)} cm². Height: ${fmt(c.height)} mm.`,
              `Иска подпори: ${fmt(c.overhang / 100)} cm². Върху плочата: ${fmt(c.contact / 100)} cm². Височина: ${fmt(c.height)} мм.`,
            ])),
            button(tr(['Apply', 'Приложи']), () => {
              if (!session) return;
              session.base = applyMatrix(session.base, c.rotation);
              refreshOrient(true);
            }, { primary: i === 0 }),
          ),
        ),
      );
      current = settleOnBed(mesh);
      showPlain(current, fit);
      setStatus(describe(current));
    });

  // ------------------------------------------------------------ cut

  const cutNote = el('p', { class: 'hint', role: 'status' });

  const refreshCut = (fit = true) =>
    work(async () => {
      if (!session) return;
      const mesh = settleOnBed(session.base);
      const [bedX, bedY] = bedSize(state);
      const result = await build((m) => {
        const solid = toSolid(m, mesh);
        if (!solid) return undefined;
        return cutToFit(m, solid, { bedX, bedY, bedZ: state.bedZ, margin: 5, dowel: state.dowels ? state.dowel : 0, clearance: state.clearance });
      });
      if (disposed) return;
      if (!result) {
        cutModels = [];
        cutNote.textContent = notClosed;
        showPlain(mesh, fit);
        setStatus(notClosed, 'error');
        return;
      }
      const models: PlateModel[] = result.pieces.map((piece, i) => ({
        name: `Piece ${i + 1}`,
        parts: [{ name: `Piece ${i + 1}`, color: MODEL_COLOR, mesh: piece }],
      }));
      result.dowels.forEach((pin, i) => models.push({ name: `Dowel ${i + 1}`, parts: [{ name: `Dowel ${i + 1}`, color: '#f59e0b', mesh: pin }] }));
      cutModels = models;
      // The preview lays everything out one plate after another.
      const plates = arrangeOnPlates(models, bedX, bedY, 4);
      const shown: Part[] = [];
      plates.forEach((plate, i) => {
        for (const model of plate) {
          for (const part of model.parts) {
            const positions = part.mesh.positions.slice();
            for (let v = 0; v < positions.length; v += 3) positions[v] += i * (bedX + 20);
            shown.push({ ...part, mesh: { positions, indices: part.mesh.indices } });
          }
        }
      });
      viewer.setParts(shown, { fit });
      const note = tr([
        `${result.pieces.length} piece(s), ${result.dowels.length} dowel(s), ${plates.length} plate(s).`,
        `Части: ${result.pieces.length}, щифтове: ${result.dowels.length}, плочи: ${plates.length}.`,
      ]);
      cutNote.textContent = result.pieces.length === 1
        ? tr(['This model already fits the bed.', 'Този модел вече се побира на плочата.'])
        : note;
      setStatus(note);
    });
  const scheduleCut = debounce(() => refreshCut(), 300);

  const downloadPlates = () => {
    if (!cutModels.length) return;
    const [bedX, bedY] = bedSize(state);
    const plates = arrangeOnPlates(cutModels, bedX, bedY, 4);
    if (plates.length === 1) {
      download(objectsTo3MF(plates[0], baseName()), `${baseName()}_cut.3mf`, 'model/3mf');
      return;
    }
    const files: Record<string, Uint8Array> = {};
    plates.forEach((plate, i) => (files[`${baseName()}_plate${i + 1}.3mf`] = objectsTo3MF(plate, `${baseName()} ${i + 1}`)));
    download(zipFiles(files), `${baseName()}_plates.zip`, 'application/zip');
  };

  const downloadStlZip = () => {
    if (!cutModels.length) return;
    const files: Record<string, Uint8Array> = {};
    for (const model of cutModels) files[`${baseName()}_${fileSafe(model.name)}.stl`] = partsToSTL(model.parts, model.name);
    download(zipFiles(files), `${baseName()}_stl.zip`, 'application/zip');
  };

  // ------------------------------------------------------------ page

  const refresh = (fit = false) => {
    if (tab === 'check') refreshCheck(fit);
    else if (tab === 'orient') refreshOrient(fit);
    else if (tab === 'cut') refreshCut(fit);
    else refreshConvert(fit);
  };

  const open = async (file: File | undefined) => {
    if (!file) return;
    setStatus(t('s.building'), 'busy');
    try {
      const mesh = await parseFile(file);
      if (!mesh.indices.length) throw new Error('empty');
      session = { name: file.name, original: mesh, base: mesh };
      repairNote.textContent = '';
      renderControls();
      refresh(true);
    } catch (err) {
      console.error(err);
      setStatus(t('stl.error'), 'error');
    }
  };

  const fileInput = el('input', { type: 'file', accept: '.stl,.3mf,.obj', hidden: true });
  fileInput.addEventListener('change', () => void open(fileInput.files?.[0]));
  const onDrag = (e: DragEvent) => {
    e.preventDefault();
    shell.root.classList.toggle('over', e.type === 'dragover');
  };
  shell.root.addEventListener('dragover', onDrag);
  shell.root.addEventListener('dragleave', onDrag);
  shell.root.addEventListener('drop', (e) => {
    e.preventDefault();
    shell.root.classList.remove('over');
    void open(e.dataTransfer?.files[0]);
  });

  const ctlFor = (schedule: () => void): Ctl<State> => ({
    state,
    change(structural) {
      save('mesh', state);
      if (structural) renderControls();
      schedule();
    },
  });

  const tabControls = (): Node[] => {
    if (tab === 'convert') {
      const ctl = ctlFor(scheduleConvert);
      return [
        section(
          tr(['Size and position', 'Размер и положение']),
          range(ctl, 'scale', tr(['Scale', 'Мащаб']), { min: 10, max: 400, step: 1, unit: '%' }),
          check(ctl, 'mirrorX', tr(['Mirror left to right', 'Огледално ляво-дясно'])),
          check(ctl, 'mirrorY', tr(['Mirror front to back', 'Огледално напред-назад'])),
          el(
            'div',
            { class: 'row' },
            button(tr(['Turn X', 'Завърти X']), () => turn(0)),
            button(tr(['Turn Y', 'Завърти Y']), () => turn(1)),
            button(tr(['Turn Z', 'Завърти Z']), () => turn(2)),
          ),
        ),
        section(
          tr(['Fewer triangles', 'По-малко триъгълници']),
          range(ctl, 'simplify', tr(['Allowed deviation (0 is off)', 'Допустимо отклонение (0 е изключено)']), { min: 0, max: 2, step: 0.01, unit: t('u.mm') }),
          hint(tr(['Makes heavy files lighter. Only works on closed solids. 0.05–0.1 mm is invisible on most prints.', 'Прави тежките файлове по-леки. Работи само със затворени тела. 0,05–0,1 мм не се виждат при повечето принтове.'])),
        ),
      ];
    }
    if (tab === 'check') {
      const ctl = ctlFor(scheduleCheck);
      return [
        section(tr(['Report', 'Резултат']), reportBox, button(tr(['Repair', 'Поправи']), repair, { primary: true, icon: icons.refresh }), repairNote),
        section(
          tr(['Show on the model', 'Покажи на модела']),
          segmented(ctl, 'map', tr(['Mark', 'Отбележи']), [
            ['none', tr(['Nothing', 'Нищо'])],
            ['overhang', tr(['Overhangs', 'Надвеси'])],
            ['thin', tr(['Thin walls', 'Тънки стени'])],
          ]),
          state.map === 'overhang' && range(ctl, 'overhangLimit', tr(['Limit from vertical', 'Граница от вертикалата']), { min: 20, max: 80, step: 1, unit: t('u.deg') }),
          state.map === 'thin' && range(ctl, 'minWall', tr(['Thinner than', 'По-тънко от']), { min: 0.2, max: 5, step: 0.1, unit: t('u.mm') }),
          state.map === 'thin' && hint(tr(['Large models are sampled, so treat this as a guide. Two nozzle widths (0.8 mm) is a common minimum.', 'Големите модели се проверяват на извадка, затова е ориентировъчно. Две ширини на дюзата (0,8 мм) е обичаен минимум.'])),
          mapNote,
        ),
      ];
    }
    if (tab === 'orient') {
      return [
        section(tr(['Suggested positions', 'Предложени положения']), choicesBox, hint(tr(['Less support comes first, then more bed contact. Looks and strength are your call: layers are weakest when pulled apart.', 'Първо е с по-малко подпори, после с повече контакт с плочата. Външният вид и здравината зависят от теб: слоевете са най-слаби при разделяне.']))),
      ];
    }
    const ctl = ctlFor(scheduleCut);
    return [
      section(
        tr(['Printer', 'Принтер']),
        ...bedControls(ctl),
        number(ctl, 'bedZ', tr(['Printable height', 'Височина за печат']), { unit: t('u.mm'), min: 20 }),
        cutNote,
      ),
      section(
        tr(['Joining the pieces', 'Сглобяване']),
        check(ctl, 'dowels', tr(['Sockets and loose dowels', 'Гнезда и отделни щифтове'])),
        state.dowels && range(ctl, 'dowel', tr(['Dowel diameter', 'Диаметър на щифта']), { min: 2, max: 12, step: 0.5, unit: t('u.mm') }),
        state.dowels && range(ctl, 'clearance', t('f.clearance'), { min: 0, max: 0.8, step: 0.05, unit: t('u.mm') }),
        hint(tr(['Glue the pieces with the dowels in place. Sockets are skipped where the wall is too thin to hold one.', 'Залепи частите с поставени щифтове. Гнезда няма там, където стената е твърде тънка.'])),
      ),
    ];
  };

  const renderControls = () => {
    shell.controls.replaceChildren(
      el(
        'div',
        { class: 'chips', role: 'navigation' },
        ...TABS.map((x) => el('a', { class: x.id === tab ? 'chip active' : 'chip', href: `#/mesh/${x.id}`, 'aria-current': x.id === tab ? 'page' : null }, tr(x.label))),
      ),
      el(
        'button',
        { type: 'button', class: 'drop', onclick: () => fileInput.click() },
        el('span', { class: 'icon', html: icons.upload, 'aria-hidden': 'true' }),
        el('span', {}, session ? session.name : t('stl.drop')),
      ),
      fileInput,
      ...(session
        ? [
            ...tabControls(),
            el('div', { class: 'panel-foot' }, button(tr(['Back to the original file', 'Обратно към оригиналния файл']), () => {
              if (!session) return;
              session.base = session.original;
              repairNote.textContent = '';
              refresh(true);
            }, { icon: icons.refresh })),
          ]
        : [hint(t('stl.hint'))]),
    );
  };

  const needsModel = (fn: () => void) => () => {
    if (session) fn();
  };
  if (tab === 'cut') {
    shell.actions.append(
      button(t('a.plate'), needsModel(downloadPlates), { primary: true, icon: icons.grid }),
      button(tr(['STL ZIP', 'STL ZIP']), needsModel(downloadStlZip), { icon: icons.zip }),
    );
  } else {
    const dl = (fn: (mesh: TriMesh) => void) => needsModel(() => {
      if (current) fn(current);
    });
    shell.actions.append(
      button(t('a.stl'), dl((mesh) => download(partsToSTL([{ name: baseName(), color: MODEL_COLOR, mesh }], 'Extruda'), `${baseName()}_extruda.stl`, 'model/stl')), { primary: true, icon: icons.download }),
      button(t('a.3mf'), dl((mesh) => download(to3MF([{ name: baseName(), color: MODEL_COLOR, mesh }], baseName()), `${baseName()}_extruda.3mf`, 'model/3mf')), { icon: icons.layers }),
      button('OBJ', dl((mesh) => download(toOBJ(mesh, baseName()), `${baseName()}_extruda.obj`, 'text/plain')), { icon: icons.cube }),
    );
  }
  shell.actions.append(el('button', { type: 'button', class: 'btn icon-only', title: t('a.reset'), 'aria-label': t('a.reset'), onclick: () => viewer.resetView(), html: icons.view }));

  renderControls();
  if (session) refresh(true);
  else setStatus(t('stl.hint'));

  return () => {
    disposed = true;
    viewer.dispose();
  };
}
