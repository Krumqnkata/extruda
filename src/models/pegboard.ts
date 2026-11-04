// SPDX-License-Identifier: AGPL-3.0-or-later
// Hooks and holders for perforated boards.
// Skådis-style numbers are community measurements (5 × 15 mm slots, 40 mm grid, 5 mm board), not an official
// drawing, and boards vary, so the page asks for one test print and offers a clearance setting.
import type { CrossSection, Manifold, ManifoldToplevel, Vec3 } from 'manifold-3d';
import { toTriMesh } from '../core/manifold';
import { num, standUp, str, type GalleryModel, type Values } from './types';

export interface BoardSystem {
  pitch: number;
  /** Slot width, or hole diameter. */
  width: number;
  /** Slot height, or hole diameter. */
  height: number;
  round: boolean;
}

export const BOARD_SYSTEMS: Record<string, BoardSystem> = {
  skadis: { pitch: 40, width: 5, height: 15, round: false },
  inch: { pitch: 25.4, width: 6.35, height: 6.35, round: true },
  metric: { pitch: 25, width: 6, height: 6, round: true },
};

export interface AnchorSize {
  /** Width across the slot or hole. */
  w: number;
  /** Height of the part that passes through the board. */
  h: number;
  /** How far the leg rises behind the board. */
  rise: number;
}

/** A tab must pass the opening; the leg behind it is limited by what can still be tilted through. */
export function anchorSize(sys: BoardSystem, clearance: number): AnchorSize {
  if (sys.round) {
    // A rectangle through a round hole: its diagonal must fit.
    const side = (sys.width - clearance) / Math.SQRT2;
    return { w: side, h: side, rise: 4 };
  }
  const h = 7;
  return { w: sys.width - clearance, h, rise: Math.max(2, sys.height - clearance - h - 1) };
}

/** Side view of the tab: x is depth (negative goes behind the board), y is up, bottom of the tab at y = 0. */
function anchorProfile(m: ManifoldToplevel, a: AnchorSize, board: number, clearance: number): CrossSection {
  const { CrossSection } = m;
  const reach = board + clearance;
  const leg = Math.max(2.4, a.w * 0.6);
  return CrossSection.union([
    CrossSection.square([reach + 0.01, a.h], false).translate([-reach, 0]),
    CrossSection.square([leg, a.h + a.rise], false).translate([-reach - leg, 0]),
  ]);
}

/** Tabs at whole board pitches, centred across a part of the given width. */
function tabPositions(sys: BoardSystem, width: number, tabW: number): number[] {
  const n = Math.max(1, Math.floor((width - tabW) / sys.pitch) + 1);
  return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * sys.pitch);
}

function settings(v: Values) {
  const sys = BOARD_SYSTEMS[str(v, 'system')] ?? BOARD_SYSTEMS.skadis;
  const c = num(v, 'clearance');
  return { sys, c, board: num(v, 'board'), a: anchorSize(sys, c) };
}

/** Upright tabs for a part standing with its back face at y = 0. */
function uprightTabs(m: ManifoldToplevel, v: Values, width: number, top: number): Manifold {
  const { sys, c, board, a } = settings(v);
  const profile = anchorProfile(m, a, board, c).translate([0, top - a.h - a.rise]);
  return m.Manifold.union(tabPositions(sys, width, a.w).map((x) => standUp(m, profile, a.w).translate([x, 0, 0])));
}

const item = (v: Values) => str(v, 'item');

