// SPDX-License-Identifier: AGPL-3.0-or-later
import { toTriMesh } from '../core/manifold';
import { plateShape } from '../core/models';
import type { Vec2 } from '../core/text';
import { bool, num, standUp, str, textCS, wrapOnCylinder, type GalleryModel } from './types';

const rad = (d: number) => (d * Math.PI) / 180;

export const DESK: GalleryModel[] = [
  {
    id: 'phone-stand',
    category: 'desk',
    emoji: '📱',
    title: ['Phone & tablet stand', 'Стойка за телефон и таблет'],
    desc: ['Leans your phone back at a comfortable angle, with a slot for the charging cable.', 'Държи телефона под удобен ъгъл, с отвор за кабела за зареждане.'],
    defaults: { font: 'russo', angle: 65, device: 12, width: 70, lip: 10, cable: true, color: '#6366f1' },
    params: [
      { key: 'angle', label: ['Angle', 'Ъгъл'], type: 'range', min: 45, max: 80, step: 1, unit: 'deg' },
      { key: 'device', label: ['Phone thickness with case', 'Дебелина на телефона с калъфа'], type: 'range', min: 6, max: 30, step: 0.5, unit: 'mm' },
      { key: 'width', label: ['Width', 'Ширина'], type: 'range', min: 40, max: 200, step: 1, unit: 'mm' },
      { key: 'lip', label: ['Front lip height', 'Височина на предния ръб'], type: 'range', min: 4, max: 25, step: 0.5, unit: 'mm' },
      { key: 'cable', label: ['Cable slot', 'Отвор за кабел'], type: 'check' },
      { key: 'color', label: ['Colour', 'Цвят'], type: 'color' },
    ],
    build(m, _font, v) {
      const { CrossSection, Manifold } = m;
      const a = rad(num(v, 'angle'));
      const baseT = 5, lipW = 4, slabT = 6, len = 80;
      const B: Vec2 = [lipW + num(v, 'device'), baseT];
      const dir: Vec2 = [Math.cos(a), Math.sin(a)];
      const n: Vec2 = [Math.sin(a), -Math.cos(a)];
      const top: Vec2 = [B[0] + len * dir[0], B[1] + len * dir[1]];
      const back: Vec2 = [top[0] + slabT * n[0], top[1] + slabT * n[1]];
      const L = back[0] + 14;
      const shapes = [
        CrossSection.square([L, baseT]),
        CrossSection.square([lipW, baseT + num(v, 'lip')]),
        CrossSection.ofPolygons([B, top, back, [B[0] + slabT * n[0], B[1] + slabT * n[1]]], 'NonZero'),
        CrossSection.ofPolygons([back, [B[0] + slabT * n[0], 0], [L, 0]], 'NonZero'),
      ];
      const profile = CrossSection.union(shapes).offset(-1, 'Round', 2, 24).offset(1, 'Round', 2, 24);
      let stand = standUp(m, profile, num(v, 'width'));
      if (bool(v, 'cable')) stand = stand.subtract(Manifold.cube([12, B[0] + 2, num(v, 'lip') + baseT], false).translate([-6, -1, 2.5]));
      return [{ name: 'Phone stand', color: str(v, 'color'), mesh: toTriMesh(stand) }];
    },
  },
  {
    id: 'cable-organizer',
    category: 'desk',
    emoji: '🔌',
    title: ['Cable organizer', 'Органайзер за кабели'],
    desc: ['A desk clip that keeps charging cables from sliding off the table.', 'Държи кабелите за зареждане на бюрото, за да не падат.'],
    defaults: { font: 'russo', cable: 6, count: 5, depth: 14, color: '#10b981' },
    params: [
      { key: 'cable', label: ['Cable diameter', 'Диаметър на кабела'], type: 'range', min: 2, max: 15, step: 0.5, unit: 'mm' },
      { key: 'count', label: ['Number of cables', 'Брой кабели'], type: 'range', min: 1, max: 12, step: 1 },
      { key: 'depth', label: ['Depth', 'Дълбочина'], type: 'range', min: 8, max: 40, step: 1, unit: 'mm' },
      { key: 'color', label: ['Colour', 'Цвят'], type: 'color' },
    ],
    build(m, _font, v) {
      const { CrossSection, Manifold } = m;
      const d = num(v, 'cable'), count = Math.round(num(v, 'count'));
      const wall = Math.max(2.4, d * 0.45);
      const pitch = d + wall;
      const w = count * pitch + wall, h = d + 2 * wall;
      let body = plateShape(m, 'rounded', w, h, 2).translate([w / 2, h / 2]);
      for (let i = 0; i < count; i++) {
        const cx = wall + d / 2 + i * pitch;
        body = body.subtract(CrossSection.circle(d / 2 + 0.2, 40).translate([cx, wall + d / 2]));
        body = body.subtract(CrossSection.square([d * 0.72, h], false).translate([cx - d * 0.36, wall + d / 2]));
      }
      return [{ name: 'Cable organizer', color: str(v, 'color'), mesh: toTriMesh(Manifold.extrude(body, num(v, 'depth'))) }];
    },
  },
  {
    id: 'pen-cup',
    category: 'desk',
    emoji: '✏️',
    title: ['Pen cup with a name', 'Чаша за моливи с име'],
    desc: ['A round pen holder with your name wrapped around it.', 'Кръгла чаша за моливи с име, обвито около нея.'],
    defaults: { font: 'lobster', text: 'Мария', diameter: 75, height: 95, wall: 2.4, textHeight: 16, cupColor: '#f8fafc', textColor: '#ec4899' },
    params: [
      { key: 'text', label: ['Name', 'Име'], type: 'text' },
      { key: 'font', label: ['Font', 'Шрифт'], type: 'font' },
      { key: 'textHeight', label: ['Letter height', 'Височина на буквите'], type: 'range', min: 6, max: 40, step: 0.5, unit: 'mm' },
      { key: 'diameter', label: ['Diameter', 'Диаметър'], type: 'range', min: 40, max: 140, step: 1, unit: 'mm' },
      { key: 'height', label: ['Height', 'Височина'], type: 'range', min: 40, max: 160, step: 1, unit: 'mm' },
      { key: 'wall', label: ['Wall', 'Стена'], type: 'range', min: 1.2, max: 5, step: 0.1, unit: 'mm' },
      { key: 'cupColor', label: ['Cup', 'Чаша'], type: 'color' },
      { key: 'textColor', label: ['Text', 'Текст'], type: 'color' },
    ],
    build(m, font, v) {
      const { Manifold } = m;
      const R = num(v, 'diameter') / 2, H = num(v, 'height'), wall = num(v, 'wall');
      const cup = Manifold.cylinder(H, R, R, 128).subtract(Manifold.cylinder(H, R - wall, R - wall, 128).translate([0, 0, 2.5]));
      const parts = [{ name: 'Cup', color: str(v, 'cupColor'), mesh: toTriMesh(cup) }];
      const text = textCS(m, font, str(v, 'text'), num(v, 'textHeight'), Math.PI * R * 0.9);
      if (text) {
        // Letters sit 0.6 mm into the wall and stand 1.2 mm proud of it.
        const flat = Manifold.extrude(text, 1.8).translate([0, H / 2, -0.6]);
        parts.push({ name: 'Name', color: str(v, 'textColor'), mesh: toTriMesh(wrapOnCylinder(flat, R)) });
      }
      return parts;
    },
  },
  {
    id: 'desk-name-plate',
    category: 'desk',
    emoji: '🪪',
    title: ['Desk name plate', 'Табелка с име за бюро'],
    desc: ['A name plate that prints flat and slots into a small stand.', 'Табелка с име, която се принтира легнала и се пъха в малка стойка.'],
    defaults: { font: 'russo', text: 'Иван Петров\nДизайнер', textHeight: 9, height: 45, thickness: 3, plateColor: '#111827', textColor: '#f8fafc' },
    params: [
      { key: 'text', label: ['Text', 'Текст'], type: 'text', multiline: true },
      { key: 'font', label: ['Font', 'Шрифт'], type: 'font' },
      { key: 'textHeight', label: ['Letter height', 'Височина на буквите'], type: 'range', min: 4, max: 30, step: 0.5, unit: 'mm' },
      { key: 'height', label: ['Plate height', 'Височина на табелката'], type: 'range', min: 25, max: 90, step: 1, unit: 'mm' },
      { key: 'thickness', label: ['Thickness', 'Дебелина'], type: 'range', min: 2, max: 6, step: 0.2, unit: 'mm' },
      { key: 'plateColor', label: ['Plate', 'Табелка'], type: 'color' },
      { key: 'textColor', label: ['Text', 'Текст'], type: 'color' },
    ],
    separate: true,
    build(m, font, v) {
      const { CrossSection, Manifold } = m;
      const text = textCS(m, font, str(v, 'text'), num(v, 'textHeight'));
      const b = text?.bounds();
      const w = b ? b.max[0] - b.min[0] + 24 : 120;
      const h = num(v, 'height'), T = num(v, 'thickness');
      const plate = Manifold.extrude(plateShape(m, 'rounded', w, h, 4), T);
      const parts = [{ name: 'Plate', color: str(v, 'plateColor'), mesh: toTriMesh(plate), group: 'Plate' }];
      if (text) parts.push({ name: 'Text', color: str(v, 'textColor'), mesh: toTriMesh(Manifold.extrude(text, 1).translate([0, 0, T])), group: 'Plate' });
      // Stand: a wedge with a slot that holds the plate leaning back 10°.
      const sw = Math.min(w * 0.6, 120), slot = T + 0.4, depth = 30, sh = 14;
      const profile = CrossSection.ofPolygons([[0, 0], [depth, 0], [depth, 6], [depth * 0.62, sh], [depth * 0.3, sh], [0, 6]], 'NonZero');
      const cut = CrossSection.square([slot, sh * 2], false).rotate(-10).translate([depth * 0.42, 3]);
      const stand = standUp(m, profile.subtract(cut), sw).translate([0, -h / 2 - depth - 10, 0]);
      parts.push({ name: 'Stand', color: str(v, 'plateColor'), mesh: toTriMesh(stand), group: 'Stand' });
      return parts;
    },
  },
];
