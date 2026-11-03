// SPDX-License-Identifier: AGPL-3.0-or-later
// Plain triangle meshes and the measurements we show to the user.

export interface TriMesh {
  positions: Float32Array; // xyz per vertex, millimetres
  indices: Uint32Array; // three vertex indices per triangle, counter-clockwise from outside
}

/** A printable body with a display colour; several parts make a multi-colour model. */
export interface Part {
  name: string;
  color: string;
  mesh: TriMesh;
  /** Parts sharing a group form one object (e.g. a lid and its inlaid text); defaults to one object per part. */
  group?: string;
}

export interface MeshStats {
  triangles: number;
  size: [number, number, number];
  min: [number, number, number];
  volume: number; // mm³
  area: number; // mm²
}

export function meshStats(mesh: TriMesh): MeshStats {
  const p = mesh.positions;
  const ix = mesh.indices;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      if (p[i + k] < min[k]) min[k] = p[i + k];
      if (p[i + k] > max[k]) max[k] = p[i + k];
    }
  }
  let volume = 0;
  let area = 0;
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
    const ax = p[a], ay = p[a + 1], az = p[a + 2];
    const bx = p[b], by = p[b + 1], bz = p[b + 2];
    const cx = p[c], cy = p[c + 1], cz = p[c + 2];
    // Signed tetrahedron volume against the origin; sums to the enclosed volume for closed meshes.
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    area += Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;
  }
  const empty = p.length === 0;
  return {
    triangles: ix.length / 3,
    size: empty ? [0, 0, 0] : [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    min: empty ? [0, 0, 0] : min,
    volume: Math.abs(volume),
    area,
  };
}

/** Flips triangle winding in place, used when a generated mesh came out inside-out. */
export function flipWinding(mesh: TriMesh): void {
  const ix = mesh.indices;
  for (let t = 0; t < ix.length; t += 3) {
    const tmp = ix[t + 1];
    ix[t + 1] = ix[t + 2];
    ix[t + 2] = tmp;
  }
}

export function signedVolume(mesh: TriMesh): number {
  const p = mesh.positions;
  const ix = mesh.indices;
  let v = 0;
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
    v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1])
      - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c])
      + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return v / 6;
}

export function mergeMeshes(meshes: TriMesh[]): TriMesh {
  let nv = 0, ni = 0;
  for (const m of meshes) { nv += m.positions.length; ni += m.indices.length; }
  const positions = new Float32Array(nv);
  const indices = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const m of meshes) {
    positions.set(m.positions, vo);
    const base = vo / 3;
    for (let i = 0; i < m.indices.length; i++) indices[io + i] = m.indices[i] + base;
    vo += m.positions.length;
    io += m.indices.length;
  }
  return { positions, indices };
}
