// SPDX-License-Identifier: AGPL-3.0-or-later
// Builders that start from 2D artwork (logo, stencil, cookie cutter).
import type { CrossSection, ManifoldToplevel } from 'manifold-3d';
import { toTriMesh } from './manifold';
import type { Part } from './mesh';
import { addRing, fillHoles, plateShape, SEGMENTS, signedArea } from './models';

const hex = (n: number) => n.toString(16).padStart(2, '0');

// ---------------------------------------------------------------- logo

export interface LogoLayer {
  color: string;
  cs: CrossSection;
}

export interface LogoParams {
  base: 'none' | 'contour' | 'plate';
  baseThickness: number;
  relief: number;
  stepped: boolean; // each later colour 0.4 mm higher, so overlaps read better
  border: number;
  padding: number;
  corner: number;
  ring: 'left' | 'top' | 'right' | 'none';
  ringDiameter: number;
  holeDiameter: number;
  baseColor: string;
  singleColor: boolean;
  color: string;
}

export const LOGO_DEFAULTS: LogoParams = {
  base: 'contour',
  baseThickness: 2,
  relief: 1.6,
  stepped: false,
  border: 3,
  padding: 5,
  corner: 4,
  ring: 'none',
  ringDiameter: 10,
  holeDiameter: 5,
  baseColor: '#1f2937',
  singleColor: false,
  color: '#ff7a1a',
};

/** Layers are in paint order; later layers cover earlier ones, so overlaps are removed from the lower one. */
export function logoParts(m: ManifoldToplevel, layers: LogoLayer[], p: LogoParams): Part[] {
  const { CrossSection, Manifold } = m;
  const visible: LogoLayer[] = [];
  for (let i = 0; i < layers.length; i++) {
    const above = layers.slice(i + 1).map((l) => l.cs);
    const cs = above.length ? layers[i].cs.subtract(CrossSection.union(above)) : layers[i].cs;
    if (!cs.isEmpty() && cs.area() > 0.05) visible.push({ color: layers[i].color, cs });
  }
  if (!visible.length) return [];
  const all = CrossSection.union(visible.map((l) => l.cs));

  let z0 = 0;
  const parts: Part[] = [];
  if (p.base !== 'none') {
    let base: CrossSection;
    if (p.base === 'contour') {
      base = fillHoles(m, all.offset(p.border + 2, 'Round', 2, SEGMENTS).offset(-2, 'Round', 2, SEGMENTS));
    } else {
      const b = all.bounds();
      const w = b.max[0] - b.min[0] + 2 * p.padding, h = b.max[1] - b.min[1] + 2 * p.padding;
      base = plateShape(m, 'rounded', w, h, p.corner).translate([(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2]);
    }
    base = addRing(m, base, p.ring, p.ringDiameter, p.holeDiameter);
    parts.push({ name: 'Base', color: p.baseColor, mesh: toTriMesh(Manifold.extrude(base, p.baseThickness)) });
    z0 = p.baseThickness;
  }
  if (p.singleColor) {
    parts.push({ name: 'Logo', color: p.color, mesh: toTriMesh(Manifold.extrude(all, p.relief).translate([0, 0, z0])) });
    return parts;
  }
  visible.forEach((l, i) => {
    const h = p.relief + (p.stepped ? i * 0.4 : 0);
    parts.push({ name: `Colour ${i + 1} ${l.color}`, color: l.color, mesh: toTriMesh(Manifold.extrude(l.cs, h).translate([0, 0, z0])) });
  });
  return parts;
}

/** Turns a grey level into a display colour for traced images. */
export function grayColor(level: number): string {
  const v = Math.round(Math.min(1, Math.max(0, level)) * 255);
  return `#${hex(v)}${hex(v)}${hex(v)}`;
}

// ---------------------------------------------------------------- stencil

export interface StencilParams {
  padding: number;
  corner: number;
  thickness: number;
  bridge: number; // width of the bridges that hold islands in place
  hole: boolean;
  color: string;
}

export const STENCIL_DEFAULTS: StencilParams = {
  padding: 10,
  corner: 5,
  thickness: 1.2,
  bridge: 1.6,
  hole: true,
  color: '#2563eb',
};

/** Cuts artwork out of a plate and adds vertical bridges across every enclosed counter (O, A, Р, Б…). */
export function stencilCut(m: ManifoldToplevel, art: CrossSection, bridge: number): CrossSection {
  const { CrossSection } = m;
  const strips: CrossSection[] = [];
  for (const comp of art.decompose()) {
    const polys = comp.toPolygons();
    const cb = comp.bounds();
    for (const poly of polys) {
      if (signedArea(poly) >= 0) continue; // outer contour
      let minX = Infinity, maxX = -Infinity;
      for (const [x] of poly) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
      const cx = (minX + maxX) / 2;
      strips.push(
        CrossSection.square([bridge, cb.max[1] - cb.min[1] + 2], true).translate([cx, (cb.min[1] + cb.max[1]) / 2]),
      );
    }
  }
  return strips.length ? art.subtract(CrossSection.union(strips)) : art;
}

export function stencilParts(m: ManifoldToplevel, art: CrossSection, p: StencilParams): Part[] {
  if (art.isEmpty()) return [];
  const b = art.bounds();
  const holeRoom = p.hole ? 10 : 0;
  const w = b.max[0] - b.min[0] + 2 * p.padding;
  const h = b.max[1] - b.min[1] + 2 * p.padding + holeRoom;
  let plate = plateShape(m, 'rounded', w, h, p.corner).translate([(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2 + holeRoom / 2]);
  if (p.hole) {
    const pb = plate.bounds();
    plate = plate.subtract(m.CrossSection.circle(3, SEGMENTS).translate([(pb.min[0] + pb.max[0]) / 2, pb.max[1] - 6]));
  }
  plate = plate.subtract(stencilCut(m, art, p.bridge));
  return [{ name: 'Stencil', color: p.color, mesh: toTriMesh(m.Manifold.extrude(plate, p.thickness)) }];
}

// ---------------------------------------------------------------- cookie cutter

export interface CutterParams {
  size: number; // largest dimension of the shape, mm
  height: number;
  edge: number; // thin cutting wall at the top
  wall: number; // thicker lower wall
  flange: number;
  flangeHeight: number;
  merge: number; // joins separate pieces (letters) into one outline
  stamp: boolean;
  clearance: number;
  stampThickness: number;
  relief: number;
  cutterColor: string;
  stampColor: string;
}

export const CUTTER_DEFAULTS: CutterParams = {
  size: 70,
  height: 15,
  edge: 0.8,
  wall: 1.6,
  flange: 4,
  flangeHeight: 2,
  merge: 3,
  stamp: false,
  clearance: 0.6,
  stampThickness: 3,
  relief: 2,
  cutterColor: '#ec4899',
  stampColor: '#f9a8d4',
};

/** Scales a shape so its largest side is `size` and centres it. */
export function fitCS(cs: CrossSection, size: number): CrossSection {
  const b = cs.bounds();
  const k = size / Math.max(1e-6, b.max[0] - b.min[0], b.max[1] - b.min[1]);
  return cs.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2]).scale(k);
}

