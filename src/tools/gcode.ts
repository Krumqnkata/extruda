// SPDX-License-Identifier: AGPL-3.0-or-later
import { download } from '../core/export';
import { insertChanges, layersAtHeights, parseGcode, parseToolPath, type ChangeCommand, type GcodeInfo, type ToolPath } from '../core/gcode';
import { parseList } from '../core/printer';
import { Viewer } from '../core/viewer';
import { fmt, t, tr } from '../i18n';
import type { Key } from '../i18n/en';
import { button, el, hint, persisted, save, select, text, type Ctl } from '../ui/form';
import { icons } from '../ui/icons';

const DEFAULTS = { heights: '3', command: 'M600', message: '' };
type State = typeof DEFAULTS;

// The open file stays in memory while switching pages; it is never stored.
let opened: { name: string; lines: string[]; info: GcodeInfo; path: ToolPath } | undefined;

// Each filament change moves on to the next colour in the preview.
const PALETTE: [number, number, number][] = [
  [1, 0.48, 0.1],
  [0.22, 0.74, 0.97],
  [0.13, 0.77, 0.37],
  [0.92, 0.7, 0.03],
  [0.93, 0.28, 0.6],
];

/** One RGB colour per line end, changing at the first segment of each chosen layer. */
export function pathColors(path: ToolPath, changeLayers: number[]): Float32Array {
  const colors = new Float32Array((path.positions.length / 3) * 3);
  const changes = [...changeLayers].sort((a, b) => a - b);
  let layer = 0;
  let used = 0;
  const segments = path.positions.length / 6;
  for (let seg = 0; seg < segments; seg++) {
    while (layer < path.layerEnds.length - 1 && seg >= path.layerEnds[layer]) layer++;
    while (used < changes.length && changes[used] <= layer) used++;
    const c = PALETTE[used % PALETTE.length];
    for (let k = 0; k < 2; k++) colors.set(c, (seg * 2 + k) * 3);
  }
  return colors;
}

