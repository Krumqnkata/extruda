// SPDX-License-Identifier: AGPL-3.0-or-later
import { strFromU8, unzipSync } from 'fflate';
import { beforeAll, describe, expect, it } from 'vitest';
import { objectsTo3MF, partsToSTL, to3MF, toSTL } from '../src/core/export';
import { lithophane, LITHO_DEFAULTS } from '../src/core/lithophane';
import { build, toTriMesh } from '../src/core/manifold';
import { meshStats, mergeMeshes, type Part, type TriMesh } from '../src/core/mesh';
import { KEYCHAIN_DEFAULTS, keychainParts, qrMatrix, qrParts, QR_DEFAULTS, SIGN_DEFAULTS, signParts } from '../src/core/models';
import { FONTS } from '../src/core/fonts';
import { loadFont } from '../src/core/text';
import { isWatertight, useDiskFonts } from './helpers';

beforeAll(useDiskFonts);

const all = (parts: Part[]) => mergeMeshes(parts.map((p) => p.mesh));

describe('mesh stats', () => {
  it('measures a 10 mm cube', async () => {
    const mesh = await build((m) => toTriMesh(m.Manifold.cube([10, 10, 10])));
    const s = meshStats(mesh);
    expect(s.volume).toBeCloseTo(1000, 3);
    expect(s.area).toBeCloseTo(600, 3);
    expect(s.size).toEqual([10, 10, 10]);
  });
});

describe('keychain', () => {
  for (const text of ['Иван', 'Ivan', 'Мария-Ёлка', 'Ж Щ Ю']) {
    it(`builds a closed model for "${text}"`, async () => {
      const font = await loadFont('lobster');
      const parts = await build((m) => keychainParts(m, font, { ...KEYCHAIN_DEFAULTS, text }));
      expect(parts.map((p) => p.name)).toEqual(['Base', 'Text']);
      for (const p of parts) {
        expect(isWatertight(p.mesh)).toBe(true);
        expect(meshStats(p.mesh).volume).toBeGreaterThan(10);
      }
      const s = meshStats(all(parts));
      expect(s.min[2]).toBeCloseTo(0, 5);
      expect(s.size[2]).toBeCloseTo(KEYCHAIN_DEFAULTS.baseThickness + KEYCHAIN_DEFAULTS.textThickness, 3);
    });
  }

  it('works with every bundled font and every style', async () => {
    for (const f of FONTS) {
      const font = await loadFont(f.id);
      for (const style of ['raised', 'engraved', 'inlay'] as const) {
        const parts = await build((m) => keychainParts(m, font, { ...KEYCHAIN_DEFAULTS, text: 'Яна', style }));
        expect(parts.length, `${f.id} ${style}`).toBeGreaterThan(0);
        for (const p of parts) expect(isWatertight(p.mesh), `${f.id} ${style} ${p.name}`).toBe(true);
      }
    }
  });

  it('cuts the key ring hole through the base', async () => {
    const font = await loadFont('russo');
    const withRing = await build((m) => keychainParts(m, font, { ...KEYCHAIN_DEFAULTS, text: 'A', ring: 'left' }));
    const noRing = await build((m) => keychainParts(m, font, { ...KEYCHAIN_DEFAULTS, text: 'A', ring: 'none' }));
    expect(meshStats(withRing[0].mesh).size[0]).toBeGreaterThan(meshStats(noRing[0].mesh).size[0] + 5);
  });

  it('returns nothing for empty text', async () => {
    const font = await loadFont('russo');
    expect(await build((m) => keychainParts(m, font, { ...KEYCHAIN_DEFAULTS, text: '   ' }))).toEqual([]);
  });
});

describe('sign and QR', () => {
  it('builds every plate shape', async () => {
    const font = await loadFont('russo');
    for (const shape of ['rounded', 'rect', 'pill', 'contour', 'none'] as const) {
      const parts = await build((m) => signParts(m, font, { ...SIGN_DEFAULTS, shape }));
      expect(parts.length, shape).toBeGreaterThan(0);
      for (const p of parts) expect(isWatertight(p.mesh), `${shape} ${p.name}`).toBe(true);
    }
  });

  it('encodes Cyrillic QR content as UTF-8', () => {
    const grid = qrMatrix('Здравей', 'M');
    expect(grid.length).toBeGreaterThanOrEqual(21);
    expect(grid.length % 4).toBe(1);
  });

  it('builds a QR plate with label and hole', async () => {
    const font = await loadFont('russo');
    const parts = await build((m) => qrParts(m, font, { ...QR_DEFAULTS, label: 'Wi-Fi', hole: true }));
    expect(parts).toHaveLength(2);
    for (const p of parts) expect(isWatertight(p.mesh)).toBe(true);
  });
});

