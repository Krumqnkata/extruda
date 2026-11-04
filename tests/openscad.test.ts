// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { weldVertices, parseMesh } from '../src/core/loadMesh';
import { meshStats } from '../src/core/mesh';
import { analyzeMesh } from '../src/core/meshcheck';
import { renderScad } from '../src/core/openscad';
import { parseScadParams, SCAD_EXAMPLES, toDefines } from '../src/core/scad';

const SOURCE = `
// A plain number
plain = 5;
// With a range
ranged = 10; // [2:50]
stepped = 1.5; // [0.5:0.25:4]
upper = 7; // [20]
/* [Shape] */
flag = true;
name = "Иван \\"И\\"";
choice = 3; // [1, 3, 5]
labelled = 2; // [1:Small, 2:Big]
word = "a"; // [a:Alpha, b:Beta]
vector = [1, 2, 3];
sum = plain + 1;
/* [Hidden] */
secret = 1;
/* [Back] */
module thing() {}
after_module = 1;
`;

describe('Customizer comments', () => {
  const params = parseScadParams(SOURCE);
  const get = (n: string) => params.find((p) => p.name === n)!;

  it('reads values, labels and sections', () => {
    expect(get('plain')).toMatchObject({ type: 'number', value: 5, label: 'A plain number', section: '' });
    expect(get('flag')).toMatchObject({ type: 'boolean', value: true, section: 'Shape' });
    expect(get('name').value).toBe('Иван "И"');
  });

  it('understands ranges and choices', () => {
    expect(get('ranged')).toMatchObject({ min: 2, max: 50 });
    expect(get('stepped')).toMatchObject({ min: 0.5, step: 0.25, max: 4 });
    expect(get('upper')).toMatchObject({ min: 0, max: 20 });
    expect(get('choice').options).toEqual([[1, '1'], [3, '3'], [5, '5']]);
    expect(get('labelled').options).toEqual([[1, 'Small'], [2, 'Big']]);
    expect(get('word').options).toEqual([['a', 'Alpha'], ['b', 'Beta']]);
  });

  it('skips what cannot be a simple setting, hidden values and everything after a module', () => {
    const names = params.map((p) => p.name);
    for (const gone of ['vector', 'sum', 'secret', 'after_module']) expect(names).not.toContain(gone);
  });

  it('builds safe overrides, keeping quotes inside strings from ending the value', () => {
    const args = toDefines(parseScadParams('title = "x";\nsize = 1;\nok = true;'), { title: 'a"; evil(); b="', size: 2, ok: false });
    expect(args).toEqual(['-D', 'title="a\\"; evil(); b=\\""', '-D', 'size=2', '-D', 'ok=false']);
  });

  it('ignores a value that is not a number', () => {
    expect(toDefines(parseScadParams('size = 1;'), { size: 'x; evil()' })).toEqual([]);
  });

  it('every example has settings', () => {
    for (const e of SCAD_EXAMPLES) expect(parseScadParams(e.source).length, e.id).toBeGreaterThan(2);
  });
});

describe('OpenSCAD engine', () => {
  const toMesh = (stl: string) => weldVertices(parseMesh(new TextEncoder().encode(stl).buffer as ArrayBuffer, 'm.stl'));

  it('renders a closed model and applies overrides', async () => {
    const source = 'size = 10;\ncube([size, size, 2]);';
    const plain = await renderScad(source, []);
    expect(meshStats(toMesh(plain.stl!)).size).toEqual([10, 10, 2]);
    const bigger = await renderScad(source, toDefines(parseScadParams(source), { size: 25 }));
    expect(meshStats(toMesh(bigger.stl!)).size).toEqual([25, 25, 2]);
  });

  it('a string override cannot add code to the script', async () => {
    const source = 'label = "x";\ncube(len(label) == 1 ? 5 : 9);';
    const r = await renderScad(source, toDefines(parseScadParams(source), { label: '"; cube(100); x="' }));
    expect(meshStats(toMesh(r.stl!)).size[0]).toBe(9);
  });

  it('reports errors instead of returning a model', async () => {
    const r = await renderScad('cube(', []);
    expect(r.stl).toBeUndefined();
    expect(r.log.join('\n')).toMatch(/error/i);
  });

  it('returns nothing for a script with no geometry', async () => {
    expect((await renderScad('x = 1;', [])).stl).toBeUndefined();
  });

  for (const e of SCAD_EXAMPLES) {
    it(`example "${e.id}" builds a closed solid`, async () => {
      const r = await renderScad(e.source, []);
      expect(r.stl, r.log.join('\n')).toBeDefined();
      expect(analyzeMesh(toMesh(r.stl!)).closed).toBe(true);
    });
  }
});
