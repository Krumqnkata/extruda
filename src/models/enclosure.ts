// SPDX-License-Identifier: AGPL-3.0-or-later
// A screwed-together box for a circuit board: standoffs, port openings and a vented lid.
import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import { toTriMesh } from '../core/manifold';
import { plateShape, SEGMENTS } from '../core/models';
import { bool, num, str, type GalleryModel, type Values } from './types';

export type Wall = 'front' | 'back' | 'left' | 'right';

export interface Cutout {
  wall: Wall;
  /** Centre along the wall, measured from the board's corner. */
  pos: number;
  /** Bottom of the opening above the underside of the board. */
  z: number;
  width: number;
  height: number;
}

const WALLS: Record<string, Wall> = {
  front: 'front', back: 'back', left: 'left', right: 'right',
  отпред: 'front', отзад: 'back', ляво: 'left', дясно: 'right',
};

/** "x,y; x,y" (or one pair per line) to a list of points. Invalid pairs are skipped. */
export function parsePoints(s: string): [number, number][] {
  const out: [number, number][] = [];
  for (const chunk of s.split(/[;\n]+/)) {
    const nums = chunk.trim().split(/[\s,]+/).map(Number);
    if (nums.length === 2 && nums.every(Number.isFinite)) out.push([nums[0], nums[1]]);
  }
  return out;
}

/** One opening per line: "wall, position, height above board, width, height". */
export function parseCutouts(s: string): Cutout[] {
  const out: Cutout[] = [];
  for (const line of s.split(/\n+/)) {
    const cols = line.trim().split(/[\s,;]+/);
    const wall = WALLS[cols[0]?.toLowerCase()];
    const [pos, z, width, height] = cols.slice(1).map(Number);
    if (wall && [pos, z, width, height].every(Number.isFinite) && width > 0 && height > 0) out.push({ wall, pos, z, width, height });
  }
  return out;
}

export interface BoardPreset {
  width: number;
  depth: number;
  height: number;
  offset: number;
  standoffHeight: number;
  screw: number;
  standoffs: string;
  cutouts: string;
}

/**
 * Raspberry Pi 4 Model B. Board size, hole positions and port centres are from the official mechanical
 * drawing (RP-008343-DS); the heights of the openings are generous estimates, since it gives few of them.
 */
export const RPI4: BoardPreset = {
  width: 87,
  depth: 58,
  height: 26,
  offset: 1,
  standoffHeight: 5,
  screw: 2.5,
  standoffs: '3.5,3.5; 61.5,3.5; 3.5,52.5; 61.5,52.5',
  cutouts: [
    'front, 11.2, 0.8, 10.5, 5.5', // USB-C power
    'front, 26, 0.8, 8.5, 5', // micro HDMI 0
    'front, 39.5, 0.8, 8.5, 5', // micro HDMI 1
    'front, 54, 0.8, 7.5, 8', // audio
    'right, 45.75, 0.8, 17, 15', // Ethernet
    'right, 27, 0.8, 15.5, 17', // USB
    'right, 9, 0.8, 15.5, 17', // USB
    'left, 28, -3.5, 13, 4.5', // microSD, under the board
  ].join('\n'),
};

function preset(v: Values): BoardPreset {
  if (str(v, 'preset') === 'rpi4') return RPI4;
  return {
    width: num(v, 'width'),
    depth: num(v, 'depth'),
    height: num(v, 'height'),
    offset: num(v, 'offset'),
    standoffHeight: num(v, 'standoffHeight'),
    screw: num(v, 'screw'),
    standoffs: str(v, 'standoffs'),
    cutouts: str(v, 'cutouts'),
  };
}

const custom = (v: Values) => str(v, 'preset') === 'custom';

