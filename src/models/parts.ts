// SPDX-License-Identifier: AGPL-3.0-or-later
// Functional parts: things that move, fasten or hold.
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { toTriMesh } from '../core/manifold';
import { num, str, type GalleryModel } from './types';

/** A cylinder along the X axis, starting at x0. */
function cylX(m: ManifoldToplevel, x0: number, len: number, r: number, y: number, z: number): Manifold {
  return m.Manifold.cylinder(len, r, r, 64).rotate([0, 90, 0]).translate([x0, y, z]);
}

/** Box from corner (x0, y0, z0) with the given size. */
function box(m: ManifoldToplevel, x0: number, y0: number, z0: number, sx: number, sy: number, sz: number): Manifold {
  return m.Manifold.cube([sx, sy, sz], false).translate([x0, y0, z0]);
}

/** A through hole for a countersunk screw, opening at the top face of a plate. */
function screwHole(m: ManifoldToplevel, x: number, y: number, r: number, t: number): Manifold {
  const { Manifold } = m;
  const sink = Math.min(r * 1.1, t * 0.6);
  return Manifold.cylinder(t + 2, r, r, 32).translate([x, y, -1]).add(Manifold.cylinder(sink + 0.01, r, r + sink, 32).translate([x, y, t - sink]));
}

