// SPDX-License-Identifier: AGPL-3.0-or-later
import { CUTTER_DEFAULTS, cutterParts, type CutterParams } from '../core/art';
import { t } from '../i18n';
import { ART_DEFAULTS, artControls, artShape, type ArtState } from '../ui/artSource';
import { check, color, el, hint, range, section, type Ctl } from '../ui/form';
import { mountModelTool } from '../ui/modelTool';

type State = CutterParams & ArtState;

export function mount(container: HTMLElement): () => void {
  return mountModelTool<State>(
    {
      id: 'cutter',
      title: t('tool.cutter.title'),
      desc: t('tool.cutter.desc'),
      defaults: { ...CUTTER_DEFAULTS, ...ART_DEFAULTS, font: 'days', text: 'Мими' },
      separateObjects: true,
      build: (m, font, s) => cutterParts(m, artShape(m, font, s, 'cutter', 0), s),
      fileName: (s) => `cutter_${s.source === 'text' ? s.text : s.icon}`,
      controls: (ctl: Ctl<State>) => {
        const s = ctl.state;
        return [
          section(t('sec.source'), ...artControls(ctl, 'cutter')),
          section(
            t('sec.shape'),
            range(ctl, 'size', t('f.size'), { min: 20, max: 200, step: 1, unit: t('u.mm') }),
            range(ctl, 'height', t('f.cutHeight'), { min: 6, max: 40, step: 0.5, unit: t('u.mm') }),
            range(ctl, 'edge', t('f.edge'), { min: 0.4, max: 2, step: 0.05, unit: t('u.mm') }),
            s.edge < 0.8 && el('p', { class: 'hint warn' }, t('f.edgeWarn')),
            range(ctl, 'wall', t('f.wallLower'), { min: 0.8, max: 4, step: 0.1, unit: t('u.mm') }),
            range(ctl, 'flange', t('f.flange'), { min: 0, max: 12, step: 0.5, unit: t('u.mm') }),
            s.source === 'text' && range(ctl, 'merge', t('f.merge'), { min: 0, max: 10, step: 0.5, unit: t('u.mm') }),
            hint(t('f.cutterHint')),
          ),
          section(
            t('sec.stamp'),
            check(ctl, 'stamp', t('f.stamp')),
            s.stamp && range(ctl, 'clearance', t('f.clearance'), { min: 0.2, max: 3, step: 0.1, unit: t('u.mm') }),
            s.stamp && range(ctl, 'stampThickness', t('f.stampThickness'), { min: 1.5, max: 8, step: 0.5, unit: t('u.mm') }),
            s.stamp && range(ctl, 'relief', t('f.reliefH'), { min: 0.6, max: 5, step: 0.2, unit: t('u.mm') }),
          ),
          section(
            t('sec.colors'),
            el('div', { class: 'swatches' }, color(ctl, 'cutterColor', t('f.cutterColor')), s.stamp && color(ctl, 'stampColor', t('f.stampColor'))),
          ),
        ];
      },
    },
    container,
  );
}
