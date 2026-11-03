// SPDX-License-Identifier: AGPL-3.0-or-later
import { download, fileSafe, partsToSTL, zipFiles } from '../core/export';
import { build } from '../core/manifold';
import { KEYCHAIN_DEFAULTS, keychainParts, type KeychainParams } from '../core/models';
import { loadFont } from '../core/text';
import { t } from '../i18n';
import { artAsShape2D, artDropZone } from '../ui/artSource';
import { button, color, el, hint, range, section, segmented, select, text, type Ctl } from '../ui/form';
import { icons } from '../ui/icons';
import { mountModelTool } from '../ui/modelTool';
import { fontOptions, iconOptions, styleOptions } from '../ui/options';
import { downloadPlates, PLATE_DEFAULTS, plateSection, type PlateState } from '../ui/plate';

type State = KeychainParams & PlateState & { font: string; batch: string };

const customIcon = () => artAsShape2D('keychain', { threshold: 0.5, invertImage: false });

export function mount(container: HTMLElement): () => void {
  return mountModelTool<State>(
    {
      id: 'keychain',
      title: t('tool.keychain.title'),
      desc: t('tool.keychain.desc'),
      defaults: { ...KEYCHAIN_DEFAULTS, ...PLATE_DEFAULTS, font: 'lobster', batch: 'Мария\nГеорги\nAlex' },
      linkOmit: ['batch'],
      build: (m, font, s) => keychainParts(m, font, s, s.icon === 'custom' ? customIcon() : undefined),
      fileName: (s) => `keychain_${s.text}`,
      controls: (ctl: Ctl<State>) => {
        const s = ctl.state;
        const status = el('p', { class: 'hint', role: 'status' });
        return [
          section(
            t('sec.text'),
            text(ctl, 'text', t('f.text'), { multiline: true, rows: 1, hint: t('f.textHint'), big: true }),
            select(ctl, 'font', t('f.font'), fontOptions(), { fontPreview: true }),
            range(ctl, 'height', t('f.height'), { min: 5, max: 40, step: 0.5, unit: t('u.mm') }),
            range(ctl, 'spacing', t('f.spacing'), { min: -3, max: 5, step: 0.1, unit: t('u.mm') }),
          ),
          section(
            t('f.icon'),
            select(ctl, 'icon', t('f.icon'), [['', t('f.icon.none')], ...iconOptions(), ['custom', t('f.icon.custom')]]),
            s.icon === 'custom' && artDropZone('keychain', () => ctl.change(true)),
            s.icon === 'custom' && hint(t('f.artHint')),
            s.icon !== '' && range(ctl, 'iconSize', t('f.iconSize'), { min: 0, max: 40, step: 0.5, unit: t('u.mm') }),
            s.icon !== '' &&
              segmented(ctl, 'iconPosition', t('f.iconPosition'), [
                ['before', t('f.iconPosition.before')],
                ['after', t('f.iconPosition.after')],
              ]),
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
            status,
          ),
          plateSection(ctl, () => void downloadPlates(s, 'keychains', () => batchModels(s), (msg) => (status.textContent = msg))),
        ];
      },
    },
    container,
  );
}

const names = (s: State) => s.batch.split(/\r?\n/).map((n) => n.trim()).filter(Boolean);

async function batchModels(s: State) {
  const font = await loadFont(s.font);
  const icon = s.icon === 'custom' ? customIcon() : undefined;
  const out = [];
  for (const name of names(s)) out.push({ name, parts: await build((m) => keychainParts(m, font, { ...s, text: name }, icon)) });
  return out;
}

async function batchZip(s: State): Promise<void> {
  const files: Record<string, Uint8Array> = {};
  for (const { name, parts } of await batchModels(s)) {
    if (!parts.length) continue;
    let file = `${fileSafe(name)}.stl`;
    for (let i = 2; files[file]; i++) file = `${fileSafe(name)}_${i}.stl`;
    files[file] = partsToSTL(parts, `Extruda keychain ${name}`);
  }
  if (Object.keys(files).length) download(zipFiles(files), 'keychains.zip', 'application/zip');
}
