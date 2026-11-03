// SPDX-License-Identifier: AGPL-3.0-or-later
import { BASEPLATE_DEFAULTS, baseplateParts, BIN_DEFAULTS, binParts, planBaseplate, type BaseplateParams, type BinParams } from '../core/gridfinity';
import { fmt, t } from '../i18n';
import { check, color, hint, number, range, section, segmented, type Ctl } from '../ui/form';
import { mountModelTool } from '../ui/modelTool';
import { bedControls, bedSize, PLATE_DEFAULTS, type PlateState } from '../ui/plate';

type State = BinParams & Omit<BaseplateParams, 'bedW' | 'bedD' | 'color'> & PlateState & { font: string; mode: 'bin' | 'baseplate'; plateColor: string };

export function mount(container: HTMLElement): () => void {
  const { color: plateColor, bedW: _w, bedD: _d, ...plate } = BASEPLATE_DEFAULTS;
  return mountModelTool<State>(
    {
      id: 'gridfinity',
      title: t('tool.gridfinity.title'),
      desc: t('tool.gridfinity.desc'),
      defaults: { ...BIN_DEFAULTS, ...plate, ...PLATE_DEFAULTS, plateColor, font: 'russo', mode: 'bin' },
      separateObjects: true,
      build: (m, _font, s) => {
        if (s.mode === 'bin') return binParts(m, s);
        const [bedW, bedD] = bedSize(s);
        return baseplateParts(m, { ...s, bedW, bedD, color: s.plateColor });
      },
      fileName: (s) => (s.mode === 'bin' ? `gridfinity_bin_${s.gx}x${s.gy}x${s.units}` : `gridfinity_baseplate_${s.drawerW}x${s.drawerD}`),
      controls: (ctl: Ctl<State>) => {
        const s = ctl.state;
        const mode = segmented(ctl, 'mode', t('f.gf.mode'), [
          ['bin', t('f.gf.bin')],
          ['baseplate', t('f.gf.baseplate')],
        ]);
        if (s.mode === 'bin') {
          return [
            section(
              t('sec.size'),
              mode,
              range(ctl, 'gx', t('f.gx'), { min: 1, max: 8, step: 1 }),
              range(ctl, 'gy', t('f.gy'), { min: 1, max: 8, step: 1 }),
              range(ctl, 'units', t('f.units'), { min: 2, max: 20, step: 1 }),
              check(ctl, 'lip', t('f.lip')),
              check(ctl, 'magnets', t('f.magnets')),
            ),
            section(
              t('sec.shape'),
              range(ctl, 'dividersX', t('f.dividersX'), { min: 0, max: 8, step: 1 }),
              range(ctl, 'dividersY', t('f.dividersY'), { min: 0, max: 8, step: 1 }),
              check(ctl, 'label', t('f.labelShelf')),
              range(ctl, 'wall', t('f.wall'), { min: 0.8, max: 2.6, step: 0.05, unit: t('u.mm') }),
              color(ctl, 'color', t('f.color')),
              hint(t('f.gfHint')),
            ),
          ];
        }
        const planText = () => {
          const [bedW, bedD] = bedSize(s);
          const plan = planBaseplate({ ...s, bedW, bedD, color: s.plateColor });
          return t('f.gfPlan', {
            gx: plan.gx,
            gy: plan.gy,
            pieces: plan.splitX.length * plan.splitY.length,
            px: fmt(plan.padX),
            py: fmt(plan.padY),
          });
        };
        const planHint = hint(planText());
        // Keeps the cell count up to date while typing, without redrawing the inputs.
        const planCtl: Ctl<State> = {
          state: s,
          change(structural) {
            planHint.textContent = planText();
            ctl.change(structural);
          },
        };
        return [
          section(
            t('sec.size'),
            mode,
            number(planCtl, 'drawerW', t('f.drawerW'), { unit: t('u.mm'), min: 42 }),
            number(planCtl, 'drawerD', t('f.drawerD'), { unit: t('u.mm'), min: 42 }),
            check(planCtl, 'fill', t('f.fill')),
            ...bedControls(planCtl),
            planHint,
            color(ctl, 'plateColor', t('f.color')),
            hint(t('f.gfHint')),
          ),
        ];
      },
    },
    container,
  );
}
