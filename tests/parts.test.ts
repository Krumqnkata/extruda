// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ManifoldToplevel } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { build } from '../src/core/manifold';
import { meshStats, type TriMesh } from '../src/core/mesh';
import { loadFont } from '../src/core/text';
import { findModel } from '../src/models';
import { parseCutouts, parsePoints, RPI4 } from '../src/models/enclosure';
import { gearProfile } from '../src/models/gears';
import { anchorSize, BOARD_SYSTEMS } from '../src/models/pegboard';
import { METRIC } from '../src/models/threads';
import { isWatertight, useDiskFonts } from './helpers';

beforeAll(useDiskFonts);

const toSolid = (m: ManifoldToplevel, mesh: TriMesh) =>
  m.Manifold.ofMesh(new m.Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices }));

async function buildModel(id: string, overrides: Record<string, number | string | boolean> = {}) {
  const model = findModel(id)!;
  const font = await loadFont(model.defaults.font);
  return build((m) => model.build(m, font, { ...model.defaults, ...overrides }));
}

describe('gears', () => {
  it('has the standard diameters', async () => {
    const parts = await buildModel('gear', { teeth: 20, teeth2: 0, module: 2, hubHeight: 0, bore: 5 });
    expect(parts).toHaveLength(1);
    // An even tooth count puts a tooth tip on each side of the X axis: outer diameter m(z + 2).
    expect(meshStats(parts[0].mesh).size[0]).toBeCloseTo(44, 1);
    expect(isWatertight(parts[0].mesh)).toBe(true);
  });

  const meshArea = async (z1: number, z2: number, mod: number, distance: number, backlash: number) =>
    build((m) => {
      const a = m.CrossSection.ofPolygons(gearProfile(z1, mod, 20, backlash), 'Positive');
      // Turned half a tooth so that a tooth gap of gear 2 faces the tooth of gear 1 on the line between centres.
      const b = m.CrossSection.ofPolygons(gearProfile(z2, mod, 20, backlash), 'Positive').rotate(180 + 180 / z2).translate([distance, 0]);
      return a.intersect(b).area();
    });

  it('two gears mesh at the right axle distance without colliding', async () => {
    for (const [z1, z2] of [[20, 40], [25, 31], [17, 60]]) {
      expect(await meshArea(z1, z2, 2, ((z1 + z2) * 2) / 2, 0.15), `${z1}/${z2}`).toBeLessThan(1e-3);
    }
  });

  it('collides when the axles are too close, so the check above means something', async () => {
    expect(await meshArea(20, 40, 2, 59, 0.15)).toBeGreaterThan(0.1);
  });

  it('twists the second gear the other way for helical pairs', async () => {
    const parts = await buildModel('gear', { helix: 20, hubHeight: 0 });
    expect(parts.map((p) => p.name)).toEqual(['Gear 1', 'Gear 2']);
    for (const p of parts) expect(isWatertight(p.mesh)).toBe(true);
  });
});

describe('bolts and nuts', () => {
  for (const size of ['M3', 'M8', 'M12', 'M30']) {
    it(`builds a closed ${size} bolt and nut to size`, async () => {
      const s = METRIC[size];
      const length = s.d * 3;
      const parts = await buildModel('bolt-nut', { size, length, clearance: 0.3 });
      expect(parts.map((p) => p.name)).toEqual(['Bolt', 'Nut']);
      for (const p of parts) expect(isWatertight(p.mesh), p.name).toBe(true);
      const bolt = meshStats(parts[0].mesh), nut = meshStats(parts[1].mesh);
      expect(bolt.size[2]).toBeCloseTo(s.head + length, 1);
      // Hexagon with a corner on X: Y spans the width across the flats.
      expect(bolt.size[1]).toBeCloseTo(s.flats, 1);
      expect(nut.size[1]).toBeCloseTo(s.flats, 1);
      expect(nut.size[2]).toBeCloseTo(s.nut, 3);
    });
  }

  it('the nut really screws onto the bolt, at any whole number of turns', async () => {
    const size = 'M10';
    const s = METRIC[size];
    const parts = await buildModel('bolt-nut', { size, length: 30, clearance: 0.3 });
    const nutX = meshStats(parts[1].mesh).min[0] + s.flats / Math.sqrt(3);
    const overlap = (turns: number, spin = 0) =>
      build((m) => {
        const bolt = toSolid(m, parts[0].mesh);
        const nut = toSolid(m, parts[1].mesh).translate([-nutX, 0, s.head + turns * s.pitch + spin]);
        return nut.intersect(bolt).volume();
      });
    expect(await overlap(5)).toBeLessThan(0.05);
    expect(await overlap(9)).toBeLessThan(0.05);
    // Half a turn out of phase, the threads collide: this proves the check can fail.
    expect(await overlap(5, s.pitch / 2)).toBeGreaterThan(1);
  });

  it('clearance makes the hole bigger and the bolt smaller', async () => {
    const tight = await buildModel('bolt-nut', { clearance: 0 });
    const loose = await buildModel('bolt-nut', { clearance: 0.6 });
    expect(meshStats(loose[0].mesh).volume).toBeLessThan(meshStats(tight[0].mesh).volume);
    expect(meshStats(loose[1].mesh).volume).toBeLessThan(meshStats(tight[1].mesh).volume);
  });

  it('can make just one of the two', async () => {
    expect((await buildModel('bolt-nut', { part: 'bolt' })).map((p) => p.name)).toEqual(['Bolt']);
    expect((await buildModel('bolt-nut', { part: 'nut' })).map((p) => p.name)).toEqual(['Nut']);
  });
});

