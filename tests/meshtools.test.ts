// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Manifold } from 'manifold-3d';
import { describe, expect, it } from 'vitest';
import { toOBJ } from '../src/core/export';
import { layersAtHeights, parseGcode, parseToolPath } from '../src/core/gcode';
import { build, toTriMesh } from '../src/core/manifold';
import { meshStats, mergeMeshes, signedVolume, type TriMesh } from '../src/core/mesh';
import { analyzeMesh, overhangMap, repairMesh, thinWallMap, toSolid } from '../src/core/meshcheck';
import { applyMatrix, cutToFit, mirrorMatrix, orientChoices, quarterTurn, rotationToDown, scaleMatrix, settleOnBed } from '../src/core/meshops';
import { isWatertight } from './helpers';

const cube = (size: [number, number, number] = [10, 10, 10]) => build((m) => toTriMesh(m.Manifold.cube(size, false)));

/** Every triangle with its own vertices, the way an STL file stores them. */
function asStl(mesh: TriMesh): TriMesh {
  const positions = new Float32Array(mesh.indices.length * 3);
  mesh.indices.forEach((v, i) => positions.set(mesh.positions.subarray(v * 3, v * 3 + 3), i * 3));
  return { positions, indices: Uint32Array.from({ length: mesh.indices.length }, (_, i) => i) };
}

const withoutTriangles = (mesh: TriMesh, ...drop: number[]): TriMesh => ({
  positions: mesh.positions,
  indices: Uint32Array.from([...mesh.indices].filter((_, i) => !drop.includes(Math.floor(i / 3)))),
});

describe('mesh analysis', () => {
  it('passes a clean solid stored like an STL', async () => {
    const r = analyzeMesh(asStl(await cube()));
    expect(r).toMatchObject({ closed: true, openEdges: 0, overusedEdges: 0, flippedEdges: 0, degenerate: 0, bodies: 1, vertices: 8, outwardFacing: true });
  });

  it('counts holes, flipped triangles and separate bodies', async () => {
    const c = await cube();
    expect(analyzeMesh(withoutTriangles(c, 0)).openEdges).toBe(3);
    const flipped = { positions: c.positions, indices: c.indices.slice() };
    [flipped.indices[1], flipped.indices[2]] = [flipped.indices[2], flipped.indices[1]];
    expect(analyzeMesh(flipped).flippedEdges).toBe(3);
    const far = await build((m) => toTriMesh(m.Manifold.cube([10, 10, 10]).translate([50, 0, 0])));
    expect(analyzeMesh(mergeMeshes([c, far])).bodies).toBe(2);
  });

  it('notices a surface turned inside out', async () => {
    const c = await cube();
    const inverted = applyMatrix(c, mirrorMatrix(0));
    expect(signedVolume(inverted)).toBeGreaterThan(0); // mirroring keeps it outward
    const raw = { positions: c.positions, indices: c.indices.slice() };
    for (let t = 0; t < raw.indices.length; t += 3) [raw.indices[t + 1], raw.indices[t + 2]] = [raw.indices[t + 2], raw.indices[t + 1]];
    expect(analyzeMesh(raw).outwardFacing).toBe(false);
  });
});

describe('mesh repair', () => {
  it('closes a hole and restores the volume', async () => {
    const broken = asStl(withoutTriangles(await cube(), 0, 1));
    expect(analyzeMesh(broken).closed).toBe(false);
    const fixed = await build((m) => repairMesh(m, broken));
    expect(fixed.ok).toBe(true);
    expect(fixed.holes).toBeGreaterThan(0);
    expect(isWatertight(fixed.mesh!)).toBe(true);
    expect(meshStats(fixed.mesh!).volume).toBeCloseTo(1000, 1);
  });

  it('turns flipped triangles and an inside-out surface the right way', async () => {
    const c = await cube();
    const raw = { positions: c.positions, indices: c.indices.slice() };
    for (let t = 0; t < raw.indices.length; t += 3) [raw.indices[t + 1], raw.indices[t + 2]] = [raw.indices[t + 2], raw.indices[t + 1]];
    [raw.indices[1], raw.indices[2]] = [raw.indices[2], raw.indices[1]];
    const fixed = await build((m) => repairMesh(m, raw));
    expect(fixed.ok).toBe(true);
    expect(signedVolume(fixed.mesh!)).toBeCloseTo(1000, 1);
  });

  it('removes repeated and empty triangles', async () => {
    const c = await cube();
    const dirty: TriMesh = { positions: c.positions, indices: Uint32Array.from([...c.indices, c.indices[0], c.indices[1], c.indices[2], 0, 0, 1]) };
    const fixed = await build((m) => repairMesh(m, dirty));
    expect(fixed.removed).toBe(2);
    expect(fixed.ok).toBe(true);
  });

  it('says so instead of returning a broken mesh when an edge cannot be fixed', async () => {
    // Three flaps meeting on one edge.
    const positions = new Float32Array([0, 0, 0, 0, 0, 1, 1, 0, 0, -1, 0, 0, 0, 1, 0]);
    const indices = new Uint32Array([0, 1, 2, 0, 1, 3, 0, 1, 4]);
    const r = await build((m) => repairMesh(m, { positions, indices }));
    expect(r.ok).toBe(false);
    expect(r.mesh).toBeUndefined();
  });
});

