// SPDX-License-Identifier: AGPL-3.0-or-later
// ISO metric bolts and nuts. Pitch and hexagon sizes come from ISO 261, ISO 4017 and ISO 4032 tables.
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { toTriMesh } from '../core/manifold';
import { flipWinding, signedVolume, type TriMesh } from '../core/mesh';
import { num, str, type GalleryModel } from './types';

export interface MetricSize {
  d: number;
  pitch: number;
  /** Width across the flats of the hexagon. */
  flats: number;
  head: number;
  nut: number;
}

export const METRIC: Record<string, MetricSize> = {
  M3: { d: 3, pitch: 0.5, flats: 5.5, head: 2, nut: 2.4 },
  M4: { d: 4, pitch: 0.7, flats: 7, head: 2.8, nut: 3.2 },
  M5: { d: 5, pitch: 0.8, flats: 8, head: 3.5, nut: 4.7 },
  M6: { d: 6, pitch: 1, flats: 10, head: 4, nut: 5.2 },
  M8: { d: 8, pitch: 1.25, flats: 13, head: 5.3, nut: 6.8 },
  M10: { d: 10, pitch: 1.5, flats: 16, head: 6.4, nut: 8.4 },
  M12: { d: 12, pitch: 1.75, flats: 18, head: 7.5, nut: 10.8 },
  M16: { d: 16, pitch: 2, flats: 24, head: 10, nut: 14.8 },
  M20: { d: 20, pitch: 2.5, flats: 30, head: 12.5, nut: 18 },
  M24: { d: 24, pitch: 3, flats: 36, head: 15, nut: 21.5 },
  M30: { d: 30, pitch: 3.5, flats: 46, head: 18.7, nut: 25.6 },
};

const SEGMENTS = 48;
const TAN30 = Math.tan(Math.PI / 6);

/** A right-hand helical ridge as a closed mesh, from z = zStart for the given number of turns. */
export function helixRidge(outerR: number, baseR: number, pitch: number, zStart: number, turns: number): TriMesh {
  const crest = pitch / 8;
  const width = Math.min(crest + 2 * (outerR - baseR) * TAN30, pitch * 0.96); // 60° flanks
  const inner = baseR - pitch * 0.15; // sunk into the core so the union is clean
  const section: [number, number][] = [
    [inner, -width / 2],
    [baseR, -width / 2],
    [outerR, -crest / 2],
    [outerR, crest / 2],
    [baseR, width / 2],
    [inner, width / 2],
  ];
  const N = section.length;
  const rings = Math.ceil(turns * SEGMENTS) + 1;
  const positions = new Float32Array(rings * N * 3);
  for (let i = 0; i < rings; i++) {
    const a = (i / SEGMENTS) * Math.PI * 2;
    const z = zStart + (i / SEGMENTS) * pitch;
    section.forEach(([r, dz], k) => {
      const o = (i * N + k) * 3;
      positions[o] = r * Math.cos(a);
      positions[o + 1] = r * Math.sin(a);
      positions[o + 2] = z + dz;
    });
  }
  const tris: number[] = [];
  for (let i = 0; i < rings - 1; i++) {
    for (let k = 0; k < N; k++) {
      const a = i * N + k, b = i * N + (k + 1) % N, c = (i + 1) * N + (k + 1) % N, d = (i + 1) * N + k;
      tris.push(a, b, c, a, c, d);
    }
  }
  const last = (rings - 1) * N;
  for (let k = 1; k < N - 1; k++) {
    tris.push(0, k + 1, k);
    tris.push(last, last + k, last + k + 1);
  }
  const mesh: TriMesh = { positions, indices: new Uint32Array(tris) };
  if (signedVolume(mesh) < 0) flipWinding(mesh);
  return mesh;
}

/** A threaded rod (or the cutter for a threaded hole) from z = 0 to z = length. */
export function threadedRod(m: ManifoldToplevel, outerR: number, coreR: number, pitch: number, length: number): Manifold {
  const { Manifold } = m;
  const mesh = helixRidge(outerR, coreR, pitch, -pitch, length / pitch + 2);
  const ridge = Manifold.ofMesh(new m.Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices }));
  const rod = ridge.add(Manifold.cylinder(length + 2 * pitch, coreR, coreR, SEGMENTS * 2).translate([0, 0, -pitch]));
  return rod.intersect(Manifold.cylinder(length, outerR + 1, outerR + 1, SEGMENTS).translate([0, 0, 0]));
}

function hexPrism(m: ManifoldToplevel, flats: number, height: number): Manifold {
  const { Manifold } = m;
  const corner = flats / Math.sqrt(3);
  const hex = Manifold.cylinder(height, corner, corner, 6);
  // Chamfered top corners, as on real hardware.
  const cone = Manifold.cylinder(height, corner + height * 0.6, flats / 2 + 0.05 * corner, 96);
  return hex.intersect(cone);
}

