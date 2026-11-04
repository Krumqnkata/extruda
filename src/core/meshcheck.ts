// SPDX-License-Identifier: AGPL-3.0-or-later
// Finds and repairs problems in triangle meshes that came from other programs.
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { weldVertices } from './loadMesh';
import { toTriMesh } from './manifold';
import { flipWinding, signedVolume, type TriMesh } from './mesh';

export interface MeshReport {
  triangles: number;
  vertices: number;
  /** Edges with a triangle on one side only: holes. */
  openEdges: number;
  /** Edges shared by more than two triangles. */
  overusedEdges: number;
  /** Edges whose two triangles disagree about which side is outside. */
  flippedEdges: number;
  /** Triangles with no area. */
  degenerate: number;
  bodies: number;
  /** False when the surface is inside out overall. */
  outwardFacing: boolean;
  closed: boolean;
}

function triangleArea(p: Float32Array, a: number, b: number, c: number): number {
  const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
  const ux = p[b * 3] - ax, uy = p[b * 3 + 1] - ay, uz = p[b * 3 + 2] - az;
  const vx = p[c * 3] - ax, vy = p[c * 3 + 1] - ay, vz = p[c * 3 + 2] - az;
  return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
}

/** Union-find over vertex ids. */
function makeSets(n: number) {
  const parent = new Uint32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  return { find, union: (a: number, b: number) => void (parent[find(a)] = find(b)) };
}

export function analyzeMesh(input: TriMesh): MeshReport {
  const mesh = weldVertices(input);
  const ix = mesh.indices;
  const V = mesh.positions.length / 3;
  const edges = new Map<number, [number, number]>();
  const sets = makeSets(V);
  let degenerate = 0;
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t], b = ix[t + 1], c = ix[t + 2];
    if (a === b || b === c || a === c || triangleArea(mesh.positions, a, b, c) < 1e-10) {
      degenerate++;
      continue;
    }
    sets.union(a, b);
    sets.union(b, c);
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const key = u < v ? u * V + v : v * V + u;
      let e = edges.get(key);
      if (!e) edges.set(key, (e = [0, 0]));
      e[u < v ? 0 : 1]++;
    }
  }
  let openEdges = 0, overusedEdges = 0, flippedEdges = 0;
  for (const [f, b] of edges.values()) {
    const n = f + b;
    if (n === 1) openEdges++;
    else if (n > 2) overusedEdges++;
    else if (f !== b) flippedEdges++;
  }
  const roots = new Set<number>();
  for (let t = 0; t < ix.length; t += 3) roots.add(sets.find(ix[t]));
  const closed = openEdges === 0 && overusedEdges === 0 && flippedEdges === 0 && degenerate === 0;
  return {
    triangles: ix.length / 3,
    vertices: V,
    openEdges,
    overusedEdges,
    flippedEdges,
    degenerate,
    bodies: roots.size,
    outwardFacing: signedVolume(mesh) >= 0,
    closed,
  };
}

/** A Manifold solid for a mesh, or undefined when the mesh is not a closed surface. */
export function toSolid(m: ManifoldToplevel, input: TriMesh): Manifold | undefined {
  const mesh = weldVertices(input);
  try {
    const solid = m.Manifold.ofMesh(new m.Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices }));
    return solid.status() === 'NoError' && !solid.isEmpty() ? solid : undefined;
  } catch {
    return undefined;
  }
}

export interface RepairResult {
  ok: boolean;
  mesh?: TriMesh;
  /** Triangles removed because they were empty or repeated. */
  removed: number;
  /** Triangles turned to face the same way as their neighbours. */
  flipped: number;
  /** Holes closed. */
  holes: number;
}

