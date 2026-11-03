// SPDX-License-Identifier: AGPL-3.0-or-later
// Gifts, pets and holidays: small personalised flat prints.
import type { CrossSection, ManifoldToplevel } from 'manifold-3d';
import { addRing, circle, emptyCS, fillHoles, plateShape, SEGMENTS, styledParts } from '../core/models';
import { iconPolygons } from '../core/shapes';
import { num, str, textCS, type GalleryModel, type Values } from './types';

type Style = 'raised' | 'engraved' | 'inlay';

const styleParam = { key: 'style', label: ['Text style', 'Стил на текста'], type: 'select', options: [['raised', ['Raised', 'Изпъкнал']], ['engraved', ['Engraved', 'Гравиран']], ['inlay', ['Flush inlay', 'Вграден (плосък)']]] } as const;
const colorParams = [
  { key: 'baseColor', label: ['Base', 'Основа'], type: 'color' },
  { key: 'textColor', label: ['Text', 'Текст'], type: 'color' },
] as const;

function flat(m: ManifoldToplevel, base: CrossSection, text: CrossSection | undefined, v: Values, extra2D?: CrossSection, back2D?: CrossSection) {
  return styledParts(m, base, text ?? emptyCS(m), {
    style: str(v, 'style') as Style,
    baseThickness: num(v, 'thickness'),
    textThickness: 1,
    baseColor: str(v, 'baseColor'),
    textColor: str(v, 'textColor'),
    extra2D,
    back2D,
  });
}

function shapeCS(m: ManifoldToplevel, shape: string, size: number): CrossSection {
  if (shape === 'circle') return m.CrossSection.circle(size / 2, 128);
  if (shape === 'bone') {
    const w = size, h = size * 0.55, r = h * 0.32;
    return m.CrossSection.union([
      m.CrossSection.square([w - 2 * r, h * 0.55], true),
      circle(m, r, -(w / 2 - r), h / 2 - r), circle(m, r, -(w / 2 - r), -(h / 2 - r)),
      circle(m, r, w / 2 - r, h / 2 - r), circle(m, r, w / 2 - r, -(h / 2 - r)),
    ]);
  }
  return m.CrossSection.ofPolygons(iconPolygons(shape, size), 'NonZero');
}

