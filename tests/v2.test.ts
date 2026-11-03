// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeAll, describe, expect, it } from 'vitest';
import { CUTTER_DEFAULTS, cutterParts, LOGO_DEFAULTS, logoParts, STENCIL_DEFAULTS, stencilCut, stencilParts } from '../src/core/art';
import { BOX_DEFAULTS, boxParts } from '../src/core/box';
import { spoolRemaining } from '../src/core/calc';
import { insertChanges, layersAtHeights, parseGcode } from '../src/core/gcode';
import { BASEPLATE_DEFAULTS, baseplateParts, BIN_DEFAULTS, binParts, planBaseplate } from '../src/core/gridfinity';
import { arrangeOnPlates, packPlates } from '../src/core/layout';
import { build } from '../src/core/manifold';
import { meshStats, mergeMeshes, type Part } from '../src/core/mesh';
import { KEYCHAIN_DEFAULTS, keychainParts } from '../src/core/models';
import {
  BRIDGE_DEFAULTS, bridgeParts, OVERHANG_DEFAULTS, overhangParts, SWATCH_DEFAULTS, swatchParts, TOLERANCE_DEFAULTS, toleranceParts,
} from '../src/core/printer';
import { ICON_IDS, iconPolygons } from '../src/core/shapes';
import { decodeState, encodeState, parseHash } from '../src/core/share';
import { loadFont } from '../src/core/text';
import { traceImage } from '../src/core/trace';
import { isWatertight, useDiskFonts } from './helpers';

beforeAll(useDiskFonts);

const stats = (parts: Part[]) => meshStats(mergeMeshes(parts.map((p) => p.mesh)));
const closed = (parts: Part[]) => parts.every((p) => isWatertight(p.mesh));

describe('icons and keychain icons', () => {
  it('every built-in icon is a valid, non-empty shape', async () => {
    for (const id of ICON_IDS) {
      const area = await build((m) => m.CrossSection.ofPolygons(iconPolygons(id, 20), 'NonZero').area());
      expect(area, id).toBeGreaterThan(20);
    }
  });

  it('adds an icon before the name and stays closed', async () => {
    const font = await loadFont('russo');
    const plain = await build((m) => keychainParts(m, font, { ...KEYCHAIN_DEFAULTS, text: 'Ivo' }));
    const withIcon = await build((m) => keychainParts(m, font, { ...KEYCHAIN_DEFAULTS, text: 'Ivo', icon: 'heart' }));
    expect(closed(withIcon)).toBe(true);
    expect(stats(withIcon).size[0]).toBeGreaterThan(stats(plain).size[0] + 10);
  });

  it('works with only an icon and no text', async () => {
    const font = await loadFont('russo');
    const parts = await build((m) => keychainParts(m, font, { ...KEYCHAIN_DEFAULTS, text: '', icon: 'paw' }));
    expect(parts).toHaveLength(2);
    expect(closed(parts)).toBe(true);
  });
});

