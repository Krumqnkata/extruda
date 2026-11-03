// SPDX-License-Identifier: AGPL-3.0-or-later
// Option lists reused by several tools.
import { FONTS } from '../core/fonts';
import { ICON_EMOJI, ICON_IDS } from '../core/shapes';
import { t, tr } from '../i18n';

export const fontOptions = (): [string, string][] => FONTS.map((f) => [f.id, f.name]);

export const styleOptions = (): [string, string][] => [
  ['raised', t('f.style.raised')],
  ['engraved', t('f.style.engraved')],
  ['inlay', t('f.style.inlay')],
];

const ICON_NAMES: Record<string, [string, string]> = {
  heart: ['Heart', 'Сърце'],
  star: ['Star', 'Звезда'],
  paw: ['Paw', 'Лапичка'],
  crown: ['Crown', 'Корона'],
  note: ['Music note', 'Нота'],
  bolt: ['Lightning', 'Светкавица'],
  flower: ['Flower', 'Цвете'],
  cloud: ['Cloud', 'Облак'],
  shield: ['Shield', 'Щит'],
  snowflake: ['Snowflake', 'Снежинка'],
  tree: ['Christmas tree', 'Елха'],
  circle: ['Circle', 'Кръг'],
  hexagon: ['Hexagon', 'Шестоъгълник'],
};

export const iconOptions = (): [string, string][] =>
  ICON_IDS.map((id) => [id, `${ICON_EMOJI[id] ?? ''}  ${ICON_NAMES[id] ? tr(ICON_NAMES[id]) : id}`]);
