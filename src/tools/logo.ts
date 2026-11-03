// SPDX-License-Identifier: AGPL-3.0-or-later
import { LOGO_DEFAULTS, logoParts, type LogoParams } from '../core/art';
import { t } from '../i18n';
import { ART_DEFAULTS, artControls, artLayers, loadedFile, type ArtState } from '../ui/artSource';
import { check, color, el, hint, range, section, segmented, type Ctl } from '../ui/form';
import { mountModelTool } from '../ui/modelTool';

type State = LogoParams & ArtState & { width: number };

export function mount(container: HTMLElement): () => void {
  return mountModelTool<State>(
    {
      id: 'logo',
      title: t('tool.logo.title'),
      desc: t('tool.logo.desc'),
      defaults: { ...LOGO_DEFAULTS, ...ART_DEFAULTS, font: 'russo', text: 'Extruda', width: 60, icon: 'star' },
      build: (m, font, s) => logoParts(m, artLayers(m, font, s, 'logo', s.width, s.color), s),
      fileName: (s) => `logo_${s.source === 'file' ? (loadedFile('logo')?.name ?? 'file').replace(/\.[^.]+$/, '') : s.source === 'text' ? s.text : s.icon}`,
      controls: (ctl: Ctl<State>) => {
        const s = ctl.state;
        const multi = s.source === 'file' && !!loadedFile('logo')?.svg;
        return [
          section(t('sec.source'), ...artControls(ctl, 'logo')),
          section(
            t('sec.size'),
            range(ctl, 'width', t('f.width'), { min: 10, max: 250, step: 1, unit: t('u.mm') }),
            range(ctl, 'relief', t('f.relief'), { min: 0.4, max: 10, step: 0.2, unit: t('u.mm') }),
            multi && check(ctl, 'stepped', t('f.stepped')),
            multi && check(ctl, 'singleColor', t('f.singleColor')),
          ),
          section(
            t('f.baseShape'),
            segmented(ctl, 'base', t('f.baseShape'), [
              ['none', t('f.base.none')],
              ['contour', t('f.base.contour')],
              ['plate', t('f.base.plate')],
            ]),
            s.base !== 'none' && range(ctl, 'baseThickness', t('f.base'), { min: 0.6, max: 8, step: 0.2, unit: t('u.mm') }),
            s.base === 'contour' && range(ctl, 'border', t('f.border'), { min: 0.5, max: 10, step: 0.5, unit: t('u.mm') }),
            s.base === 'plate' && range(ctl, 'padding', t('f.padding'), { min: 1, max: 30, step: 0.5, unit: t('u.mm') }),
            s.base === 'plate' && range(ctl, 'corner', t('f.corner'), { min: 0, max: 30, step: 0.5, unit: t('u.mm') }),
            s.base !== 'none' &&
              segmented(ctl, 'ring', t('f.hole'), [
                ['none', t('f.ring.none')],
                ['left', t('f.ring.left')],
                ['top', t('f.ring.top')],
                ['right', t('f.ring.right')],
              ]),
            s.base !== 'none' && s.ring !== 'none' && range(ctl, 'holeDiameter', t('f.holeDiameter'), { min: 2, max: 12, step: 0.5, unit: t('u.mm') }),
          ),
          section(
            t('sec.colors'),
            el(
              'div',
              { class: 'swatches' },
              s.base !== 'none' && color(ctl, 'baseColor', t('f.baseColor')),
              (!multi || s.singleColor) && color(ctl, 'color', t('f.color')),
            ),
            hint(t('f.colorHint')),
          ),
        ];
      },
    },
    container,
  );
}