export const ELECTRONICS: GalleryModel[] = [
  {
    id: 'enclosure',
    category: 'parts',
    emoji: '📟',
    title: ['Electronics enclosure', 'Кутия за електроника'],
    desc: ['A box for your circuit board with standoffs, port openings and a vented lid held by screws.', 'Кутия за платка със стойки, отвори за портове и проветрив капак с винтове.'],
    defaults: {
      font: 'russo',
      preset: 'custom',
      width: 70,
      depth: 50,
      height: 25,
      wall: 2,
      floor: 2,
      offset: 2,
      standoffHeight: 5,
      screw: 3,
      standoffs: '4,4; 62,4; 4,42; 62,42',
      cutouts: 'front, 20, 1, 12, 6\nback, 33, 1, 10, 8',
      lidScrew: 3,
      vents: true,
      boxColor: '#334155',
      lidColor: '#475569',
    },
    params: [
      { key: 'preset', label: ['Board', 'Платка'], type: 'select', options: [['custom', ['My own board', 'Моя платка']], ['rpi4', ['Raspberry Pi 4 Model B', 'Raspberry Pi 4 Model B']]] },
      { hint: ['Hole positions and port centres follow the official drawing. Port heights are estimates, so check them against your board before printing.', 'Отворите за винтове и центровете на портовете са по официалния чертеж. Височините на портовете са приблизителни, затова ги провери с истинската платка преди печат.'], when: (v) => !custom(v) },
      { section: ['Board', 'Платка'] },
      { key: 'width', label: ['Inside width', 'Вътрешна ширина'], type: 'range', min: 20, max: 250, step: 1, unit: 'mm', when: custom },
      { key: 'depth', label: ['Inside depth', 'Вътрешна дълбочина'], type: 'range', min: 20, max: 250, step: 1, unit: 'mm', when: custom },
      { key: 'height', label: ['Inside height', 'Вътрешна височина'], type: 'range', min: 8, max: 120, step: 1, unit: 'mm', when: custom },
      { key: 'offset', label: ['Gap between wall and board', 'Разстояние от стената до платката'], type: 'range', min: 0, max: 20, step: 0.5, unit: 'mm', when: custom },
      { key: 'standoffHeight', label: ['Standoff height', 'Височина на стойките'], type: 'range', min: 2, max: 30, step: 0.5, unit: 'mm', when: custom },
      { key: 'screw', label: ['Board screw', 'Винт за платката'], type: 'range', min: 2, max: 5, step: 0.5, unit: 'mm', when: custom },
      { key: 'standoffs', label: ['Mounting holes, from the board corner: x,y; x,y', 'Отвори от ъгъла на платката: x,y; x,y'], type: 'text', multiline: true, when: custom },
      { key: 'cutouts', label: ['Openings, one per line: wall, position, height above the underside of the board, width, height', 'Отвори, по един на ред: стена, позиция, височина над долната страна на платката, ширина, височина'], type: 'text', multiline: true, when: custom },
      { hint: ['Walls: front, back, left, right (or отпред, отзад, ляво, дясно). Front is the side nearest the board corner you measure from.', 'Стени: front, back, left, right (или отпред, отзад, ляво, дясно). Отпред е страната до ъгъла, от който мериш.'], when: custom },
      { section: ['Box', 'Кутия'] },
      { key: 'wall', label: ['Wall', 'Стена'], type: 'range', min: 1.2, max: 5, step: 0.1, unit: 'mm' },
      { key: 'floor', label: ['Floor', 'Дъно'], type: 'range', min: 1.2, max: 5, step: 0.1, unit: 'mm' },
      { key: 'lidScrew', label: ['Lid screw', 'Винт за капака'], type: 'range', min: 2, max: 5, step: 0.5, unit: 'mm' },
      { key: 'vents', label: ['Vent slots in the lid', 'Отвори за проветряване в капака'], type: 'check' },
      { key: 'boxColor', label: ['Box', 'Кутия'], type: 'color' },
      { key: 'lidColor', label: ['Lid', 'Капак'], type: 'color' },
    ],
    separate: true,
    build(m, _font, v) {
      const { CrossSection, Manifold } = m;
      const p = preset(v);
      const W = p.width, D = p.depth, wall = num(v, 'wall'), floor = num(v, 'floor');
      const total = floor + p.height;
      const lidScrew = num(v, 'lidScrew');
      const ear = Math.max(4, lidScrew * 1.4);

      // Corner ears hold the lid screws outside the cavity, so they never reach the board.
      const inset = wall + ear * 0.45;
      const corners: [number, number][] = [[-inset, -inset], [W + inset, -inset], [-inset, D + inset], [W + inset, D + inset]];
      const ears = (r: number) => corners.map(([x, y]) => CrossSection.circle(r, SEGMENTS).translate([x, y]));
      const inner = plateShape(m, 'rounded', W, D, 2).translate([W / 2, D / 2]);
      const body2D = plateShape(m, 'rounded', W + 2 * wall, D + 2 * wall, 2 + wall).translate([W / 2, D / 2]);
      const outline: CrossSection = CrossSection.union([body2D, ...ears(ear)]);

      let box = Manifold.extrude(outline, total).subtract(Manifold.extrude(inner, p.height + 1).translate([0, 0, floor]));
      const pilot = lidScrew * 0.4;
      const pilotDepth = Math.min(total - 1.5, 12);
      box = box.subtract(Manifold.union(corners.map(([x, y]) => Manifold.cylinder(pilotDepth + 1, pilot, pilot, 32).translate([x, y, total - pilotDepth]))));

      // Standoffs with pilot holes for the board screws.
      const posts: Manifold[] = [], bores: Manifold[] = [];
      const postR = p.screw * 1.25, boreR = p.screw * 0.42;
      for (const [x, y] of parsePoints(p.standoffs)) {
        const px = p.offset + x, py = p.offset + y;
        posts.push(Manifold.cylinder(p.standoffHeight + 0.01, postR, postR, 32).translate([px, py, floor - 0.01]));
        bores.push(Manifold.cylinder(p.standoffHeight + 0.5, boreR, boreR, 24).translate([px, py, floor + 0.01]));
      }
      if (posts.length) box = box.add(Manifold.union(posts)).subtract(Manifold.union(bores));

      // Port openings, measured from the corner and underside of the board.
      const boardZ = floor + p.standoffHeight;
      const span = wall + ear + 2; // deep enough to clear the wall from inside to outside
      const openings: Manifold[] = [];
      for (const c of parseCutouts(p.cutouts)) {
        const z = Math.max(floor, boardZ + c.z);
        const h = Math.max(0.5, boardZ + c.z + c.height - z);
        if (c.wall === 'front' || c.wall === 'back') {
          const x = p.offset + c.pos - c.width / 2;
          openings.push(Manifold.cube([c.width, span, h], false).translate([x, c.wall === 'front' ? -span + 0.01 : D - 0.01, z]));
        } else {
          const y = p.offset + c.pos - c.width / 2;
          openings.push(Manifold.cube([span, c.width, h], false).translate([c.wall === 'left' ? -span + 0.01 : W - 0.01, y, z]));
        }
      }
      if (openings.length) box = box.subtract(Manifold.union(openings));

      // Lid: flat on the bed, countersunk screw holes opening on the bed side.
      const lidT = 2;
      let lid = Manifold.extrude(outline, lidT);
      const lip = plateShape(m, 'rounded', W - 0.5, D - 0.5, 1.8).translate([W / 2, D / 2]).subtract(plateShape(m, 'rounded', W - 3.3, D - 3.3, 1).translate([W / 2, D / 2]));
      lid = lid.add(Manifold.extrude(lip, 2).translate([0, 0, lidT - 0.01]));
      const clear = lidScrew / 2 + 0.2;
      for (const [x, y] of corners) {
        lid = lid.subtract(Manifold.cylinder(lidT + 2, clear, clear, 32).translate([x, y, -1]));
        lid = lid.subtract(Manifold.cylinder(1.2, clear * 1.9, clear, 32).translate([x, y, -0.01]));
      }
      if (bool(v, 'vents')) {
        const rows = Math.max(1, Math.floor((D - 12) / 5));
        const slots: Manifold[] = [];
        for (let i = 0; i < rows; i++) {
          const y = D / 2 + (i - (rows - 1) / 2) * 5;
          slots.push(Manifold.cube([Math.max(6, W * 0.6), 2, lidT + 2], false).translate([W / 2 - Math.max(6, W * 0.6) / 2, y - 1, -1]));
        }
        lid = lid.subtract(Manifold.union(slots));
      }
      const dx = W + 2 * (wall + ear) + 12;
      return [
        { name: 'Box', color: str(v, 'boxColor'), mesh: toTriMesh(box) },
        { name: 'Lid', color: str(v, 'lidColor'), mesh: toTriMesh(lid.translate([dx, 0, 0])) },
      ];
    },
  },
];
