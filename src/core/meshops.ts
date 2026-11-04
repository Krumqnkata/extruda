// SPDX-License-Identifier: AGPL-3.0-or-later
// Transforms, automatic orientation and cutting for imported meshes.
import type { Manifold, ManifoldToplevel, Vec3 } from 'manifold-3d';
import { toTriMesh } from './manifold';
import { flipWinding, meshStats, signedVolume, type TriMesh } from './mesh';

export type Matrix3 = readonly [number, number, number, number, number, number, number, number, number];

export const IDENTITY: Matrix3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Applies a 3 × 3 matrix to every vertex; mirroring keeps the outside facing out. */
export function applyMatrix(mesh: TriMesh, r: Matrix3): TriMesh {
  const positions = new Float32Array(mesh.positions.length);
  const p = mesh.positions;
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    positions[i] = r[0] * x + r[1] * y + r[2] * z;
    positions[i + 1] = r[3] * x + r[4] * y + r[5] * z;
    positions[i + 2] = r[6] * x + r[7] * y + r[8] * z;
  }
  const det = r[0] * (r[4] * r[8] - r[5] * r[7]) - r[1] * (r[3] * r[8] - r[5] * r[6]) + r[2] * (r[3] * r[7] - r[4] * r[6]);
  const out: TriMesh = { positions, indices: mesh.indices.slice() };
  if (det < 0) flipWinding(out);
  return out;
}

export const scaleMatrix = (k: number): Matrix3 => [k, 0, 0, 0, k, 0, 0, 0, k];
export const mirrorMatrix = (axis: 0 | 1 | 2): Matrix3 => [axis === 0 ? -1 : 1, 0, 0, 0, axis === 1 ? -1 : 1, 0, 0, 0, axis === 2 ? -1 : 1];

/** A quarter turn about one axis. */
export function quarterTurn(axis: 0 | 1 | 2): Matrix3 {
  if (axis === 0) return [1, 0, 0, 0, 0, -1, 0, 1, 0];
  if (axis === 1) return [0, 0, 1, 0, 1, 0, -1, 0, 0];
  return [0, -1, 0, 1, 0, 0, 0, 0, 1];
}

/** Centres a mesh over the origin and rests it on z = 0. */
export function settleOnBed(mesh: TriMesh): TriMesh {
  const s = meshStats(mesh);
  const positions = mesh.positions.slice();
  const dx = s.min[0] + s.size[0] / 2, dy = s.min[1] + s.size[1] / 2, dz = s.min[2];
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] -= dx;
    positions[i + 1] -= dy;
    positions[i + 2] -= dz;
  }
  return { positions, indices: mesh.indices };
}

// ---------------------------------------------------------------- automatic orientation

/** The rotation that turns direction `d` (a unit vector) to point straight down. */
export function rotationToDown(d: readonly [number, number, number]): Matrix3 {
  const [x, y, z] = d;
  const c = -z; // dot(d, down)
  if (c > 0.999999) return IDENTITY;
  if (c < -0.999999) return [1, 0, 0, 0, -1, 0, 0, 0, -1];
  // Rodrigues' formula for the axis d × down.
  const ax = -y, ay = x; // az = 0
  const k = 1 / (1 + c);
  return [
    1 - k * ay * ay, k * ax * ay, ay,
    k * ax * ay, 1 - k * ax * ax, -ax,
    -ay, ax, 1 - k * (ax * ax + ay * ay),
  ];
}

export interface OrientChoice {
  /** The direction that ends up pointing down. */
  down: [number, number, number];
  rotation: Matrix3;
  /** Surface needing support, mm². */
  overhang: number;
  /** Surface touching the bed, mm². */
  contact: number;
  height: number;
}

const COS45 = Math.SQRT1_2;

