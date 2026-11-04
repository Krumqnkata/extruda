// SPDX-License-Identifier: AGPL-3.0-or-later
// A closed solid made from a grid: a top surface, a bottom surface and walls joining them.
// Used for anything driven by a height per sample (lithophanes, relief pictures, terrain).
import { flipWinding, signedVolume, type TriMesh } from './mesh';

/** Writes the xyz of grid vertex (i, j) on the top or bottom surface into `out` at offset `o`. */
export type PlaceVertex = (i: number, j: number, top: boolean, out: Float32Array, o: number) => void;

/**
 * Builds the mesh for `nu` × `nv` samples. With `wrap`, column nu-1 joins column 0 (a cylinder).
 * Top vertices come first, one per sample in row order, then the bottom ones in the same order.
 */
export function closedGrid(nu: number, nv: number, wrap: boolean, place: PlaceVertex): TriMesh {
  const N = nu * nv;
  const rows = nv - 1;
  const positions = new Float32Array(N * 2 * 3);
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const k = j * nu + i;
      place(i, j, true, positions, k * 3);
      place(i, j, false, positions, (N + k) * 3);
    }
  }

  const cellsU = wrap ? nu : nu - 1;
  const cellCount = cellsU * rows;
  const boundary: number[] = [];
  if (wrap) {
    // Only the bottom and top rims need walls; they run in opposite directions.
    for (let i = 0; i < nu; i++) boundary.push(i, (i + 1) % nu);
    for (let i = nu - 1; i >= 0; i--) boundary.push(rows * nu + ((i + 1) % nu), rows * nu + i);
  } else {
    // Counter-clockwise loop around the grid so each wall faces outwards.
    for (let i = 0; i < nu - 1; i++) boundary.push(i, i + 1);
    for (let j = 0; j < rows; j++) boundary.push(j * nu + nu - 1, (j + 1) * nu + nu - 1);
    for (let i = nu - 1; i > 0; i--) boundary.push(rows * nu + i, rows * nu + i - 1);
    for (let j = rows; j > 0; j--) boundary.push(j * nu, (j - 1) * nu);
  }
  const indices = new Uint32Array((cellCount * 4 + boundary.length) * 3);
  let o = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cellsU; i++) {
      const a = j * nu + i;
      const b = j * nu + ((i + 1) % nu);
      const c = (j + 1) * nu + ((i + 1) % nu);
      const d = (j + 1) * nu + i;
      indices.set([a, b, c, a, c, d], o);
      indices.set([a + N, c + N, b + N, a + N, d + N, c + N], o + 6);
      o += 12;
    }
  }
  for (let e = 0; e < boundary.length; e += 2) {
    const P = boundary[e], Q = boundary[e + 1];
    indices.set([P + N, Q + N, Q, P + N, Q, P], o);
    o += 6;
  }

  const mesh: TriMesh = { positions, indices };
  if (signedVolume(mesh) < 0) flipWinding(mesh);
  return mesh;
}