/** Makes every triangle in a connected piece agree with its neighbours. Returns how many were turned. */
function orientConsistently(tris: Uint32Array[], V: number): number {
  const byEdge = new Map<number, number[]>();
  tris.forEach((t, i) => {
    for (const [u, v] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
      const key = u < v ? u * V + v : v * V + u;
      const list = byEdge.get(key);
      if (list) list.push(i);
      else byEdge.set(key, [i]);
    }
  });
  const hasDirected = (t: Uint32Array, u: number, v: number) => (t[0] === u && t[1] === v) || (t[1] === u && t[2] === v) || (t[2] === u && t[0] === v);
  const seen = new Uint8Array(tris.length);
  let flipped = 0;
  for (let start = 0; start < tris.length; start++) {
    if (seen[start]) continue;
    seen[start] = 1;
    const stack = [start];
    while (stack.length) {
      const cur = tris[stack.pop()!];
      for (const [u, v] of [[cur[0], cur[1]], [cur[1], cur[2]], [cur[2], cur[0]]]) {
        const list = byEdge.get(u < v ? u * V + v : v * V + u)!;
        if (list.length !== 2) continue; // holes and over-used edges say nothing about direction
        for (const n of list) {
          if (seen[n]) continue;
          seen[n] = 1;
          // A neighbour must run the shared edge the opposite way.
          if (hasDirected(tris[n], u, v)) {
            const t = tris[n];
            const tmp = t[1];
            t[1] = t[2];
            t[2] = tmp;
            flipped++;
          }
          stack.push(n);
        }
      }
    }
  }
  return flipped;
}

/** Closes each boundary loop with new triangles. Returns the number of holes, or -1 if a loop cannot be traced. */
function fillHoles(m: ManifoldToplevel, tris: Uint32Array[], positions: Float32Array, V: number): number {
  const directed = new Set<number>();
  for (const t of tris) for (const [u, v] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) directed.add(u * V + v);
  const next = new Map<number, number>();
  for (const t of tris) {
    for (const [u, v] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
      if (directed.has(v * V + u)) continue;
      if (next.has(u)) return -1; // two holes touch at this point
      next.set(u, v);
    }
  }
  let holes = 0;
  const visited = new Set<number>();
  for (const start of next.keys()) {
    if (visited.has(start)) continue;
    const loop: number[] = [];
    let cur = start;
    while (!visited.has(cur)) {
      visited.add(cur);
      loop.push(cur);
      const n = next.get(cur);
      if (n === undefined) return -1;
      cur = n;
    }
    if (cur !== start || loop.length < 3) return -1;
    holes++;

    // Newell's method gives the loop's plane; flatten onto it to triangulate concave holes properly.
    let nx = 0, ny = 0, nz = 0, cx = 0, cy = 0, cz = 0;
    const at = (i: number): [number, number, number] => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
    loop.forEach((vtx, i) => {
      const a = at(vtx), b = at(loop[(i + 1) % loop.length]);
      nx += (a[1] - b[1]) * (a[2] + b[2]);
      ny += (a[2] - b[2]) * (a[0] + b[0]);
      nz += (a[0] - b[0]) * (a[1] + b[1]);
      cx += a[0]; cy += a[1]; cz += a[2];
    });
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const ax = Math.abs(nx) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    let ux = ny * ax[2] - nz * ax[1], uy = nz * ax[0] - nx * ax[2], uz = nx * ax[1] - ny * ax[0];
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
    const flat = loop.map((vtx): [number, number] => {
      const a = at(vtx);
      const dx = a[0] - cx / loop.length, dy = a[1] - cy / loop.length, dz = a[2] - cz / loop.length;
      return [dx * ux + dy * uy + dz * uz, dx * vx + dy * vy + dz * vz];
    });
    let faces: number[][];
    try {
      faces = m.triangulate([flat]) as unknown as number[][];
      if (faces.length !== loop.length - 2) throw new Error('incomplete');
    } catch {
      faces = loop.slice(2).map((_, i) => [0, i + 1, i + 2]); // a simple fan still closes the surface
    }
    // The cap runs against the loop, so its edges pair up with the surrounding triangles.
    for (const [i, j, k] of faces) tris.push(Uint32Array.of(loop[k], loop[j], loop[i]));
  }
  return holes;
}

export function repairMesh(m: ManifoldToplevel, input: TriMesh): RepairResult {
  const mesh = weldVertices(input);
  const V = mesh.positions.length / 3;
  const ix = mesh.indices;
  const tris: Uint32Array[] = [];
  const seen = new Set<string>();
  let removed = 0;
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t], b = ix[t + 1], c = ix[t + 2];
    const key = [a, b, c].sort((x, y) => x - y).join(',');
    if (a === b || b === c || a === c || seen.has(key) || triangleArea(mesh.positions, a, b, c) < 1e-10) {
      removed++;
      continue;
    }
    seen.add(key);
    tris.push(Uint32Array.of(a, b, c));
  }
  const flipped = orientConsistently(tris, V);
  const holes = fillHoles(m, tris, mesh.positions, V);
  if (holes < 0) return { ok: false, removed, flipped, holes: 0 };

  const indices = new Uint32Array(tris.length * 3);
  tris.forEach((t, i) => indices.set(t, i * 3));
  const fixed: TriMesh = { positions: mesh.positions, indices };
  if (signedVolume(fixed) < 0) flipWinding(fixed);
  const solid = toSolid(m, fixed);
  if (!solid) return { ok: false, removed, flipped, holes };
  return { ok: true, mesh: toTriMesh(solid), removed, flipped, holes };
}

