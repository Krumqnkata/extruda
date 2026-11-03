// SPDX-License-Identifier: AGPL-3.0-or-later
// Storage box with dividers and a choice of lids.
import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import type { Font } from 'opentype.js';
import { toTriMesh } from './manifold';
import type { Part } from './mesh';
import { plateShape } from './models';
import { centerShape, textToPolygons } from './text';

export interface BoxParams {
  width: number; // inside
  depth: number;
  height: number;
  wall: number;
  floor: number;
  radius: number;
  dividersX: number;
  dividersY: number;
  lid: 'slip' | 'inset' | 'slide' | 'none';
  clearance: number;
  lidThickness: number;
  lipHeight: number;
  lidText: string;
  textHeight: number;
  textStyle: 'engraved' | 'inlay';
  boxColor: string;
  lidColor: string;
  textColor: string;
}

export const BOX_DEFAULTS: BoxParams = {
  width: 80,
  depth: 60,
  height: 35,
  wall: 2,
  floor: 1.6,
  radius: 4,
  dividersX: 1,
  dividersY: 0,
  lid: 'slip',
  clearance: 0.2,
  lidThickness: 2,
  lipHeight: 6,
  lidText: 'Винтчета',
  textHeight: 9,
  textStyle: 'engraved',
  boxColor: '#0ea5e9',
  lidColor: '#0369a1',
  textColor: '#f8fafc',
};

const LIP_WALL = 1.6;
const rect = (m: ManifoldToplevel, w: number, d: number, r: number): CrossSection => plateShape(m, 'rounded', w, d, Math.max(0, r));

export function boxParts(m: ManifoldToplevel, font: Font, p: BoxParams): Part[] {
  const { Manifold, CrossSection } = m;
  const W = p.width, D = p.depth;
  const ow = W + 2 * p.wall, od = D + 2 * p.wall;
  const ri = Math.max(0.5, p.radius - p.wall);
  const slide = p.lid === 'slide';
  const groove = Math.max(0.6, Math.min(1.2, p.wall - 0.8));
  const slotH = p.lidThickness + 2 * p.clearance;
  const boxH = p.floor + p.height + (slide ? slotH + 1.2 : 0);

  let box = Manifold.extrude(rect(m, ow, od, p.radius), boxH);
  box = box.subtract(Manifold.extrude(rect(m, W, D, ri), boxH).translate([0, 0, p.floor]));

  const dividerTop = p.floor + p.height - (p.lid === 'inset' ? p.lipHeight + 0.5 : 0.5);
  const walls: Manifold[] = [];
  for (let i = 1; i <= p.dividersX; i++) {
    const x = -W / 2 + (i * W) / (p.dividersX + 1);
    walls.push(Manifold.cube([1.2, D + 0.2, dividerTop - p.floor], true).translate([x, 0, (p.floor + dividerTop) / 2]));
  }
  for (let j = 1; j <= p.dividersY; j++) {
    const y = -D / 2 + (j * D) / (p.dividersY + 1);
    walls.push(Manifold.cube([W + 0.2, 1.2, dividerTop - p.floor], true).translate([0, y, (p.floor + dividerTop) / 2]));
  }
  if (walls.length) box = box.add(Manifold.union(walls));

  if (slide) {
    const zs = p.floor + p.height;
    // Groove in both side walls and the back wall, open at the front.
    box = box.subtract(Manifold.cube([W + 2 * groove, D / 2 + groove + od / 2 + 1, slotH], false).translate([-(W / 2 + groove), -od / 2 - 1, zs]));
    box = box.subtract(Manifold.cube([W, p.wall + 2, boxH], false).translate([-W / 2, -od / 2 - 1, zs]));
  }

  const parts: Part[] = [{ name: 'Box', color: p.boxColor, mesh: toTriMesh(box), group: 'Box' }];
  if (p.lid === 'none') return parts;

  let lid: Manifold;
  let lidW: number;
  let textOnBottom = true;
  if (p.lid === 'slip') {
    const o = p.clearance + LIP_WALL;
    lidW = ow + 2 * o;
    lid = Manifold.extrude(rect(m, ow + 2 * o, od + 2 * o, p.radius + o), p.lidThickness);
    const skirt = rect(m, ow + 2 * o, od + 2 * o, p.radius + o).subtract(rect(m, ow + 2 * p.clearance, od + 2 * p.clearance, p.radius + p.clearance));
    lid = lid.add(Manifold.extrude(skirt, p.lipHeight).translate([0, 0, p.lidThickness]));
  } else if (p.lid === 'inset') {
    lidW = ow;
    lid = Manifold.extrude(rect(m, ow, od, p.radius), p.lidThickness);
    const c = p.clearance;
    const lip = rect(m, W - 2 * c, D - 2 * c, ri - c).subtract(rect(m, W - 2 * c - 2 * LIP_WALL, D - 2 * c - 2 * LIP_WALL, ri - c - LIP_WALL));
    lid = lid.add(Manifold.extrude(lip, p.lipHeight).translate([0, 0, p.lidThickness]));
  } else {
    lidW = W + 2 * groove - 2 * p.clearance;
    const len = D / 2 + groove - p.clearance + od / 2;
    lid = Manifold.cube([lidW, len, p.lidThickness], false).translate([-lidW / 2, -len / 2, 0]);
    textOnBottom = false;
  }

  let text2D: CrossSection | undefined;
  if (p.lidText.trim()) {
    const shape = centerShape(textToPolygons(font, p.lidText, { height: p.textHeight, align: 'center', lineHeight: 1.4 }));
    if (shape.polygons.length) {
      text2D = CrossSection.ofPolygons(shape.polygons, 'NonZero');
      // Text on the face that prints on the bed is mirrored so it reads correctly once the lid is flipped.
      if (textOnBottom) text2D = text2D.mirror([1, 0]);
    }
  }
  const lidParts: Part[] = [];
  if (text2D) {
    const depth = Math.min(0.8, p.lidThickness - 0.6);
    const z = textOnBottom ? 0 : p.lidThickness - depth;
    lid = lid.subtract(Manifold.extrude(text2D, depth + 0.01).translate([0, 0, z - (textOnBottom ? 0.01 : 0)]));
    if (p.textStyle === 'inlay') lidParts.push({ name: 'Lid text', color: p.textColor, mesh: toTriMesh(Manifold.extrude(text2D, depth).translate([0, 0, z])), group: 'Lid' });
  }
  const dx = ow / 2 + lidW / 2 + 10;
  lidParts.unshift({ name: 'Lid', color: p.lidColor, mesh: toTriMesh(lid), group: 'Lid' });
  for (const part of lidParts) {
    const pos = part.mesh.positions;
    for (let i = 0; i < pos.length; i += 3) pos[i] += dx;
  }
  return [...parts, ...lidParts];
}
