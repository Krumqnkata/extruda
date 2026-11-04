// SPDX-License-Identifier: AGPL-3.0-or-later
// A gallery model is one self-describing object: labels, parameters and a geometry builder.
// Adding a model means adding one entry to a category file; the page and tests pick it up.
import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import type { Font } from 'opentype.js';
import type { Part } from '../core/mesh';
import { centerShape, textToPolygons } from '../core/text';

export type Pair = readonly [string, string]; // [English, Български]
export type Values = Record<string, number | string | boolean>;

export type Param =
  | { key: string; label: Pair; type: 'range'; min: number; max: number; step: number; unit?: 'mm' | 'deg' | '%' }
  | { key: string; label: Pair; type: 'text'; multiline?: boolean }
  | { key: string; label: Pair; type: 'select'; options: readonly (readonly [string, Pair])[] }
  | { key: string; label: Pair; type: 'check' | 'color' | 'font' }
  | { section: Pair }
  | { hint: Pair };

export type Category = 'desk' | 'home' | 'gifts' | 'pets' | 'holiday' | 'parts';

export interface GalleryModel {
  id: string;
  category: Category;
  /** Emoji shown on the gallery card. */
  emoji: string;
  title: Pair;
  desc: Pair;
  defaults: Values & { font: string };
  params: Param[];
  build(m: ManifoldToplevel, font: Font, v: Values): Part[];
  /** Export each part (or group) as a separate object, e.g. a pot and its saucer. */
  separate?: boolean;
}

export const num = (v: Values, k: string): number => Number(v[k]);
export const str = (v: Values, k: string): string => String(v[k] ?? '');
export const bool = (v: Values, k: string): boolean => Boolean(v[k]);

/** Centred text outline; empty when the text is blank. */
export function textCS(m: ManifoldToplevel, font: Font, text: string, height: number, maxWidth = Infinity): CrossSection | undefined {
  if (!text.trim()) return undefined;
  const shape = centerShape(textToPolygons(font, text, { height, align: 'center', lineHeight: 1.35 }));
  if (!shape.polygons.length) return undefined;
  const cs = m.CrossSection.ofPolygons(shape.polygons, 'NonZero');
  const w = shape.max[0] - shape.min[0];
  return w > maxWidth ? cs.scale(maxWidth / w) : cs;
}

/**
 * Extrudes a side profile drawn in (depth, height) and stands it up: the extrusion becomes the X
 * axis, profile x becomes Y and profile y becomes Z. The axis swap is a rotation, so normals stay correct.
 */
export function standUp(m: ManifoldToplevel, profile: CrossSection, width: number): Manifold {
  return m.Manifold.extrude(profile, width)
    .translate([0, 0, -width / 2])
    .warp((v) => {
      const [u, h, w] = [v[0], v[1], v[2]];
      v[0] = w;
      v[1] = u;
      v[2] = h;
    });
}

/** Wraps a flat solid (x along the surface, y up, z outwards) around a vertical cylinder of radius r. */
export function wrapOnCylinder(solid: Manifold, r: number): Manifold {
  return solid.refineToLength(1).warp((v) => {
    const a = v[0] / r;
    const rr = r + v[2];
    const up = v[1];
    v[0] = rr * Math.sin(a);
    v[1] = -rr * Math.cos(a);
    v[2] = up;
  });
}
