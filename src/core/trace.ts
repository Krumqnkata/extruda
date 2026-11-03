// SPDX-License-Identifier: AGPL-3.0-or-later
// Raster silhouette → polygons with marching squares, then Ramer–Douglas–Peucker simplification.
import type { GrayImage } from './lithophane';
import type { Polygon, Vec2 } from './text';

/**
 * Traces the dark areas of an image (or the light ones when `invert`). Returns contours in pixel
 * units, y up. Use the EvenOdd fill rule: holes come out as separate loops.
 */
export function traceImage(img: GrayImage, threshold = 0.5, invert = false, epsilon = 0.6): Polygon[] {
  const W = img.width + 2, H = img.height + 2;
  // Padded "inkiness" field: 1 = fully inside the shape. The border is always outside.
  const v = new Float32Array(W * H);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const g = img.data[y * img.width + x];
      v[(y + 1) * W + x + 1] = invert ? g : 1 - g;
    }
  }
  const iso = 1 - threshold;
  const inside = (x: number, y: number) => v[y * W + x] > iso;
  const cross = (a: number, b: number) => {
    const d = b - a;
    return d === 0 ? 0.5 : Math.min(1, Math.max(0, (iso - a) / d));
  };

  // Edge points are keyed by edge id: horizontal edge (x,y)-(x+1,y) or vertical (x,y)-(x,y+1).
  const points = new Map<string, Vec2>();
  const links = new Map<string, string[]>();
  const point = (kind: 'h' | 'v', x: number, y: number): string => {
    const key = `${kind}${x},${y}`;
    if (!points.has(key)) {
      if (kind === 'h') points.set(key, [x + cross(v[y * W + x], v[y * W + x + 1]), y]);
      else points.set(key, [x, y + cross(v[y * W + x], v[(y + 1) * W + x])]);
    }
    return key;
  };
  const link = (a: string, b: string) => {
    (links.get(a) ?? links.set(a, []).get(a)!).push(b);
    (links.get(b) ?? links.set(b, []).get(b)!).push(a);
  };

  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const tl = inside(x, y), tr = inside(x + 1, y), br = inside(x + 1, y + 1), bl = inside(x, y + 1);
      const top = tl !== tr ? point('h', x, y) : null;
      const bottom = bl !== br ? point('h', x, y + 1) : null;
      const left = tl !== bl ? point('v', x, y) : null;
      const right = tr !== br ? point('v', x + 1, y) : null;
      const edges = [top, right, bottom, left].filter((e): e is string => e !== null);
      if (edges.length === 2) link(edges[0], edges[1]);
      else if (edges.length === 4) {
        // Saddle: keep the two inside corners apart by cutting each one off.
        if (tl) { link(top!, left!); link(bottom!, right!); }
        else { link(top!, right!); link(bottom!, left!); }
      }
    }
  }

  const loops: Polygon[] = [];
  const seen = new Set<string>();
  for (const start of links.keys()) {
    if (seen.has(start)) continue;
    const loop: Vec2[] = [];
    let prev = '';
    let cur = start;
    while (!seen.has(cur)) {
      seen.add(cur);
      const [px, py] = points.get(cur)!;
      loop.push([px - 1, img.height - (py - 1)]);
      const next = links.get(cur)!.find((n) => n !== prev && !seen.has(n)) ?? '';
      prev = cur;
      if (!next) break;
      cur = next;
    }
    if (loop.length > 2) {
      const simple = simplify(loop, epsilon);
      if (simple.length > 2 && Math.abs(signedArea(simple)) > 2) loops.push(simple);
    }
  }
  return loops;
}

function signedArea(p: Vec2[]): number {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1];
  return a / 2;
}

function perpDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len;
}

function rdp(points: Vec2[], eps: number): Vec2[] {
  if (points.length < 3) return points;
  let max = 0, index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpDistance(points[i], points[0], points[end]);
    if (d > max) { max = d; index = i; }
  }
  if (max <= eps) return [points[0], points[end]];
  return [...rdp(points.slice(0, index + 1), eps).slice(0, -1), ...rdp(points.slice(index), eps)];
}

/** Simplifies a closed loop by splitting it at its two most distant points. */
export function simplify(loop: Vec2[], eps: number): Vec2[] {
  let far = 0, best = 0;
  for (let i = 1; i < loop.length; i++) {
    const d = Math.hypot(loop[i][0] - loop[0][0], loop[i][1] - loop[0][1]);
    if (d > best) { best = d; far = i; }
  }
  const a = rdp(loop.slice(0, far + 1), eps);
  const b = rdp([...loop.slice(far), loop[0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}
