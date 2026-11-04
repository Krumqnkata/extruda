// SPDX-License-Identifier: AGPL-3.0-or-later
// Personalised gifts built from letters: dual-name illusion, rings, bracelets and a desk calendar.
import type { CrossSection, Manifold, ManifoldToplevel, Vec3 } from 'manifold-3d';
import type { Font } from 'opentype.js';
import { toTriMesh } from '../core/manifold';
import type { Part } from '../core/mesh';
import { circle } from '../core/models';
import { textToPolygons } from '../core/text';
import { bool, num, standUp, str, textCS, wrapOnCylinder, type Param, type Values, type GalleryModel } from './types';

// ---------------------------------------------------------------- dual-name illusion

interface Glyph {
  cs: CrossSection;
  width: number;
}

/** One letter, centred horizontally with its baseline at y = 0. */
function glyph(m: ManifoldToplevel, font: Font, ch: string, height: number): Glyph | undefined {
  const shape = textToPolygons(font, ch, { height });
  if (!shape.polygons.length) return undefined;
  const cs = m.CrossSection.ofPolygons(shape.polygons, 'NonZero').translate([-(shape.min[0] + shape.max[0]) / 2, 0]);
  return { cs, width: shape.max[0] - shape.min[0] };
}

/** Letter readable from the front (looking along +Y), extruded along Y. */
function frontPrism(m: ManifoldToplevel, cs: CrossSection, depth: number): Manifold {
  return m.Manifold.extrude(cs, depth)
    .translate([0, 0, -depth / 2])
    .warp((v) => {
      const [u, h, w] = [v[0], v[1], v[2]];
      v[0] = u;
      v[1] = -w;
      v[2] = h;
    });
}

/** The letters of a name, without spaces. */
function letters(s: string, upper: boolean): string[] {
  return [...(upper ? s.toUpperCase() : s).replace(/\s+/g, '')];
}

const dualIllusion: GalleryModel = {
  id: 'dual-illusion',
  category: 'gifts',
  emoji: '🔠',
  title: ['Dual-name illusion', 'Двойна илюзия с имена'],
  desc: ['One solid that reads one name from the front and another from the side.', 'Едно тяло, което отпред чете едно име, а отстрани друго.'],
  defaults: { font: 'russo', text: 'МАМА', text2: 'ТАТО', height: 30, gap: 2, base: 3, upper: true, letterColor: '#ff7a1a', baseColor: '#1f2937' },
  params: [
    { key: 'text', label: ['Name from the front', 'Име отпред'], type: 'text' },
    { key: 'text2', label: ['Name from the side', 'Име отстрани'], type: 'text' },
    { key: 'font', label: ['Font', 'Шрифт'], type: 'font' },
    { key: 'upper', label: ['Capital letters', 'Главни букви'], type: 'check' },
    { hint: ['Works best with bold capitals and names of equal length. Extra letters in a longer name show up as a thin bar from the other side.', 'Получава се най-добре с дебели главни букви и имена с еднаква дължина. Излишните букви на по-дългото име се виждат като тънка лента от другата страна.'] },
    { key: 'height', label: ['Letter height', 'Височина на буквите'], type: 'range', min: 15, max: 80, step: 1, unit: 'mm' },
    { key: 'gap', label: ['Gap between letters', 'Разстояние между буквите'], type: 'range', min: 0.5, max: 10, step: 0.5, unit: 'mm' },
    { key: 'base', label: ['Base thickness', 'Дебелина на основата'], type: 'range', min: 1.6, max: 8, step: 0.2, unit: 'mm' },
    { key: 'letterColor', label: ['Letters', 'Букви'], type: 'color' },
    { key: 'baseColor', label: ['Base', 'Основа'], type: 'color' },
  ],
  build(m, font, v) {
    const { Manifold, CrossSection } = m;
    const upper = bool(v, 'upper');
    const a = letters(str(v, 'text'), upper);
    const b = letters(str(v, 'text2'), upper);
    const count = Math.max(a.length, b.length);
    if (!count) return [];
    const h = num(v, 'height'), baseT = num(v, 'base');
    const pairs = Array.from({ length: count }, (_, i) => ({
      front: a[i] ? glyph(m, font, a[i], h) : undefined,
      side: b[i] ? glyph(m, font, b[i], h) : undefined,
    }));
    const widest = Math.max(1, ...pairs.flatMap((p) => [p.front?.width ?? 0, p.side?.width ?? 0]));
    const depth = widest + 2;
    const pitch = widest + num(v, 'gap');
    const thin = Math.min(3, widest / 4); // a letter with no partner stands as a thin slab

    const blocks: Manifold[] = [];
    pairs.forEach((p, i) => {
      let block: Manifold;
      if (p.front && p.side) block = frontPrism(m, p.front.cs, depth).intersect(standUp(m, p.side.cs, depth));
      else if (p.front) block = frontPrism(m, p.front.cs, thin);
      else if (p.side) block = standUp(m, p.side.cs, thin);
      else return;
      // Anything that would float above the base cannot be printed, so it is dropped.
      const standing = block.trimByPlane([0, 0, 1], 0).decompose().filter((piece) => piece.boundingBox().min[2] < 0.01);
      if (standing.length) blocks.push(Manifold.compose(standing).translate([i * pitch, i * pitch, baseT]));
    });
    if (!blocks.length) return [];

    const r = (widest / 2) * Math.SQRT2 + 2;
    const end = (count - 1) * pitch;
    const base2D = CrossSection.hull([circle(m, r, 0, 0), circle(m, r, end, end)]);
    return [
      { name: 'Base', color: str(v, 'baseColor'), mesh: toTriMesh(Manifold.extrude(base2D, baseT)) },
      { name: 'Letters', color: str(v, 'letterColor'), mesh: toTriMesh(Manifold.union(blocks)) },
    ];
  },
};