function bolt(m: ManifoldToplevel, size: MetricSize, length: number, c: number): Manifold {
  const { Manifold } = m;
  const R = size.d / 2 - c / 2;
  const core = size.d / 2 - 0.6134 * size.pitch; // ISO minor radius of an external thread
  const lead = Math.min(size.pitch, length / 4);
  let rod = threadedRod(m, R, core, size.pitch, length);
  // The tip tapers so the bolt finds its way into the nut.
  const tip = Manifold.cylinder(length - lead, R + 2, R + 2, 96).add(Manifold.cylinder(lead, R, R - lead, 96).translate([0, 0, length - lead]));
  rod = rod.intersect(tip);
  return hexPrism(m, size.flats, size.head).add(rod.translate([0, 0, size.head - 0.01]));
}

function nut(m: ManifoldToplevel, size: MetricSize, c: number): Manifold {
  const { Manifold } = m;
  const R = size.d / 2 + c / 2;
  const core = size.d / 2 - 0.5413 * size.pitch + c / 2; // ISO minor radius of an internal thread
  const P = size.pitch;
  const whole = (Math.ceil(size.nut / P) + 2) * P;
  // Whole turns below z = 0, so the cutter's phase matches a bolt started at z = 0.
  const cutter = threadedRod(m, R, core, P, whole).translate([0, 0, -P]);
  const body = hexPrism(m, size.flats, size.nut);
  const flare = 0.6 * P; // countersinks ease the first turn at both faces
  const sink = Manifold.cylinder(flare, R + flare, R, 96).translate([0, 0, -0.001])
    .add(Manifold.cylinder(flare, R, R + flare, 96).translate([0, 0, size.nut - flare + 0.001]));
  return body.subtract(cutter).subtract(sink);
}

const SIZE_OPTIONS = Object.keys(METRIC).map((k) => [k, [k, k]] as const);

export const THREADS: GalleryModel[] = [
  {
    id: 'bolt-nut',
    category: 'parts',
    emoji: '🔩',
    title: ['Bolts & nuts', 'Винтове и гайки'],
    desc: ['ISO metric hex bolts and nuts from M3 to M30, with a clearance you can tune to your printer.', 'Метрични винтове и гайки с шестограм от M3 до M30, с хлабина, настроена за твоя принтер.'],
    defaults: { font: 'russo', size: 'M8', length: 25, part: 'both', clearance: 0.3, boltColor: '#94a3b8', nutColor: '#64748b' },
    params: [
      { key: 'size', label: ['Size', 'Размер'], type: 'select', options: SIZE_OPTIONS },
      { key: 'part', label: ['Make', 'Направи'], type: 'select', options: [['both', ['Bolt and nut', 'Винт и гайка']], ['bolt', ['Bolt only', 'Само винт']], ['nut', ['Nut only', 'Само гайка']]] },
      { key: 'length', label: ['Bolt length', 'Дължина на винта'], type: 'range', min: 6, max: 150, step: 1, unit: 'mm', when: (v) => str(v, 'part') !== 'nut' },
      { key: 'clearance', label: ['Clearance', 'Хлабина'], type: 'range', min: 0, max: 0.8, step: 0.05, unit: 'mm' },
      { readout: (v) => {
        const s = METRIC[str(v, 'size')] ?? METRIC.M8;
        return [`Pitch ${s.pitch} mm. Spanner size ${s.flats} mm.`, `Стъпка ${s.pitch} мм. Ключ ${s.flats} мм.`];
      } },
      { hint: ['Print standing, with fine layers (0.12–0.16 mm). Below M6 a 0.4 mm nozzle makes weak threads, so these sizes suit light use only. Printed threads are not rated for loads or anything safety-related.', 'Принтирай изправен, с тънки слоеве (0,12–0,16 мм). Под M6 дюза 0,4 мм дава слаба резба, затова тези размери са само за леко натоварване. Принтираната резба не е за големи товари и нищо свързано с безопасност.'] },
      { key: 'boltColor', label: ['Bolt', 'Винт'], type: 'color' },
      { key: 'nutColor', label: ['Nut', 'Гайка'], type: 'color' },
    ],
    separate: true,
    build(m, _font, v) {
      const size = METRIC[str(v, 'size')] ?? METRIC.M8;
      const which = str(v, 'part'), c = num(v, 'clearance');
      const parts = [];
      if (which !== 'nut') parts.push({ name: 'Bolt', color: str(v, 'boltColor'), mesh: toTriMesh(bolt(m, size, num(v, 'length'), c)) });
      if (which !== 'bolt') {
        const dx = which === 'both' ? size.flats * 1.3 + 4 : 0;
        parts.push({ name: 'Nut', color: str(v, 'nutColor'), mesh: toTriMesh(nut(m, size, c).translate([dx, 0, 0])) });
      }
      return parts;
    },
  },
];
