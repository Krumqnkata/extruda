// SPDX-License-Identifier: AGPL-3.0-or-later
import { download, partsToSTL, to3MF } from '../core/export';
import { filamentArt, type ArtFilament, type ArtResult } from '../core/filamentart';
import { toGray, type GrayImage } from '../core/lithophane';
import type { Part } from '../core/mesh';
import { Viewer } from '../core/viewer';
import { fmt, t, tr } from '../i18n';
import { button, check, color, debounce, el, hint, number, persisted, range, save, section, select, type Ctl } from '../ui/form';
import { icons } from '../ui/icons';
import { statusText, toolShell } from '../ui/modelTool';
import { demoPicture } from './lithophane';

const DEFAULTS = {
  width: 120,
  base: 0.6,
  top: 2.4,
  layer: 0.12,
  resolution: 3,
  invert: false,
  contrast: 1,
  count: 4,
  color1: '#111111', td1: 0.6, start1: 0,
  color2: '#6b7280', td2: 1.2, start2: 0,
  color3: '#d1d5db', td3: 1.6, start3: 0,
  color4: '#ffffff', td4: 2.4, start4: 0,
  color5: '#ffb347', td5: 2, start5: 0,
  color6: '#38bdf8', td6: 2, start6: 0,
};
type State = typeof DEFAULTS;

const MAX_PIXELS = 1000;

// The picture stays in memory while switching pages; it is never stored or uploaded.
let picture: { name: string; source: CanvasImageSource; width: number; height: number } | undefined;