// ---------------------------------------------------------------- rings and bracelets

const bandParams: Param[] = [
  { key: 'text', label: ['Text', 'Текст'], type: 'text' },
  { key: 'font', label: ['Font', 'Шрифт'], type: 'font' },
  { key: 'style', label: ['Text style', 'Стил на текста'], type: 'select', options: [['raised', ['Raised', 'Изпъкнал']], ['engraved', ['Engraved', 'Гравиран']]] },
];

/** A band of the given inner radius with text around its outside; `gapDeg` leaves a C-shaped opening. */
function bandParts(m: ManifoldToplevel, font: Font, v: Values, innerR: number, gapDeg: number): Part[] {
  const { Manifold } = m;
  const W = num(v, 'width'), T = num(v, 'thickness');
  const R = innerR + T;
  let band = Manifold.cylinder(W, R, R, 128).subtract(Manifold.cylinder(W + 2, innerR, innerR, 128).translate([0, 0, -1]));
  if (gapDeg > 0) {
    // The opening is at the back, opposite the text.
    const far = R * 3, half = Math.tan((gapDeg / 2) * (Math.PI / 180)) * far;
    const wedge: Vec3[] = [
      [0, 0, -1], [-half, far, -1], [half, far, -1],
      [0, 0, W + 1], [-half, far, W + 1], [half, far, W + 1],
    ];
    band = band.subtract(Manifold.hull(wedge));
  }
  const room = (2 * Math.PI - (gapDeg * Math.PI) / 180) * R * 0.85;
  const text = textCS(m, font, str(v, 'text'), Math.min(num(v, 'textHeight'), W * 0.8), room);
  if (!text) return [{ name: 'Band', color: str(v, 'bandColor'), mesh: toTriMesh(band) }];
  if (str(v, 'style') === 'engraved') {
    const cut = wrapOnCylinder(Manifold.extrude(text, 0.8).translate([0, W / 2, -0.6]), R);
    return [{ name: 'Band', color: str(v, 'bandColor'), mesh: toTriMesh(band.subtract(cut)) }];
  }
  const raised = wrapOnCylinder(Manifold.extrude(text, 1).translate([0, W / 2, -0.4]), R);
  return [
    { name: 'Band', color: str(v, 'bandColor'), mesh: toTriMesh(band) },
    { name: 'Text', color: str(v, 'textColor'), mesh: toTriMesh(raised) },
  ];
}