function scoreDirection(mesh: TriMesh, d: [number, number, number]): OrientChoice {
  const p = mesh.positions, ix = mesh.indices;
  let lowest = -Infinity, highest = Infinity;
  for (let i = 0; i < p.length; i += 3) {
    const h = p[i] * d[0] + p[i + 1] * d[1] + p[i + 2] * d[2]; // grows towards the bed
    if (h > lowest) lowest = h;
    if (h < highest) highest = h;
  }
  let overhang = 0, contact = 0;
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len === 0) continue;
    const area = len / 2;
    const facing = (nx * d[0] + ny * d[1] + nz * d[2]) / len;
    if (facing <= COS45) continue;
    const ha = p[a] * d[0] + p[a + 1] * d[1] + p[a + 2] * d[2];
    const hb = p[b] * d[0] + p[b + 1] * d[1] + p[b + 2] * d[2];
    const hc = p[c] * d[0] + p[c + 1] * d[1] + p[c + 2] * d[2];
    if (Math.min(ha, hb, hc) > lowest - 0.05) contact += area;
    else overhang += area;
  }
  return { down: d, rotation: rotationToDown(d), overhang, contact, height: lowest - highest };
}

/** Tries the sides of the convex hull and the six axes; best first. Less support wins, then more bed contact. */
export function orientChoices(m: ManifoldToplevel, mesh: TriMesh, count = 3): OrientChoice[] {
  const p = mesh.positions;
  const stride = Math.max(1, Math.ceil(p.length / 3 / 40000));
  const points: Vec3[] = [];
  for (let i = 0; i < p.length; i += 3 * stride) points.push([p[i], p[i + 1], p[i + 2]]);
  const hull = toTriMesh(m.Manifold.hull(points));
  const byNormal = new Map<string, { d: [number, number, number]; area: number }>();
  for (let t = 0; t < hull.indices.length; t += 3) {
    const a = hull.indices[t] * 3, b = hull.indices[t + 1] * 3, c = hull.indices[t + 2] * 3;
    const q = hull.positions;
    const ux = q[b] - q[a], uy = q[b + 1] - q[a + 1], uz = q[b + 2] - q[a + 2];
    const vx = q[c] - q[a], vy = q[c + 1] - q[a + 1], vz = q[c + 2] - q[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len === 0) continue;
    const d: [number, number, number] = [nx / len, ny / len, nz / len];
    const key = d.map((v) => v.toFixed(2)).join(',');
    const e = byNormal.get(key);
    if (e) e.area += len / 2;
    else byNormal.set(key, { d, area: len / 2 });
  }
  const candidates: [number, number, number][] = [...byNormal.values()].sort((x, y) => y.area - x.area).slice(0, 14).map((e) => e.d);
  candidates.push([0, 0, -1], [0, 0, 1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]);
  const scored = candidates.map((d) => scoreDirection(mesh, d));
  scored.sort((x, y) => x.overhang - x.contact * 0.5 + x.height * 0.5 - (y.overhang - y.contact * 0.5 + y.height * 0.5));
  // Near-identical directions would make the top three the same choice.
  const picked: OrientChoice[] = [];
  for (const s of scored) {
    if (picked.every((q) => q.down[0] * s.down[0] + q.down[1] * s.down[1] + q.down[2] * s.down[2] < 0.98)) picked.push(s);
    if (picked.length === count) break;
  }
  return picked;
}

// ---------------------------------------------------------------- cutting to fit the bed

export interface CutOptions {
  bedX: number;
  bedY: number;
  bedZ: number;
  /** Space left free on the bed around each piece. */
  margin: number;
  /** Dowel diameter; 0 for no dowels. */
  dowel: number;
  clearance: number;
}

export interface CutResult {
  pieces: TriMesh[];
  /** One loose pin per pair of sockets, standing on the bed. */
  dowels: TriMesh[];
}

const DOWEL_DEPTH = 8;

