// SPDX-License-Identifier: AGPL-3.0-or-later
// Paste OpenSCAD code, get sliders and a model. The engine downloads only when first used.
import { download, fileSafe, partsToSTL, to3MF } from '../core/export';
import { parseMesh, weldVertices } from '../core/loadMesh';
import type { Part } from '../core/mesh';
import { parseScadParams, SCAD_EXAMPLES, toDefines, type ScadParam, type ScadValue } from '../core/scad';
import { decodeState, encodeState, parseHash } from '../core/share';
import { Viewer } from '../core/viewer';
import { t, tr } from '../i18n';
import { button, check, debounce, el, hint, number, range, save, persisted, section, select, text, type Ctl } from '../ui/form';
import { icons } from '../ui/icons';
import { statusText, toolShell } from '../ui/modelTool';
import type { ScadRequest } from './openscad.worker';

const DEFAULTS = { source: SCAD_EXAMPLES[0].source, example: SCAD_EXAMPLES[0].id, auto: true, color: '#22c55e' };
type Values = Record<string, ScadValue>;

/** Links longer than this get cut off by some apps. */
const MAX_LINK_CODE = 6000;

export function mount(container: HTMLElement): () => void {
  const state = persisted('openscad', DEFAULTS);
  const values: Values = {};
  let fromLink = false;
  const shared = parseHash(location.hash).params.get('s');
  if (shared) {
    const link = decodeState(shared, { source: '', values: {} as Values });
    if (link.source) {
      state.source = link.source;
      Object.assign(values, link.values);
      fromLink = true;
    }
  }

  const shell = toolShell(t('tool.openscad.title'), t('tool.openscad.desc'));
  container.append(shell.root);
  const viewer = new Viewer(shell.host);
  let worker: Worker | undefined;
  let running = false;
  let everRendered = false;
  let firstFit = true;
  let parts: Part[] = [];
  let params: ScadParam[] = parseScadParams(state.source);

  const logBox = el('pre', { class: 'scad-log' });
  const paramsBox = el('div', { class: 'section-body' });
  const runBtn = button(tr(['Render', 'Генерирай']), () => render(), { primary: true, icon: icons.cube });
  const stopBtn = button(tr(['Stop', 'Спри']), () => stop());
  stopBtn.disabled = true;

  const setStatus = (s: string, kind = 'ok') => {
    shell.status.textContent = s;
    shell.status.dataset.kind = kind;
  };
  const setRunning = (on: boolean) => {
    running = on;
    stopBtn.disabled = !on;
  };

  const stop = () => {
    worker?.terminate();
    worker = undefined;
    setRunning(false);
    setStatus(tr(['Stopped.', 'Спряно.']));
  };

  const render = () => {
    // A new request replaces one still running, so only the latest settings count.
    if (running) {
      worker?.terminate();
      worker = undefined;
    }
    setRunning(true);
    setStatus(everRendered
      ? t('s.building')
      : tr(['Loading OpenSCAD (about 11 MB, first time only)…', 'Зареждане на OpenSCAD (около 11 MB, само първия път)…']), 'busy');
    try {
      worker ??= new Worker(new URL('./openscad.worker.ts', import.meta.url), { type: 'module' });
    } catch (err) {
      console.error(err);
      setRunning(false);
      setStatus(tr(['This browser cannot run OpenSCAD.', 'Този браузър не може да стартира OpenSCAD.']), 'error');
      return;
    }
    worker.onerror = (e) => {
      console.error(e.message);
      worker = undefined;
      setRunning(false);
      setStatus(navigator.onLine === false
        ? tr(['OpenSCAD has not been downloaded yet and you are offline.', 'OpenSCAD още не е изтеглен, а нямаш интернет.'])
        : tr(['OpenSCAD could not be loaded. Try again.', 'OpenSCAD не можа да се зареди. Опитай пак.']), 'error');
    };
    worker.onmessage = (e: MessageEvent<{ stl?: string; log: string[]; failed?: boolean }>) => {
      setRunning(false);
      logBox.textContent = e.data.log.join('\n');
      if (!e.data.stl) {
        logBox.parentElement?.closest('details')?.setAttribute('open', '');
        const empty = e.data.log.some((l) => /empty|Current top level object is not a 3D object/i.test(l));
        setStatus(empty
          ? tr(['The script made nothing 3D to print.', 'Скриптът не създаде 3D модел.'])
          : tr(['The script has an error: see the log.', 'Скриптът има грешка: виж дневника.']), 'error');
        return;
      }
      const buf = new TextEncoder().encode(e.data.stl).buffer;
      const mesh = weldVertices(parseMesh(buf as ArrayBuffer, 'model.stl'));
      parts = [{ name: 'OpenSCAD', color: state.color, mesh }];
      viewer.setParts(parts, { fit: firstFit });
      firstFit = false;
      everRendered = true;
      setStatus(statusText(parts));
    };
    const request: ScadRequest = { source: state.source, defines: toDefines(params, values) };
    worker.postMessage(request);
  };
  const scheduleRender = debounce(() => {
    if (everRendered && state.auto) render();
  }, 500);

  const renderParams = () => {
    if (!params.length) {
      paramsBox.replaceChildren(hint(tr(['No settings found. Add comments such as: width = 40; // [10:1:100]', 'Няма намерени настройки. Добави коментари като: width = 40; // [10:1:100]'])));
      return;
    }
    for (const p of params) {
      // A value that no longer fits its setting goes back to the default in the script.
      if (typeof values[p.name] !== typeof p.value) values[p.name] = p.value;
    }
    const ctl: Ctl<Values> = { state: values, change: () => scheduleRender() };
    const groups = new Map<string, Node[]>();
    for (const p of params) {
      const label = p.label;
      let field: Node;
      if (p.options) {
        // Select values are text; convert back so numbers stay numbers.
        const choice: Record<string, string> = { v: String(values[p.name]) };
        const pick: Ctl<Record<string, string>> = {
          state: choice,
          change() {
            values[p.name] = p.type === 'number' ? Number(choice.v) : choice.v;
            scheduleRender();
          },
        };
        field = select(pick, 'v', label, p.options.map(([v, l]) => [String(v), l]));
      } else if (p.type === 'boolean') field = check(ctl, p.name, label);
      else if (p.type === 'string') field = text(ctl, p.name, label);
      else if (p.min !== undefined && p.max !== undefined) field = range(ctl, p.name, label, { min: p.min, max: p.max, step: p.step ?? 1 });
      else field = number(ctl, p.name, label);
      const list = groups.get(p.section);
      if (list) list.push(field);
      else groups.set(p.section, [field]);
    }
    paramsBox.replaceChildren(...[...groups.entries()].flatMap(([name, fields]) => (name ? [el('h3', { class: 'scad-section' }, name), ...fields] : fields)));
  };

  const reparse = debounce(() => {
    params = parseScadParams(state.source);
    renderParams();
  }, 300);

  const stateCtl: Ctl<typeof state> = {
    state,
    change() {
      save('openscad', state);
      reparse();
    },
  };

  const loadSource = (source: string) => {
    state.source = source;
    for (const k of Object.keys(values)) delete values[k];
    firstFit = true;
    save('openscad', state);
    params = parseScadParams(state.source);
    renderControls();
    renderParams();
  };

  const fileInput = el('input', { type: 'file', accept: '.scad,text/plain', hidden: true });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) loadSource(await file.text());
  });

  const shareLink = async () => {
    if (state.source.length > MAX_LINK_CODE) {
      setStatus(tr(['This script is too long for a link. Send the .scad file instead.', 'Скриптът е твърде дълъг за линк. Изпрати .scad файла.']), 'error');
      return;
    }
    const url = `${location.origin}${location.pathname}#/openscad?s=${encodeState({ source: state.source, values })}`;
    try {
      await navigator.clipboard.writeText(url);
      setStatus(t('s.linkCopied'));
    } catch {
      window.prompt(t('a.share'), url);
    }
  };

  const renderControls = () => {
    const example = { id: SCAD_EXAMPLES.find((x) => x.source === state.source)?.id ?? '' };
    const exampleCtl: Ctl<typeof example> = {
      state: example,
      change() {
        const found = SCAD_EXAMPLES.find((x) => x.id === example.id);
        if (found) loadSource(found.source);
      },
    };
    const codeField = text(stateCtl, 'source', tr(['OpenSCAD code', 'OpenSCAD код']), { multiline: true, rows: 14 });
    codeField.querySelector('textarea')?.classList.add('mono', 'scad-code');
    shell.controls.replaceChildren(
      fromLink
        ? el('p', { class: 'hint warn' }, tr(['This code came from a link. It runs only when you press Render, and only inside this page.', 'Този код идва от линк. Изпълнява се само когато натиснеш Генерирай и само вътре в тази страница.']))
        : '',
      section(
        tr(['Code', 'Код']),
        select(exampleCtl, 'id', tr(['Example', 'Пример']), [['', tr(['My own code', 'Мой код'])], ...SCAD_EXAMPLES.map((x) => [x.id, tr(x.name)] as [string, string])]),
        codeField,
        fileInput,
        el(
          'div',
          { class: 'row' },
          runBtn,
          stopBtn,
          button(tr(['Open .scad', 'Отвори .scad']), () => fileInput.click(), { icon: icons.upload }),
          button(tr(['Save .scad', 'Запази .scad']), () => download(state.source, 'extruda.scad', 'text/plain'), { icon: icons.download }),
        ),
        check(stateCtl, 'auto', tr(['Render again when a setting changes', 'Генерирай отново при промяна на настройка'])),
      ),
      section(tr(['Settings', 'Настройки']), paramsBox),
      el('details', { class: 'section' }, el('summary', {}, tr(['Log', 'Дневник'])), logBox),
      hint(tr([
        'Runs in your browser with the real OpenSCAD engine. Libraries such as BOSL2 and the import() of other files are not available, and text() may have no fonts.',
        'Работи в браузъра с истинския OpenSCAD. Библиотеки като BOSL2 и import() на други файлове не са налични, а text() може да няма шрифтове.',
      ])),
    );
  };

  shell.actions.append(
    button(t('a.stl'), () => {
      if (parts.length) download(partsToSTL(parts, 'Extruda OpenSCAD'), `${fileSafe('openscad')}.stl`, 'model/stl');
    }, { primary: true, icon: icons.download }),
    button(t('a.3mf'), () => {
      if (parts.length) download(to3MF(parts, 'OpenSCAD'), `${fileSafe('openscad')}.3mf`, 'model/3mf');
    }, { icon: icons.layers }),
    el('button', { type: 'button', class: 'btn icon-only', title: t('a.share'), 'aria-label': t('a.share'), onclick: () => void shareLink(), html: icons.link }),
    el('button', { type: 'button', class: 'btn icon-only', title: t('a.reset'), 'aria-label': t('a.reset'), onclick: () => viewer.resetView(), html: icons.view }),
  );

  renderControls();
  renderParams();
  setStatus(tr(['Press Render to build the model.', 'Натисни Генерирай, за да се изгради моделът.']));

  return () => {
    worker?.terminate();
    viewer.dispose();
  };
}