export function mount(container: HTMLElement): () => void {
  const state = persisted('filament-art', DEFAULTS);
  const shell = toolShell(t('tool.filamentart.title'), t('tool.filamentart.desc'));
  container.append(shell.root);
  const viewer = new Viewer(shell.host);
  let parts: Part[] = [];
  let result: ArtResult | undefined;
  let gray: GrayImage | undefined;
  let disposed = false;
  let firstBuild = true;

  const changesBox = el('div', { class: 'results' });

  const setStatus = (s: string, kind = 'ok') => {
    shell.status.textContent = s;
    shell.status.dataset.kind = kind;
  };

  const filaments = (): ArtFilament[] => {
    const s = state as unknown as Record<string, number | string>;
    return Array.from({ length: state.count }, (_, i) => ({ color: String(s[`color${i + 1}`]), td: Number(s[`td${i + 1}`]), start: Number(s[`start${i + 1}`]) }));
  };

  const regray = () => {
    const pic = picture ?? { source: demoPicture(), width: 480, height: 320 };
    const k = Math.min(1, MAX_PIXELS / Math.max(pic.width, pic.height));
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.round(pic.width * k));
    c.height = Math.max(2, Math.round(pic.height * k));
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(pic.source, 0, 0, c.width, c.height);
    gray = toGray(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height, state.contrast);
  };

  const renderChanges = () => {
    if (!result) return;
    const rows = result.changes.map((c) => {
      const dot = el('span', { class: 'spool-dot', 'aria-hidden': 'true' });
      dot.style.background = c.color;
      return el(
        'div',
        { class: 'result' },
        el('span', { class: 'change-row' }, dot, tr([`After layer ${c.layers}`, `След слой ${c.layers}`])),
        el('output', { class: 'result-value' }, `Z ${fmt(c.z, 2)} ${t('u.mm')}`),
      );
    });
    changesBox.replaceChildren(...rows);
  };

  const rebuild = () => {
    setStatus(t('s.building'), 'busy');
    setTimeout(() => {
      if (disposed) return;
      if (!gray) regray();
      result = filamentArt(gray!, { width: state.width, base: state.base, top: Math.max(state.top, state.base + state.layer), layer: state.layer, resolution: state.resolution, invert: state.invert, filaments: filaments() });
      const part = { name: 'Filament art', color: state.color1, mesh: result.mesh, smooth: true, colors: result.colors };
      parts = [part];
      viewer.setParts([part], { fit: firstBuild });
      firstBuild = false;
      renderChanges();
      setStatus(statusText(parts));
    }, 16);
  };
  const scheduleRebuild = debounce(rebuild, 250);

  const ctl: Ctl<State> = {
    state,
    change(structural) {
      save('filament-art', state);
      if (structural) renderControls();
      scheduleRebuild();
    },
  };
  const imageCtl: Ctl<State> = {
    state,
    change(structural) {
      gray = undefined;
      ctl.change(structural);
    },
  };

  // A select stores text, while the rest of the page works with a number.
  const countState = { count: String(state.count) };
  const countCtl: Ctl<typeof countState> = {
    state: countState,
    change() {
      state.count = Number(countState.count);
      ctl.change(true);
    },
  };

  const fileInput = el('input', { type: 'file', accept: 'image/*', hidden: true });
  const loadFile = (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    const img = new Image();
    img.onload = () => {
      picture = { name: file.name, source: img, width: img.naturalWidth, height: img.naturalHeight };
      gray = undefined;
      firstBuild = true;
      renderControls();
      rebuild();
    };
    img.src = URL.createObjectURL(file);
  };
  fileInput.addEventListener('change', () => loadFile(fileInput.files?.[0]));

  const sendToGcode = () => {
    if (!result) return;
    try {
      const saved = JSON.parse(localStorage.getItem('extruda.gcode') ?? '{}') as Record<string, unknown>;
      localStorage.setItem('extruda.gcode', JSON.stringify({ ...saved, heights: result.changes.map((c) => c.z.toFixed(2)).join(', ') }));
    } catch {
      /* storage unavailable: the page opens with its own values */
    }
    location.hash = '#/gcode';
  };

  const filamentRow = (i: number) => {
    const key = (name: string) => `${name}${i}` as keyof State;
    return el(
      'div',
      { class: 'art-filament' },
      color(ctl, key('color'), tr([`Filament ${i}`, `Филамент ${i}`])),
      number(ctl, key('td'), tr(['Hides at (TD)', 'Покрива при (TD)']), { unit: t('u.mm'), step: 0.1, min: 0.1 }),
      i > 1 && number(ctl, key('start'), tr(['Starts at (0 = auto)', 'Започва на (0 = авто)']), { unit: t('u.mm'), step: 0.01, min: 0 }),
    );
  };

  const renderControls = () => {
    const zone = el(
      'button',
      { type: 'button', class: 'drop', onclick: () => fileInput.click() },
      el('span', { class: 'icon', html: icons.image, 'aria-hidden': 'true' }),
      el('span', {}, picture ? picture.name : t('f.drop')),
    );
    zone.addEventListener('dragover', (e) => e.preventDefault());
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      loadFile(e.dataTransfer?.files[0]);
    });
    shell.controls.replaceChildren(
      section(
        t('sec.image'),
        zone,
        fileInput,
        range(imageCtl, 'contrast', t('f.contrast'), { min: 0.3, max: 2.5, step: 0.05, unit: '×' }),
        check(ctl, 'invert', t('f.invert')),
      ),
      section(
        tr(['Filaments, from the bottom up', 'Филаменти отдолу нагоре']),
        select(countCtl, 'count', tr(['How many', 'Колко']), ['2', '3', '4', '5', '6'].map((n) => [n, n])),
        ...Array.from({ length: state.count }, (_, i) => filamentRow(i + 1)),
        hint(tr(['Start with the darkest filament. TD is how thick a filament must be to hide what is under it: measure it with the swatch staircase, or use the value from your supplier.', 'Започни с най-тъмния филамент. TD е колко дебел трябва да е филаментът, за да скрие това под него: измери го със стъпалата на мострата или вземи стойността от производителя.'])),
      ),
      section(
        tr(['Colour changes', 'Смени на цвета']),
        changesBox,
        button(tr(['Send to the G-code tool', 'Прехвърли към G-code инструмента']), sendToGcode, { icon: icons.code }),
        hint(tr(['The on-screen colours are an estimate. Real ones depend on your filaments, so print a small test first.', 'Цветовете на екрана са приблизителни. Истинските зависят от филаментите, затова първо принтирай малка проба.'])),
      ),
      section(
        t('sec.size'),
        range(ctl, 'width', t('f.width'), { min: 40, max: 300, step: 1, unit: t('u.mm') }),
        range(ctl, 'base', tr(['Darkest areas', 'Най-тъмните части']), { min: 0.2, max: 3, step: 0.04, unit: t('u.mm') }),
        range(ctl, 'top', tr(['Lightest areas', 'Най-светлите части']), { min: 0.6, max: 8, step: 0.04, unit: t('u.mm') }),
        range(ctl, 'layer', tr(['Layer height', 'Височина на слоя']), { min: 0.04, max: 0.3, step: 0.01, unit: t('u.mm') }),
        range(ctl, 'resolution', t('f.resolution'), { min: 1, max: 6, step: 0.5, unit: t('u.perMm') }),
        hint(tr(['Print flat, 100% infill, and use this same layer height in the slicer.', 'Принтирай легнало, със 100% запълване и същата височина на слоя в слайсъра.'])),
      ),
    );
  };

  const name = () => `filament_art_${(picture?.name ?? 'demo').replace(/\.[^.]+$/, '')}`;
  shell.actions.append(
    button(t('a.stl'), () => download(partsToSTL(parts, 'Extruda filament art'), `${name()}.stl`, 'model/stl'), { primary: true, icon: icons.download }),
    button(t('a.3mf'), () => download(to3MF(parts, 'Filament art'), `${name()}.3mf`, 'model/3mf'), { icon: icons.layers }),
    el('button', { type: 'button', class: 'btn icon-only', title: t('a.reset'), 'aria-label': t('a.reset'), onclick: () => viewer.resetView(), html: icons.view }),
  );

  renderControls();
  if (document.fonts) void document.fonts.load('44px "x-russo"').finally(rebuild);
  else rebuild();

  return () => {
    disposed = true;
    viewer.dispose();
  };
}