export function mount(container: HTMLElement): () => void {
  const state = persisted('gcode', { ...DEFAULTS, message: t('g.messageDefault') });
  const info = el('div', { class: 'results' });
  const resolved = el('p', { class: 'hint' });
  const notice = el('p', { class: 'hint warn' });
  const layerList = el('details', { class: 'section' });
  const host = el('div', { class: 'viewer-host gcode-view', hidden: true });
  const slider = el('input', { type: 'range', min: 1, max: 1, step: 1, value: 1, 'aria-label': tr(['Layer', 'Слой']) });
  const sliderLabel = el('span', { class: 'hint' });
  const sliderRow = el('div', { class: 'field', hidden: true }, sliderLabel, slider);
  let viewer: Viewer | undefined;
  let shownPath: ToolPath | undefined;

  const showLayer = () => {
    if (!opened || !viewer) return;
    const { path, info: i } = opened;
    const index = Math.min(Number(slider.value), path.layerEnds.length) - 1;
    viewer.setLineCount(path.layerEnds[index] ?? 0);
    const z = i.layers[index]?.z;
    sliderLabel.textContent = tr([
      `Up to layer ${index + 1} of ${path.layerEnds.length}${z === undefined ? '' : `, Z ${fmt(z, 2)} mm`}`,
      `До слой ${index + 1} от ${path.layerEnds.length}${z === undefined ? '' : `, Z ${fmt(z, 2)} мм`}`,
    ]);
  };
  slider.addEventListener('input', showLayer);

  const refreshPreview = (changeLayers: number[]) => {
    if (!opened || !opened.path.positions.length) {
      host.hidden = true;
      sliderRow.hidden = true;
      return;
    }
    host.hidden = false;
    viewer ??= new Viewer(host);
    const { path } = opened;
    const fresh = shownPath !== path;
    viewer.setLines(path.positions, pathColors(path, changeLayers), { fit: fresh });
    if (fresh) {
      slider.max = String(path.layerEnds.length);
      slider.value = String(path.layerEnds.length);
      shownPath = path;
    }
    sliderRow.hidden = path.layerEnds.length < 2;
    showLayer();
  };
  const dl = button(t('g.download'), () => {
    if (!opened) return;
    const layers = layersAtHeights(opened.info, parseList(state.heights, 0, 10000));
    const out = insertChanges(opened.lines, layers, state.command as ChangeCommand, state.message);
    download(out.join('\n'), opened.name.replace(/(\.gcode)?$/i, '_colorchange.gcode'), 'text/plain');
  }, { primary: true, icon: icons.download });

  const refresh = () => {
    notice.textContent = '';
    dl.disabled = true;
    if (!opened) {
      info.replaceChildren(hint(t('g.hint')));
      resolved.textContent = '';
      layerList.replaceChildren();
      refreshPreview([]);
      return;
    }
    const i = opened.info;
    const row = (key: Key, value: string) => el('div', { class: 'result' }, el('span', {}, t(key)), el('output', { class: 'result-value' }, value));
    const rows = [
      el('div', { class: 'result strong' }, el('span', {}, opened.name)),
      row('g.slicer', i.slicer === 'unknown' ? '—' : { prusa: 'PrusaSlicer / OrcaSlicer', cura: 'Cura', bambu: 'Bambu Studio' }[i.slicer]),
      row('g.layers', String(i.layers.length)),
      i.layers.length > 0 && row('stl.size', `Z ${fmt(i.layers[i.layers.length - 1].z, 2)} ${t('u.mm')}`),
      i.time !== undefined && row('g.time', i.time),
      i.filament !== undefined && row('g.filament', i.filament),
    ];
    info.replaceChildren(...rows.filter((r): r is HTMLDivElement => r !== false));
    if (!i.layers.length) {
      notice.textContent = t('g.noLayers');
      resolved.textContent = '';
      refreshPreview([]);
      return;
    }
    const layers = layersAtHeights(i, parseList(state.heights, 0, 10000));
    resolved.textContent = layers.length
      ? t('g.resolved', { list: layers.map((l) => `#${l.index + 1} (Z ${fmt(l.z, 2)})`).join(', ') })
      : t('g.none');
    dl.disabled = !layers.length;
    refreshPreview(layers.map((l) => l.index));
    if (opened.path.truncated) notice.textContent = tr(['This file is very large, so the preview stops part way. The download is complete.', 'Файлът е много голям, затова прегледът спира по средата. Сваленият файл е пълен.']);
    // Distinct layer heights help pick where a colour should start.
    const zs = [...new Set(i.layers.map((l) => l.z.toFixed(2)))];
    layerList.replaceChildren(
      el('summary', {}, `${t('g.layerList')} (${zs.length})`),
      el('p', { class: 'hint mono layer-list' }, zs.join('  ')),
    );
  };

  const open = async (file: File | undefined) => {
    if (!file) return;
    if (/\.3mf$/i.test(file.name)) {
      opened = undefined;
      refresh();
      notice.textContent = t('g.bambu');
      return;
    }
    const lines = (await file.text()).split(/\r?\n/);
    const parsed = parseGcode(lines);
    opened = { name: file.name, lines, info: parsed, path: parseToolPath(lines, parsed.layers) };
    refresh();
  };

  const input = el('input', { type: 'file', accept: '.gcode,.gco,.g,.3mf', hidden: true });
  input.addEventListener('change', () => void open(input.files?.[0]));
  const zone = el(
    'button',
    { type: 'button', class: 'drop', onclick: () => input.click() },
    el('span', { class: 'icon', html: icons.code, 'aria-hidden': 'true' }),
    el('span', {}, t('g.drop')),
  );
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('over');
    void open(e.dataTransfer?.files[0]);
  });

  const ctl: Ctl<State> = {
    state,
    change() {
      save('gcode', state);
      refresh();
    },
  };

  container.append(
    el(
      'div',
      { class: 'page narrow' },
      el('header', { class: 'page-head' }, el('h1', {}, t('tool.gcode.title')), el('p', {}, t('tool.gcode.desc'))),
      el(
        'div',
        { class: 'card calc' },
        zone,
        input,
        notice,
        info,
        host,
        sliderRow,
        text(ctl, 'heights', t('g.heights'), { hint: t('g.heightsHint') }),
        select(ctl, 'command', t('g.command'), (['M600', 'PAUSE', 'M601', 'M0'] as const).map((c) => [c, t(`g.cmd.${c}` as Key)])),
        text(ctl, 'message', t('g.message')),
        resolved,
        el('div', { class: 'row' }, dl),
        hint(t('g.keychainTip')),
        layerList,
      ),
    ),
  );
  refresh();
  return () => viewer?.dispose();
}
