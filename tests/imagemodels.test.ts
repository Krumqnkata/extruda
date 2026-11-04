// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { colorChanges, filamentArt, surfaceColor, toLinear, type ArtFilament } from '../src/core/filamentart';
import { meshStats } from '../src/core/mesh';
import { decodeTerrarium, loadHeights, lonLatToPixel, metersPerPixel, PLACES, terrainMesh, TILE_SIZE, tileRange, zoomFor } from '../src/core/terrain';
import { isWatertight } from './helpers';

const black: ArtFilament = { color: '#000000', td: 0.5, start: 0 };
const white: ArtFilament = { color: '#ffffff', td: 1, start: 0 };
const grey: ArtFilament = { color: '#808080', td: 1, start: 0 };

describe('filament art', () => {
  it('spreads colour changes evenly on whole layers, going up', () => {
    const c = colorChanges({ base: 0.6, top: 2.4, layer: 0.12, filaments: [black, grey, white] });
    expect(c.map((x) => x.layers)).toEqual([5, 13]);
    expect(c[0].z).toBeCloseTo(0.6);
    expect(c[1].z).toBeCloseTo(1.56);
  });

  it('respects a chosen start, on a whole layer', () => {
    const c = colorChanges({ base: 0.6, top: 2.4, layer: 0.2, filaments: [black, { ...white, start: 1.03 }] });
    expect(c[0].z).toBeCloseTo(1.0);
  });

  it('keeps changes in order even if the chosen heights are not', () => {
    const c = colorChanges({ base: 0.6, top: 2.4, layer: 0.2, filaments: [black, { ...grey, start: 2 }, { ...white, start: 1 }] });
    expect(c[1].z).toBeGreaterThan(c[0].z);
  });

  it('gets lighter with height: dark below, the top filament covering it', () => {
    const f = [black, white];
    const c = colorChanges({ base: 0.4, top: 3, layer: 0.2, filaments: f });
    const at = (h: number) => surfaceColor(h, f, c)[0];
    expect(at(0.2)).toBe(0);
    expect(at(c[0].z)).toBe(0);
    let previous = 0;
    for (const h of [0.6, 0.8, 1.2, 1.6, 2.4, 3]) {
      expect(at(h)).toBeGreaterThan(previous);
      previous = at(h);
    }
    // One TD of white hides about 90% of the black.
    expect(at(c[0].z + 1)).toBeCloseTo(0.9, 2);
  });

  it('a more transparent filament shows more of what is below', () => {
    const stack = (td: number) => {
      const f = [black, { ...white, td }];
      return surfaceColor(1, f, colorChanges({ base: 0.5, top: 2, layer: 0.1, filaments: f }))[0];
    };
    expect(stack(3)).toBeLessThan(stack(0.5));
  });

  const img = { width: 4, height: 2, data: new Float32Array([0, 0.3, 0.6, 1, 1, 0.6, 0.3, 0]) };

  it('builds a closed relief between the two chosen heights', () => {
    const r = filamentArt(img, { width: 40, base: 0.6, top: 2.4, layer: 0.12, resolution: 2, invert: false, filaments: [black, grey, white] });
    expect(isWatertight(r.mesh)).toBe(true);
    const s = meshStats(r.mesh);
    expect(s.size[0]).toBeCloseTo(40, 3);
    expect(s.size[1]).toBeCloseTo(20, 3);
    expect(s.size[2]).toBeCloseTo(2.4, 3);
    expect(s.min[2]).toBe(0);
    expect(r.colors.length).toBe(r.mesh.positions.length);
  });

  it('hands the preview linear colours, so dark stays dark on screen', () => {
    expect(toLinear(0)).toBe(0);
    expect(toLinear(1)).toBeCloseTo(1, 5);
    expect(toLinear(0.5)).toBeCloseTo(0.214, 3);
    const flat = { width: 2, height: 2, data: new Float32Array([0, 0, 0, 0]) };
    const grey = '#808080';
    const r = filamentArt(flat, { width: 20, base: 0.6, top: 2.4, layer: 0.12, resolution: 1, invert: false, filaments: [{ color: grey, td: 1, start: 0 }, white] });
    expect(r.colors[0]).toBeCloseTo(0.216, 2); // #808080 is 50% on screen but about 21.6% in linear light
  });

  it('keeps very large pictures within the limit', () => {
    const r = filamentArt(img, { width: 300, base: 0.6, top: 2.4, layer: 0.12, resolution: 6, invert: false, filaments: [black, white] });
    expect(r.mesh.positions.length / 3 / 2).toBeLessThan(310_000);
  });
});