describe('pegboard holders', () => {
  it('tabs fit through every opening', () => {
    for (const [name, sys] of Object.entries(BOARD_SYSTEMS)) {
      const a = anchorSize(sys, 0.3);
      if (sys.round) expect(Math.hypot(a.w, a.h), name).toBeLessThanOrEqual(sys.width);
      else {
        expect(a.w, name).toBeLessThan(sys.width);
        expect(a.h + a.rise, name).toBeLessThan(sys.height);
      }
    }
  });

  for (const system of Object.keys(BOARD_SYSTEMS)) {
    for (const item of ['hook', 'bin', 'holder']) {
      it(`builds a closed ${item} for ${system}`, async () => {
        const parts = await buildModel('pegboard', { system, item, board: 5 });
        expect(parts).toHaveLength(1);
        expect(isWatertight(parts[0].mesh)).toBe(true);
        const s = meshStats(parts[0].mesh);
        expect(s.min[2]).toBeCloseTo(0, 3);
        const pieces = await build((m) => toSolid(m, parts[0].mesh).decompose().length);
        expect(pieces).toBe(1);
      });
    }
  }

  it('reaches through the board behind a bin', async () => {
    const parts = await buildModel('pegboard', { item: 'bin', board: 5, clearance: 0.3 });
    // The front faces -Y, so the tab sticks out towards +Y: the board plus clearance plus the leg.
    const s = meshStats(parts[0].mesh);
    expect(s.min[1] + s.size[1]).toBeGreaterThanOrEqual(5.3);
  });
});

describe('electronics enclosure', () => {
  it('reads the Raspberry Pi 4 profile from the official drawing', () => {
    const holes = parsePoints(RPI4.standoffs);
    const xs = holes.map((h) => h[0]), ys = holes.map((h) => h[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBe(58);
    expect(Math.max(...ys) - Math.min(...ys)).toBe(49);
    expect(Math.min(...xs)).toBe(3.5);
    expect(RPI4.width - 2 * RPI4.offset).toBe(85);
    expect(RPI4.depth - 2 * RPI4.offset).toBe(56);
    expect(parseCutouts(RPI4.cutouts).filter((c) => c.wall === 'front').map((c) => c.pos)).toEqual([11.2, 26, 39.5, 54]);
  });

  it('skips lines it cannot read and accepts Bulgarian wall names', () => {
    expect(parsePoints('1,2; bad; 3 4\n5,6,7')).toEqual([[1, 2], [3, 4]]);
    const cuts = parseCutouts('отпред, 10, 1, 5, 5\nnowhere, 1, 1, 1, 1\nleft, 1, 2');
    expect(cuts).toHaveLength(1);
    expect(cuts[0].wall).toBe('front');
  });

  it('builds both profiles with box and lid', async () => {
    for (const preset of ['custom', 'rpi4']) {
      const parts = await buildModel('enclosure', { preset });
      expect(parts.map((p) => p.name)).toEqual(['Box', 'Lid']);
      for (const p of parts) expect(isWatertight(p.mesh), `${preset} ${p.name}`).toBe(true);
    }
  });

  it('cuts every opening through the wall and adds standoffs', async () => {
    const none = await buildModel('enclosure', { cutouts: '', standoffs: '' });
    const opened = await buildModel('enclosure', { cutouts: 'front, 20, 1, 12, 6', standoffs: '' });
    const posts = await buildModel('enclosure', { cutouts: '', standoffs: '4,4' });
    const v = (p: typeof none) => meshStats(p[0].mesh).volume;
    // A 12 × 6 mm opening through a 2 mm wall removes 144 mm³.
    expect(v(none) - v(opened)).toBeCloseTo(144, -1);
    expect(v(posts)).toBeGreaterThan(v(none));
  });
});
