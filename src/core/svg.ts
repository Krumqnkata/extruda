// SPDX-License-Identifier: AGPL-3.0-or-later
// SVG artwork → flat polygons grouped by fill colour (y up, millimetres after fitting).
import { Color } from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import type { Polygon, Vec2 } from './text';

export interface ArtLayer {
  color: string; // #rrggbb
  polygons: Polygon[];
  fillRule: 'NonZero' | 'EvenOdd';
}

export interface Art {
  layers: ArtLayer[];
  min: Vec2;
  max: Vec2;
}

/** Parses filled shapes; strokes are ignored. Layers keep the SVG paint order (later on top). */
export function parseSvg(text: string): Art {
  const data = new SVGLoader().parse(text);
  const layers: ArtLayer[] = [];
  for (const path of data.paths) {
    const style = (path.userData?.style ?? {}) as { fill?: string; fillOpacity?: number; fillRule?: string };
    if (style.fill === 'none' || style.fill === 'transparent' || style.fillOpacity === 0) continue;
    const polygons: Polygon[] = [];
    for (const sub of path.subPaths) {
      const pts = sub.getPoints(24);
      const poly: Polygon = [];
      for (const p of pts) {
        const last = poly[poly.length - 1];
        if (!last || Math.abs(last[0] - p.x) > 1e-6 || Math.abs(last[1] + p.y) > 1e-6) poly.push([p.x, -p.y]);
      }
      if (poly.length > 2) {
        const a = poly[0], b = poly[poly.length - 1];
        if (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6) poly.pop();
      }
      if (poly.length > 2) polygons.push(poly);
    }
    if (!polygons.length) continue;
    const color = `#${(path.color instanceof Color ? path.color : new Color(0x000000)).getHexString()}`;
    const fillRule = style.fillRule === 'evenodd' ? 'EvenOdd' : 'NonZero';
    const prev = layers[layers.length - 1];
    // Consecutive paths of the same colour and rule become one layer.
    if (prev && prev.color === color && prev.fillRule === fillRule) prev.polygons.push(...polygons);
    else layers.push({ color, polygons, fillRule });
  }
  return withBounds(layers);
}

function withBounds(layers: ArtLayer[]): Art {
  const min: Vec2 = [Infinity, Infinity];
  const max: Vec2 = [-Infinity, -Infinity];
  for (const l of layers) for (const p of l.polygons) for (const [x, y] of p) {
    min[0] = Math.min(min[0], x); min[1] = Math.min(min[1], y);
    max[0] = Math.max(max[0], x); max[1] = Math.max(max[1], y);
  }
  if (!layers.length) return { layers, min: [0, 0], max: [0, 0] };
  return { layers, min, max };
}

/** Scales artwork so its width is `width` mm and centres it on the origin. */
export function fitArt(art: Art, width: number, mirror = false): Art {
  const w = art.max[0] - art.min[0];
  const k = w > 0 ? width / w : 1;
  const cx = (art.min[0] + art.max[0]) / 2, cy = (art.min[1] + art.max[1]) / 2;
  const layers = art.layers.map((l) => ({
    ...l,
    polygons: l.polygons.map((p) => p.map(([x, y]) => [(mirror ? cx - x : x - cx) * k, (y - cy) * k] as Vec2)),
  }));
  return withBounds(layers);
}

/** Merges all colours into one layer (for single-colour uses such as cutters and stencils). */
export function flattenArt(art: Art): Polygon[][] {
  return art.layers.map((l) => l.polygons);
}
