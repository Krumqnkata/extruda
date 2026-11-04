// SPDX-License-Identifier: AGPL-3.0-or-later
// Involute spur and helical gears.
import type { ManifoldToplevel } from 'manifold-3d';
import { toTriMesh } from '../core/manifold';
import type { Part } from '../core/mesh';
import type { Polygon } from '../core/text';
import { num, str, type GalleryModel, type Values } from './types';

const rad = (d: number) => (d * Math.PI) / 180;

/** Outline of a gear with a tooth centred on +X. Sizes in mm; backlash is taken off the tooth at the pitch circle. */
export function gearProfile(teeth: number, module: number, pressureDeg: number, backlash = 0): Polygon {
  const alpha = rad(pressureDeg);
  const rp = (module * teeth) / 2;
  const rb = rp * Math.cos(alpha);
  const ra = rp + module;
  const rf = rp - 1.25 * module;
  const inv = (a: number) => Math.tan(a) - a;
  const halfAtPitch = ((Math.PI * module) / 2 - backlash) / (2 * rp);
  const half = (r: number) => {
    const a = r > rb ? Math.acos(rb / r) : 0;
    return Math.max(0.002, halfAtPitch + inv(alpha) - inv(a));
  };

  const start = Math.max(rf, rb);
  const radii = Array.from({ length: 9 }, (_, i) => start + ((ra - start) * i) / 8);
  const pitch = (2 * Math.PI) / teeth;
  const points: Polygon = [];
  const polar = (r: number, a: number) => points.push([r * Math.cos(a), r * Math.sin(a)]);
  for (let t = 0; t < teeth; t++) {
    const c = t * pitch;
    if (rf < rb) polar(rf, c - half(rb)); // below the base circle the flank runs straight to the root
    for (const r of radii) polar(r, c - half(r));
    for (const r of [...radii].reverse()) polar(r, c + half(r));
    if (rf < rb) polar(rf, c + half(rb));
    // Root arc across to the next tooth.
    const from = c + half(start), to = c + pitch - half(start);
    for (let i = 1; i < 4; i++) polar(rf, from + ((to - from) * i) / 4);
  }
  return points;
}

function gearPart(m: ManifoldToplevel, v: Values, teeth: number, hand: 1 | -1, name: string, color: string): Part {
  const { CrossSection, Manifold } = m;
  const mod = num(v, 'module'), h = num(v, 'thickness');
  const profile = CrossSection.ofPolygons(gearProfile(teeth, mod, num(v, 'pressure'), num(v, 'backlash')), 'Positive');
  const rp = (mod * teeth) / 2;
  const rf = rp - 1.25 * mod;
  const twist = hand * ((h * Math.tan(rad(num(v, 'helix')))) / rp) * (180 / Math.PI);
  let gear = Manifold.extrude(profile, h, Math.max(1, Math.ceil(Math.abs(twist) / 3)), twist);
  const hubH = num(v, 'hubHeight'), hubR = Math.min(num(v, 'hubDiameter') / 2, rf - 0.5);
  if (hubH > 0 && hubR > 0) gear = gear.add(Manifold.cylinder(hubH + 0.01, hubR, hubR, 64).translate([0, 0, h - 0.01]));
  const bore = Math.min(num(v, 'bore') / 2, rf - 1);
  if (bore > 0) gear = gear.subtract(Manifold.cylinder(h + hubH + 2, bore, bore, 64).translate([0, 0, -1]));
  return { name, color, mesh: toTriMesh(gear) };
}