describe('terrain', () => {
  it('decodes the documented Terrarium formula', () => {
    expect(decodeTerrarium(128, 0, 0)).toBe(0);
    expect(decodeTerrarium(139, 109, 128)).toBeCloseTo(2925.5, 3);
  });

  it('places known coordinates in the right Web Mercator pixel', () => {
    expect(lonLatToPixel(0, 0, 0)).toEqual([128, 128]);
    const [x, y] = lonLatToPixel(23.5853, 42.1794, 10);
    expect(Math.floor(x / TILE_SIZE)).toBe(579);
    // By hand: (1 - ln(tan φ + sec φ) / π) / 2 × 1024 = 379.5
    expect(Math.floor(y / TILE_SIZE)).toBe(379);
  });

  it('picks a zoom with enough detail and a sensible number of tiles', () => {
    for (const p of PLACES) {
      const zoom = zoomFor(p.lat, p.radius, 256);
      expect(metersPerPixel(p.lat, zoom)).toBeLessThanOrEqual((2 * p.radius * 1000) / 256 + 1e-6);
      const r = tileRange(p.lat, p.lon, p.radius, 512);
      expect((r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1)).toBeLessThanOrEqual(25);
    }
  });

  it('samples with north at the top of the grid', async () => {
    const range = tileRange(42, 23, 5, 32);
    // A fake service: height rises towards the north by one metre per pixel.
    const grid = await loadHeights(42, 23, 5, 32, async (_z, _x, y) => {
      const px = new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4);
      for (let row = 0; row < TILE_SIZE; row++) {
        const v = 2000 - ((y - range.y0) * TILE_SIZE + row) + 32768;
        for (let col = 0; col < TILE_SIZE; col++) {
          const o = (row * TILE_SIZE + col) * 4;
          px[o] = Math.floor(v / 256);
          px[o + 1] = v % 256;
          px[o + 3] = 255;
        }
      }
      return px;
    });
    const south = grid.heights[0], north = grid.heights[32 * 31];
    expect(north).toBeGreaterThan(south);
    // 10 km across at this latitude, in whole source pixels of the fake slope.
    expect(north - south).toBeCloseTo(2 * range.half, -1);
  });

  it('builds a closed model to the chosen size and height scale', () => {
    const samples = 16;
    const heights = new Float32Array(samples * samples).fill(100);
    heights[samples * 8 + 8] = 1100;
    const r = terrainMesh({ heights, samples }, { width: 100, areaKm: 10, exaggeration: 2, base: 3, flatSea: false });
    expect(isWatertight(r.mesh)).toBe(true);
    const s = meshStats(r.mesh);
    expect(s.size[0]).toBeCloseTo(100, 3);
    // 1000 m at 100 mm per 10 km is 10 mm; doubled, plus the 3 mm base.
    expect(s.size[2]).toBeCloseTo(23, 3);
    expect(r.height).toBeCloseTo(23, 3);
    expect(r.min).toBe(100);
    expect(r.max).toBe(1100);
  });

  it('can treat everything below sea level as flat', () => {
    const heights = new Float32Array([-500, -500, 100, 200]);
    const flat = terrainMesh({ heights, samples: 2 }, { width: 10, areaKm: 1, exaggeration: 1, base: 1, flatSea: true });
    expect(flat.min).toBe(0);
    const deep = terrainMesh({ heights, samples: 2 }, { width: 10, areaKm: 1, exaggeration: 1, base: 1, flatSea: false });
    expect(deep.min).toBe(-500);
  });
});
