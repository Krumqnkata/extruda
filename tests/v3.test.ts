// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ManifoldToplevel } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { build } from '../src/core/manifold';
import { meshStats, type TriMesh } from '../src/core/mesh';
import { loadFont } from '../src/core/text';
import { findModel } from '../src/models';
import { coversAllDates, CUBE_A, CUBE_B } from '../src/models/personal';
import { useDiskFonts } from './helpers';

beforeAll(useDiskFonts);

const toSolid = (m: ManifoldToplevel, mesh: TriMesh) =>
  m.Manifold.ofMesh(new m.Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices }));


/** Rasterises a mesh's shadow onto a plane, keeping axes `a` and `b` (0 = x, 1 = y, 2 = z). */
function silhouette(mesh: TriMesh, a: number, b: number, cell = 0.5): Set<string> {
  const on = new Set<string>();
  const p = mesh.positions, ix = mesh.indices;
  for (let t = 0; t < ix.length; t += 3) {
    const [v0, v1, v2] = [ix[t] * 3, ix[t + 1] * 3, ix[t + 2] * 3];
    const ax = p[v0 + a], ay = p[v0 + b], bx = p[v1 + a], by = p[v1 + b], cx = p[v2 + a], cy = p[v2 + b];
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(d) < 1e-9) continue; // edge-on triangle: no area in this view
    const x0 = Math.floor(Math.min(ax, bx, cx) / cell), x1 = Math.ceil(Math.max(ax, bx, cx) / cell);
    const y0 = Math.floor(Math.min(ay, by, cy) / cell), y1 = Math.ceil(Math.max(ay, by, cy) / cell);
    for (let i = x0; i <= x1; i++) {
      for (let j = y0; j <= y1; j++) {
        const px = (i + 0.5) * cell, py = (j + 0.5) * cell;
        const l0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d;
        const l1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d;
        if (l0 >= 0 && l1 >= 0 && l0 + l1 <= 1) on.add(`${i},${j}`);
      }
    }
  }
  return on;
}

/** Intersection over union of two rasterised shapes: 1 means identical. */
function similarity(a: Set<string>, b: Set<string>): number {
  let both = 0;
  for (const k of a) if (b.has(k)) both++;
  return both / (a.size + b.size - both);
}

async function buildModel(id: string, overrides: Record<string, number | string | boolean> = {}) {
  const model = findModel(id)!;
  const font = await loadFont(String(overrides.font ?? model.defaults.font));
  return build((m) => model.build(m, font, { ...model.defaults, ...overrides }));
}

describe('dual-name illusion', () => {
  it('shows each name along its own axis', async () => {
    const parts = await buildModel('dual-illusion', { text: 'ИВАН', text2: 'ТОНИ' });
    const letters = meshStats(parts[1].mesh);
    // Letters run along the diagonal, so width and depth match, and height is the letter height.
    expect(letters.size[0]).toBeCloseTo(letters.size[1], 0);
    expect(letters.size[2]).toBeGreaterThan(25);
    expect(letters.min[2]).toBeCloseTo(3, 3);
  });

  it('reads one letter from the front and the other from the side', async () => {
    const both = (await buildModel('dual-illusion', { text: 'М', text2: 'Т' }))[1].mesh;
    const frontOnly = (await buildModel('dual-illusion', { text: 'М', text2: '' }))[1].mesh;
    const sideOnly = (await buildModel('dual-illusion', { text: '', text2: 'Т' }))[1].mesh;
    // Front view: x across, z up. Side view: y across, z up.
    expect(similarity(silhouette(both, 0, 2), silhouette(frontOnly, 0, 2))).toBeGreaterThan(0.9);
    expect(similarity(silhouette(both, 1, 2), silhouette(sideOnly, 1, 2))).toBeGreaterThan(0.9);
  });

  it('copes with names of different length and with blanks', async () => {
    expect((await buildModel('dual-illusion', { text: 'АНА', text2: 'МАРИЯ' })).length).toBe(2);
    expect(await buildModel('dual-illusion', { text: ' ', text2: '' })).toEqual([]);
  });
});

describe('rings and bracelets', () => {
  it('sizes a ring from its EU number', async () => {
    const parts = await buildModel('name-ring', { size: 60, text: '', thickness: 2 });
    const s = meshStats(parts[0].mesh);
    expect(s.size[0]).toBeCloseTo(60 / Math.PI + 4, 1);
    expect(parts).toHaveLength(1);
  });

  it('engraves into the band instead of adding a text part', async () => {
    const plain = await buildModel('name-ring', { text: '' });
    const cut = await buildModel('name-ring', { text: 'Ана', style: 'engraved' });
    expect(cut).toHaveLength(1);
    expect(meshStats(cut[0].mesh).volume).toBeLessThan(meshStats(plain[0].mesh).volume);
  });

  it('leaves an opening in a bracelet', async () => {
    const closed = await buildModel('name-bracelet', { text: '', opening: 30 });
    const open = await buildModel('name-bracelet', { text: '', opening: 120 });
    expect(meshStats(open[0].mesh).volume).toBeLessThan(meshStats(closed[0].mesh).volume);
  });
});

describe('perpetual calendar', () => {
  it('two cubes show every date, using the 6 as a 9', () => {
    expect(coversAllDates(CUBE_A, CUBE_B)).toBe(true);
    expect(coversAllDates(['0', '1', '2', '3', '4', '5'], ['0', '1', '3', '6', '7', '8'])).toBe(false);
  });

  it('has month names in both languages on three bars', async () => {
    for (const lang of ['bg', 'en']) {
      const parts = await buildModel('perpetual-calendar', { lang });
      expect(parts.map((p) => p.name)).toEqual(['Cube 1', 'Cube 2', 'Months 1', 'Months 2', 'Months 3', 'Stand']);
      expect(meshStats(parts[0].mesh).size).toEqual([30, 30, 30]);
    }
  });
});

describe('moving parts', () => {
  it('keeps the hinge leaves separate so it moves right off the bed', async () => {
    const parts = await buildModel('hinge');
    const overlap = await build((m) => toSolid(m, parts[0].mesh).intersect(toSolid(m, parts[1].mesh)).volume());
    expect(overlap).toBeCloseTo(0, 6);
    const pieces = await build((m) => parts.map((p) => toSolid(m, p.mesh).decompose().length));
    expect(pieces).toEqual([1, 1]);
  });

  it('fits the snap clip through its plate with the barbs past the back', async () => {
    const parts = await buildModel('snap-fit', { width: 12, length: 10, gap: 6, arm: 1.6, barb: 1.2, clearance: 0.2 });
    const plate = meshStats(parts[1].mesh);
    const clip = meshStats(parts[0].mesh);
    expect(clip.size[2]).toBeCloseTo(12, 3);
    // Arm length minus the 2.4 mm barb lead-in and the clearance.
    expect(plate.size[2]).toBeCloseTo(10 - 2.4 - 0.2, 3);
  });
});