const nameRing: GalleryModel = {
  id: 'name-ring',
  category: 'gifts',
  emoji: '💍',
  title: ['Ring with a name', 'Пръстен с име'],
  desc: ['A band with a name or date around it, sized by the EU ring number.', 'Халка с име или дата, по европейски номер на пръстена.'],
  defaults: { font: 'russo', text: 'Мария', style: 'raised', size: 54, width: 8, thickness: 2, textHeight: 5, bandColor: '#eab308', textColor: '#1f2937' },
  params: [
    ...bandParams,
    { key: 'textHeight', label: ['Letter height', 'Височина на буквите'], type: 'range', min: 2.5, max: 12, step: 0.5, unit: 'mm' },
    { key: 'size', label: ['EU ring size (inner circumference)', 'Номер на пръстена (вътрешна обиколка)'], type: 'range', min: 44, max: 76, step: 1, unit: 'mm' },
    { key: 'width', label: ['Band width', 'Ширина на халката'], type: 'range', min: 4, max: 16, step: 0.5, unit: 'mm' },
    { key: 'thickness', label: ['Band thickness', 'Дебелина на халката'], type: 'range', min: 1.2, max: 4, step: 0.1, unit: 'mm' },
    { hint: ['Print standing up. Small text needs a 0.2 or 0.25 mm nozzle to stay sharp.', 'Принтирай изправен. Дребният текст е по-ясен с дюза 0,2 или 0,25 мм.'] },
    { key: 'bandColor', label: ['Band', 'Халка'], type: 'color' },
    { key: 'textColor', label: ['Text', 'Текст'], type: 'color' },
  ],
  build: (m, font, v) => bandParts(m, font, v, num(v, 'size') / (2 * Math.PI), 0),
};

const nameBracelet: GalleryModel = {
  id: 'name-bracelet',
  category: 'gifts',
  emoji: '📿',
  title: ['Bracelet with a name', 'Гривна с име'],
  desc: ['An open bracelet that flexes over the wrist, with a name on the front.', 'Отворена гривна, която се огъва около китката, с име отпред.'],
  defaults: { font: 'lobster', text: 'Елена', style: 'raised', diameter: 62, width: 14, thickness: 2.4, opening: 60, textHeight: 10, bandColor: '#ec4899', textColor: '#fdf2f8' },
  params: [
    ...bandParams,
    { key: 'textHeight', label: ['Letter height', 'Височина на буквите'], type: 'range', min: 4, max: 24, step: 0.5, unit: 'mm' },
    { key: 'diameter', label: ['Inner diameter', 'Вътрешен диаметър'], type: 'range', min: 40, max: 90, step: 1, unit: 'mm' },
    { key: 'width', label: ['Width', 'Ширина'], type: 'range', min: 6, max: 30, step: 0.5, unit: 'mm' },
    { key: 'thickness', label: ['Thickness', 'Дебелина'], type: 'range', min: 1.6, max: 5, step: 0.1, unit: 'mm' },
    { key: 'opening', label: ['Opening', 'Отвор'], type: 'range', min: 30, max: 120, step: 5, unit: 'deg' },
    { hint: ['Flexes better in PETG or TPU than in PLA, which can crack.', 'Огъва се по-добре от PETG или TPU, а PLA може да се спука.'] },
    { key: 'bandColor', label: ['Bracelet', 'Гривна'], type: 'color' },
    { key: 'textColor', label: ['Text', 'Текст'], type: 'color' },
  ],
  build: (m, font, v) => bandParts(m, font, v, num(v, 'diameter') / 2, num(v, 'opening')),
};

// ---------------------------------------------------------------- perpetual calendar

export const CUBE_A = ['0', '1', '2', '3', '4', '5'];
export const CUBE_B = ['0', '1', '2', '6', '7', '8']; // the 6 turned upside down is the 9

/** True when the two cubes can show every date from 01 to 31. */
export function coversAllDates(a: string[], b: string[]): boolean {
  const has = (cube: string[], d: string) => cube.includes(d) || (d === '9' && cube.includes('6'));
  for (let day = 1; day <= 31; day++) {
    const [x, y] = String(day).padStart(2, '0');
    if (!((has(a, x) && has(b, y)) || (has(b, x) && has(a, y)))) return false;
  }
  return true;
}

const MONTHS: Record<string, string[]> = {
  bg: ['ЯНУАРИ', 'ФЕВРУАРИ', 'МАРТ', 'АПРИЛ', 'МАЙ', 'ЮНИ', 'ЮЛИ', 'АВГУСТ', 'СЕПТЕМВРИ', 'ОКТОМВРИ', 'НОЕМВРИ', 'ДЕКЕМВРИ'],
  en: ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'],
};

const CUBE_FACES: Vec3[] = [[0, 0, 0], [180, 0, 0], [0, 90, 0], [0, -90, 0], [-90, 0, 0], [90, 0, 0]];
const BAR_FACES: Vec3[] = [[0, 0, 0], [180, 0, 0], [-90, 0, 0], [90, 0, 0]];

