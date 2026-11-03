// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  BRIDGE_DEFAULTS, bridgeParts, OVERHANG_DEFAULTS, overhangParts, TOLERANCE_DEFAULTS, toleranceParts,
} from '../core/printer';
import { t } from '../i18n';
import { hint, range, section, segmented, text, type Ctl } from '../ui/form';
import { mountModelTool } from '../ui/modelTool';

interface State {
  font: string;
  test: 'tolerance' | 'overhang' | 'bridge';
  gaps: string;
  pin: number;
  angles: string;
  overhangHeight: number;
  spans: string;
  bridgeHeight: number;
}

export function mount(container: HTMLElement): () => void {
  return mountModelTool<State>(
    {
      id: 'calibration',
      title: t('tool.calibration.title'),
      desc: t('tool.calibration.desc'),
      defaults: {
        font: 'russo',
        test: 'tolerance',
        gaps: TOLERANCE_DEFAULTS.gaps,
        pin: TOLERANCE_DEFAULTS.pin,
        angles: OVERHANG_DEFAULTS.angles,
        overhangHeight: OVERHANG_DEFAULTS.height,
        spans: BRIDGE_DEFAULTS.spans,
        bridgeHeight: BRIDGE_DEFAULTS.height,
      },
      separateObjects: true,
      build: (m, font, s) => {
        if (s.test === 'tolerance') return toleranceParts(m, font, { ...TOLERANCE_DEFAULTS, gaps: s.gaps, pin: s.pin });
        if (s.test === 'overhang') return overhangParts(m, font, { ...OVERHANG_DEFAULTS, angles: s.angles, height: s.overhangHeight });
        return bridgeParts(m, font, { ...BRIDGE_DEFAULTS, spans: s.spans, height: s.bridgeHeight });
      },
      fileName: (s) => `calibration_${s.test}`,
      controls: (ctl: Ctl<State>) => {
        const s = ctl.state;
        return [
          section(
            t('f.test'),
            segmented(ctl, 'test', t('f.test'), [
              ['tolerance', t('f.test.tolerance')],
              ['overhang', t('f.test.overhang')],
              ['bridge', t('f.test.bridge')],
            ]),
            s.test === 'tolerance' && text(ctl, 'gaps', t('f.gaps'), { hint: t('f.listHint') }),
            s.test === 'tolerance' && range(ctl, 'pin', t('f.pin'), { min: 4, max: 20, step: 0.5, unit: t('u.mm') }),
            s.test === 'tolerance' && hint(t('f.tolHint')),
            s.test === 'overhang' && text(ctl, 'angles', t('f.angles'), { hint: t('f.listHint') }),
            s.test === 'overhang' && range(ctl, 'overhangHeight', t('f.testHeight'), { min: 5, max: 30, step: 1, unit: t('u.mm') }),
            s.test === 'overhang' && hint(t('f.ovHint')),
            s.test === 'bridge' && text(ctl, 'spans', t('f.spans'), { hint: t('f.listHint') }),
            s.test === 'bridge' && range(ctl, 'bridgeHeight', t('f.testHeight'), { min: 3, max: 30, step: 1, unit: t('u.mm') }),
            s.test === 'bridge' && hint(t('f.brHint')),
          ),
        ];
      },
    },
    container,
  );
}
