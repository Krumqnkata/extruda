// SPDX-License-Identifier: AGPL-3.0-or-later
// Reads slicer G-code layer markers and inserts filament-change commands.

export interface Layer {
  index: number;
  z: number;
  /** Line number of the layer marker; inserted commands go right before it. */
  line: number;
}

export interface GcodeInfo {
  slicer: 'prusa' | 'cura' | 'bambu' | 'unknown';
  layers: Layer[];
  time?: string;
  filament?: string;
}

const Z_MOVE = /^G[01]\b[^;]*\bZ(-?\d*\.?\d+)/;

function nextZ(lines: string[], from: number): number | undefined {
  for (let i = from; i < Math.min(lines.length, from + 400); i++) {
    const l = lines[i];
    let m = /^;\s*Z(?:_HEIGHT)?\s*:\s*(-?\d*\.?\d+)/.exec(l);
    if (m) return Number(m[1]);
    m = Z_MOVE.exec(l);
    if (m) return Number(m[1]);
  }
  return undefined;
}

export function parseGcode(lines: string[]): GcodeInfo {
  let slicer: GcodeInfo['slicer'] = 'unknown';
  const layers: Layer[] = [];
  let time: string | undefined;
  let filament: string | undefined;
  let lastZ = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l[0] !== ';') continue;
    let marker = false;
    if (l.startsWith(';LAYER_CHANGE')) {
      slicer = 'prusa';
      marker = true;
    } else if (/^; CHANGE_LAYER/.test(l)) {
      slicer = 'bambu';
      marker = true;
    } else if (/^;LAYER:-?\d+/.test(l)) {
      slicer = 'cura';
      marker = true;
    } else if (!time) {
      const t =
        /^;\s*estimated printing time \(normal mode\)\s*=\s*(.+)$/.exec(l) ??
        /^;\s*total estimated time:\s*(.+)$/i.exec(l) ??
        /^;\s*model printing time:\s*([^;]+)/i.exec(l);
      if (t) time = t[1].trim();
      const c = /^;TIME:(\d+)/.exec(l);
      if (c) {
        const s = Number(c[1]);
        time = `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
      }
    }
    if (!filament) {
      const f =
        /^;\s*(?:total )?filament used \[g\]\s*[=:]\s*(.+)$/i.exec(l) ??
        /^;\s*total filament weight \[g\]\s*:\s*(.+)$/i.exec(l) ??
        /^;Filament used:\s*(.+)$/.exec(l);
      if (f) filament = f[1].trim();
    }
    if (marker) {
      const z = nextZ(lines, i + 1) ?? lastZ;
      lastZ = z;
      layers.push({ index: layers.length, z, line: i });
    }
  }
  return { slicer, layers, time, filament };
}

export type ChangeCommand = 'M600' | 'PAUSE' | 'M601' | 'M0';

export function commandLines(cmd: ChangeCommand, message: string, z: number): string[] {
  const note = `; Extruda: filament change at Z=${z.toFixed(2)}`;
  const msg = message.trim().replace(/[\r\n;]/g, ' ');
  const out = [note];
  if (msg) out.push(`M117 ${msg}`);
  if (cmd === 'M0') out.push(msg ? `M0 ${msg}` : 'M0');
  else out.push(cmd);
  return out;
}

/**
 * The first layer printed above each height (in mm), without duplicates. A layer's Z is its top,
 * so with a 3 mm base the layer at Z = 3.0 is still base and the change goes before Z = 3.2.
 */
export function layersAtHeights(info: GcodeInfo, heights: number[]): Layer[] {
  const out: Layer[] = [];
  for (const h of heights) {
    const layer = info.layers.find((l) => l.z > h + 1e-6);
    if (layer && !out.includes(layer)) out.push(layer);
  }
  return out.sort((a, b) => a.line - b.line);
}

/** Inserts the change command before each chosen layer marker; all other lines stay untouched. */
export function insertChanges(lines: string[], layers: Layer[], cmd: ChangeCommand, message: string): string[] {
  const at = new Map(layers.map((l) => [l.line, l]));
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const layer = at.get(i);
    if (layer) out.push(...commandLines(cmd, message, layer.z));
    out.push(lines[i]);
  }
  return out;
}
