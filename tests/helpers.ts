// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFile } from 'node:fs/promises';
import type { TriMesh } from '../src/core/mesh';
import { setFontReader } from '../src/core/text';

export function useDiskFonts(): void {
  setFontReader(async (file) => {
    const b = await readFile(new URL(`../public/fonts/${file}`, import.meta.url));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  });
}

/** Every edge of a closed, consistently oriented mesh is used exactly once in each direction. */
export function isWatertight(mesh: TriMesh): boolean {
  const edges = new Map<string, number>();
  const ix = mesh.indices;
  for (let t = 0; t < ix.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const k = `${ix[t + e]}>${ix[t + ((e + 1) % 3)]}`;
      edges.set(k, (edges.get(k) ?? 0) + 1);
    }
  }
  for (const [k, n] of edges) {
    const [a, b] = k.split('>');
    if (n !== 1 || edges.get(`${b}>${a}`) !== 1) return false;
  }
  return true;
}