describe('logo, stencil, cutter', () => {
  it('keeps one part per visible colour and removes hidden overlaps', async () => {
    const parts = await build((m) => {
      const red = m.CrossSection.square([30, 30], true);
      const blue = m.CrossSection.circle(8, 48);
      return logoParts(m, [{ color: '#ff0000', cs: red }, { color: '#0000ff', cs: blue }], LOGO_DEFAULTS);
    });
    expect(parts.map((p) => p.name)).toEqual(['Base', 'Colour 1 #ff0000', 'Colour 2 #0000ff']);
    expect(closed(parts)).toBe(true);
    const redVol = meshStats(parts[1].mesh).volume;
    expect(redVol).toBeCloseTo((900 - Math.PI * 64) * LOGO_DEFAULTS.relief, -1);
  });

  it('bridges letter counters so the stencil stays in one piece', async () => {
    const font = await loadFont('russo');
    const { textToPolygons, centerShape } = await import('../src/core/text');
    const pieces = await build((m) => {
      const shape = centerShape(textToPolygons(font, 'ОРБА 08', { height: 20 }));
      const art = m.CrossSection.ofPolygons(shape.polygons, 'NonZero');
      const b = art.bounds();
      const plate = m.CrossSection.square([b.max[0] - b.min[0] + 20, b.max[1] - b.min[1] + 20], true);
      return {
        bridged: plate.subtract(stencilCut(m, art, 1.6)).decompose().length,
        naive: plate.subtract(art).decompose().length,
      };
    });
    expect(pieces.naive).toBeGreaterThan(1);
    expect(pieces.bridged).toBe(1);
    const parts = await build((m) => {
      const shape = centerShape(textToPolygons(font, 'ABO', { height: 20 }));
      return stencilParts(m, m.CrossSection.ofPolygons(shape.polygons, 'NonZero'), STENCIL_DEFAULTS);
    });
    expect(closed(parts)).toBe(true);
  });

  it('builds a cookie cutter and a fitting stamp', async () => {
    const parts = await build((m) =>
      cutterParts(m, m.CrossSection.ofPolygons(iconPolygons('star', 10), 'NonZero'), { ...CUTTER_DEFAULTS, stamp: true }),
    );
    expect(parts.map((p) => p.name)).toEqual(['Cutter', 'Stamp']);
    expect(closed(parts)).toBe(true);
    const cutter = meshStats(parts[0].mesh);
    expect(cutter.size[2]).toBeCloseTo(CUTTER_DEFAULTS.height, 3);
    expect(Math.max(cutter.size[0], cutter.size[1])).toBeGreaterThan(CUTTER_DEFAULTS.size);
    const stamp = meshStats(parts[1].mesh);
    expect(Math.max(stamp.size[0], stamp.size[1])).toBeLessThan(CUTTER_DEFAULTS.size);
  });
});

describe('gridfinity', () => {
  it('builds a 1x1x3 bin to spec', async () => {
    const parts = await build((m) => binParts(m, { ...BIN_DEFAULTS, gx: 1, gy: 1, units: 3, lip: false, dividersX: 0, label: false }));
    expect(closed(parts)).toBe(true);
    const s = stats(parts);
    expect(s.size[0]).toBeCloseTo(41.5, 3);
    expect(s.size[1]).toBeCloseTo(41.5, 3);
    expect(s.size[2]).toBeCloseTo(21, 3);
    expect(s.min[2]).toBeCloseTo(0, 5);
  });

  it('adds the stacking lip, dividers, label and magnet holes', async () => {
    const parts = await build((m) => binParts(m, BIN_DEFAULTS));
    expect(closed(parts)).toBe(true);
    const s = stats(parts);
    expect(s.size[0]).toBeCloseTo(83.5, 3);
    expect(s.size[2]).toBeCloseTo(21 + 4.4 - 0.25, 3);
  });

  it('plans a baseplate for a drawer and splits it for the bed', () => {
    const plan = planBaseplate({ ...BASEPLATE_DEFAULTS, drawerW: 400, drawerD: 130, bedW: 256, bedD: 256 });
    expect(plan.gx).toBe(9);
    expect(plan.gy).toBe(3);
    expect(plan.splitX.reduce((a, b) => a + b, 0)).toBe(9);
    expect(plan.splitX.length).toBe(2);
    expect(plan.padX).toBeCloseTo((400 - 0.5 - 9 * 42) / 2, 6);
  });

  it('builds closed baseplate pieces that fit the drawer', async () => {
    const p = { ...BASEPLATE_DEFAULTS, drawerW: 130, drawerD: 90 };
    const parts = await build((m) => baseplateParts(m, p));
    expect(parts).toHaveLength(1);
    expect(closed(parts)).toBe(true);
    const s = stats(parts);
    expect(s.size[0]).toBeCloseTo(129.5, 3);
    expect(s.size[1]).toBeCloseTo(89.5, 3);
    expect(s.size[2]).toBeCloseTo(4.65, 3);
  });
});

