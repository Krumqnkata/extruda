// SPDX-License-Identifier: AGPL-3.0-or-later
// Real terrain from public elevation tiles (Terrarium format, Web Mercator, 256 px tiles).
import { closedGrid } from './heightfield';
import type { TriMesh } from './mesh';

export const TILE_SIZE = 256;
const MAX_ZOOM = 14;
const EARTH_METERS_PER_PIXEL = 156543.03392; // at the equator, zoom 0

export interface Place {
  id: string;
  name: readonly [string, string];
  lat: number;
  lon: number;
  radius: number;
  /** Known height of the summit, m. */
  peak: number;
}

export const PLACES: Place[] = [
  { id: 'musala', name: ['Musala, Rila', 'Мусала, Рила'], lat: 42.1794, lon: 23.5853, radius: 6, peak: 2925 },
  { id: 'vihren', name: ['Vihren, Pirin', 'Вихрен, Пирин'], lat: 41.7678, lon: 23.3995, radius: 6, peak: 2914 },
  { id: 'cherni', name: ['Cherni Vrah, Vitosha', 'Черни връх, Витоша'], lat: 42.5636, lon: 23.2785, radius: 8, peak: 2290 },
  { id: 'blanc', name: ['Mont Blanc', 'Мон Блан'], lat: 45.8326, lon: 6.8652, radius: 10, peak: 4806 },
  { id: 'fuji', name: ['Mount Fuji', 'Фуджи'], lat: 35.3606, lon: 138.7274, radius: 15, peak: 3776 },
];

/** Decodes one Terrarium pixel to metres. */
export function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

/** Global pixel position at a zoom level. */
export function lonLatToPixel(lon: number, lat: number, zoom: number): [number, number] {
  const size = TILE_SIZE * 2 ** zoom;
  const s = Math.sin((lat * Math.PI) / 180);
  return [((lon + 180) / 360) * size, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * size];
}

export const metersPerPixel = (lat: number, zoom: number) => (EARTH_METERS_PER_PIXEL * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;

/** The lowest zoom with at least one source pixel per output sample. */
export function zoomFor(lat: number, radiusKm: number, samples: number): number {
  const wanted = (2 * radiusKm * 1000) / samples;
  const z = Math.ceil(Math.log2((EARTH_METERS_PER_PIXEL * Math.cos((lat * Math.PI) / 180)) / wanted));
  return Math.max(1, Math.min(MAX_ZOOM, z));
}

export interface TileRange {
  zoom: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Centre of the area and half its width, in global pixels. */
  cx: number;
  cy: number;
  half: number;
}

export function tileRange(lat: number, lon: number, radiusKm: number, samples: number): TileRange {
  const zoom = zoomFor(lat, radiusKm, samples);
  const [cx, cy] = lonLatToPixel(lon, lat, zoom);
  const half = (radiusKm * 1000) / metersPerPixel(lat, zoom);
  return {
    zoom,
    cx,
    cy,
    half,
    x0: Math.floor((cx - half) / TILE_SIZE),
    x1: Math.floor((cx + half) / TILE_SIZE),
    y0: Math.floor((cy - half) / TILE_SIZE),
    y1: Math.floor((cy + half) / TILE_SIZE),
  };
}

export const tileUrl = (z: number, x: number, y: number) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

/** RGBA pixels of one tile. */
export type TileLoader = (z: number, x: number, y: number) => Promise<Uint8ClampedArray>;

export interface HeightGrid {
  /** Metres, row 0 at the south edge. */
  heights: Float32Array;
  samples: number;
}

/** Downloads the tiles for an area and samples a square grid of heights. */
export async function loadHeights(lat: number, lon: number, radiusKm: number, samples: number, load: TileLoader): Promise<HeightGrid> {
  const r = tileRange(lat, lon, radiusKm, samples);
  const span = 2 ** r.zoom;
  const nx = r.x1 - r.x0 + 1, ny = r.y1 - r.y0 + 1;
  const W = nx * TILE_SIZE, H = ny * TILE_SIZE;
  const mosaic = new Float32Array(W * H);
  const jobs: Promise<void>[] = [];
  for (let ty = 0; ty < ny; ty++) {
    for (let tx = 0; tx < nx; tx++) {
      // Longitude wraps around the world; latitude does not.
      const tileX = ((r.x0 + tx) % span + span) % span;
      const tileY = Math.min(span - 1, Math.max(0, r.y0 + ty));
      jobs.push(load(r.zoom, tileX, tileY).then((px) => {
        for (let y = 0; y < TILE_SIZE; y++) {
          for (let x = 0; x < TILE_SIZE; x++) {
            const o = (y * TILE_SIZE + x) * 4;
            mosaic[(ty * TILE_SIZE + y) * W + tx * TILE_SIZE + x] = decodeTerrarium(px[o], px[o + 1], px[o + 2]);
          }
        }
      }));
    }
  }
  await Promise.all(jobs);

  const left = r.x0 * TILE_SIZE, topEdge = r.y0 * TILE_SIZE;
  const heights = new Float32Array(samples * samples);
  for (let j = 0; j < samples; j++) {
    const gy = r.cy + r.half - (j / (samples - 1)) * 2 * r.half - topEdge - 0.5;
    const y0 = Math.max(0, Math.min(H - 1, Math.floor(gy))), y1 = Math.min(H - 1, y0 + 1), fy = Math.max(0, Math.min(1, gy - y0));
    for (let i = 0; i < samples; i++) {
      const gx = r.cx - r.half + (i / (samples - 1)) * 2 * r.half - left - 0.5;
      const x0 = Math.max(0, Math.min(W - 1, Math.floor(gx))), x1 = Math.min(W - 1, x0 + 1), fx = Math.max(0, Math.min(1, gx - x0));
      const a = mosaic[y0 * W + x0] * (1 - fx) + mosaic[y0 * W + x1] * fx;
      const b = mosaic[y1 * W + x0] * (1 - fx) + mosaic[y1 * W + x1] * fx;
      heights[j * samples + i] = a * (1 - fy) + b * fy;
    }
  }
  return { heights, samples };
}

export interface TerrainParams {
  /** Width of the printed model, mm. */
  width: number;
  /** Real width of the area, km. */
  areaKm: number;
  /** Vertical exaggeration; 1 is true to scale. */
  exaggeration: number;
  base: number;
  /** Treat everything under sea level as flat water. */
  flatSea: boolean;
}

export interface TerrainResult {
  mesh: TriMesh;
  min: number;
  max: number;
  /** Height of the highest point above the bed, mm. */
  height: number;
}

export function terrainMesh(grid: HeightGrid, p: TerrainParams): TerrainResult {
  const { heights, samples } = grid;
  let min = Infinity, max = -Infinity;
  for (const raw of heights) {
    const h = p.flatSea ? Math.max(0, raw) : raw;
    if (h < min) min = h;
    if (h > max) max = h;
  }
  const mmPerMeter = p.width / (p.areaKm * 1000);
  const zScale = mmPerMeter * p.exaggeration;
  const mesh = closedGrid(samples, samples, false, (i, j, top, out, o) => {
    out[o] = (i / (samples - 1) - 0.5) * p.width;
    out[o + 1] = (j / (samples - 1) - 0.5) * p.width;
    if (!top) {
      out[o + 2] = 0;
      return;
    }
    const raw = heights[j * samples + i];
    const h = p.flatSea ? Math.max(0, raw) : raw;
    out[o + 2] = p.base + (h - min) * zScale;
  });
  return { mesh, min, max, height: p.base + (max - min) * zScale };
}
