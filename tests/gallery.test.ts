// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeAll, describe, expect, it } from 'vitest';
import { build } from '../src/core/manifold';
import { meshStats, mergeMeshes, type Part } from '../src/core/mesh';
import { loadFont } from '../src/core/text';
import { CATEGORIES, GALLERY } from '../src/models';
import { isWatertight, useDiskFonts } from './helpers';

beforeAll(useDiskFonts);

/** Objects exported separately sit side by side on the plate, so their footprints must not touch. */
function expectNoOverlap(parts: Part[]): void {
  const groups = new Map<string, Part[]>();
  for (const p of parts) groups.set(p.group ?? p.name, [...(groups.get(p.group ?? p.name) ?? []), p]);
  const boxes = [...groups.entries()].map(([name, list]) => ({ name, ...meshStats(mergeMeshes(list.map((p) => p.mesh))) }));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const apart =
        a.min[0] + a.size[0] <= b.min[0] || b.min[0] + b.size[0] <= a.min[0] ||
        a.min[1] + a.size[1] <= b.min[1] || b.min[1] + b.size[1] <= a.min[1];
      expect(apart, `${a.name} overlaps ${b.name}`).toBe(true);
    }
  }
}

describe('gallery models', () => {
  it('has unique ids, both languages and a known category', () => {
    expect(new Set(GALLERY.map((m) => m.id)).size).toBe(GALLERY.length);
    for (const model of GALLERY) {
      expect(CATEGORIES).toContain(model.category);
      expect(model.title.every(Boolean) && model.desc.every(Boolean)).toBe(true);
      for (const p of model.params) {
        if ('key' in p) expect(model.defaults, `${model.id}.${p.key}`).toHaveProperty(p.key);
      }
    }
  });

  for (const model of GALLERY) {
    it(`${model.id} builds closed parts resting on the bed`, async () => {
      const font = await loadFont(model.defaults.font);
      const parts = await build((m) => model.build(m, font, { ...model.defaults }));
      expect(parts.length).toBeGreaterThan(0);
      for (const p of parts) {
        expect(p.mesh.indices.length, p.name).toBeGreaterThan(0);
        expect(isWatertight(p.mesh), p.name).toBe(true);
        expect(meshStats(p.mesh).volume, p.name).toBeGreaterThan(1);
      }
      const s = meshStats(mergeMeshes(parts.map((p) => p.mesh)));
      expect(s.min[2]).toBeGreaterThan(-0.01);
      expect(s.min[2]).toBeLessThan(0.01);
      if (model.separate) expectNoOverlap(parts);
    });
  }
});
