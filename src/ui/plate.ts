// SPDX-License-Identifier: AGPL-3.0-or-later
// "Full build plate" section: arranges many generated models on printer plates.
import { download, fileSafe, objectsTo3MF, zipFiles } from '../core/export';
import { arrangeOnPlates, BEDS, type PlateModel } from '../core/layout';
import { t } from '../i18n';
import { button, el, hint, number, range, section, select, type Ctl } from './form';
import { icons } from './icons';

export interface PlateState {
  bed: string;
  bedW: number;
  bedD: number;
  gap: number;
}

export const PLATE_DEFAULTS: PlateState = { bed: 'bambu', bedW: 256, bedD: 256, gap: 4 };

export function bedSize(s: PlateState): [number, number] {
  const bed = BEDS.find((b) => b.id === s.bed);
  return bed ? [bed.w, bed.h] : [s.bedW, s.bedD];
}

export function bedControls<S extends PlateState>(ctl: Ctl<S>): Node[] {
  return [
    select(ctl, 'bed', t('f.bed'), [...BEDS.map((b) => [b.id, b.name] as [string, string]), ['custom', t('f.bedCustom')]]),
    ctl.state.bed === 'custom' && number(ctl, 'bedW', t('f.bedW'), { unit: t('u.mm'), min: 50 }),
    ctl.state.bed === 'custom' && number(ctl, 'bedD', t('f.bedD'), { unit: t('u.mm'), min: 50 }),
  ].filter(Boolean) as Node[];
}

/** Builds every model, arranges them and downloads one 3MF (or a ZIP of plates). */
export async function downloadPlates(s: PlateState, name: string, makeModels: () => Promise<PlateModel[]>, setStatus: (msg: string) => void): Promise<void> {
  const models = (await makeModels()).filter((m) => m.parts.length);
  if (!models.length) return;
  const [w, d] = bedSize(s);
  const plates = arrangeOnPlates(models, w, d, s.gap);
  setStatus(t('s.plates', { n: models.length, p: plates.length }));
  if (plates.length === 1) {
    download(objectsTo3MF(plates[0], name), `${fileSafe(name)}.3mf`, 'model/3mf');
    return;
  }
  const files: Record<string, Uint8Array> = {};
  plates.forEach((plate, i) => (files[`${fileSafe(name)}_plate${i + 1}.3mf`] = objectsTo3MF(plate, `${name} ${i + 1}`)));
  download(zipFiles(files), `${fileSafe(name)}_plates.zip`, 'application/zip');
}

export function plateSection<S extends PlateState>(ctl: Ctl<S>, onPlate: () => void, extra: Node[] = []): HTMLElement {
  return section(
    t('sec.plate'),
    ...extra,
    ...bedControls(ctl),
    range(ctl, 'gap', t('f.gap'), { min: 1, max: 20, step: 0.5, unit: t('u.mm') }),
    el('div', { class: 'row' }, button(t('a.plate'), onPlate, { icon: icons.grid })),
    hint(t('f.plateHint')),
  );
}