export const PEGBOARD: GalleryModel[] = [
  {
    id: 'pegboard',
    category: 'parts',
    emoji: '🧰',
    title: ['Pegboard holders', 'Държачи за перфорирана дъска'],
    desc: ['Hooks, bins and tool holders for Skådis-style boards and standard pegboards.', 'Кукички, кутийки и държачи за инструменти за дъски тип Skådis и стандартни перфорирани дъски.'],
    defaults: { font: 'russo', system: 'skadis', item: 'hook', board: 5, clearance: 0.3, reach: 35, drop: 25, tip: 12, width: 80, depth: 40, height: 40, holes: 5, hole: 10, color: '#f59e0b' },
    params: [
      { key: 'system', label: ['Board', 'Дъска'], type: 'select', options: [
        ['skadis', ['Skådis-style: 5 × 15 mm slots, 40 mm grid', 'Тип Skådis: прорези 5 × 15 мм, стъпка 40 мм']],
        ['inch', ['Pegboard: 1/4 inch holes, 1 inch grid', 'Перфорирана: отвори 1/4 инча, стъпка 1 инч']],
        ['metric', ['Pegboard: 6 mm holes, 25 mm grid', 'Перфорирана: отвори 6 мм, стъпка 25 мм']],
      ] },
      { key: 'item', label: ['Make', 'Направи'], type: 'select', options: [['hook', ['Hook', 'Кукичка']], ['bin', ['Bin', 'Кутийка']], ['holder', ['Tool holder', 'Държач за инструменти']]] },
      { key: 'board', label: ['Board thickness (measure yours)', 'Дебелина на дъската (измери я)'], type: 'range', min: 2, max: 10, step: 0.1, unit: 'mm' },
      { key: 'clearance', label: ['Clearance', 'Хлабина'], type: 'range', min: 0, max: 1, step: 0.05, unit: 'mm' },
      { hint: ['Boards differ, so measure yours and print one hook first. Tilt the tab into the opening, then let it drop.', 'Дъските се различават, затова измери своята и първо принтирай една кукичка. Наклони издатината в отвора и я пусни надолу.'] },
      { key: 'reach', label: ['Reach', 'Дължина'], type: 'range', min: 10, max: 100, step: 1, unit: 'mm', when: (v) => item(v) === 'hook' },
      { key: 'drop', label: ['Back plate length', 'Дължина на опората'], type: 'range', min: 10, max: 60, step: 1, unit: 'mm', when: (v) => item(v) === 'hook' },
      { key: 'tip', label: ['Tip height', 'Височина на върха'], type: 'range', min: 4, max: 40, step: 1, unit: 'mm', when: (v) => item(v) === 'hook' },
      { hint: ['The hook prints lying on its side, so no supports are needed.', 'Кукичката се принтира легнала на една страна, така че не иска подпори.'], when: (v) => item(v) === 'hook' },
      { key: 'width', label: ['Width', 'Ширина'], type: 'range', min: 20, max: 240, step: 1, unit: 'mm', when: (v) => item(v) !== 'hook' },
      { key: 'depth', label: ['Depth', 'Дълбочина'], type: 'range', min: 10, max: 120, step: 1, unit: 'mm', when: (v) => item(v) !== 'hook' },
      { key: 'height', label: ['Height', 'Височина'], type: 'range', min: 20, max: 150, step: 1, unit: 'mm', when: (v) => item(v) !== 'hook' },
      { key: 'holes', label: ['Number of holes', 'Брой отвори'], type: 'range', min: 1, max: 20, step: 1, when: (v) => item(v) === 'holder' },
      { key: 'hole', label: ['Hole diameter', 'Диаметър на отворите'], type: 'range', min: 3, max: 40, step: 0.5, unit: 'mm', when: (v) => item(v) === 'holder' },
      { hint: ['Turn on supports touching the build plate for the tabs behind this part.', 'Включи подпори от плочата за издатините зад тази част.'], when: (v) => item(v) !== 'hook' },
      { key: 'color', label: ['Colour', 'Цвят'], type: 'color' },
    ],
    build(m, _font, v) {
      const { CrossSection, Manifold } = m;
      const { c, board, a } = settings(v);
      const color = str(v, 'color');

      if (item(v) === 'hook') {
        const plate = 4;
        const drop = num(v, 'drop'), reach = Math.max(num(v, 'reach'), plate + 6), tip = num(v, 'tip');
        const arm = Math.max(4, a.w);
        const bottom = -drop;
        const body = CrossSection.union([
          CrossSection.square([plate, a.h + a.rise - bottom], false).translate([0, bottom]),
          CrossSection.square([reach, arm], false).translate([0, bottom]),
          CrossSection.square([arm, arm + tip], false).translate([reach - arm, bottom]),
          CrossSection.ofPolygons([[plate - 0.1, bottom + arm - 0.1], [plate + 10, bottom + arm - 0.1], [plate - 0.1, bottom + arm + 10]], 'NonZero'),
        ]).offset(-0.5, 'Round', 2, 24).offset(0.5, 'Round', 2, 24);
        const profile = CrossSection.union(body, anchorProfile(m, a, board, c));
        return [{ name: 'Hook', color, mesh: toTriMesh(Manifold.extrude(profile, a.w)) }];
      }

      const W = num(v, 'width'), D = num(v, 'depth');
      const H = Math.max(num(v, 'height'), a.h + a.rise + 6);
      const wall = 2.4;
      // Built with the board side at y = 0, then turned so the open front faces the viewer.
      const faceFront = (solid: Manifold) => toTriMesh(solid.rotate([0, 0, 180]));
      const back = Manifold.cube([W, wall, H], false).translate([-W / 2, 0, 0]);

      if (item(v) === 'bin') {
        const outer = Manifold.cube([W, D, H], false).translate([-W / 2, 0, 0]);
        const inner = Manifold.cube([W - 2 * wall, D - 2 * wall, H], false).translate([-W / 2 + wall, wall, wall]);
        return [{ name: 'Bin', color, mesh: faceFront(outer.subtract(inner).add(uprightTabs(m, v, W, H))) }];
      }

      // Tool holder: a shelf with holes at the bottom, held by gussets at both ends.
      const shelfT = 4, n = Math.round(num(v, 'holes')), hole = num(v, 'hole');
      let shelf = Manifold.cube([W, D, shelfT], false).translate([-W / 2, 0, 0]);
      const gusset = Math.min(D - 1, H - shelfT);
      const brace = (x: number): Manifold => {
        const pts: Vec3[] = [
          [x, wall - 0.1, shelfT - 0.1], [x + 3, wall - 0.1, shelfT - 0.1],
          [x, gusset, shelfT - 0.1], [x + 3, gusset, shelfT - 0.1],
          [x, wall - 0.1, shelfT + gusset], [x + 3, wall - 0.1, shelfT + gusset],
        ];
        return Manifold.hull(pts);
      };
      // Holes stay clear of the back plate and of the gussets at the ends.
      const usable = W - 6;
      const pitch = usable / n;
      const r = Math.min(hole / 2, pitch / 2 - 0.8, (D - wall) / 2 - 1.5);
      const cy = wall + (D - wall) / 2;
      const holes = Array.from({ length: n }, (_, i) => Manifold.cylinder(shelfT + 2, r, r, 48).translate([-usable / 2 + pitch * (i + 0.5), cy, -1]));
      shelf = shelf.subtract(Manifold.union(holes));
      const solid = Manifold.union([shelf, back, brace(-W / 2), brace(W / 2 - 3), uprightTabs(m, v, W, H)]);
      return [{ name: 'Tool holder', color, mesh: faceFront(solid) }];
    },
  },
];