describe('box with lid', () => {
  for (const lid of ['slip', 'inset', 'slide', 'none'] as const) {
    it(`builds a closed box with a ${lid} lid`, async () => {
      const font = await loadFont('russo');
      const parts = await build((m) => boxParts(m, font, { ...BOX_DEFAULTS, lid, textStyle: 'inlay' }));
      expect(closed(parts)).toBe(true);
      expect(parts[0].group).toBe('Box');
      if (lid !== 'none') expect(parts.some((p) => p.name === 'Lid')).toBe(true);
    });
  }

  it('leaves exactly the chosen clearance around a slip lid', async () => {
    const font = await loadFont('russo');
    const parts = await build((m) => boxParts(m, font, { ...BOX_DEFAULTS, lid: 'slip', lidText: '' }));
    const box = meshStats(parts[0].mesh);
    const lid = meshStats(parts[1].mesh);
    const o = BOX_DEFAULTS.clearance + 1.6;
    expect(lid.size[0]).toBeCloseTo(box.size[0] + 2 * o, 3);
  });
});

describe('calibration prints and swatches', () => {
  it('builds all calibration prints', async () => {
    const font = await loadFont('russo');
    const sets = await build((m) => [toleranceParts(m, font, TOLERANCE_DEFAULTS), overhangParts(m, font, OVERHANG_DEFAULTS), bridgeParts(m, font, BRIDGE_DEFAULTS)]);
    for (const parts of sets) {
      expect(parts.length).toBeGreaterThan(0);
      expect(closed(parts)).toBe(true);
      expect(stats(parts).min[2]).toBeCloseTo(0, 5);
    }
  });

  it('builds a swatch with steps and text', async () => {
    const font = await loadFont('russo');
    for (const textStyle of ['engraved', 'raised'] as const) {
      const parts = await build((m) => swatchParts(m, font, { ...SWATCH_DEFAULTS, textStyle }));
      expect(closed(parts)).toBe(true);
      expect(stats(parts).size[0]).toBeCloseTo(SWATCH_DEFAULTS.width, 3);
    }
  });
});

describe('plate layout', () => {
  it('packs boxes without overlap inside the bed, spilling onto new plates', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({ w: 40 + (i % 3) * 10, h: 20 + (i % 4) * 5 }));
    const places = packPlates(items, 180, 180, 4);
    const plates = Math.max(...places.map((p) => p.plate)) + 1;
    expect(plates).toBeGreaterThan(1);
    for (let i = 0; i < items.length; i++) {
      const a = places[i];
      expect(a.x + items[i].w).toBeLessThanOrEqual(180);
      expect(a.y + items[i].h).toBeLessThanOrEqual(180);
      for (let j = i + 1; j < items.length; j++) {
        const b = places[j];
        if (a.plate !== b.plate) continue;
        const overlap = a.x < b.x + items[j].w && b.x < a.x + items[i].w && a.y < b.y + items[j].h && b.y < a.y + items[i].h;
        expect(overlap).toBe(false);
      }
    }
  });

  it('moves model meshes onto the plate', async () => {
    const font = await loadFont('russo');
    const models = await build((m) => ['A', 'Б', 'C'].map((text) => ({ name: text, parts: keychainParts(m, font, { ...KEYCHAIN_DEFAULTS, text }) })));
    const plates = arrangeOnPlates(models, 256, 256, 5);
    expect(plates).toHaveLength(1);
    for (const model of plates[0]) {
      const s = stats(model.parts);
      expect(s.min[0]).toBeGreaterThanOrEqual(4.99);
      expect(s.min[1]).toBeGreaterThanOrEqual(4.99);
    }
  });
});

