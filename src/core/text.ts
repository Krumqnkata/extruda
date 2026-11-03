// SPDX-License-Identifier: AGPL-3.0-or-later
// Turns text into flat polygons (millimetres, y up) using bundled TrueType fonts with Cyrillic support.
import { parse, type Font } from 'opentype.js';
import { FONTS } from './fonts';

export type Vec2 = [number, number];
export type Polygon = Vec2[];

let readFont = async (file: string): Promise<ArrayBuffer> => {
  const res = await fetch(`${import.meta.env.BASE_URL}fonts/${file}`);
  if (!res.ok) throw new Error(`Font ${file}: HTTP ${res.status}`);
  return res.arrayBuffer();
};

/** Lets tests read fonts from disk instead of over HTTP. */
export function setFontReader(fn: (file: string) => Promise<ArrayBuffer>): void {
  readFont = fn;
}

const cache = new Map<string, Promise<Font>>();

export function loadFont(id: string): Promise<Font> {
  const info = FONTS.find((f) => f.id === id) ?? FONTS[0];
  let p = cache.get(info.id);
  if (!p) {
    p = readFont(info.file).then((buf) => parse(buf));
    p.catch(() => cache.delete(info.id));
    cache.set(info.id, p);
  }
  return p;
}

function capHeightUnits(font: Font): number {
  const os2 = (font.tables as { os2?: { sCapHeight?: number } }).os2;
  if (os2?.sCapHeight && os2.sCapHeight > 0) return os2.sCapHeight;
  const bb = font.charToGlyph('H').getBoundingBox();
  return bb.y2 > 0 ? bb.y2 : font.unitsPerEm * 0.7;
}

export interface TextOptions {
  /** Height of capital letters in mm. */
  height: number;
  /** Extra space between letters in mm (can be negative). */
  spacing?: number;
  /** Line distance as a multiple of the letter height. */
  lineHeight?: number;
  align?: 'left' | 'center' | 'right';
}

export interface TextShape {
  polygons: Polygon[];
  /** Bounding box of the outlines. */
  min: Vec2;
  max: Vec2;
}

const TOLERANCE = 0.08; // mm, maximum chord error when flattening curves

function flatten(cmds: { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }[]): Polygon[] {
  const out: Polygon[] = [];
  let cur: Polygon = [];
  let px = 0, py = 0;
  const push = (x: number, y: number) => {
    const last = cur[cur.length - 1];
    if (!last || Math.abs(last[0] - x) > 1e-6 || Math.abs(last[1] + y) > 1e-6) cur.push([x, -y]);
    px = x; py = y;
  };
  const steps = (len: number) => Math.max(2, Math.min(24, Math.ceil(Math.sqrt(len / TOLERANCE))));
  const close = () => {
    if (cur.length > 2) {
      const a = cur[0], b = cur[cur.length - 1];
      if (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6) cur.pop();
      if (cur.length > 2) out.push(cur);
    }
    cur = [];
  };
  for (const c of cmds) {
    switch (c.type) {
      case 'M':
        close();
        push(c.x!, c.y!);
        break;
      case 'L':
        push(c.x!, c.y!);
        break;
      case 'Q': {
        const x0 = px, y0 = py;
        const n = steps(Math.hypot(c.x1! - x0, c.y1! - y0) + Math.hypot(c.x! - c.x1!, c.y! - c.y1!));
        for (let i = 1; i <= n; i++) {
          const t = i / n, u = 1 - t;
          push(u * u * x0 + 2 * u * t * c.x1! + t * t * c.x!, u * u * y0 + 2 * u * t * c.y1! + t * t * c.y!);
        }
        break;
      }
      case 'C': {
        const x0 = px, y0 = py;
        const n = steps(
          Math.hypot(c.x1! - x0, c.y1! - y0) + Math.hypot(c.x2! - c.x1!, c.y2! - c.y1!) + Math.hypot(c.x! - c.x2!, c.y! - c.y2!),
        );
        for (let i = 1; i <= n; i++) {
          const t = i / n, u = 1 - t;
          push(
            u * u * u * x0 + 3 * u * u * t * c.x1! + 3 * u * t * t * c.x2! + t * t * t * c.x!,
            u * u * u * y0 + 3 * u * u * t * c.y1! + 3 * u * t * t * c.y2! + t * t * t * c.y!,
          );
        }
        break;
      }
      case 'Z':
        close();
        break;
    }
  }
  close();
  return out;
}

/** Lays out one or more lines of text. The first line's baseline sits at y = 0. */
export function textToPolygons(font: Font, text: string, opts: TextOptions): TextShape {
  const fontSize = (opts.height * font.unitsPerEm) / capHeightUnits(font);
  const scale = fontSize / font.unitsPerEm;
  const spacing = opts.spacing ?? 0;
  const lineStep = opts.height * (opts.lineHeight ?? 1.6);
  const lines = text.split(/\r?\n/);

  type Placed = { glyphs: { glyph: ReturnType<Font['charToGlyph']>; x: number }[]; width: number };
  const placed: Placed[] = lines.map((line) => {
    let glyphs: ReturnType<Font['stringToGlyphs']>;
    try {
      glyphs = font.stringToGlyphs(line); // applies ligatures and contextual forms
    } catch {
      // opentype.js does not support every substitution format; plain glyphs still look right.
      glyphs = [...line].map((ch) => font.charToGlyph(ch));
    }
    const out: Placed['glyphs'] = [];
    let x = 0;
    glyphs.forEach((g, i) => {
      out.push({ glyph: g, x });
      x += (g.advanceWidth ?? 0) * scale + spacing;
      const next = glyphs[i + 1];
      if (next) x += font.getKerningValue(g, next) * scale;
    });
    return { glyphs: out, width: Math.max(0, x - spacing) };
  });
  const maxWidth = Math.max(0, ...placed.map((p) => p.width));

  const polygons: Polygon[] = [];
  placed.forEach((line, li) => {
    const shift = opts.align === 'right' ? maxWidth - line.width : opts.align === 'left' ? 0 : (maxWidth - line.width) / 2;
    const baseline = li * lineStep; // opentype paths are y-down, flatten() flips them
    for (const { glyph, x } of line.glyphs) {
      const path = glyph.getPath(x + shift, baseline, fontSize);
      polygons.push(...flatten(path.commands as Parameters<typeof flatten>[0]));
    }
  });

  const min: Vec2 = [Infinity, Infinity];
  const max: Vec2 = [-Infinity, -Infinity];
  for (const poly of polygons) {
    for (const [x, y] of poly) {
      if (x < min[0]) min[0] = x;
      if (y < min[1]) min[1] = y;
      if (x > max[0]) max[0] = x;
      if (y > max[1]) max[1] = y;
    }
  }
  if (!polygons.length) return { polygons, min: [0, 0], max: [0, 0] };
  return { polygons, min, max };
}

/** Moves polygons so their bounding box is centred on the origin. */
export function centerShape(shape: TextShape): TextShape {
  const cx = (shape.min[0] + shape.max[0]) / 2;
  const cy = (shape.min[1] + shape.max[1]) / 2;
  return {
    polygons: shape.polygons.map((poly) => poly.map(([x, y]) => [x - cx, y - cy] as Vec2)),
    min: [shape.min[0] - cx, shape.min[1] - cy],
    max: [shape.max[0] - cx, shape.max[1] - cy],
  };
}