/** Where sockets fit across a cut: inside the material, as far apart as the section allows. */
function dowelSites(section: ReturnType<Manifold['slice']>, r: number): [number, number][] {
  const sites: [number, number][] = [];
  for (const part of section.decompose()) {
    const inner = part.offset(-(r + 1.6), 'Round', 2, 16);
    if (inner.isEmpty()) continue;
    for (const region of inner.decompose()) {
      const pts = region.toPolygons().flat();
      if (!pts.length) continue;
      const b = region.bounds();
      const alongX = b.max[0] - b.min[0] >= b.max[1] - b.min[1];
      const axis = alongX ? 0 : 1;
      let lo = pts[0], hi = pts[0];
      for (const q of pts) {
        if (q[axis] < lo[axis]) lo = q;
        if (q[axis] > hi[axis]) hi = q;
      }
      sites.push([lo[0], lo[1]]);
      if (Math.hypot(hi[0] - lo[0], hi[1] - lo[1]) > 4 * r) sites.push([hi[0], hi[1]]);
    }
  }
  return sites;
}

/** Cuts a solid along a grid so every piece fits the bed, with sockets for loose dowels across each cut. */
export function cutToFit(m: ManifoldToplevel, solid: Manifold, o: CutOptions): CutResult {
  const { Manifold } = m;
  const r = o.dowel / 2;
  const box = solid.boundingBox();
  const room = [o.bedX - 2 * o.margin, o.bedY - 2 * o.margin, o.bedZ - o.margin];
  // Each axis is turned to Z for slicing and socket cutting, then turned back.
  const frames: [Vec3, Vec3][] = [[[0, -90, 0], [0, 90, 0]], [[90, 0, 0], [-90, 0, 0]], [[0, 0, 0], [0, 0, 0]]];
  let pieces: Manifold[] = [solid];
  let dowelCount = 0;
  for (let axis = 0; axis < 3; axis++) {
    const extent = box.max[axis] - box.min[axis];
    const parts = Math.max(1, Math.ceil(extent / room[axis]));
    const normal: Vec3 = [axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0];
    for (let i = 1; i < parts; i++) {
      const at = box.min[axis] + (extent * i) / parts;
      const next: Manifold[] = [];
      for (const piece of pieces) {
        const b = piece.boundingBox();
        if (b.min[axis] >= at || b.max[axis] <= at) {
          next.push(piece);
          continue;
        }
        const [above, below] = piece.splitByPlane(normal, at);
        let upper = above, lower = below;
        // Thin pieces cannot take a socket without breaking through.
        if (r > 0 && b.max[axis] - at > DOWEL_DEPTH + 2 && at - b.min[axis] > DOWEL_DEPTH + 2) {
          const [forward, back] = frames[axis];
          // In the turned frame the cut lies at z = at for every axis.
          const section = piece.rotate(forward).slice(at);
          const sites = dowelSites(section, r);
          if (sites.length) {
            const socketR = r + o.clearance / 2;
            const depth = DOWEL_DEPTH + 0.4;
            const sockets = Manifold.union(sites.map(([x, y]) => Manifold.cylinder(2 * depth, socketR, socketR, 32).translate([x, y, at - depth]))).rotate(back);
            upper = upper.subtract(sockets);
            lower = lower.subtract(sockets);
            dowelCount += sites.length;
          }
        }
        if (!upper.isEmpty()) next.push(upper);
        if (!lower.isEmpty()) next.push(lower);
      }
      pieces = next;
    }
  }
  const meshes = pieces.map((piece) => toTriMesh(piece));
  const dowels: TriMesh[] = [];
  if (dowelCount) {
    const pin = toTriMesh(Manifold.cylinder(2 * DOWEL_DEPTH, r, r, 32));
    for (let i = 0; i < dowelCount; i++) dowels.push({ positions: pin.positions.slice(), indices: pin.indices.slice() });
  }
  for (const mesh of meshes) if (signedVolume(mesh) < 0) flipWinding(mesh);
  return { pieces: meshes, dowels };
}
