// SPDX-License-Identifier: AGPL-3.0-or-later
// Reads the OpenSCAD Customizer comments, so a script's settings become sliders and switches.

export type ScadValue = number | string | boolean;

export interface ScadParam {
  name: string;
  type: 'number' | 'string' | 'boolean';
  value: ScadValue;
  section: string;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  /** Fixed choices: [value, label]. */
  options?: [ScadValue, string][];
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function parseValue(raw: string): { type: ScadParam['type']; value: ScadValue } | undefined {
  const v = raw.trim();
  if (v === 'true' || v === 'false') return { type: 'boolean', value: v === 'true' };
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(v)) return { type: 'number', value: Number(v) };
  const m = /^"((?:[^"\\]|\\.)*)"$/.exec(v);
  if (m) return { type: 'string', value: m[1].replace(/\\(.)/g, '$1') };
  return undefined; // vectors and expressions are left to the script itself
}

/** What the comment after a setting says about its range or choices. */
function applyHint(p: ScadParam, hint: string): void {
  const body = /^\s*\[(.*)\]\s*$/.exec(hint)?.[1];
  if (body === undefined) return;
  const isRange = /^\s*[-+\d.]+(\s*:\s*[-+\d.]+){0,2}\s*$/.test(body);
  if (isRange && p.type === 'number') {
    const parts = body.split(':').map(Number);
    if (parts.length === 1) {
      p.min = 0;
      p.max = parts[0];
    } else if (parts.length === 2) {
      [p.min, p.max] = parts;
    } else {
      [p.min, p.step, p.max] = parts;
    }
    return;
  }
  const options: [ScadValue, string][] = [];
  for (const item of body.split(',')) {
    const colon = item.indexOf(':');
    const rawValue = (colon >= 0 ? item.slice(0, colon) : item).trim();
    const label = (colon >= 0 ? item.slice(colon + 1) : item).trim();
    if (!rawValue) continue;
    options.push([p.type === 'number' ? Number(rawValue) : rawValue, label]);
  }
  if (options.length && options.every(([v]) => typeof v !== 'number' || Number.isFinite(v))) p.options = options;
}

/**
 * Finds the settings at the top of a script. As in OpenSCAD, they end at the first module or
 * function, and anything in a "Hidden" section stays out of the panel.
 */
export function parseScadParams(source: string): ScadParam[] {
  const params: ScadParam[] = [];
  let section = '';
  let previousComment = '';
  let inBlock = false;
  for (const line of source.split(/\r?\n/)) {
    const t = line.trim();
    if (inBlock) {
      if (t.includes('*/')) inBlock = false;
      continue;
    }
    const heading = /^\/\*\s*\[([^\]]*)\]\s*\*\/$/.exec(t);
    if (heading) {
      section = heading[1].trim();
      previousComment = '';
      continue;
    }
    if (t.startsWith('/*')) {
      if (!t.includes('*/')) inBlock = true;
      continue;
    }
    if (t.startsWith('//')) {
      previousComment = t.replace(/^\/\/+\s*/, '');
      continue;
    }
    if (!t) {
      previousComment = '';
      continue;
    }
    if (/^(module|function)\b/.test(t)) break;
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?);\s*(?:\/\/(.*))?$/.exec(t);
    if (m && section.toLowerCase() !== 'hidden') {
      const parsed = parseValue(m[2]);
      if (parsed) {
        const param: ScadParam = { name: m[1], ...parsed, section, label: previousComment || m[1].replace(/_/g, ' ') };
        if (m[3]) applyHint(param, m[3]);
        params.push(param);
      }
    }
    previousComment = '';
  }
  return params;
}

/** Command-line overrides for OpenSCAD. Only well-formed names get through, and strings are quoted safely. */
export function toDefines(params: ScadParam[], values: Record<string, ScadValue>): string[] {
  const args: string[] = [];
  for (const p of params) {
    if (!NAME.test(p.name)) continue;
    const v = values[p.name] ?? p.value;
    let text: string;
    if (p.type === 'string') text = JSON.stringify(String(v));
    else if (p.type === 'boolean') text = v === true || v === 'true' ? 'true' : 'false';
    else {
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      text = String(n);
    }
    args.push('-D', `${p.name}=${text}`);
  }
  return args;
}

/** Example scripts, written for Extruda. */
export const SCAD_EXAMPLES: { id: string; name: readonly [string, string]; source: string }[] = [
  {
    id: 'tray',
    name: ['Rounded tray', 'Заоблена тавичка'],
    source: `/* [Size] */
// Inside width
width = 80; // [20:1:200]
// Inside depth
depth = 50; // [20:1:200]
// Inside height
height = 20; // [5:1:80]

/* [Walls] */
// Wall thickness
wall = 2; // [0.8:0.2:5]
// Corner radius
radius = 6; // [1:0.5:20]
// Split the tray in two
divider = true;

/* [Hidden] */
$fn = 64;

module rounded(w, d, h, r) {
  linear_extrude(h) offset(r) square([w - 2 * r, d - 2 * r], center = true);
}

difference() {
  rounded(width + 2 * wall, depth + 2 * wall, height + wall, radius + wall);
  translate([0, 0, wall]) rounded(width, depth, height + 1, radius);
}
if (divider) translate([-wall / 2, -depth / 2 - 0.1, 0]) cube([wall, depth + 0.2, height * 0.8 + wall]);
`,
  },
  {
    id: 'vase',
    name: ['Twisted vase', 'Усукана ваза'],
    source: `// Height of the vase
height = 120; // [40:5:250]
// Radius at the base
radius = 35; // [15:1:80]
// Number of lobes
lobes = 5; // [3, 4, 5, 6, 8, 12]
// How deep the lobes are
depth = 6; // [1:0.5:15]
// Degrees of twist
twist = 90; // [0:5:360]

/* [Hidden] */
$fn = 180;

module outline() {
  polygon([for (i = [0 : 359]) let (r = radius + depth * cos(i * lobes)) [r * cos(i), r * sin(i)]]);
}

// Print in vase mode (spiral outer contour)
linear_extrude(height = height, twist = twist, slices = height / 2, scale = 1.15) outline();
`,
  },
  {
    id: 'peg',
    name: ['Shelf bracket', 'Конзола за рафт'],
    source: `// Depth of the shelf
reach = 80; // [30:5:200]
// Height against the wall
drop = 80; // [30:5:200]
// Bracket width
width = 20; // [10:1:50]
// Arm thickness
thickness = 6; // [3:0.5:15]
// Screw hole diameter
screw = 4; // [2:0.5:8]

/* [Hidden] */
$fn = 48;

// Prints on its side, so the layers run along the arms.
difference() {
  linear_extrude(width) polygon([
    [0, 0], [reach, 0], [reach, thickness], [thickness * 2, thickness],
    [thickness, thickness * 2], [thickness, drop], [0, drop],
  ]);
  for (z = [drop * 0.5, drop * 0.85])
    translate([-1, z, width / 2]) rotate([0, 90, 0]) cylinder(h = thickness + 2, d = screw);
  for (x = [reach * 0.5, reach * 0.85])
    translate([x, -1, width / 2]) rotate([-90, 0, 0]) cylinder(h = thickness + 2, d = screw);
}
`,
  },
];