// ---------------------------------------------------------------- printability maps

export interface FaceMap {
  /** Each triangle has its own three vertices, so it can have its own colour. */
  mesh: TriMesh;
  colors: Float32Array;
  /** Total area flagged, mm². */
  flagged: number;
  /** Share of the surface flagged, 0–1. */
  share: number;
}

const OK_COLOR: [number, number, number] = [0.55, 0.6, 0.68];
const BAD_COLOR: [number, number, number] = [0.93, 0.2, 0.16];

function paintFaces(mesh: TriMesh, isBad: (t: number) => boolean): FaceMap {
  const p = mesh.positions, ix = mesh.indices;
  const n = ix.length / 3;
  const positions = new Float32Array(n * 9);
  const colors = new Float32Array(n * 9);
  let flagged = 0, total = 0;
  for (let t = 0; t < n; t++) {
    const area = triangleArea(p, ix[t * 3], ix[t * 3 + 1], ix[t * 3 + 2]);
    total += area;
    const bad = isBad(t);
    if (bad) flagged += area;
    const color = bad ? BAD_COLOR : OK_COLOR;
    for (let k = 0; k < 3; k++) {
      const v = ix[t * 3 + k] * 3;
      const o = (t * 3 + k) * 3;
      positions[o] = p[v]; positions[o + 1] = p[v + 1]; positions[o + 2] = p[v + 2];
      colors[o] = color[0]; colors[o + 1] = color[1]; colors[o + 2] = color[2];
    }
  }
  const indices = Uint32Array.from({ length: n * 3 }, (_, i) => i);
  return { mesh: { positions, indices }, colors, flagged, share: total ? flagged / total : 0 };
}

function faceNormal(p: Float32Array, a: number, b: number, c: number): [number, number, number] {
  const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
  const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

/** Faces leaning out further than `limitDeg` from vertical, ignoring those resting on the bed. */
export function overhangMap(mesh: TriMesh, limitDeg = 45): FaceMap {
  const p = mesh.positions, ix = mesh.indices;
  let minZ = Infinity;
  for (let i = 2; i < p.length; i += 3) minZ = Math.min(minZ, p[i]);
  const limit = -Math.sin((limitDeg * Math.PI) / 180);
  return paintFaces(mesh, (t) => {
    const a = ix[t * 3], b = ix[t * 3 + 1], c = ix[t * 3 + 2];
    if (faceNormal(p, a, b, c)[2] >= limit) return false;
    return Math.max(p[a * 3 + 2], p[b * 3 + 2], p[c * 3 + 2]) > minZ + 0.2;
  });
}

/**
 * Faces where the solid is thinner than `minWall`, found by shooting a ray inwards from the middle of each
 * triangle. Large meshes are sampled, so treat the result as a guide.
 */
export function thinWallMap(solid: Manifold, mesh: TriMesh, minWall: number, maxSamples = 15000): FaceMap {
  const p = mesh.positions, ix = mesh.indices;
  const n = ix.length / 3;
  const stride = Math.max(1, Math.ceil(n / maxSamples));
  const eps = 1e-3;
  return paintFaces(mesh, (t) => {
    // Sampled neighbours share the verdict of the last triangle tested in their run.
    const q = t - (t % stride);
    const a = ix[q * 3], b = ix[q * 3 + 1], c = ix[q * 3 + 2];
    const nrm = faceNormal(p, a, b, c);
    const mx = (p[a * 3] + p[b * 3] + p[c * 3]) / 3, my = (p[a * 3 + 1] + p[b * 3 + 1] + p[c * 3 + 1]) / 3, mz = (p[a * 3 + 2] + p[b * 3 + 2] + p[c * 3 + 2]) / 3;
    const start: [number, number, number] = [mx - nrm[0] * eps, my - nrm[1] * eps, mz - nrm[2] * eps];
    const end: [number, number, number] = [mx - nrm[0] * minWall, my - nrm[1] * minWall, mz - nrm[2] * minWall];
    return solid.rayCast(start, end).length > 0;
  });
}
