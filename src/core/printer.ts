// SPDX-License-Identifier: AGPL-3.0-or-later
// Calibration prints and filament swatches.
import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import type { Font } from 'opentype.js';
import { toTriMesh } from './manifold';
import type { Part } from './mesh';
import { plateShape } from './models';
import { centerShape, textToPolygons } from './text';

function label(m: ManifoldToplevel, font: Font, text: string, height: number, x: number, y: number): CrossSection {
  const shape = centerShape(textToPolygons(font, text, { height, align: 'center' }));
  return m.CrossSection.ofPolygons(shape.polygons, 'NonZero').translate([x, y]);
}

/** Engraves labels 0.6 mm deep into the top of a solid. */
function engrave(m: ManifoldToplevel, solid: Manifold, labels: CrossSection[], top: number): Manifold {
  if (!labels.length) return solid;
  return solid.subtract(m.Manifold.extrude(m.CrossSection.union(labels), 0.61).translate([0, 0, top - 0.6]));
}

const fmtMm = (n: number) => (Math.round(n * 100) / 100).toString();

// ---------------------------------------------------------------- tolerance test

export interface ToleranceParams {
  gaps: string; // comma separated, mm
  pin: number; // pin diameter
  color: string;
}

export const TOLERANCE_DEFAULTS: ToleranceParams = { gaps: '0.1, 0.2, 0.3, 0.4, 0.5, 0.6', pin: 10, color: '#a855f7' };

export function parseList(s: string, min: number, max: number): number[] {
  return s
    .split(/[,;\s]+/)
    .map((v) => Number(v.replace(',', '.')))
    .filter((v) => Number.isFinite(v) && v >= min && v <= max)
    .slice(0, 12);
}

/** Print-in-place pins inside holes: the smallest gap whose pin turns freely is your printer's tolerance. */
export function toleranceParts(m: ManifoldToplevel, font: Font, p: ToleranceParams): Part[] {
  const { Manifold } = m;
  const gaps = parseList(p.gaps, 0.05, 1.5);
  if (!gaps.length) return [];
  const r = p.pin / 2;
  const pitch = p.pin + 2 * Math.max(...gaps) + 6;
  const plateT = 4;
  const w = gaps.length * pitch + 4, d = p.pin + 18;
  let plate = Manifold.extrude(plateShape(m, 'rounded', w, d, 3), plateT);
  const labels: CrossSection[] = [];
  const pins: Manifold[] = [];
  gaps.forEach((g, i) => {
    const x = -w / 2 + 2 + pitch * (i + 0.5);
    plate = plate.subtract(Manifold.cylinder(plateT + 2, r + g, r + g, 64).translate([x, 3, -1]));
    labels.push(label(m, font, fmtMm(g), 3.5, x, -d / 2 + 4));
    // The pin's cap sits one gap above the plate so it is free but cannot fall through.
    const pin = Manifold.cylinder(plateT + g + 0.6, r, r, 64).translate([x, 3, 0]);
    const cap = Manifold.cylinder(1.6, r + g + 1.5, r + g + 1.5, 64).translate([x, 3, plateT + g + 0.4]);
    pins.push(pin.add(cap));
  });
  plate = engrave(m, plate, labels, plateT);
  return [
    { name: 'Plate', color: p.color, mesh: toTriMesh(plate) },
    { name: 'Pins', color: '#f59e0b', mesh: toTriMesh(Manifold.union(pins)) },
  ];
}

// ---------------------------------------------------------------- overhang test

export interface OverhangParams {
  angles: string; // degrees from vertical
  height: number;
  color: string;
}

export const OVERHANG_DEFAULTS: OverhangParams = { angles: '30, 40, 50, 60, 70', height: 12, color: '#f97316' };

export function overhangParts(m: ManifoldToplevel, font: Font, p: OverhangParams): Part[] {
  const { Manifold } = m;
  const angles = parseList(p.angles, 5, 85);
  if (!angles.length) return [];
  const h = p.height, depth = 8;
  const reach = angles.map((a) => h * Math.tan((a * Math.PI) / 180));
  const widths = reach.map((r) => r + 4);
  const total = widths.reduce((s, w) => s + w + 4, 4);
  const baseD = depth + 10;
  let base = Manifold.cube([total, baseD, 2], false).translate([-total / 2, -baseD / 2, 0]);
  const fins: Manifold[] = [];
  const labels: CrossSection[] = [];
  let x = -total / 2 + 4;
  angles.forEach((a, i) => {
    const r = reach[i];
    const y0 = baseD / 2 - depth - 1, y1 = y0 + depth;
    // A post with one face leaning out at the tested angle from vertical.
    fins.push(Manifold.hull([
      [x, y0, 1.9], [x + 4, y0, 1.9], [x, y1, 1.9], [x + 4, y1, 1.9],
      [x, y0, 2 + h], [x + 4 + r, y0, 2 + h], [x, y1, 2 + h], [x + 4 + r, y1, 2 + h],
    ]));
    labels.push(label(m, font, `${a}°`, 3, x + widths[i] / 2, -baseD / 2 + 2.5));
    x += widths[i] + 4;
  });
  base = engrave(m, base, labels, 2);
  return [{ name: 'Overhang test', color: p.color, mesh: toTriMesh(base.add(Manifold.union(fins))) }];
}

