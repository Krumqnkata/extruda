// SPDX-License-Identifier: AGPL-3.0-or-later
// A picture made from colour changes: thin light filament over dark lets the dark show through, so one
// relief surface gives many shades. The preview is an estimate; real results depend on the filaments.
import { closedGrid } from './heightfield';
import { sample, type GrayImage } from './lithophane';
import type { TriMesh } from './mesh';

export interface ArtFilament {
  color: string; // #rrggbb
  /** Thickness in mm at which the filament hides about 90% of what is below it. */
  td: number;
  /** Height where this filament starts, mm; 0 means share the height evenly. */
  start: number;
}

export interface ArtParams {
  width: number;
  /** Height of the darkest part of the picture. */
  base: number;
  /** Height of the lightest part. */
  top: number;
  layer: number;
  resolution: number;
  invert: boolean;
  filaments: ArtFilament[];
}

export interface ColorChange {
  /** The filament swap happens once this height is finished. */
  z: number;
  /** Number of layers printed before the swap. */
  layers: number;
  color: string;
}

export const MAX_ART_SAMPLES = 300_000;

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Where each filament after the first begins, on whole layers and always going up. */
export function colorChanges(p: Pick<ArtParams, 'base' | 'top' | 'layer' | 'filaments'>): ColorChange[] {
  const count = p.filaments.length;
  const out: ColorChange[] = [];
  let previous = 0;
  for (let i = 1; i < count; i++) {
    const even = p.base + ((p.top - p.base) * (i - 1)) / (count - 1);
    const wanted = p.filaments[i].start > 0 ? p.filaments[i].start : even;
    let layers = Math.max(1, Math.round(wanted / p.layer));
    if (layers * p.layer <= previous + 1e-6) layers = Math.round(previous / p.layer) + 1;
    const z = layers * p.layer;
    out.push({ z, layers, color: p.filaments[i].color });
    previous = z;
  }
  return out;
}

/** Estimated colour of a surface at height h, seen from above with light from above. */
export function surfaceColor(h: number, filaments: ArtFilament[], changes: ColorChange[]): [number, number, number] {
  let c = rgb(filaments[0].color);
  for (let i = 1; i < filaments.length; i++) {
    const from = changes[i - 1].z;
    if (h <= from) break;
    const to = i < changes.length ? changes[i].z : Infinity;
    const thickness = Math.min(h, to) - from;
    const cover = 1 - Math.pow(10, -thickness / Math.max(0.05, filaments[i].td));
    const f = rgb(filaments[i].color);
    c = [c[0] + (f[0] - c[0]) * cover, c[1] + (f[1] - c[1]) * cover, c[2] + (f[2] - c[2]) * cover];
  }
  return c;
}

/** Screen colour to linear light; without this the preview shows dark filaments far too light. */
export function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export interface ArtResult {
  mesh: TriMesh;
  /** RGB per vertex in linear light, the form the 3D preview expects. */
  colors: Float32Array;
  changes: ColorChange[];
  size: [number, number];
}

export function filamentArt(img: GrayImage, p: ArtParams): ArtResult {
  const W = p.width, H = (W * img.height) / img.width;
  let res = p.resolution;
  if (W * H * res * res > MAX_ART_SAMPLES) res = Math.sqrt(MAX_ART_SAMPLES / (W * H));
  const cols = Math.max(2, Math.round(W * res)), rows = Math.max(2, Math.round(H * res));
  const nu = cols + 1, nv = rows + 1, N = nu * nv;
  const changes = colorChanges(p);

  // Colour depends only on height, so a table keeps this fast on big pictures.
  const steps = 256;
  const table = new Float32Array((steps + 1) * 3);
  for (let i = 0; i <= steps; i++) table.set(surfaceColor(p.base + ((p.top - p.base) * i) / steps, p.filaments, changes).map(toLinear), i * 3);

  const colors = new Float32Array(N * 2 * 3);
  const heights = new Float32Array(N);
  const mesh = closedGrid(nu, nv, false, (i, j, top, out, o) => {
    const k = j * nu + i;
    out[o] = (i / cols - 0.5) * W;
    out[o + 1] = (j / rows - 0.5) * H;
    if (!top) {
      out[o + 2] = 0;
      colors.set(table.subarray(0, 3), (N + k) * 3);
      return;
    }
    let g = sample(img, i / cols, j / rows);
    if (p.invert) g = 1 - g;
    const h = p.base + (p.top - p.base) * g;
    heights[k] = h;
    out[o + 2] = h;
    const row = Math.round(g * steps) * 3;
    colors[k * 3] = table[row];
    colors[k * 3 + 1] = table[row + 1];
    colors[k * 3 + 2] = table[row + 2];
  });
  return { mesh, colors, changes, size: [W, H] };
}