const calendar: GalleryModel = {
  id: 'perpetual-calendar',
  category: 'desk',
  emoji: '📅',
  title: ['Perpetual desk calendar', 'Вечен календар за бюро'],
  desc: ['Two number cubes and month bars in a stand. Turn them each day, for years.', 'Две кубчета с цифри и блокчета за месеците в стойка. Обръщаш ги всеки ден, години наред.'],
  defaults: { font: 'russo', lang: 'bg', cube: 30, depth: 0.8, cubeColor: '#f8fafc', barColor: '#ff7a1a', standColor: '#1f2937' },
  params: [
    { key: 'lang', label: ['Month names', 'Имена на месеците'], type: 'select', options: [['bg', ['Bulgarian', 'Български']], ['en', ['English', 'Английски']]] },
    { key: 'font', label: ['Font', 'Шрифт'], type: 'font' },
    { key: 'cube', label: ['Cube size', 'Размер на кубчето'], type: 'range', min: 20, max: 50, step: 1, unit: 'mm' },
    { key: 'depth', label: ['Engraving depth', 'Дълбочина на гравирането'], type: 'range', min: 0.4, max: 1.6, step: 0.1, unit: 'mm' },
    { hint: ['One 6 turned upside down makes the 9, so two cubes are enough for every date. Fill the engraving with paint for contrast.', 'Шестицата, обърната наопаки, е деветка, затова две кубчета стигат за всяка дата. Запълни гравирането с боя за контраст.'] },
    { key: 'cubeColor', label: ['Cubes', 'Кубчета'], type: 'color' },
    { key: 'barColor', label: ['Months', 'Месеци'], type: 'color' },
    { key: 'standColor', label: ['Stand', 'Стойка'], type: 'color' },
  ],
  separate: true,
  build(m, font, v) {
    const { Manifold } = m;
    const c = num(v, 'cube'), d = num(v, 'depth');
    const barSide = c * 0.55, barLen = 2 * c + 1;
    const engrave = (solid: Manifold, labels: string[], faces: Vec3[], distance: number, height: number, maxWidth: number) => {
      const cuts: Manifold[] = [];
      labels.forEach((label, i) => {
        const text = textCS(m, font, label, height, maxWidth);
        if (text) cuts.push(Manifold.extrude(text, d + 0.01).translate([0, 0, distance - d]).rotate(faces[i]));
      });
      return cuts.length ? solid.subtract(Manifold.union(cuts)) : solid;
    };
    const parts: Part[] = [];
    const cubeMesh = (digits: string[], x: number, name: string) => {
      const cube = engrave(Manifold.cube([c, c, c], true), digits, CUBE_FACES, c / 2, c * 0.6, c * 0.8);
      parts.push({ name, color: str(v, 'cubeColor'), mesh: toTriMesh(cube.translate([x, 0, c / 2])) });
    };
    cubeMesh(CUBE_A, c / 2, 'Cube 1');
    cubeMesh(CUBE_B, c * 2, 'Cube 2');

    const months = MONTHS[str(v, 'lang')] ?? MONTHS.bg;
    for (let i = 0; i < 3; i++) {
      const labels = months.slice(i * 4, i * 4 + 4);
      const bar = engrave(Manifold.cube([barLen, barSide, barSide], true), labels, BAR_FACES, barSide / 2, barSide * 0.5, barLen * 0.9);
      parts.push({ name: `Months ${i + 1}`, color: str(v, 'barColor'), mesh: toTriMesh(bar.translate([barLen / 2, c + 6 + barSide / 2 + i * (barSide + 6), barSide / 2])) });
    }

    // A tray: the month bar lies on the floor, the cubes sit on it against the back wall.
    const wall = 2.5, floor = 3, lip = 5;
    const innerW = barLen + 1, innerD = Math.max(c, barSide) + 1;
    const outerW = innerW + 2 * wall, outerD = innerD + 2 * wall, height = floor + barSide + c * 0.7;
    const y0 = -c / 2 - outerD - 8;
    let stand = Manifold.cube([outerW, outerD, height], false);
    stand = stand.subtract(Manifold.cube([innerW, innerD, height], false).translate([wall, wall, floor]));
    stand = stand.subtract(Manifold.cube([outerW + 2, wall + innerD * 0.55, height], false).translate([-1, -1, floor + lip]));
    parts.push({ name: 'Stand', color: str(v, 'standColor'), mesh: toTriMesh(stand.translate([0, y0, 0])) });
    return parts;
  },
};

export const PERSONAL: GalleryModel[] = [dualIllusion, nameRing, nameBracelet, calendar];
