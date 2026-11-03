// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Vec3 } from 'manifold-3d';
import { toTriMesh } from '../core/manifold';
import { emptyCS, plateShape, styledParts } from '../core/models';
import { bool, num, str, textCS, type GalleryModel } from './types';

/** Points of a circle in the YZ plane at x, for drilling holes along X with a hull. */
function ringYZ(x: number, y: number, z: number, r: number, n = 32): Vec3[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [x, y + r * Math.cos(a), z + r * Math.sin(a)] as Vec3;
  });
}

export const HOME: GalleryModel[] = [
  {
    id: 'wall-hook',
    category: 'home',
    emoji: '🪝',
    title: ['Wall hook', 'Кукичка за стена'],
    desc: ['A sturdy J-hook with countersunk screw holes. Prints on its side for strength.', 'Здрава кукичка с вкопани отвори за винтове. Принтира се на една страна за здравина.'],
    defaults: { font: 'russo', width: 20, height: 60, reach: 35, thickness: 6, screw: 4, color: '#f59e0b' },
    params: [
      { key: 'width', label: ['Width', 'Ширина'], type: 'range', min: 10, max: 60, step: 1, unit: 'mm' },
      { key: 'height', label: ['Back plate height', 'Височина на основата'], type: 'range', min: 30, max: 120, step: 1, unit: 'mm' },
      { key: 'reach', label: ['Reach', 'Дължина на кукичката'], type: 'range', min: 15, max: 80, step: 1, unit: 'mm' },
      { key: 'thickness', label: ['Thickness', 'Дебелина'], type: 'range', min: 3, max: 12, step: 0.5, unit: 'mm' },
      { key: 'screw', label: ['Screw diameter', 'Диаметър на винта'], type: 'range', min: 2.5, max: 6, step: 0.5, unit: 'mm' },
      { key: 'color', label: ['Colour', 'Цвят'], type: 'color' },
    ],
    build(m, _font, v) {
      const { CrossSection, Manifold } = m;
      const T = num(v, 'thickness'), H = num(v, 'height'), reach = num(v, 'reach'), W = num(v, 'width');
      const tip = Math.max(8, reach * 0.35);
      let profile = CrossSection.union([
        CrossSection.square([T, H]),
        CrossSection.square([reach, T]),
        CrossSection.square([T, T + tip]).translate([reach - T, 0]),
        CrossSection.ofPolygons([[T - 0.1, T - 0.1], [T + 10, T - 0.1], [T - 0.1, T + 10]], 'NonZero'),
      ]);
      profile = profile.offset(-1, 'Round', 2, 24).offset(1, 'Round', 2, 24);
      let hook = Manifold.extrude(profile, W);
      const r = num(v, 'screw') / 2;
      for (const y of [H - 10, Math.max(T + r + 12, H * 0.45)]) {
        hook = hook.subtract(Manifold.hull([...ringYZ(-1, y, W / 2, r), ...ringYZ(T + 1, y, W / 2, r)]));
        hook = hook.subtract(Manifold.hull([...ringYZ(T - r - 0.2, y, W / 2, r), ...ringYZ(T + 0.01, y, W / 2, r * 2 + 0.2)]));
      }
      return [{ name: 'Wall hook', color: str(v, 'color'), mesh: toTriMesh(hook) }];
    },
  },
  {
    id: 'plant-pot',
    category: 'home',
    emoji: '🪴',
    title: ['Plant pot with saucer', 'Саксия с подложка'],
    desc: ['A tapered pot with drainage holes and a matching saucer.', 'Конусовидна саксия с дренажни отвори и подходяща подложка.'],
    defaults: { font: 'russo', top: 90, bottom: 68, height: 80, wall: 2, drainage: true, saucer: true, color: '#c2410c', saucerColor: '#9a3412' },
    params: [
      { key: 'top', label: ['Top diameter', 'Горен диаметър'], type: 'range', min: 40, max: 200, step: 1, unit: 'mm' },
      { key: 'bottom', label: ['Bottom diameter', 'Долен диаметър'], type: 'range', min: 30, max: 200, step: 1, unit: 'mm' },
      { key: 'height', label: ['Height', 'Височина'], type: 'range', min: 30, max: 200, step: 1, unit: 'mm' },
      { key: 'wall', label: ['Wall', 'Стена'], type: 'range', min: 1.2, max: 5, step: 0.1, unit: 'mm' },
      { key: 'drainage', label: ['Drainage holes', 'Дренажни отвори'], type: 'check' },
      { key: 'saucer', label: ['Saucer', 'Подложка'], type: 'check' },
      { key: 'color', label: ['Pot', 'Саксия'], type: 'color' },
      { key: 'saucerColor', label: ['Saucer', 'Подложка'], type: 'color' },
    ],
    separate: true,
    build(m, _font, v) {
      const { Manifold } = m;
      const rt = num(v, 'top') / 2, rb = num(v, 'bottom') / 2, H = num(v, 'height'), w = num(v, 'wall');
      const floor = 3;
      let pot = Manifold.cylinder(H, rb, rt, 128).subtract(Manifold.cylinder(H, rb - w, rt - w, 128).translate([0, 0, floor]));
      if (bool(v, 'drainage')) {
        const holes = [Manifold.cylinder(floor + 2, 4, 4, 32).translate([0, 0, -1])];
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          holes.push(Manifold.cylinder(floor + 2, 2.5, 2.5, 24).translate([Math.cos(a) * rb * 0.55, Math.sin(a) * rb * 0.55, -1]));
        }
        pot = pot.subtract(Manifold.union(holes));
      }
      const parts = [{ name: 'Pot', color: str(v, 'color'), mesh: toTriMesh(pot) }];
      if (bool(v, 'saucer')) {
        const sr = rb + 8;
        const saucer = Manifold.cylinder(14, sr, sr + 4, 128).subtract(Manifold.cylinder(14, sr - 2, sr + 2, 128).translate([0, 0, 2]));
        parts.push({ name: 'Saucer', color: str(v, 'saucerColor'), mesh: toTriMesh(saucer.translate([rt + sr + 12, 0, 0])) });
      }
      return parts;
    },
  },
  {
    id: 'door-wedge',
    category: 'home',
    emoji: '🚪',
    title: ['Door stop wedge', 'Клин за врата'],
    desc: ['Keeps a door open. The hole lets you hang it on a hook when not in use.', 'Държи вратата отворена. Отворът позволява да го закачиш, когато не ти трябва.'],
    defaults: { font: 'russo', length: 120, width: 40, low: 3, high: 25, hole: true, color: '#0ea5e9' },
    params: [
      { key: 'length', label: ['Length', 'Дължина'], type: 'range', min: 60, max: 200, step: 1, unit: 'mm' },
      { key: 'width', label: ['Width', 'Ширина'], type: 'range', min: 20, max: 80, step: 1, unit: 'mm' },
      { key: 'low', label: ['Thin end', 'Тънък край'], type: 'range', min: 1, max: 10, step: 0.5, unit: 'mm' },
      { key: 'high', label: ['Thick end', 'Дебел край'], type: 'range', min: 10, max: 60, step: 1, unit: 'mm' },
      { key: 'hole', label: ['Hanging hole', 'Отвор за закачане'], type: 'check' },
      { key: 'color', label: ['Colour', 'Цвят'], type: 'color' },
    ],
    build(m, _font, v) {
      const { Manifold } = m;
      const L = num(v, 'length'), W = num(v, 'width'), lo = num(v, 'low'), hi = num(v, 'high');
      let wedge = Manifold.hull([
        [0, 0, 0], [L, 0, 0], [0, W, 0], [L, W, 0],
        [0, 0, lo], [0, W, lo], [L, 0, hi], [L, W, hi],
      ]);
      if (bool(v, 'hole')) wedge = wedge.subtract(Manifold.cylinder(hi + 2, 5, 5, 40).translate([L - 14, W / 2, -1]));
      return [{ name: 'Door wedge', color: str(v, 'color'), mesh: toTriMesh(wedge) }];
    },
  },
  {
    id: 'coaster',
    category: 'home',
    emoji: '☕',
    title: ['Coaster with a name', 'Подложка за чаша с име'],
    desc: ['Round, hexagonal or square coaster with a rim and a name or initials.', 'Кръгла, шестоъгълна или квадратна подложка с борд и име или инициали.'],
    defaults: { font: 'lobster', text: 'Кафе', shape: 'circle', size: 95, thickness: 4, textHeight: 16, style: 'inlay', baseColor: '#1f2937', textColor: '#fbbf24' },
    params: [
      { key: 'text', label: ['Text', 'Текст'], type: 'text' },
      { key: 'font', label: ['Font', 'Шрифт'], type: 'font' },
      { key: 'textHeight', label: ['Letter height', 'Височина на буквите'], type: 'range', min: 5, max: 40, step: 0.5, unit: 'mm' },
      { key: 'shape', label: ['Shape', 'Форма'], type: 'select', options: [['circle', ['Circle', 'Кръг']], ['hexagon', ['Hexagon', 'Шестоъгълник']], ['square', ['Square', 'Квадрат']]] },
      { key: 'size', label: ['Size', 'Размер'], type: 'range', min: 60, max: 140, step: 1, unit: 'mm' },
      { key: 'thickness', label: ['Thickness', 'Дебелина'], type: 'range', min: 2, max: 8, step: 0.2, unit: 'mm' },
      { key: 'style', label: ['Text style', 'Стил на текста'], type: 'select', options: [['raised', ['Raised', 'Изпъкнал']], ['engraved', ['Engraved', 'Гравиран']], ['inlay', ['Flush inlay', 'Вграден (плосък)']]] },
      { key: 'baseColor', label: ['Coaster', 'Подложка'], type: 'color' },
      { key: 'textColor', label: ['Text', 'Текст'], type: 'color' },
    ],
    build(m, font, v) {
      const size = num(v, 'size');
      const shape = str(v, 'shape');
      const base = shape === 'square'
        ? plateShape(m, 'rounded', size, size, 8)
        : m.CrossSection.circle(size / 2, shape === 'hexagon' ? 6 : 128);
      const rim = base.subtract(base.offset(-2.5, 'Round', 2, 64));
      const text = textCS(m, font, str(v, 'text'), num(v, 'textHeight'), size * 0.7) ?? emptyCS(m);
      return styledParts(m, base, text, {
        style: str(v, 'style') as 'raised' | 'engraved' | 'inlay',
        baseThickness: num(v, 'thickness'),
        textThickness: 1,
        baseColor: str(v, 'baseColor'),
        textColor: str(v, 'textColor'),
        extra2D: rim,
      });
    },
  },
];

