// SPDX-License-Identifier: AGPL-3.0-or-later
import { download, fileSafe, partsToSTL, zipFiles } from '../core/export';
import { build } from '../core/manifold';
import { KEYCHAIN_DEFAULTS, keychainParts, type KeychainParams } from '../core/models';
import { FONTS } from '../core/fonts';
import { loadFont } from '../core/text';
import { t } from '../i18n';
import { button, color, el, hint, range, section, segmented, select, text, type Ctl } from '../ui/form';
import { icons } from '../ui/icons';
import { mountModelTool } from '../ui/modelTool';

type State = KeychainParams & { font: string; batch: string };

export const fontOptions = (): [string, string][] => FONTS.map((f) => [f.id, f.name]);

export const styleOptions = (): [string, string][] => [
  ['raised', t('f.style.raised')],
  ['engraved', t('f.style.engraved')],
  ['inlay', t('f.style.inlay')],
];

export function mount(container: HTMLElement): () => void {
  return mountModelTool<State>(
    {
      id: 'keychain',
      titleKey: 'tool.keychain.title',
      descKey: 'tool.keychain.desc',
      defaults: { ...KEYCHAIN_DEFAULTS, font: 'lobster', batch: 'Мария\nГеорги\nAlex' },
      build: (m, font, s) => keychainParts(m, font, s),
      fileName: (s) => `keychain_${s.text}`,
      controls: (ctl: Ctl<State>) => {
        const s = ctl.state;
        return [
          section(
            t('sec.text'),
            text(ctl, 'text', t('f.text'), { multiline: true, rows: 1, hint: t('f.textHint'), big: true }),
            select(ctl, 'font', t('f.font'), fontOptions(), { fontPreview: true }),
            range(ctl, 'height', t('f.height'), { min: 5, max: 40, step: 0.5, unit: t('u.mm') }),
            range(ctl, 'spacing', t('f.spacing'), { min: -3, max: 5, step: 0.1, unit: t('u.mm') }),
          ),
          section(
            t('sec.shape'),
            range(ctl, 'border', t('f.border'), { min: 1, max: 10, step: 0.5, unit: t('u.mm') }),
            range(ctl, 'smooth', t('f.smooth'), { min: 0, max: 8, step: 0.5, unit: t('u.mm') }),
            segmented(ctl, 'style', t('f.style'), styleOptions(), t('f.styleHint')),
          ),
          section(
            t('sec.ring'),
            segmented(ctl, 'ring', t('f.ring'), [
              ['left', t('f.ring.left')],
              ['top', t('f.ring.top')],
              ['right', t('f.ring.right')],
              ['none', t('f.ring.none')],
            ]),
            s.ring !== 'none' && range(ctl, 'ringDiameter', t('f.ringDiameter'), { min: 6, max: 20, step: 0.5, unit: t('u.mm') }),
            s.ring !== 'none' && range(ctl, 'holeDiameter', t('f.holeDiameter'), { min: 2, max: 12, step: 0.5, unit: t('u.mm') }),
          ),
          section(
            t('sec.thickness'),
            range(ctl, 'baseThickness', t('f.base'), { min: 1, max: 8, step: 0.2, unit: t('u.mm') }),
            range(ctl, 'textThickness', t('f.textThickness'), { min: 0.4, max: 6, step: 0.2, unit: t('u.mm') }),
          ),
          section(
            t('sec.colors'),
            el('div', { class: 'swatches' }, color(ctl, 'baseColor', t('f.baseColor')), color(ctl, 'textColor', t('f.textColor'))),
            hint(t('f.colorHint')),
          ),
          section(
            t('sec.batch'),
            text(ctl, 'batch', t('f.batchNames'), { multiline: true, rows: 4, hint: t('f.batchHint') }),
            button(t('a.zip'), () => void batchZip(s), { icon: icons.zip }),
          ),
        ];
      },
    },
    container,
  );
}

async function batchZip(s: State): Promise<void> {
  const names = s.batch.split(/\r?\n/).map((n) => n.trim()).filter(Boolean);
  if (!names.length) return;
  const font = await loadFont(s.font);
  const files: Record<string, Uint8Array> = {};
  for (const name of names) {
    const parts = await build((m) => keychainParts(m, font, { ...s, text: name }));
    if (!parts.length) continue;
    let file = `${fileSafe(name)}.stl`;
    for (let i = 2; files[file]; i++) file = `${fileSafe(name)}_${i}.stl`;
    files[file] = partsToSTL(parts, `Extruda keychain ${name}`);
  }
  download(zipFiles(files), 'keychains.zip', 'application/zip');
}