describe('printability maps', () => {
  it('flags the underside of an overhang but not what rests on the bed', async () => {
    // A T shape: the bar's underside hangs in the air.
    const t = await build((m) => toTriMesh(m.Manifold.union([m.Manifold.cube([10, 10, 20], false).translate([20, 0, 0]), m.Manifold.cube([50, 10, 5], false).translate([0, 0, 20])])));
    const map = overhangMap(t);
    expect(map.flagged).toBeCloseTo(50 * 10 - 10 * 10, 0);
    expect(map.colors.length).toBe(map.mesh.positions.length);
    const plain = overhangMap(await cube());
    expect(plain.flagged).toBe(0);
  });

  it('finds thin walls and passes thick ones', async () => {
    const result = await build((m) => {
      const thin = m.Manifold.cube([40, 40, 0.5], false);
      const thick = m.Manifold.cube([40, 40, 10], false);
      return [thinWallMap(thin, toTriMesh(thin), 1).share, thinWallMap(thick, toTriMesh(thick), 1).share];
    });
    expect(result[0]).toBeGreaterThan(0.9);
    expect(result[1]).toBeLessThan(0.01);
  });
});

describe('transforms and export', () => {
  it('scales, mirrors and turns while staying outward facing', async () => {
    const c = await cube([10, 20, 30]);
    expect(meshStats(applyMatrix(c, scaleMatrix(2))).volume).toBeCloseTo(48000, 0);
    const mirrored = applyMatrix(c, mirrorMatrix(0));
    expect(signedVolume(mirrored)).toBeCloseTo(6000, 0);
    expect(isWatertight(mirrored)).toBe(true);
    const turned = meshStats(applyMatrix(c, quarterTurn(0)));
    expect(turned.size[1]).toBeCloseTo(30, 4);
    expect(turned.size[2]).toBeCloseTo(20, 4);
    const settled = meshStats(settleOnBed(applyMatrix(c, quarterTurn(1))));
    expect(settled.min[2]).toBeCloseTo(0, 5);
    expect(settled.min[0]).toBeCloseTo(-settled.size[0] / 2, 5);
  });

  it('writes OBJ with one-based indices', async () => {
    const obj = toOBJ(await cube());
    expect(obj.match(/^v /gm)).toHaveLength(8);
    expect(obj.match(/^f /gm)).toHaveLength(12);
    expect(obj).not.toMatch(/^f .*\b0\b/m);
  });

  it('simplifies a dense sphere and keeps it closed', async () => {
    const r = await build((m) => {
      const s = m.Manifold.sphere(20, 256);
      const fewer = toSolid(m, toTriMesh(s))!.simplify(0.2);
      return { before: s.numTri(), after: fewer.numTri(), mesh: toTriMesh(fewer), vol: s.volume() };
    });
    expect(r.after).toBeLessThan(r.before / 3);
    expect(isWatertight(r.mesh)).toBe(true);
    // A 0.2 mm tolerance on a 20 mm radius shaves off a little, but under 2%.
    expect(Math.abs(meshStats(r.mesh).volume - r.vol) / r.vol).toBeLessThan(0.02);
  });
});

describe('automatic orientation', () => {
  it('rotation sends the chosen direction straight down', () => {
    for (const d of [[0, 0, 1], [0, 0, -1], [1, 0, 0], [0.6, 0.8, 0], [0.2672612, 0.5345225, 0.8017837]] as [number, number, number][]) {
      const r = rotationToDown(d);
      expect(r[2] * d[2] + r[0] * d[0] + r[1] * d[1]).toBeCloseTo(0, 5);
      expect(r[6] * d[0] + r[7] * d[1] + r[8] * d[2]).toBeCloseTo(-1, 5);
    }
  });

  it('lays a tilted pyramid on its base', async () => {
    const pyramid = await build((m) => toTriMesh(m.Manifold.hull([[0, 0, 0], [40, 0, 0], [0, 40, 0], [40, 40, 0], [20, 20, 30]]).rotate([37, 21, 13])));
    const best = await build((m) => orientChoices(m, pyramid))
      .then((c) => c[0]);
    expect(best.contact).toBeCloseTo(1600, -1);
    expect(best.overhang).toBeCloseTo(0, 0);
    const placed = meshStats(settleOnBed(applyMatrix(pyramid, best.rotation)));
    expect(placed.size[2]).toBeCloseTo(30, 1);
    expect(placed.min[2]).toBeCloseTo(0, 4);
  });

  it('returns different choices, best first', async () => {
    const choices = await build(async (m) => orientChoices(m, toTriMesh(m.Manifold.cube([10, 20, 30], false))));
    const list = await choices;
    expect(list.length).toBe(3);
    // A box lies flat on its biggest side first.
    expect(list[0].height).toBeCloseTo(10, 3);
  });
});

