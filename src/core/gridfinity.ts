// SPDX-License-Identifier: AGPL-3.0-or-later
// Gridfinity bins and baseplates. Dimensions follow the spec as implemented by Gridfinity Rebuilt:
// 42 mm pitch, 41.5 mm bin footprint, 7 mm height units, base profile 0.8/1.8/2.15,
// stacking lip 0.7/1.8/1.9, magnet holes Ø6.5 × 2.4 mm, 8 mm from the cell edge.
import type { Manifold, ManifoldToplevel, Vec3 } from 'manifold-3d';
import { toTriMesh } from './manifold';
import type { Part } from './mesh';

export const PITCH = 42;
export const UNIT = 7;
const GAP = 0.5;
const BIN_R = 3.75;
const PLATE_R = 4;
const FOOT_H = 0.8 + 1.8 + 2.15; // 4.75
const LIP = { depth: 2.6, h: 0.7 + 1.8 + 1.9 }; // 4.4 mm tall, 2.6 mm deep
const PLATE_H = 0.7 + 1.8 + 2.15; // 4.65
const MAGNET = { r: 6.5 / 2, depth: 2.4, offset: PITCH / 2 - 8 };

/** Points of a rounded rectangle (w × d, radius r) shrunk by `inset`, at height z. */
function rr(w: number, d: number, r: number, inset: number, z: number, n = 10): Vec3[] {
  const W = w / 2 - inset, D = d / 2 - inset;
  const R = Math.max(0.05, Math.min(r - inset, W, D));
  const pts: Vec3[] = [];
  const corners: [number, number, number][] = [
    [W - R, D - R, 0],
    [-(W - R), D - R, 90],
    [-(W - R), -(D - R), 180],
    [W - R, -(D - R), 270],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= n; i++) {
      const a = ((a0 + (i / n) * 90) * Math.PI) / 180;
      pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a), z]);
    }
  }
  return pts;
}

interface Level {
  inset: number;
  z: number;
}

/** A stack of 45° and vertical sections, each the convex hull of two rounded rectangles. */
function profile(m: ManifoldToplevel, w: number, d: number, r: number, levels: Level[]): Manifold {
  const parts: Manifold[] = [];
  for (let i = 0; i < levels.length - 1; i++) {
    const a = levels[i], b = levels[i + 1];
    parts.push(m.Manifold.hull([...rr(w, d, r, a.inset, a.z), ...rr(w, d, r, b.inset, b.z)]));
  }
  return m.Manifold.union(parts);
}

function slab(m: ManifoldToplevel, w: number, d: number, r: number, z0: number, z1: number): Manifold {
  return profile(m, w, d, r, [{ inset: 0, z: z0 }, { inset: 0, z: z1 }]);
}

function cellCenters(gx: number, gy: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < gx; i++) for (let j = 0; j < gy; j++) out.push([(i - (gx - 1) / 2) * PITCH, (j - (gy - 1) / 2) * PITCH]);
  return out;
}

// ---------------------------------------------------------------- bin

export interface BinParams {
  gx: number;
  gy: number;
  units: number;
  lip: boolean;
  magnets: boolean;
  dividersX: number;
  dividersY: number;
  label: boolean;
  wall: number;
  color: string;
}

export const BIN_DEFAULTS: BinParams = {
  gx: 2,
  gy: 1,
  units: 3,
  lip: true,
  magnets: true,
  dividersX: 1,
  dividersY: 0,
  label: true,
  wall: 1.2,
  color: '#22c55e',
};

export function binParts(m: ManifoldToplevel, p: BinParams): Part[] {
  const { Manifold } = m;
  const gx = Math.max(1, Math.round(p.gx)), gy = Math.max(1, Math.round(p.gy));
  const W = gx * PITCH - GAP, D = gy * PITCH - GAP;
  const H = Math.max(2, p.units) * UNIT;
  const wall = Math.min(Math.max(p.wall, 0.8), LIP.depth);
  const foot = PITCH - GAP;

  const feet = cellCenters(gx, gy).map(([x, y]) =>
    profile(m, foot, foot, BIN_R, [
      { inset: 0.8 + 2.15, z: 0 },
      { inset: 2.15, z: 0.8 },
      { inset: 2.15, z: 0.8 + 1.8 },
      { inset: 0, z: FOOT_H },
    ]).translate([x, y, 0]),
  );
  const top = p.lip ? H + LIP.h - 0.25 : H;
  let bin = Manifold.union([...feet, slab(m, W, D, BIN_R, FOOT_H - 0.01, top)]);

  const floor = FOOT_H + 1.2;
  const cavity: Level[] = p.lip
    ? [
        { inset: wall, z: floor },
        { inset: wall, z: H - (LIP.depth - wall) },
        { inset: LIP.depth, z: H },
        { inset: LIP.depth - 0.7, z: H + 0.7 },
        { inset: LIP.depth - 0.7, z: H + 0.7 + 1.8 },
        { inset: 0.25, z: top },
        { inset: -0.75, z: top + 1 },
      ]
    : [
        { inset: wall, z: floor },
        { inset: wall, z: H + 1 },
      ];
  bin = bin.subtract(profile(m, W, D, BIN_R, cavity));

  // Dividers and the label shelf stop below the lip so stacked bins still seat.
  const innerTop = p.lip ? H - (LIP.depth - wall) : H;
  const extras: Manifold[] = [];
  const iw = W - 2 * wall + 0.2, id = D - 2 * wall + 0.2;
  for (let i = 1; i <= p.dividersX; i++) {
    const x = -W / 2 + wall + (i * (W - 2 * wall)) / (p.dividersX + 1);
    extras.push(Manifold.cube([1.2, id, innerTop - floor], true).translate([x, 0, (floor + innerTop) / 2]));
  }
  for (let j = 1; j <= p.dividersY; j++) {
    const y = -D / 2 + wall + (j * (D - 2 * wall)) / (p.dividersY + 1);
    extras.push(Manifold.cube([iw, 1.2, innerTop - floor], true).translate([0, y, (floor + innerTop) / 2]));
  }
  if (p.label) {
    const yb = D / 2 - wall + 0.1, x = W / 2 - wall + 0.1, tab = Math.min(12, D / 3);
    extras.push(
      Manifold.hull([
        [-x, yb, innerTop], [x, yb, innerTop],
        [-x, yb - tab, innerTop], [x, yb - tab, innerTop],
        [-x, yb, innerTop - tab], [x, yb, innerTop - tab],
      ]),
    );
  }
  if (extras.length) bin = bin.add(Manifold.union(extras));

  if (p.magnets) {
    const holes: Manifold[] = [];
    for (const [cx, cy] of cellCenters(gx, gy)) {
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        holes.push(Manifold.cylinder(MAGNET.depth + 0.01, MAGNET.r, MAGNET.r, 40).translate([cx + sx * MAGNET.offset, cy + sy * MAGNET.offset, -0.01]));
      }
    }
    bin = bin.subtract(Manifold.union(holes));
  }
  return [{ name: `Gridfinity bin ${gx}x${gy}x${p.units}`, color: p.color, mesh: toTriMesh(bin) }];
}

