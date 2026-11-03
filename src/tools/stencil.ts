// SPDX-License-Identifier: AGPL-3.0-or-later
import { STENCIL_DEFAULTS, stencilParts, type StencilParams } from '../core/art';
import { t } from '../i18n';
import { ART_DEFAULTS, artControls, artShape, type ArtState } from '../ui/artSource';
import { check, color, hint, range, section, type Ctl } from '../ui/form';
import { mountModelTool } from '../ui/modelTool';

type State = StencilParams & ArtState & { width: number };

export function mount(container: HTMLElement): () => void {
  return mountModelTool<State>(
    {
      id: 'stencil',
      title: t('tool.stencil.title'),
      desc: t('tool.stencil.desc'),
      defaults: { ...STENCIL_DEFAULTS, ...ART_DEFAULTS, source: 'text', font: 'russo', text: 'ОБРАЗЕЦ', width: 140 },
      build: (m, font, s) => stencilParts(m, artShape(m, font, s, 'stencil', s.width), s),
      fileName: (s) => `stencil_${s.source === 'text' ? s.text : s.icon}`,
      controls: (ctl: Ctl<State>) => [
        section(t('sec.source'), ...artControls(ctl, 'stencil')),
        section(
          t('sec.shape'),
          range(ctl, 'width', t('f.width'), { min: 20, max: 300, step: 1, unit: t('u.mm') }),
          range(ctl, 'bridge', t('f.bridge'), { min: 0.8, max: 5, step: 0.1, unit: t('u.mm') }),
          hint(t('f.stencilHint')),
          range(ctl, 'padding', t('f.padding'), { min: 3, max: 40, step: 0.5, unit: t('u.mm') }),
          range(ctl, 'corner', t('f.corner'), { min: 0, max: 20, step: 0.5, unit: t('u.mm') }),
          range(ctl, 'thickness', t('f.thickness'), { min: 0.6, max: 4, step: 0.2, unit: t('u.mm') }),
          check(ctl, 'hole', t('f.hole')),
          color(ctl, 'color', t('f.color')),
        ),
      ],
    },
    container,
  );
}
