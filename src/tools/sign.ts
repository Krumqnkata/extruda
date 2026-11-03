// SPDX-License-Identifier: AGPL-3.0-or-later
import { SIGN_DEFAULTS, signParts, type SignParams } from '../core/models';
import { t } from '../i18n';
import { check, color, el, hint, range, section, segmented, select, text, type Ctl } from '../ui/form';
import { mountModelTool } from '../ui/modelTool';
import { fontOptions, styleOptions } from './keychain';

type State = SignParams & { font: string };

export function mount(container: HTMLElement): () => void {
  return mountModelTool<State>(
    {
      id: 'sign',
      titleKey: 'tool.sign.title',
      descKey: 'tool.sign.desc',
      defaults: { ...SIGN_DEFAULTS, font: 'russo' },
      build: (m, font, s) => signParts(m, font, s),
      fileName: (s) => `sign_${s.text.split('\n')[0]}`,
      controls: (ctl: Ctl<State>) => {
        const s = ctl.state;
        const plate = s.shape !== 'none';
        const box = plate && s.shape !== 'contour';
        return [
          section(
            t('sec.text'),
            text(ctl, 'text', t('f.text'), { multiline: true, rows: 3, hint: t('f.textHint'), big: true }),
            select(ctl, 'font', t('f.font'), fontOptions(), { fontPreview: true }),
            range(ctl, 'height', t('f.height'), { min: 4, max: 60, step: 0.5, unit: t('u.mm') }),
            range(ctl, 'spacing', t('f.spacing'), { min: -3, max: 6, step: 0.1, unit: t('u.mm') }),
            range(ctl, 'lineHeight', t('f.lineHeight'), { min: 1, max: 3, step: 0.05, unit: '×' }),
            segmented(ctl, 'align', t('f.align'), [
              ['left', t('f.align.left')],
              ['center', t('f.align.center')],
              ['right', t('f.align.right')],
            ]),
          ),
          section(
            t('sec.shape'),
            select(ctl, 'shape', t('f.shape'), [
              ['rounded', t('f.shape.rounded')],
              ['rect', t('f.shape.rect')],
              ['pill', t('f.shape.pill')],
              ['contour', t('f.shape.contour')],
              ['none', t('f.shape.none')],
            ]),
            box && check(ctl, 'autoSize', t('f.autoSize')),
            box && !s.autoSize && range(ctl, 'width', t('f.width'), { min: 20, max: 300, step: 1, unit: t('u.mm') }),
            box && !s.autoSize && range(ctl, 'plateHeight', t('f.plateHeight'), { min: 10, max: 200, step: 1, unit: t('u.mm') }),
            plate && range(ctl, 'padding', t('f.padding'), { min: 1, max: 30, step: 0.5, unit: t('u.mm') }),
            s.shape === 'rounded' && range(ctl, 'corner', t('f.corner'), { min: 0, max: 30, step: 0.5, unit: t('u.mm') }),
            box && range(ctl, 'frame', t('f.frame'), { min: 0, max: 8, step: 0.5, unit: t('u.mm') }),
            plate &&
              segmented(ctl, 'holes', t('f.holes'), [
                ['none', t('f.holes.none')],
                ['sides', t('f.holes.sides')],
                ['top', t('f.holes.top')],
              ]),
            plate && s.holes !== 'none' && range(ctl, 'holeDiameter', t('f.holeDiameter'), { min: 2, max: 10, step: 0.5, unit: t('u.mm') }),
            plate && segmented(ctl, 'style', t('f.style'), styleOptions(), t('f.styleHint')),
          ),
          section(
            t('sec.thickness'),
            range(ctl, 'baseThickness', t('f.base'), { min: 1, max: 10, step: 0.2, unit: t('u.mm') }),
            range(ctl, 'textThickness', t('f.textThickness'), { min: 0.4, max: 10, step: 0.2, unit: t('u.mm') }),
          ),
          section(
            t('sec.colors'),
            el('div', { class: 'swatches' }, color(ctl, 'baseColor', t('f.baseColor')), color(ctl, 'textColor', t('f.textColor'))),
            hint(t('f.colorHint')),
          ),
        ];
      },
    },
    container,
  );
}