export function cutterParts(m: ManifoldToplevel, shape: CrossSection, p: CutterParams): Part[] {
  const { Manifold } = m;
  if (shape.isEmpty()) return [];
  const art = fitCS(shape, p.size);
  let sil = p.merge > 0 ? art.offset(p.merge, 'Round', 2, SEGMENTS).offset(-p.merge, 'Round', 2, SEGMENTS) : art;
  sil = fillHoles(m, sil);
  if (sil.isEmpty()) return [];
  const ring = (w: number) => sil.offset(w, 'Round', 2, SEGMENTS).subtract(sil);
  const edge = Math.min(p.edge, p.wall);
  const lowerH = Math.max(p.flangeHeight + 0.5, p.height * 0.6);
  let cutter = Manifold.extrude(ring(edge), p.height);
  cutter = cutter.add(Manifold.extrude(ring(p.wall), lowerH));
  cutter = cutter.add(Manifold.extrude(ring(p.wall + p.flange), p.flangeHeight));
  const parts: Part[] = [{ name: 'Cutter', color: p.cutterColor, mesh: toTriMesh(cutter) }];

  if (p.stamp) {
    const plate = sil.offset(-p.clearance, 'Round', 2, SEGMENTS);
    if (!plate.isEmpty()) {
      // A stamp prints mirrored, so the design is mirrored to read correctly on the cookie.
      const detail = art.mirror([1, 0]).intersect(plate.offset(-0.8, 'Round', 2, SEGMENTS));
      let stamp = Manifold.extrude(plate, p.stampThickness);
      if (!detail.isEmpty()) stamp = stamp.add(Manifold.extrude(detail, p.relief).translate([0, 0, p.stampThickness]));
      const b = sil.bounds();
      const dx = b.max[0] - b.min[0] + p.wall + p.flange * 2 + 10;
      parts.push({ name: 'Stamp', color: p.stampColor, mesh: toTriMesh(stamp.translate([dx, 0, 0])) });
    }
  }
  return parts;
}