describe('lithophane', () => {
  const img = { width: 4, height: 3, data: new Float32Array([0, 0.3, 0.6, 1, 1, 0.6, 0.3, 0, 0.5, 0.5, 0.5, 0.5]) };
  for (const shape of ['flat', 'curved', 'cylinder'] as const) {
    it(`builds a closed ${shape} lithophane`, () => {
      const { mesh } = lithophane(img, { ...LITHO_DEFAULTS, shape, width: 40, resolution: 2 });
      expect(isWatertight(mesh)).toBe(true);
      expect(meshStats(mesh).volume).toBeGreaterThan(0);
    });
  }
  it('keeps thickness within the chosen range', () => {
    const { thickness } = lithophane(img, { ...LITHO_DEFAULTS, width: 40, resolution: 2 });
    expect(Math.min(...thickness.filter((t) => t > 0))).toBeGreaterThanOrEqual(LITHO_DEFAULTS.minThickness - 1e-6);
    expect(Math.max(...thickness)).toBeLessThanOrEqual(LITHO_DEFAULTS.maxThickness + 1e-6);
  });
});

describe('export', () => {
  const tri: TriMesh = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]) };

  it('writes binary STL with the right size', () => {
    const stl = toSTL(tri);
    expect(stl.length).toBe(84 + 50);
    expect(new DataView(stl.buffer).getUint32(80, true)).toBe(1);
  });

  describe('per-part filaments for Bambu Studio and OrcaSlicer', () => {
    const base: Part = { name: 'Base', color: '#112233', mesh: tri };
    const text: Part = { name: 'Text & more', color: '#FF7A1A', mesh: tri };
    const frame: Part = { name: 'Frame', color: '#ff7a1a', mesh: tri }; // same colour, other case
    const read = (bytes: Uint8Array) => {
      const files = unzipSync(bytes);
      return { model: strFromU8(files['3D/3dmodel.model']), config: files['Metadata/model_settings.config'] && strFromU8(files['Metadata/model_settings.config']) };
    };

    it('leaves the plain 3MF exactly as it was', () => {
      expect(read(objectsTo3MF([{ name: 'A', parts: [base, text] }])).config).toBeUndefined();
    });

    it('gives each colour one filament number, on matching object and part ids', () => {
      const { model, config } = read(objectsTo3MF([{ name: 'Tag', parts: [base, text, frame] }], 'Tag', { slicerFilaments: true }));
      const meshIds = [...model.matchAll(/<object id="(\d+)"[^>]*pid=/g)].map((x) => x[1]);
      const assembly = /<object id="(\d+)"[^>]*><components>/.exec(model)![1];
      expect(config).toContain(`<object id="${assembly}">`);
      const parts = [...config!.matchAll(/<part id="(\d+)" subtype="normal_part"><metadata key="name" value="[^"]*"\/><metadata key="extruder" value="(\d+)"\/>/g)];
      expect(parts.map((x) => x[1])).toEqual(meshIds);
      expect(parts.map((x) => x[2])).toEqual(['1', '2', '2']);
      expect(config).toContain('Text &#38; more');
    });

    it('numbers filaments across a whole plate and gives every object its own settings', () => {
      const { config } = read(objectsTo3MF([{ name: 'A', parts: [base] }, { name: 'B', parts: [text] }, { name: 'C', parts: [base, text] }], 'Plate', { slicerFilaments: true }));
      const ids = [...config!.matchAll(/<object id="(\d+)">/g)].map((x) => x[1]);
      expect(new Set(ids).size).toBe(3); // the importer rejects duplicate object ids
      const extruders = [...config!.matchAll(/<object id="\d+"><metadata key="name" value="[^"]*"\/><metadata key="extruder" value="(\d+)"/g)].map((x) => x[1]);
      expect(extruders).toEqual(['1', '2', '1']);
    });

    it('stays honest about which program made the file', () => {
      // Claiming to be Bambu Studio would make it load as a full project, with settings this file does not have.
      const { model } = read(objectsTo3MF([{ name: 'A', parts: [base] }], 'A', { slicerFilaments: true }));
      expect(model).toContain('<metadata name="Application">Extruda</metadata>');
      expect(model).not.toMatch(/BambuStudio|OrcaSlicer/);
    });
  });

  it('writes a 3MF with one object per part plus an assembly', () => {
    const parts: Part[] = [
      { name: 'Base', color: '#112233', mesh: tri },
      { name: 'Text & more', color: '#ff7a1a', mesh: tri },
    ];
    const files = unzipSync(to3MF(parts, 'Test'));
    const model = strFromU8(files['3D/3dmodel.model']);
    expect(files['[Content_Types].xml']).toBeDefined();
    expect(model.match(/<object /g)).toHaveLength(3);
    expect(model).toContain('Text &#38; more');
    expect(model).toContain('displaycolor="#FF7A1AFF"');
    expect(partsToSTL(parts).length).toBe(84 + 2 * 50);
  });
});