describe('cutting to fit the bed', () => {
  const options = { bedX: 100, bedY: 100, bedZ: 100, margin: 5, dowel: 0, clearance: 0.2 };

  it('leaves a model that already fits alone', async () => {
    const r = await build((m) => cutToFit(m, m.Manifold.cube([50, 50, 50], false), options));
    expect(r.pieces).toHaveLength(1);
    expect(r.dowels).toHaveLength(0);
  });

  it('cuts in every direction, all pieces fit and no volume is lost', async () => {
    const r = await build((m) => cutToFit(m, m.Manifold.cube([250, 150, 120], false), options));
    expect(r.pieces).toHaveLength(3 * 2 * 2);
    let total = 0;
    for (const p of r.pieces) {
      expect(isWatertight(p)).toBe(true);
      const s = meshStats(p);
      expect(s.size[0]).toBeLessThanOrEqual(90);
      expect(s.size[1]).toBeLessThanOrEqual(90);
      expect(s.size[2]).toBeLessThanOrEqual(95);
      total += s.volume;
    }
    expect(total).toBeCloseTo(250 * 150 * 120, -1);
  });

  it('makes matching sockets and loose dowels across a cut', async () => {
    const withPins = { ...options, dowel: 5 };
    const r = await build((m) => cutToFit(m, m.Manifold.cube([150, 60, 40], false), withPins));
    expect(r.pieces).toHaveLength(2);
    expect(r.dowels.length).toBeGreaterThan(0);
    for (const p of r.pieces) expect(isWatertight(p)).toBe(true);
    for (const d of r.dowels) expect(meshStats(d).size[2]).toBeCloseTo(16, 3);
    // Each dowel removes two sockets of radius 2.6 mm and depth 8.4 mm.
    const total = r.pieces.reduce((sum, p) => sum + meshStats(p).volume, 0);
    const socket = Math.PI * 2.6 * 2.6 * 8.4;
    expect(150 * 60 * 40 - total).toBeCloseTo(r.dowels.length * 2 * socket, -2);
  });

  it('puts sockets only inside the material, on an awkward shape', async () => {
    const r = await build((m) => {
      const ring: Manifold = m.Manifold.cylinder(30, 80, 80, 96).subtract(m.Manifold.cylinder(32, 72, 72, 96).translate([0, 0, -1]));
      return cutToFit(m, ring, { ...options, dowel: 4 });
    });
    for (const p of r.pieces) expect(isWatertight(p)).toBe(true);
    expect(r.pieces.length).toBeGreaterThan(1);
  });
});

describe('g-code tool path', () => {
  const lines = [
    'G21', 'G90', 'M83', 'G28', 'G92 E0',
    ';LAYER_CHANGE', ';Z:0.2', 'G1 Z0.2 F600', 'G1 X10 Y0 E1', 'G0 X20 Y0', 'G1 X20 Y10 E1',
    ';LAYER_CHANGE', ';Z:0.4', 'G1 Z0.4', 'G1 X0 Y10 E-0.5', 'G1 X0 Y0 E0.5 ; comment', 'G1 X5 Y0',
    ';LAYER_CHANGE', ';Z:0.6', 'G1 Z0.6', 'G2 X10 Y0 I5 J0 E1',
  ];

  it('keeps extruding moves by layer and skips travel and retraction', () => {
    const path = parseToolPath(lines, parseGcode(lines).layers);
    const counts = [...path.layerEnds];
    expect(counts[0]).toBe(2);
    expect(counts[1]).toBe(3);
    expect(counts[2]).toBeGreaterThan(3);
    expect([...path.positions.slice(0, 6)]).toEqual([0, 0, expect.closeTo(0.2, 5), 10, 0, expect.closeTo(0.2, 5)]);
    expect(path.truncated).toBe(false);
  });

  it('follows clockwise arcs through the right side of the circle', () => {
    const path = parseToolPath(['G90', 'M83', ';LAYER_CHANGE', ';Z:0.2', 'G1 X0 Y0 Z0.2', 'G2 X10 Y0 I5 J0 E1'], [{ index: 0, z: 0.2, line: 2 }]);
    const ys = [];
    for (let i = 1; i < path.positions.length; i += 3) ys.push(path.positions[i]);
    expect(Math.max(...ys)).toBeCloseTo(5, 1); // a clockwise half circle from (0,0) to (10,0) rises to y = 5
  });

  it('handles absolute extrusion and G92 resets', () => {
    const abs = ['G90', 'M82', ';LAYER_CHANGE', ';Z:0.2', 'G1 X0 Y0 Z0.2 E0', 'G1 X10 E1', 'G1 X20 E1', 'G92 E0', 'G1 X30 E0.5'];
    const path = parseToolPath(abs, parseGcode(abs).layers);
    expect(path.layerEnds[0]).toBe(2); // X20 has no new filament; X30 does after the reset
  });

  it('works when a file has no layer markers', () => {
    const path = parseToolPath(['M83', 'G1 X1 E1', 'G1 X2 E1'], []);
    expect(path.positions.length).toBe(12);
    expect(layersAtHeights(parseGcode([]), [1])).toEqual([]);
  });
});