// ---------------------------------------------------------------- baseplate

export interface BaseplateParams {
  drawerW: number;
  drawerD: number;
  bedW: number;
  bedD: number;
  fill: boolean; // pad to the drawer size with solid borders
  color: string;
}

export const BASEPLATE_DEFAULTS: BaseplateParams = {
  drawerW: 200,
  drawerD: 150,
  bedW: 256,
  bedD: 256,
  fill: true,
  color: '#64748b',
};

export interface PlatePlan {
  gx: number;
  gy: number;
  padX: number;
  padY: number;
  /** Cells per piece along each axis, after splitting to fit the bed. */
  splitX: number[];
  splitY: number[];
}

function split(cells: number, pad: number, bed: number): number[] {
  const max = Math.max(1, Math.floor((bed - 2 * pad) / PITCH));
  const pieces = Math.ceil(cells / max);
  const base = Math.floor(cells / pieces), extra = cells % pieces;
  return Array.from({ length: pieces }, (_, i) => base + (i < extra ? 1 : 0));
}

/** How many cells fit in a drawer (with 0.5 mm play) and how to split them into printable pieces. */
export function planBaseplate(p: BaseplateParams): PlatePlan {
  const gx = Math.max(1, Math.floor((p.drawerW - 0.5) / PITCH));
  const gy = Math.max(1, Math.floor((p.drawerD - 0.5) / PITCH));
  const padX = p.fill ? Math.max(0, (p.drawerW - 0.5 - gx * PITCH) / 2) : 0;
  const padY = p.fill ? Math.max(0, (p.drawerD - 0.5 - gy * PITCH) / 2) : 0;
  return { gx, gy, padX, padY, splitX: split(gx, padX, p.bedW), splitY: split(gy, padY, p.bedD) };
}

function baseplatePiece(m: ManifoldToplevel, gx: number, gy: number, pads: { l: number; r: number; b: number; t: number }): Manifold {
  const w = gx * PITCH + pads.l + pads.r, d = gy * PITCH + pads.b + pads.t;
  // The grid is centred on the origin; the plate is shifted by its uneven padding.
  let plate = slab(m, w, d, PLATE_R, 0, PLATE_H).translate([(pads.r - pads.l) / 2, (pads.t - pads.b) / 2, 0]);
  const sockets = cellCenters(gx, gy).map(([x, y]) =>
    profile(m, PITCH, PITCH, PLATE_R, [
      { inset: 0.7 + 2.15, z: -1 },
      { inset: 0.7 + 2.15, z: 0 },
      { inset: 2.15, z: 0.7 },
      { inset: 2.15, z: 0.7 + 1.8 },
      { inset: 0, z: PLATE_H },
      { inset: -1, z: PLATE_H + 1 },
    ]).translate([x, y, 0]),
  );
  plate = plate.subtract(m.Manifold.union(sockets));
  return plate;
}

export function baseplateParts(m: ManifoldToplevel, p: BaseplateParams): Part[] {
  const plan = planBaseplate(p);
  const parts: Part[] = [];
  let y = 0;
  let n = 1;
  plan.splitY.forEach((cy, j) => {
    let x = 0;
    let rowDepth = 0;
    plan.splitX.forEach((cx, i) => {
      const pads = {
        l: i === 0 ? plan.padX : 0,
        r: i === plan.splitX.length - 1 ? plan.padX : 0,
        b: j === 0 ? plan.padY : 0,
        t: j === plan.splitY.length - 1 ? plan.padY : 0,
      };
      const w = cx * PITCH + pads.l + pads.r, d = cy * PITCH + pads.b + pads.t;
      const piece = baseplatePiece(m, cx, cy, pads).translate([x + w / 2 + (pads.l - pads.r) / 2, y + d / 2 + (pads.b - pads.t) / 2, 0]);
      parts.push({ name: `Baseplate ${n++} (${cx}x${cy})`, color: p.color, mesh: toTriMesh(piece) });
      x += w + 8;
      rowDepth = Math.max(rowDepth, d);
    });
    y += rowDepth + 8;
  });
  return parts;
}