// ---------------------------------------------------------------- bridging test

export interface BridgeParams {
  spans: string;
  height: number;
  color: string;
}

export const BRIDGE_DEFAULTS: BridgeParams = { spans: '10, 20, 30, 40, 50', height: 8, color: '#14b8a6' };

export function bridgeParts(m: ManifoldToplevel, font: Font, p: BridgeParams): Part[] {
  const { Manifold } = m;
  const spans = parseList(p.spans, 2, 150);
  if (!spans.length) return [];
  const post = 5, deck = 1, row = 8, gap = 4;
  const maxSpan = Math.max(...spans);
  const w = maxSpan + 2 * post + 16;
  const d = spans.length * (row + gap) + gap;
  let base = Manifold.cube([w, d, 2], false).translate([-w / 2, -d / 2, 0]);
  const parts: Manifold[] = [];
  const labels: CrossSection[] = [];
  spans.forEach((s, i) => {
    const y = -d / 2 + gap + i * (row + gap);
    const x0 = -w / 2 + 14;
    parts.push(Manifold.cube([post, row, p.height], false).translate([x0, y, 2]));
    parts.push(Manifold.cube([post, row, p.height], false).translate([x0 + post + s, y, 2]));
    parts.push(Manifold.cube([s + 2 * post, row, deck], false).translate([x0, y, 2 + p.height]));
    labels.push(label(m, font, fmtMm(s), 3.5, -w / 2 + 7, y + row / 2));
  });
  base = engrave(m, base, labels, 2);
  return [{ name: 'Bridging test', color: p.color, mesh: toTriMesh(base.add(Manifold.union(parts))) }];
}

// ---------------------------------------------------------------- filament swatch

export interface SwatchParams {
  brand: string;
  material: string;
  colorName: string;
  temps: string;
  width: number;
  height: number;
  thickness: number;
  steps: boolean;
  textStyle: 'engraved' | 'raised';
  color: string;
}

export const SWATCH_DEFAULTS: SwatchParams = {
  brand: 'Bambu Lab',
  material: 'PLA Basic',
  colorName: 'Orange',
  temps: '220°C / 60°C',
  width: 75,
  height: 40,
  thickness: 3,
  steps: true,
  textStyle: 'engraved',
  color: '#ff7a1a',
};

/** A sample card: name, material and temperatures on top, a thickness staircase below. */
export function swatchParts(m: ManifoldToplevel, font: Font, p: SwatchParams): Part[] {
  const { Manifold, CrossSection } = m;
  const W = p.width, H = p.height, T = p.thickness;
  const stepH = p.steps ? Math.min(10, H * 0.28) : 0;
  let card = Manifold.extrude(plateShape(m, 'rounded', W, H, 4), T);
  card = card.subtract(Manifold.cylinder(T + 2, 2.5, 2.5, 32).translate([-W / 2 + 6, H / 2 - 6, -1]));
  if (p.steps) {
    const levels = [0.4, 0.8, 1.2, 1.6, 2.0].filter((v) => v < T);
    const sw = (W - 8) / (levels.length + 1);
    levels.forEach((lv, i) => {
      const x = -W / 2 + 4 + i * sw;
      card = card.subtract(Manifold.cube([sw + 0.01, stepH + 4, T], false).translate([x, -H / 2 - 4, lv]));
    });
  }
  const lines = [p.brand, `${p.material} · ${p.colorName}`, p.temps].map((s) => s.trim());
  const sizes = [5, 3.8, 3.2];
  const top = H / 2 - 4;
  const avail = H - stepH - 8;
  const glyphs: CrossSection[] = [];
  let y = top;
  const scale = Math.min(1, avail / (sizes.reduce((a, b) => a + b * 1.55, 0)));
  lines.forEach((text, i) => {
    if (!text) return;
    const hgt = sizes[i] * scale;
    y -= hgt * 1.2;
    const shape = textToPolygons(font, text, { height: hgt, align: 'left' });
    if (!shape.polygons.length) return;
    let cs = CrossSection.ofPolygons(shape.polygons, 'NonZero');
    const b = cs.bounds();
    const maxW = W - (i === 0 ? 20 : 10);
    const k = Math.min(1, maxW / Math.max(1e-6, b.max[0] - b.min[0]));
    cs = cs.translate([-b.min[0], 0]).scale(k).translate([-W / 2 + (i === 0 ? 12 : 5), y]);
    glyphs.push(cs);
    y -= hgt * 0.45;
  });
  if (!glyphs.length) return [{ name: 'Swatch', color: p.color, mesh: toTriMesh(card) }];
  const text2D = CrossSection.union(glyphs);
  if (p.textStyle === 'engraved') {
    card = card.subtract(Manifold.extrude(text2D, 0.61).translate([0, 0, T - 0.6]));
    return [{ name: 'Swatch', color: p.color, mesh: toTriMesh(card) }];
  }
  return [{ name: 'Swatch', color: p.color, mesh: toTriMesh(card.add(Manifold.extrude(text2D, 0.6).translate([0, 0, T]))) }];
}