export const PARTS: GalleryModel[] = [
  {
    id: 'hinge',
    category: 'parts',
    emoji: '🚪',
    title: ['Print-in-place hinge', 'Панта, принтирана наведнъж'],
    desc: ['Comes off the printer already assembled. Knuckles and pin are separated by a clearance gap.', 'Излиза от принтера сглобена. Между шарнирите и оста има хлабина.'],
    defaults: { font: 'russo', length: 60, leaf: 20, thickness: 2.4, radius: 4, clearance: 0.35, knuckles: 5, screw: 3, colorA: '#0ea5e9', colorB: '#38bdf8' },
    params: [
      { key: 'length', label: ['Length', 'Дължина'], type: 'range', min: 20, max: 200, step: 1, unit: 'mm' },
      { key: 'leaf', label: ['Leaf width', 'Ширина на крилото'], type: 'range', min: 12, max: 60, step: 1, unit: 'mm' },
      { key: 'thickness', label: ['Leaf thickness', 'Дебелина на крилото'], type: 'range', min: 1.6, max: 6, step: 0.2, unit: 'mm' },
      { key: 'radius', label: ['Barrel radius', 'Радиус на шарнира'], type: 'range', min: 3, max: 10, step: 0.5, unit: 'mm' },
      { key: 'knuckles', label: ['Knuckles', 'Брой шарнири'], type: 'range', min: 3, max: 11, step: 2 },
      { key: 'clearance', label: ['Clearance', 'Хлабина'], type: 'range', min: 0.15, max: 0.8, step: 0.05, unit: 'mm' },
      { key: 'screw', label: ['Screw diameter', 'Диаметър на винта'], type: 'range', min: 2, max: 6, step: 0.5, unit: 'mm' },
      { hint: ['Too stiff? Raise the clearance. Find your value with the tolerance test in Calibration prints.', 'Много е стегната? Увеличи хлабината. Подходящата стойност показва тестът за хлабина в Калибрационни тестове.'] },
      { key: 'colorA', label: ['Leaf A', 'Крило А'], type: 'color' },
      { key: 'colorB', label: ['Leaf B', 'Крило Б'], type: 'color' },
    ],
    build(m, _font, v) {
      const { Manifold } = m;
      const L = num(v, 'length'), R = num(v, 'radius'), c = num(v, 'clearance');
      const t = Math.min(num(v, 'thickness'), R);
      const W = Math.max(num(v, 'leaf'), R + c + 8);
      const n = Math.max(3, Math.round(num(v, 'knuckles')) | 1);
      const pin = R * 0.45;
      const seg = (L - (n - 1) * c) / n;
      const reach = W - (R + c);
      const a: Manifold[] = [box(m, -L / 2, -W, 0, L, reach, t), cylX(m, -L / 2, L, pin, 0, R)];
      const b: Manifold[] = [box(m, -L / 2, R + c, 0, L, reach, t)];
      for (let i = 0; i < n; i++) {
        const x0 = -L / 2 + i * (seg + c);
        if (i % 2 === 0) a.push(cylX(m, x0, seg, R, 0, R), box(m, x0, -(R + c) - 0.01, 0, seg, R + c + 0.01, t));
        else b.push(cylX(m, x0, seg, R, 0, R), box(m, x0, 0, 0, seg, R + c + 0.01, t));
      }
      const yHole = W - reach / 2;
      const r = num(v, 'screw') / 2;
      const holes = (sign: number) => Manifold.union([-L / 3, L / 3].map((x) => screwHole(m, x, sign * yHole, r, t)));
      const leafA = Manifold.union(a).subtract(holes(-1));
      const leafB = Manifold.union(b).subtract(cylX(m, -L / 2 - 1, L + 2, pin + c, 0, R)).subtract(holes(1));
      return [
        { name: 'Leaf A', color: str(v, 'colorA'), mesh: toTriMesh(leafA) },
        { name: 'Leaf B', color: str(v, 'colorB'), mesh: toTriMesh(leafB) },
      ];
    },
  },
  {
    id: 'snap-fit',
    category: 'parts',
    emoji: '🧷',
    title: ['Snap-fit clip', 'Щракаща закопчалка'],
    desc: ['A plug with two flexible arms that clicks into a matching plate. Prints on its side so the arms do not snap.', 'Част с две гъвкави рамена, която щраква в подходяща плочка. Принтира се на една страна, за да не се чупят рамената.'],
    defaults: { font: 'russo', width: 12, length: 10, arm: 1.6, barb: 1.2, gap: 6, clearance: 0.2, color: '#22c55e', plateColor: '#15803d' },
    params: [
      { key: 'width', label: ['Clip width', 'Ширина'], type: 'range', min: 6, max: 40, step: 1, unit: 'mm' },
      { key: 'length', label: ['Arm length', 'Дължина на рамената'], type: 'range', min: 6, max: 30, step: 0.5, unit: 'mm' },
      { key: 'arm', label: ['Arm thickness', 'Дебелина на рамената'], type: 'range', min: 1, max: 3, step: 0.1, unit: 'mm' },
      { key: 'barb', label: ['Barb depth', 'Дълбочина на зъбчето'], type: 'range', min: 0.6, max: 2.5, step: 0.1, unit: 'mm' },
      { key: 'gap', label: ['Gap between arms', 'Разстояние между рамената'], type: 'range', min: 3, max: 20, step: 0.5, unit: 'mm' },
      { key: 'clearance', label: ['Clearance', 'Хлабина'], type: 'range', min: 0.1, max: 0.6, step: 0.05, unit: 'mm' },
      { key: 'color', label: ['Clip', 'Закопчалка'], type: 'color' },
      { key: 'plateColor', label: ['Plate', 'Плочка'], type: 'color' },
    ],
    separate: true,
    build(m, _font, v) {
      const { CrossSection, Manifold } = m;
      const w = num(v, 'width'), a = num(v, 'arm'), b = num(v, 'barb'), g = num(v, 'gap'), c = num(v, 'clearance');
      const lead = b * 2; // sloped lead-in so the barb slides into the slot
      const h = Math.max(num(v, 'length'), lead + 3);
      const span = g / 2 + a;
      const baseT = 3;
      const arm = (side: number) => [
        CrossSection.square([a, h + 0.1], false).translate([side > 0 ? g / 2 : -span, baseT - 0.1]),
        CrossSection.ofPolygons([[side * span, baseT + h - lead], [side * (span + b), baseT + h - lead], [side * span, baseT + h]], 'NonZero'),
      ];
      const profile = CrossSection.union([
        CrossSection.square([2 * (span + 3), baseT], true).translate([0, baseT / 2]),
        ...arm(1),
        ...arm(-1),
      ]);
      const clip = Manifold.extrude(profile, w);

      // The barb's flat underside catches on the back of the plate.
      const plateT = h - lead - c;
      const slotX = w + 2 * c, slotY = 2 * span + 2 * c;
      const plateX = slotX + 12, plateY = slotY + 12;
      const plate = box(m, -plateX / 2, -plateY / 2, 0, plateX, plateY, plateT).subtract(box(m, -slotX / 2, -slotY / 2, -1, slotX, slotY, plateT + 2));
      const dx = span + b + 3 + plateX / 2 + 8;
      return [
        { name: 'Clip', color: str(v, 'color'), mesh: toTriMesh(clip) },
        { name: 'Plate', color: str(v, 'plateColor'), mesh: toTriMesh(plate.translate([dx, baseT + h / 2, 0])) },
      ];
    },
  },
];
