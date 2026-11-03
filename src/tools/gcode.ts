// SPDX-License-Identifier: AGPL-3.0-or-later
import { download } from '../core/export';
import { insertChanges, layersAtHeights, parseGcode, type ChangeCommand, type GcodeInfo } from '../core/gcode';
import { parseList } from '../core/printer';
import { fmt, t } from '../i18n';
import type { Key } from '../i18n/en';
import { button, el, hint, persisted, save, select, text, type Ctl } from '../ui/form';
import { icons } from '../ui/icons';

const DEFAULTS = { heights: '3', command: 'M600', message: '' };
type State = typeof DEFAULTS;

// The open file stays in memory while switching pages; it is never stored.
let opened: { name: string; lines: string[]; info: GcodeInfo } | undefined;

export function mount(container: HTMLElement): () => void {
  const state = persisted('gcode', { ...DEFAULTS, message: t('g.messageDefault') });
  const info = el('div', { class: 'results' });
  const resolved = el('p', { class: 'hint' });
  const notice = el('p', { class: 'hint warn' });
  const layerList = el('details', { class: 'section' });
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
      return;
    }
    const layers = layersAtHeights(i, parseList(state.heights, 0, 10000));
    resolved.textContent = layers.length
      ? t('g.resolved', { list: layers.map((l) => `#${l.index + 1} (Z ${fmt(l.z, 2)})`).join(', ') })
      : t('g.none');
    dl.disabled = !layers.length;
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
    opened = { name: file.name, lines, info: parseGcode(lines) };
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
  return () => {};
}
