// SPDX-License-Identifier: AGPL-3.0-or-later
// Arranges many models on printer build plates.
import { meshStats, mergeMeshes, type Part } from './mesh';

export interface Bed {
  id: string;
  name: string;
  w: number;
  h: number;
}

export const BEDS: Bed[] = [
  { id: 'a1mini', name: 'Bambu Lab A1 mini · 180×180', w: 180, h: 180 },
  { id: 'bambu', name: 'Bambu Lab A1 / P1 / X1 · 256×256', w: 256, h: 256 },
  { id: 'mk4', name: 'Prusa MK4 / Core One · 250×210', w: 250, h: 210 },
  { id: 'mini', name: 'Prusa MINI · 180×180', w: 180, h: 180 },
  { id: 'ender3', name: 'Ender-3 · 220×220', w: 220, h: 220 },
  { id: 'k1', name: 'Creality K1 / Neptune 4 · 220×220', w: 220, h: 220 },
];

export interface Placement {
  plate: number;
  /** Lower-left corner of the item's footprint on its plate. */
  x: number;
  y: number;
}

/**
 * Shelf packing: items go left to right in rows, tallest first; a new plate starts when a row
 * no longer fits. Items larger than the plate get a plate of their own.
 */
export function packPlates(items: { w: number; h: number }[], bedW: number, bedH: number, gap: number, margin = 5): Placement[] {
  const order = items.map((_, i) => i).sort((a, b) => items[b].h - items[a].h);
  const out: Placement[] = new Array(items.length);
  let plate = 0;
  let x = margin, y = margin, rowH = 0;
  let used = false;
  for (const i of order) {
    const { w, h } = items[i];
    if (used && x + w > bedW - margin) {
      x = margin;
      y += rowH + gap;
      rowH = 0;
    }
    if (used && y + h > bedH - margin) {
      plate++;
      x = margin;
      y = margin;
      rowH = 0;
    }
    out[i] = { plate, x, y };
    used = true;
    x += w + gap;
    rowH = Math.max(rowH, h);
  }
  return out;
}

export function translateParts(parts: Part[], dx: number, dy: number): Part[] {
  return parts.map((p) => {
    const positions = p.mesh.positions.slice();
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] += dx;
      positions[i + 1] += dy;
    }
    return { ...p, mesh: { positions, indices: p.mesh.indices } };
  });
}

export interface PlateModel {
  name: string;
  parts: Part[];
}

/** Places each model on a plate; returns one list of (moved) models per plate. */
export function arrangeOnPlates(models: PlateModel[], bedW: number, bedH: number, gap: number): PlateModel[][] {
  const boxes = models.map((m) => meshStats(mergeMeshes(m.parts.map((p) => p.mesh))));
  const places = packPlates(boxes.map((b) => ({ w: b.size[0], h: b.size[1] })), bedW, bedH, gap);
  const plates: PlateModel[][] = [];
  models.forEach((m, i) => {
    const { plate, x, y } = places[i];
    (plates[plate] ??= []).push({ name: m.name, parts: translateParts(m.parts, x - boxes[i].min[0], y - boxes[i].min[1]) });
  });
  return plates;
}
