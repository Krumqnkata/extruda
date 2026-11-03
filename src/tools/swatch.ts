// SPDX-License-Identifier: AGPL-3.0-or-later
import { build } from '../core/manifold';
import { SWATCH_DEFAULTS, swatchParts, type SwatchParams } from '../core/printer';
import { loadFont } from '../core/text';
import { t } from '../i18n';
import { check, color, el, range, section, segmented, select, text, type Ctl } from '../ui/form';
import { mountModelTool } from '../ui/modelTool';
import { fontOptions } from '../ui/options';
import { downloadPlates, PLATE_DEFAULTS, plateSection, type PlateState } from '../ui/plate';

type State = SwatchParams & PlateState & { font: string; batch: string };

/** "brand; material; colour; temps" lines → swatch settings. */
export function parseSwatchLines(s: string): Pick<SwatchParams, 'brand' | 'material' | 'colorName' | 'temps'>[] {
  return s
    .split(/\r?\n/)
    .map((line) => line.split(';').map((v) => v.trim()))
    .filter((cols) => cols.some(Boolean))
    .map(([brand = '', material = '', colorName = '', temps = '']) => ({ brand, material, colorName, temps }));
}

export function mount(container: HTMLElement): () => void {
  return mountModelTool<State>(
    {
      id: 'swatch',
      title: t('tool.swatch.title'),
      desc: t('tool.swatch.desc'),
      defaults: {
        ...SWATCH_DEFAULTS,
        ...PLATE_DEFAULTS,
        font: 'ptsans',
        batch: 'Bambu Lab; PLA Basic; Black; 220°C / 60°C\nPrusament; PETG; Galaxy Black; 250°C / 85°C\neSun; PLA+; Fire Engine Red; 215°C / 60°C',
      },
      linkOmit: ['batch'],
      build: (m, font, s) => swatchParts(m, font, s),
      fileName: (s) => `swatch_${s.brand}_${s.material}_${s.colorName}`,
      controls: (ctl: Ctl<State>) => {
        const s = ctl.state;
        const status = el('p', { class: 'hint', role: 'status' });
        return [
          section(
            t('sec.text'),
            text(ctl, 'brand', t('f.brand')),
            text(ctl, 'material', t('f.material')),
            text(ctl, 'colorName', t('f.colorName')),
            text(ctl, 'temps', t('f.temps')),
            select(ctl, 'font', t('f.font'), fontOptions(), { fontPreview: true }),
            segmented(ctl, 'textStyle', t('f.style'), [
              ['engraved', t('f.style.engraved')],
              ['raised', t('f.style.raised')],
            ]),
          ),
          section(
            t('sec.size'),
            range(ctl, 'width', t('f.width'), { min: 40, max: 120, step: 1, unit: t('u.mm') }),
            range(ctl, 'height', t('f.plateHeight'), { min: 25, max: 80, step: 1, unit: t('u.mm') }),
            range(ctl, 'thickness', t('f.thickness'), { min: 1.6, max: 5, step: 0.2, unit: t('u.mm') }),
            check(ctl, 'steps', t('f.steps')),
            color(ctl, 'color', t('f.color')),
          ),
          plateSection(
            ctl,
            () =>
              void downloadPlates(s, 'swatches', async () => {
                const font = await loadFont(s.font);
                const out = [];
                for (const row of parseSwatchLines(s.batch)) {
                  out.push({ name: `${row.brand} ${row.material} ${row.colorName}`.trim(), parts: await build((m) => swatchParts(m, font, { ...s, ...row })) });
                }
                return out;
              }, (msg) => (status.textContent = msg)),
            [text(ctl, 'batch', t('f.swatchBatch'), { multiline: true, rows: 5 }), status],
          ),
        ];
      },
    },
    container,
  );
}
