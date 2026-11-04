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

export interface ToolPath {
  /** Two xyz points per extruding segment. */
  positions: Float32Array;
  /** For each layer, how many segments exist up to and including it. */
  layerEnds: Uint32Array;
  /** True when a very large file was cut short to keep the preview responsive. */
  truncated: boolean;
}

const MAX_SEGMENTS = 3_000_000;
const WORD = /([XYZEIJ])(-?\d*\.?\d+)/g;

/** Reads the extruding moves of a print, split by layer, including arcs (G2/G3). */
export function parseToolPath(lines: string[], layers: Layer[]): ToolPath {
  let buffer = new Float32Array(Math.min(lines.length, MAX_SEGMENTS) * 6 + 6 * 512);
  let n = 0;
  let x = 0, y = 0, z = 0, e = 0;
  let relPos = false, relE = false, modeRelE = false;
  let truncated = false;
  const ends = new Uint32Array(Math.max(1, layers.length));
  let layer = 0;
  let nextMarker = layers.length ? layers[0].line : Infinity;

  const push = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => {
    if (n >= MAX_SEGMENTS) {
      truncated = true;
      return;
    }
    if ((n + 1) * 6 > buffer.length) {
      const bigger = new Float32Array(buffer.length * 2);
      bigger.set(buffer);
      buffer = bigger;
    }
    buffer.set([x1, y1, z1, x2, y2, z2], n * 6);
    n++;
  };

  for (let i = 0; i < lines.length; i++) {
    while (i >= nextMarker) {
      // Moves before a marker belong to the layer before it.
      if (layer < layers.length && i === layers[layer].line && layer > 0) ends[layer - 1] = n;
      layer++;
      nextMarker = layer < layers.length ? layers[layer].line : Infinity;
    }
    const raw = lines[i];
    const c0 = raw.charCodeAt(0);
    if (c0 !== 71 && c0 !== 77) continue; // only G and M words
    const semi = raw.indexOf(';');
    const line = semi >= 0 ? raw.slice(0, semi) : raw;
    const cmd = line.split(/\s+/, 1)[0];
    if (cmd === 'G90') {
      relPos = false;
      relE = modeRelE;
    } else if (cmd === 'G91') {
      relPos = true;
      relE = true;
    } else if (cmd === 'M82') {
      relE = modeRelE = false;
    } else if (cmd === 'M83') {
      relE = modeRelE = true;
    } else if (cmd === 'G92') {
      for (const m of line.matchAll(WORD)) {
        const v = Number(m[2]);
        if (m[1] === 'E') e = v;
        else if (m[1] === 'X') x = v;
        else if (m[1] === 'Y') y = v;
        else if (m[1] === 'Z') z = v;
      }
    } else if (cmd === 'G0' || cmd === 'G1' || cmd === 'G2' || cmd === 'G3' || cmd === 'G00' || cmd === 'G01' || cmd === 'G02' || cmd === 'G03') {
      let nx = x, ny = y, nz = z, ne: number | undefined, ci = 0, cj = 0;
      for (const m of line.matchAll(WORD)) {
        const v = Number(m[2]);
        switch (m[1]) {
          case 'X': nx = relPos ? x + v : v; break;
          case 'Y': ny = relPos ? y + v : v; break;
          case 'Z': nz = relPos ? z + v : v; break;
          case 'E': ne = v; break;
          case 'I': ci = v; break;
          case 'J': cj = v; break;
        }
      }
      const de = ne === undefined ? 0 : relE ? ne : ne - e;
      if (ne !== undefined) e = relE ? e + ne : ne;
      const extrudes = de > 1e-6;
      const isArc = cmd === 'G2' || cmd === 'G3' || cmd === 'G02' || cmd === 'G03';
      if (extrudes && isArc && (ci !== 0 || cj !== 0)) {
        const cx = x + ci, cy = y + cj, r = Math.hypot(ci, cj);
        const a0 = Math.atan2(y - cy, x - cx);
        let a1 = Math.atan2(ny - cy, nx - cx);
        const ccw = cmd === 'G3' || cmd === 'G03';
        if (ccw && a1 <= a0) a1 += Math.PI * 2;
        if (!ccw && a1 >= a0) a1 -= Math.PI * 2;
        const steps = Math.max(2, Math.min(64, Math.ceil(Math.abs(a1 - a0) * r)));
        let px = x, py = y, pz = z;
        for (let k = 1; k <= steps; k++) {
          const f = k / steps;
          const a = a0 + (a1 - a0) * f;
          const qx = k === steps ? nx : cx + r * Math.cos(a), qy = k === steps ? ny : cy + r * Math.sin(a), qz = z + (nz - z) * f;
          push(px, py, pz, qx, qy, qz);
          px = qx; py = qy; pz = qz;
        }
      } else if (extrudes && (nx !== x || ny !== y)) {
        push(x, y, z, nx, ny, nz);
      }
      x = nx; y = ny; z = nz;
    }
  }
  // Everything after the last marker is the last layer.
  for (let l = 0; l < ends.length; l++) if (ends[l] === 0 && l >= layer - 1) ends[l] = n;
  ends[ends.length - 1] = n;
  return { positions: buffer.slice(0, n * 6), layerEnds: ends, truncated };
}