export const GEARS: GalleryModel[] = [
  {
    id: 'gear',
    category: 'parts',
    emoji: '⚙️',
    title: ['Gears', 'Зъбни колела'],
    desc: ['Involute spur or helical gears by module and tooth count, with an optional matching second gear.', 'Еволвентни прави или скосени зъбни колела по модул и брой зъби, по избор с второ подходящо колело.'],
    defaults: { font: 'russo', teeth: 20, teeth2: 40, module: 2, pressure: 20, thickness: 8, bore: 5, hubDiameter: 14, hubHeight: 5, helix: 0, backlash: 0.15, color: '#f97316', color2: '#fb923c' },
    params: [
      { key: 'teeth', label: ['Teeth', 'Брой зъби'], type: 'range', min: 8, max: 120, step: 1 },
      { key: 'teeth2', label: ['Teeth on the second gear (0 for none)', 'Зъби на второто колело (0 за без)'], type: 'range', min: 0, max: 120, step: 1 },
      { key: 'module', label: ['Module', 'Модул'], type: 'range', min: 0.5, max: 6, step: 0.25, unit: 'mm' },
      { readout: (v) => {
        const z1 = num(v, 'teeth'), z2 = num(v, 'teeth2'), mod = num(v, 'module');
        const base = `${(z1 * mod).toFixed(1)} / ${(mod * (z1 + 2)).toFixed(1)}`;
        if (!z2) return [`Pitch / outer diameter: ${base} mm`, `Делителен / външен диаметър: ${base} мм`];
        const dist = (((z1 + z2) * mod) / 2).toFixed(2), ratio = (z2 / z1).toFixed(2);
        return [
          `Pitch / outer diameter: ${base} mm. Axle distance: ${dist} mm. Ratio 1 : ${ratio}`,
          `Делителен / външен диаметър: ${base} мм. Разстояние между осите: ${dist} мм. Предавателно число 1 : ${ratio}`,
        ];
      } },
      { key: 'thickness', label: ['Face width', 'Ширина на зъба'], type: 'range', min: 2, max: 40, step: 0.5, unit: 'mm' },
      { key: 'bore', label: ['Axle hole', 'Отвор за ос'], type: 'range', min: 0, max: 30, step: 0.1, unit: 'mm' },
      { key: 'hubDiameter', label: ['Hub diameter', 'Диаметър на главината'], type: 'range', min: 0, max: 60, step: 0.5, unit: 'mm' },
      { key: 'hubHeight', label: ['Hub height', 'Височина на главината'], type: 'range', min: 0, max: 30, step: 0.5, unit: 'mm' },
      { key: 'helix', label: ['Helix angle (0 for straight)', 'Ъгъл на скосяване (0 за прави зъби)'], type: 'range', min: 0, max: 30, step: 1, unit: 'deg' },
      { key: 'pressure', label: ['Pressure angle', 'Ъгъл на зацепване'], type: 'range', min: 14.5, max: 25, step: 0.5, unit: 'deg' },
      { key: 'backlash', label: ['Backlash', 'Луфт'], type: 'range', min: 0, max: 0.6, step: 0.05, unit: 'mm' },
      { hint: ['Below about 17 teeth, real gears are undercut; this outline is not, so small gears may bind slightly. Gears that mesh must share the same module and pressure angle.', 'Под около 17 зъба истинските колела имат подрязване, а тук го няма, така че малките колела може леко да заяждат. Зацепените колела трябва да са с еднакъв модул и ъгъл.'] },
      { key: 'color', label: ['Gear 1', 'Колело 1'], type: 'color' },
      { key: 'color2', label: ['Gear 2', 'Колело 2'], type: 'color' },
    ],
    separate: true,
    build(m, _font, v) {
      const z1 = Math.round(num(v, 'teeth')), z2 = Math.round(num(v, 'teeth2')), mod = num(v, 'module');
      const parts = [gearPart(m, v, z1, 1, 'Gear 1', str(v, 'color'))];
      if (z2 > 0) {
        const second = gearPart(m, v, z2, -1, 'Gear 2', str(v, 'color2'));
        // Laid out apart for printing; helical gears on parallel axles need opposite hands.
        const dx = (mod * (z1 + 2)) / 2 + (mod * (z2 + 2)) / 2 + 5;
        const pos = second.mesh.positions;
        for (let i = 0; i < pos.length; i += 3) pos[i] += dx;
        parts.push(second);
      }
      return parts;
    },
  },
];
