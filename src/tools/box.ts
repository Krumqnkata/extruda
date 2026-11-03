// SPDX-License-Identifier: AGPL-3.0-or-later
import { BOX_DEFAULTS, boxParts, type BoxParams } from '../core/box';
import { t } from '../i18n';
import { color, el, hint, range, section, segmented, select, text, type Ctl } from '../ui/form';
import { mountModelTool } from '../ui/modelTool';
import { fontOptions } from '../ui/options';

type State = BoxParams & { font: string };

export function mount(container: HTMLElement): () => void {
  return mountModelTool<State>(
    {
      id: 'box',
      title: t('tool.box.title'),
      desc: t('tool.box.desc'),
      defaults: { ...BOX_DEFAULTS, font: 'russo' },
      separateObjects: true,
      build: (m, font, s) => boxParts(m, font, s),
      fileName: (s) => `box_${s.width}x${s.depth}x${s.height}`,
      controls: (ctl: Ctl<State>) => {
        const s = ctl.state;
        const lid = s.lid !== 'none';
        return [
          section(
            t('sec.size'),
            range(ctl, 'width', t('f.innerW'), { min: 10, max: 250, step: 1, unit: t('u.mm') }),
            range(ctl, 'depth', t('f.innerD'), { min: 10, max: 250, step: 1, unit: t('u.mm') }),
            range(ctl, 'height', t('f.innerH'), { min: 5, max: 200, step: 1, unit: t('u.mm') }),
            range(ctl, 'wall', t('f.wall'), { min: 1.2, max: 5, step: 0.1, unit: t('u.mm') }),
            range(ctl, 'floor', t('f.floor'), { min: 0.8, max: 5, step: 0.1, unit: t('u.mm') }),
            range(ctl, 'radius', t('f.corner'), { min: 0, max: 20, step: 0.5, unit: t('u.mm') }),
            range(ctl, 'dividersX', t('f.dividersX'), { min: 0, max: 10, step: 1 }),
            range(ctl, 'dividersY', t('f.dividersY'), { min: 0, max: 10, step: 1 }),
          ),
          section(
            t('sec.lid'),
            segmented(ctl, 'lid', t('f.lid'), [
              ['slip', t('f.lid.slip')],
              ['inset', t('f.lid.inset')],
              ['slide', t('f.lid.slide')],
              ['none', t('f.lid.none')],
            ]),
            lid && range(ctl, 'clearance', t('f.clearance'), { min: 0, max: 1, step: 0.05, unit: t('u.mm') }),
            lid && hint(t('f.clearanceHint')),
            lid && range(ctl, 'lidThickness', t('f.lidThickness'), { min: 1.2, max: 5, step: 0.1, unit: t('u.mm') }),
            lid && s.lid !== 'slide' && range(ctl, 'lipHeight', t('f.lipHeight'), { min: 2, max: 20, step: 0.5, unit: t('u.mm') }),
            lid && text(ctl, 'lidText', t('f.lidText'), { multiline: true, rows: 2 }),
            lid && s.lidText.trim() !== '' && select(ctl, 'font', t('f.font'), fontOptions(), { fontPreview: true }),
            lid && s.lidText.trim() !== '' && range(ctl, 'textHeight', t('f.height'), { min: 4, max: 40, step: 0.5, unit: t('u.mm') }),
            lid &&
              s.lidText.trim() !== '' &&
              segmented(ctl, 'textStyle', t('f.style'), [
                ['engraved', t('f.style.engraved')],
                ['inlay', t('f.style.inlay')],
              ]),
          ),
          section(
            t('sec.colors'),
            el(
              'div',
              { class: 'swatches' },
              color(ctl, 'boxColor', t('f.boxColor')),
              lid && color(ctl, 'lidColor', t('f.lidColor')),
              lid && s.textStyle === 'inlay' && color(ctl, 'textColor', t('f.textColor')),
            ),
          ),
        ];
      },
    },
    container,
  );
}