export const GIFTS: GalleryModel[] = [
  {
    id: 'bookmark',
    category: 'gifts',
    emoji: '🔖',
    title: ['Bookmark with a name', 'Отметка за книга с име'],
    desc: ['A slim bookmark with a name running along it and a hole for a tassel.', 'Тънка отметка с име по дължината и отвор за пискюл.'],
    defaults: { font: 'pacifico', text: 'Елена', length: 150, width: 40, thickness: 1.6, textHeight: 16, style: 'raised', baseColor: '#7c3aed', textColor: '#fde68a' },
    params: [
      { key: 'text', label: ['Name', 'Име'], type: 'text' },
      { key: 'font', label: ['Font', 'Шрифт'], type: 'font' },
      { key: 'textHeight', label: ['Letter height', 'Височина на буквите'], type: 'range', min: 6, max: 30, step: 0.5, unit: 'mm' },
      { key: 'length', label: ['Length', 'Дължина'], type: 'range', min: 80, max: 220, step: 1, unit: 'mm' },
      { key: 'width', label: ['Width', 'Ширина'], type: 'range', min: 20, max: 60, step: 1, unit: 'mm' },
      { key: 'thickness', label: ['Thickness', 'Дебелина'], type: 'range', min: 1, max: 3, step: 0.2, unit: 'mm' },
      styleParam,
      ...colorParams,
    ],
    build(m, font, v) {
      const L = num(v, 'length'), W = num(v, 'width');
      let base = plateShape(m, 'rounded', W, L, 6);
      base = base.subtract(circle(m, 2.5, 0, L / 2 - 8));
      const text = textCS(m, font, str(v, 'text'), num(v, 'textHeight'), L - 34)?.rotate(90).translate([0, -6]);
      return flat(m, base, text, v);
    },
  },
  {
    id: 'gift-tag',
    category: 'gifts',
    emoji: '🎁',
    title: ['Gift tag', 'Етикет за подарък'],
    desc: ['A luggage-style tag with a ribbon hole: "For Maria", "From Grandma"…', 'Етикет с отвор за панделка: „За Мария“, „От баба“…'],
    defaults: { font: 'lobster', text: 'За\nМария', width: 60, height: 36, thickness: 2, textHeight: 9, style: 'raised', baseColor: '#dc2626', textColor: '#fef3c7' },
    params: [
      { key: 'text', label: ['Text', 'Текст'], type: 'text', multiline: true },
      { key: 'font', label: ['Font', 'Шрифт'], type: 'font' },
      { key: 'textHeight', label: ['Letter height', 'Височина на буквите'], type: 'range', min: 4, max: 20, step: 0.5, unit: 'mm' },
      { key: 'width', label: ['Width', 'Ширина'], type: 'range', min: 40, max: 120, step: 1, unit: 'mm' },
      { key: 'height', label: ['Height', 'Височина'], type: 'range', min: 25, max: 80, step: 1, unit: 'mm' },
      { key: 'thickness', label: ['Thickness', 'Дебелина'], type: 'range', min: 1.2, max: 4, step: 0.2, unit: 'mm' },
      styleParam,
      ...colorParams,
    ],
    build(m, font, v) {
      const W = num(v, 'width'), H = num(v, 'height'), c = Math.min(H * 0.35, 12);
      const base = m.CrossSection.ofPolygons([[-W / 2 + c, H / 2], [W / 2, H / 2], [W / 2, -H / 2], [-W / 2 + c, -H / 2], [-W / 2, -H / 2 + c], [-W / 2, H / 2 - c]], 'NonZero')
        .offset(-1.5, 'Round', 2, SEGMENTS).offset(1.5, 'Round', 2, SEGMENTS)
        .subtract(circle(m, 2.5, -W / 2 + 6, 0));
      const text = textCS(m, font, str(v, 'text'), num(v, 'textHeight'), W - 22)?.translate([5, 0]);
      return flat(m, base, text, v);
    },
  },
  {
    id: 'ornament',
    category: 'holiday',
    emoji: '🎄',
    title: ['Christmas ornament with a name', 'Коледна играчка с име'],
    desc: ['A tree decoration in the shape of a ball, star, heart or snowflake, with a name and a loop.', 'Украса за елха – топка, звезда, сърце или снежинка, с име и халка.'],
    defaults: { font: 'lobster', text: 'Ема', shape: 'circle', size: 70, thickness: 3, textHeight: 14, style: 'raised', baseColor: '#b91c1c', textColor: '#fde68a' },
    params: [
      { key: 'text', label: ['Name', 'Име'], type: 'text' },
      { key: 'font', label: ['Font', 'Шрифт'], type: 'font' },
      { key: 'textHeight', label: ['Letter height', 'Височина на буквите'], type: 'range', min: 6, max: 30, step: 0.5, unit: 'mm' },
      { key: 'shape', label: ['Shape', 'Форма'], type: 'select', options: [['circle', ['Ball', 'Топка']], ['star', ['Star', 'Звезда']], ['heart', ['Heart', 'Сърце']], ['snowflake', ['Snowflake', 'Снежинка']], ['tree', ['Tree', 'Елха']]] },
      { key: 'size', label: ['Size', 'Размер'], type: 'range', min: 40, max: 120, step: 1, unit: 'mm' },
      { key: 'thickness', label: ['Thickness', 'Дебелина'], type: 'range', min: 1.6, max: 6, step: 0.2, unit: 'mm' },
      styleParam,
      ...colorParams,
    ],
    build(m, font, v) {
      const size = num(v, 'size');
      let base = shapeCS(m, str(v, 'shape'), size);
      // Thin decorative shapes get a backing disc so the name has room.
      if (str(v, 'shape') === 'snowflake') base = m.CrossSection.union(base, m.CrossSection.circle(size * 0.3, 96));
      base = fillHoles(m, base.offset(1, 'Round', 2, SEGMENTS).offset(-1, 'Round', 2, SEGMENTS));
      base = addRing(m, base, 'top', 9, 4);
      const text = textCS(m, font, str(v, 'text'), num(v, 'textHeight'), size * 0.62);
      return flat(m, base, text, v);
    },
  },
  {
    id: 'pet-tag',
    category: 'pets',
    emoji: '🐶',
    title: ['Pet ID tag', 'Медальон за домашен любимец'],
    desc: ['Name on the front, phone number engraved on the back. Bone, circle or heart.', 'Име отпред, телефон, гравиран отзад. Кокал, кръг или сърце.'],
    defaults: { font: 'russo', text: 'Рекс', phone: '0888 123 456', shape: 'bone', size: 42, thickness: 3, textHeight: 8, style: 'raised', baseColor: '#2563eb', textColor: '#f8fafc' },
    params: [
      { key: 'text', label: ['Name', 'Име'], type: 'text' },
      { key: 'phone', label: ['Phone (back side)', 'Телефон (отзад)'], type: 'text' },
      { key: 'font', label: ['Font', 'Шрифт'], type: 'font' },
      { key: 'textHeight', label: ['Letter height', 'Височина на буквите'], type: 'range', min: 4, max: 16, step: 0.5, unit: 'mm' },
      { key: 'shape', label: ['Shape', 'Форма'], type: 'select', options: [['bone', ['Bone', 'Кокал']], ['circle', ['Circle', 'Кръг']], ['heart', ['Heart', 'Сърце']], ['paw', ['Paw', 'Лапичка']]] },
      { key: 'size', label: ['Size', 'Размер'], type: 'range', min: 25, max: 70, step: 1, unit: 'mm' },
      { key: 'thickness', label: ['Thickness', 'Дебелина'], type: 'range', min: 2, max: 5, step: 0.2, unit: 'mm' },
      styleParam,
      ...colorParams,
    ],
    build(m, font, v) {
      const size = num(v, 'size');
      let base = shapeCS(m, str(v, 'shape'), size);
      base = fillHoles(m, base.offset(1.5, 'Round', 2, SEGMENTS).offset(-1.5, 'Round', 2, SEGMENTS));
      base = addRing(m, base, str(v, 'shape') === 'bone' ? 'left' : 'top', 8, 3.5);
      const text = textCS(m, font, str(v, 'text'), num(v, 'textHeight'), size * 0.62);
      const phone = textCS(m, font, str(v, 'phone'), Math.max(3, num(v, 'textHeight') * 0.5), size * 0.7);
      // Mirrored so the number reads correctly when the tag is turned over.
      return flat(m, base, text, v, undefined, phone?.mirror([1, 0]));
    },
  },
];
