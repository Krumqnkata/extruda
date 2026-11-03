// SPDX-License-Identifier: AGPL-3.0-or-later
// Parametric model builders. Each returns printable parts (one per colour), all sitting on z = 0.
import type { CrossSection, ManifoldToplevel } from 'manifold-3d';
import type { Font } from 'opentype.js';
import qrcode from 'qrcode-generator';
import { toTriMesh } from './manifold';
import type { Part } from './mesh';
import { iconPolygons } from './shapes';
import { centerShape, textToPolygons, type Polygon, type Vec2 } from './text';

export type TextStyle = 'raised' | 'engraved' | 'inlay';

export const SEGMENTS = 48;

export function signedArea(poly: Vec2[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  return a / 2;
}

/** Drops the holes of a cross-section (e.g. the inside of an "O" in a keychain outline). */
export function fillHoles(m: ManifoldToplevel, cs: CrossSection): CrossSection {
  const outer = cs.toPolygons().filter((p) => signedArea(p) > 0);
  return m.CrossSection.ofPolygons(outer, 'Positive');
}

/** An empty cross-section (Manifold rejects an empty polygon list). */
export function emptyCS(m: ManifoldToplevel): CrossSection {
  return m.CrossSection.square(1).intersect(m.CrossSection.square(1).translate([5, 0]));
}

export function circle(m: ManifoldToplevel, r: number, x: number, y: number): CrossSection {
  return m.CrossSection.circle(r, SEGMENTS).translate([x, y]);
}

/** Puts text on a base according to the chosen style and returns base + text parts. */
export function styledParts(
  m: ManifoldToplevel,
  base2D: CrossSection,
  text2D: CrossSection,
  o: {
    style: TextStyle;
    baseThickness: number;
    textThickness: number;
    baseColor: string;
    textColor: string;
    extra2D?: CrossSection;
    /** Engraved 0.6 mm into the underside, already mirrored by the caller (e.g. a phone number on a tag's back). */
    back2D?: CrossSection;
  },
): Part[] {
  const { Manifold } = m;
  let base = Manifold.extrude(base2D, o.baseThickness);
  if (o.back2D && !o.back2D.isEmpty()) base = base.subtract(Manifold.extrude(o.back2D, 0.61).translate([0, 0, -0.01]));
  const extra = o.extra2D ? Manifold.extrude(o.extra2D, o.textThickness).translate([0, 0, o.baseThickness]) : undefined;
  if (o.style === 'raised') {
    let text = Manifold.extrude(text2D, o.textThickness).translate([0, 0, o.baseThickness]);
    if (extra) text = text.add(extra);
    return [
      { name: 'Base', color: o.baseColor, mesh: toTriMesh(base) },
      { name: 'Text', color: o.textColor, mesh: toTriMesh(text) },
    ];
  }
  const depth = Math.max(0.2, Math.min(o.textThickness, o.baseThickness - 0.4));
  const z = o.baseThickness - depth;
  const pocket = Manifold.extrude(text2D, depth + 0.01).translate([0, 0, z]);
  base = base.subtract(pocket);
  if (o.style === 'engraved') {
    const parts: Part[] = [{ name: 'Base', color: o.baseColor, mesh: toTriMesh(base) }];
    if (extra) parts.push({ name: 'Frame', color: o.textColor, mesh: toTriMesh(extra) });
    return parts;
  }
  let inlay = Manifold.extrude(text2D, depth).translate([0, 0, z]);
  if (extra) {
    // A raised frame would stick out of a flush inlay, so it is sunk into the plate as well.
    base = base.subtract(Manifold.extrude(o.extra2D!, depth + 0.01).translate([0, 0, z]));
    inlay = inlay.add(Manifold.extrude(o.extra2D!, depth).translate([0, 0, z]));
  }
  return [
    { name: 'Base', color: o.baseColor, mesh: toTriMesh(base) },
    { name: 'Text', color: o.textColor, mesh: toTriMesh(inlay) },
  ];
}

// ---------------------------------------------------------------- keychain

export interface KeychainParams {
  text: string;
  height: number; // cap height, mm
  spacing: number;
  border: number;
  smooth: number; // closes gaps between letters
  baseThickness: number;
  textThickness: number;
  style: TextStyle;
  ring: 'left' | 'top' | 'right' | 'none';
  ringDiameter: number;
  holeDiameter: number;
  baseColor: string;
  textColor: string;
  /** Built-in icon id, 'custom' for user artwork, or '' for none. */
  icon: string;
  iconSize: number; // mm tall; 0 = automatic
  iconPosition: 'before' | 'after';
}

export const KEYCHAIN_DEFAULTS: KeychainParams = {
  text: 'Иван',
  height: 12,
  spacing: 0,
  border: 3,
  smooth: 2,
  baseThickness: 3,
  textThickness: 2,
  style: 'raised',
  ring: 'left',
  ringDiameter: 10,
  holeDiameter: 5,
  baseColor: '#1f2937',
  textColor: '#ff7a1a',
  icon: '',
  iconSize: 0,
  iconPosition: 'before',
};

/** Artwork supplied by the caller, e.g. a parsed SVG: polygons with their fill rule. */
export type Shape2D = { polygons: Polygon[]; fillRule: 'NonZero' | 'EvenOdd' | 'Positive' }[];

export function shapeToCS(m: ManifoldToplevel, shape: Shape2D): CrossSection {
  return m.CrossSection.union(shape.map((s) => m.CrossSection.ofPolygons(s.polygons, s.fillRule)));
}

/** Adds a key ring tab on one side of an outline and cuts its hole. */
export function addRing(m: ManifoldToplevel, outline: CrossSection, ring: 'left' | 'top' | 'right' | 'none', ringDiameter: number, holeDiameter: number): CrossSection {
  if (ring === 'none' || outline.isEmpty()) return outline;
  const R = Math.max(ringDiameter / 2, holeDiameter / 2 + 1);
  const r = Math.min(holeDiameter / 2, R - 0.8);
  const b = outline.bounds();
  let tab: CrossSection, anchor: CrossSection, hole: CrossSection;
  if (ring === 'top') {
    const cx = (b.min[0] + b.max[0]) / 2;
    const cy = b.max[1] + R * 0.35;
    tab = circle(m, R, cx, cy);
    anchor = circle(m, R * 0.8, cx, b.max[1] - R);
    hole = circle(m, r, cx, cy);
  } else {
    const side = ring === 'left' ? -1 : 1;
    const edge = side < 0 ? b.min[0] : b.max[0];
    const cy = (b.min[1] + b.max[1]) / 2;
    const cx = edge - side * R * 0.35;
    tab = circle(m, R, cx, cy);
    anchor = circle(m, R * 0.8, edge + side * R, cy);
    hole = circle(m, r, cx, cy);
  }
  return m.CrossSection.union(outline, m.CrossSection.hull([tab, anchor])).subtract(hole);
}

export function keychainParts(m: ManifoldToplevel, font: Font, p: KeychainParams, customIcon?: Shape2D): Part[] {
  const lines = p.text.trim();
  const { CrossSection } = m;
  let text2D = emptyCS(m);
  if (lines) {
    const shape = centerShape(textToPolygons(font, lines, { height: p.height, spacing: p.spacing, align: 'center', lineHeight: 1.3 }));
    if (shape.polygons.length) text2D = CrossSection.ofPolygons(shape.polygons, 'NonZero');
  }
  if (p.icon) {
    const size = p.iconSize > 0 ? p.iconSize : p.height * 1.4;
    let icon = customIcon?.length
      ? shapeToCS(m, customIcon)
      : CrossSection.ofPolygons(iconPolygons(p.icon === 'custom' ? 'heart' : p.icon, size), 'NonZero');
    if (!icon.isEmpty()) {
      const ib = icon.bounds();
      const k = size / Math.max(1e-6, ib.max[1] - ib.min[1]);
      icon = icon.translate([-(ib.min[0] + ib.max[0]) / 2, -(ib.min[1] + ib.max[1]) / 2]).scale(k);
      const iw = (ib.max[0] - ib.min[0]) * k;
      const gap = Math.max(1.5, p.height * 0.25);
      if (text2D.isEmpty()) text2D = icon;
      else {
        const tb = text2D.bounds();
        const x = p.iconPosition === 'after' ? tb.max[0] + gap + iw / 2 : tb.min[0] - gap - iw / 2;
        text2D = CrossSection.union(text2D, icon.translate([x, (tb.min[1] + tb.max[1]) / 2]));
      }
    }
  }
  if (text2D.isEmpty()) return [];
  const closing = Math.max(0, p.smooth);
  let outline = text2D.offset(p.border + closing, 'Round', 2, SEGMENTS);
  if (closing > 0) outline = outline.offset(-closing, 'Round', 2, SEGMENTS);
  outline = fillHoles(m, outline);

  outline = addRing(m, outline, p.ring, p.ringDiameter, p.holeDiameter);

  return styledParts(m, outline, text2D, p);
}

// ---------------------------------------------------------------- sign / 3D text

export interface SignParams {
  text: string;
  height: number;
  spacing: number;
  lineHeight: number;
  align: 'left' | 'center' | 'right';
  shape: 'rounded' | 'rect' | 'pill' | 'contour' | 'none';
  autoSize: boolean;
  width: number;
  plateHeight: number;
  padding: number;
  corner: number;
  frame: number;
  holes: 'none' | 'sides' | 'top';
  holeDiameter: number;
  baseThickness: number;
  textThickness: number;
  style: TextStyle;
  baseColor: string;
  textColor: string;
}

export const SIGN_DEFAULTS: SignParams = {
  text: 'Стая 12\nКабинет',
  height: 10,
  spacing: 0,
  lineHeight: 1.6,
  align: 'center',
  shape: 'rounded',
  autoSize: true,
  width: 140,
  plateHeight: 60,
  padding: 8,
  corner: 6,
  frame: 2,
  holes: 'sides',
  holeDiameter: 4,
  baseThickness: 3,
  textThickness: 1.6,
  style: 'raised',
  baseColor: '#f8fafc',
  textColor: '#0f172a',
};

export function plateShape(m: ManifoldToplevel, shape: SignParams['shape'], w: number, h: number, corner: number): CrossSection {
  const { CrossSection } = m;
  if (shape === 'rect' || corner <= 0) return CrossSection.square([w, h], true);
  const r = shape === 'pill' ? Math.min(w, h) / 2 - 0.01 : Math.min(corner, Math.min(w, h) / 2 - 0.01);
  return CrossSection.square([w - 2 * r, h - 2 * r], true).offset(r, 'Round', 2, SEGMENTS * 2);
}

export function signParts(m: ManifoldToplevel, font: Font, p: SignParams): Part[] {
  const { CrossSection, Manifold } = m;
  const shape = centerShape(textToPolygons(font, p.text, { height: p.height, spacing: p.spacing, lineHeight: p.lineHeight, align: p.align }));
  const text2D = shape.polygons.length ? CrossSection.ofPolygons(shape.polygons, 'NonZero') : emptyCS(m);

  if (p.shape === 'none') {
    if (text2D.isEmpty()) return [];
    return [{ name: 'Text', color: p.textColor, mesh: toTriMesh(Manifold.extrude(text2D, p.textThickness + p.baseThickness)) }];
  }

  let plate: CrossSection;
  let frame2D: CrossSection | undefined;
  const holeR = p.holeDiameter / 2;
  const holeRoom = p.holes === 'none' ? 0 : p.holeDiameter * 2.2;
  if (p.shape === 'contour') {
    if (text2D.isEmpty()) return [];
    plate = fillHoles(m, text2D.offset(p.padding + 2, 'Round', 2, SEGMENTS).offset(-2, 'Round', 2, SEGMENTS));
  } else {
    const tw = shape.max[0] - shape.min[0];
    const th = shape.max[1] - shape.min[1];
    const w = p.autoSize ? tw + 2 * p.padding + 2 * p.frame + (p.holes === 'sides' ? 2 * holeRoom : 0) : p.width;
    const h = p.autoSize ? th + 2 * p.padding + 2 * p.frame + (p.holes === 'top' ? holeRoom : 0) : p.plateHeight;
    plate = plateShape(m, p.shape, w, h, p.corner);
    if (p.holes === 'top' && p.autoSize) plate = plate.translate([0, holeRoom / 2]);
    if (p.frame > 0) {
      const inner = plate.offset(-p.frame, 'Round', 2, SEGMENTS);
      frame2D = plate.subtract(inner);
    }
  }

  if (p.holes !== 'none') {
    const b = plate.bounds();
    const inset = p.frame + holeR + Math.max(1.5, p.holeDiameter * 0.35);
    const holes =
      p.holes === 'sides'
        ? [circle(m, holeR, b.min[0] + inset, 0), circle(m, holeR, b.max[0] - inset, 0)]
        : [circle(m, holeR, 0, b.max[1] - inset)];
    plate = plate.subtract(CrossSection.union(holes));
  }

  return styledParts(m, plate, text2D, { ...p, extra2D: frame2D });
}

// ---------------------------------------------------------------- QR code

export interface QRParams {
  content: string;
  ecc: 'L' | 'M' | 'Q' | 'H';
  module: number; // mm per module
  quiet: number; // modules of margin
  corner: number;
  label: string;
  labelHeight: number;
  hole: boolean;
  baseThickness: number;
  textThickness: number;
  style: TextStyle;
  baseColor: string;
  textColor: string;
}

export const QR_DEFAULTS: QRParams = {
  content: 'https://krumqnkata.github.io/extruda/',
  ecc: 'M',
  module: 2,
  quiet: 2,
  corner: 4,
  label: '',
  labelHeight: 6,
  hole: false,
  baseThickness: 2,
  textThickness: 1,
  style: 'raised',
  baseColor: '#f8fafc',
  textColor: '#111827',
};

/** Encodes text as UTF-8 so Cyrillic and emoji survive (the library otherwise uses Latin-1). */
export function qrMatrix(content: string, ecc: QRParams['ecc']): boolean[][] {
  const bytes = new TextEncoder().encode(content);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const qr = qrcode(0, ecc);
  qr.addData(binary, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

export function qrParts(m: ManifoldToplevel, font: Font, p: QRParams): Part[] {
  const { CrossSection } = m;
  if (!p.content) return [];
  const grid = qrMatrix(p.content, p.ecc);
  const n = grid.length;
  const s = p.module;
  const half = (n * s) / 2;
  const rects: Polygon[] = [];
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!grid[r][c]) { c++; continue; }
      const start = c;
      while (c < n && grid[r][c]) c++;
      const x0 = start * s - half, x1 = c * s - half;
      const y1 = half - r * s, y0 = y1 - s;
      rects.push([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
    }
  }
  const code2D = CrossSection.ofPolygons(rects, 'Positive');

  const side = (n + 2 * p.quiet) * s;
  let top = side / 2;
  let bottom = -side / 2;
  let label2D: CrossSection | undefined;
  if (p.label.trim()) {
    const shape = centerShape(textToPolygons(font, p.label, { height: p.labelHeight, align: 'center', lineHeight: 1.4 }));
    const lh = shape.max[1] - shape.min[1];
    const lw = shape.max[0] - shape.min[0];
    const scale = lw > side - 2 * s ? (side - 2 * s) / lw : 1;
    const y = bottom - (lh * scale) / 2 - s * 0.5;
    label2D = CrossSection.ofPolygons(shape.polygons, 'NonZero').scale(scale).translate([0, y]);
    bottom = y - (lh * scale) / 2 - p.quiet * s * 0.75;
  }
  const holeR = Math.max(2, s * 1.4);
  if (p.hole) top += holeR * 2 + s;
  const h = top - bottom;
  let plate = plateShape(m, p.corner > 0 ? 'rounded' : 'rect', side, h, p.corner).translate([0, (top + bottom) / 2]);
  if (p.hole) plate = plate.subtract(circle(m, holeR, 0, top - holeR - s));

  const marks = label2D ? CrossSection.union(code2D, label2D) : code2D;
  return styledParts(m, plate, marks, p);
}