describe('g-code', () => {
  const prusa = [
    '; generated by PrusaSlicer',
    'G28',
    ';LAYER_CHANGE', ';Z:0.2', 'G1 Z0.2', 'G1 X1 E1',
    ';LAYER_CHANGE', ';Z:0.4', 'G1 Z0.4', 'G1 X2 E1',
    ';LAYER_CHANGE', ';Z:0.6', 'G1 Z0.6', 'G1 X3 E1',
    '; filament used [g] = 3.21',
    '; estimated printing time (normal mode) = 12m 3s',
  ];

  it('finds PrusaSlicer layers and stats', () => {
    const info = parseGcode(prusa);
    expect(info.slicer).toBe('prusa');
    expect(info.layers.map((l) => l.z)).toEqual([0.2, 0.4, 0.6]);
    expect(info.filament).toBe('3.21');
    expect(info.time).toBe('12m 3s');
  });

  it('finds Cura and Bambu layers', () => {
    const cura = parseGcode([';TIME:3720', ';LAYER:0', 'G0 F600 X1 Y1 Z0.3', ';LAYER:1', 'G0 X1 Z0.5']);
    expect(cura.slicer).toBe('cura');
    expect(cura.layers.map((l) => l.z)).toEqual([0.3, 0.5]);
    expect(cura.time).toBe('1h 2m');
    const bambu = parseGcode(['; CHANGE_LAYER', '; Z_HEIGHT: 0.2', '; CHANGE_LAYER', '; Z_HEIGHT: 0.4']);
    expect(bambu.slicer).toBe('bambu');
    expect(bambu.layers.map((l) => l.z)).toEqual([0.2, 0.4]);
  });

  it('inserts M600 right before the chosen layer and changes nothing else', () => {
    const info = parseGcode(prusa);
    // Z is the top of a layer: changing "at 0.2 mm" must keep the 0.2 layer in the old colour.
    expect(layersAtHeights(info, [0.2]).map((l) => l.z)).toEqual([0.4]);
    const layers = layersAtHeights(info, [0.35]);
    expect(layers.map((l) => l.z)).toEqual([0.4]);
    const out = insertChanges(prusa, layers, 'M600', 'Text colour');
    const at = out.indexOf('M600');
    expect(out[at + 1]).toBe(';LAYER_CHANGE');
    expect(out[at + 2]).toBe(';Z:0.4');
    expect(out.filter((l) => !l.startsWith('; Extruda') && l !== 'M600' && !l.startsWith('M117'))).toEqual(prusa);
  });
});

describe('share links, trace, spool', () => {
  it('round-trips settings with Cyrillic and drops private keys', () => {
    const state = { text: 'Мария 💖', size: 12, password: 'secret', ok: true };
    const encoded = encodeState(state, ['password']);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = decodeState(encoded, { text: '', size: 0, password: '', ok: false });
    expect(back).toEqual({ text: 'Мария 💖', size: 12, ok: true });
    expect(decodeState('%%%', { a: 1 })).toEqual({});
    expect(parseHash('#/keychain?s=abc').path).toBe('keychain');
    expect(parseHash('#/models/phone-stand?s=abc').params.get('s')).toBe('abc');
  });

  it('traces a black square on white into one square contour', () => {
    const w = 40, h = 30;
    const data = new Float32Array(w * h).fill(1);
    for (let y = 10; y < 20; y++) for (let x = 5; x < 25; x++) data[y * w + x] = 0;
    const loops = traceImage({ width: w, height: h, data });
    expect(loops).toHaveLength(1);
    expect(loops[0].length).toBeLessThanOrEqual(8);
    const xs = loops[0].map((p) => p[0]), ys = loops[0].map((p) => p[1]);
    // Within a pixel: corners are cut diagonally by marching squares.
    expect(Math.abs(Math.max(...xs) - Math.min(...xs) - 20)).toBeLessThan(1);
    expect(Math.abs(Math.max(...ys) - Math.min(...ys) - 10)).toBeLessThan(1);
  });

  it('works out the filament left on a spool', () => {
    const r = spoolRemaining(1100, 250, 300, 1.75, 1.24);
    expect(r.grams).toBe(850);
    expect(r.spare).toBe(550);
    expect(r.meters).toBeCloseTo(285, 0);
  });
});
