// SPDX-License-Identifier: AGPL-3.0-or-later
// Built-in icons drawn from simple maths, so there are no third-party artwork licenses to track.
// Every icon is one unit tall, centred on the origin, outer contours counter-clockwise.
import type { Polygon, Vec2 } from './text';

const TAU = Math.PI * 2;

function ring(n: number, f: (t: number) => Vec2): Polygon {
  return Array.from({ length: n }, (_, i) => f((i / n) * TAU));
}

function circle(cx: number, cy: number, r: number, n = 48): Polygon {
  return ring(n, (t) => [cx + r * Math.cos(t), cy + r * Math.sin(t)]);
}

function ellipse(cx: number, cy: number, rx: number, ry: number, rot = 0, n = 48): Polygon {
  const c = Math.cos(rot), s = Math.sin(rot);
  return ring(n, (t) => {
    const x = rx * Math.cos(t), y = ry * Math.sin(t);
    return [cx + x * c - y * s, cy + x * s + y * c];
  });
}

function area(p: Polygon): number {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1];
  return a / 2;
}

/** Scales a set of contours to height 1 and centres it; outer contours end up counter-clockwise. */
function normalize(polys: Polygon[]): Polygon[] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of polys) for (const [x, y] of p) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const k = 1 / (maxY - minY);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  return polys.map((p) => {
    const q = p.map(([x, y]) => [(x - cx) * k, (y - cy) * k] as Vec2);
    return area(q) < 0 ? q.reverse() : q;
  });
}

const heart = () => [
  ring(96, (t) => [16 * Math.sin(t) ** 3, 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)]),
];

const star = (points = 5, inner = 0.45) => [
  ring(points * 2, (t) => {
    const r = Math.round((t / TAU) * points * 2) % 2 ? inner : 1;
    return [r * Math.sin(t), r * Math.cos(t)];
  }),
];

const paw = () => [
  ellipse(0, -0.35, 0.42, 0.34),
  ellipse(-0.5, 0.12, 0.15, 0.2, 0.35),
  ellipse(-0.18, 0.42, 0.15, 0.2, 0.1),
  ellipse(0.18, 0.42, 0.15, 0.2, -0.1),
  ellipse(0.5, 0.12, 0.15, 0.2, -0.35),
];

const crown = () => [
  [[-1, 0], [1, 0], [1.1, 1], [0.55, 0.45], [0, 1.15], [-0.55, 0.45], [-1.1, 1]] as Polygon,
];

const note = () => [
  ellipse(-0.25, 0, 0.32, 0.23, 0.45),
  [[0.02, 0.05], [0.12, 0.05], [0.12, 1.25], [0.02, 1.25]] as Polygon,
  [[0.12, 1.25], [0.12, 0.95], [0.55, 0.7], [0.5, 0.95]] as Polygon,
];

const bolt = () => [[[0.15, 1], [-0.45, -0.05], [-0.02, -0.05], [-0.2, -1], [0.45, 0.15], [0.03, 0.15], [0.25, 1]] as Polygon];

const flower = () => [ring(120, (t) => {
  const r = 0.62 + 0.38 * Math.abs(Math.cos(2.5 * t));
  return [r * Math.cos(t), r * Math.sin(t)];
})];

const cloud = () => [
  circle(-0.55, 0, 0.35),
  circle(0, 0.2, 0.5),
  circle(0.55, 0, 0.38),
  [[-0.55, -0.35], [0.55, -0.38], [0.55, 0], [-0.55, 0]] as Polygon,
];

const shield = () => [[
  [-0.8, 0.6], [0, 0.85], [0.8, 0.6], [0.8, -0.05], [0.55, -0.55], [0, -0.95], [-0.55, -0.55], [-0.8, -0.05],
] as Polygon];

const snowflake = () => {
  const arms: Polygon[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU;
    const c = Math.cos(a), s = Math.sin(a);
    const rot = (x: number, y: number): Vec2 => [x * c - y * s, x * s + y * c];
    arms.push([rot(0, -0.07), rot(1, -0.07), rot(1, 0.07), rot(0, 0.07)]);
    arms.push([rot(0.55, 0), rot(0.8, -0.24), rot(0.86, -0.18), rot(0.66, 0.05)]);
    arms.push([rot(0.55, 0), rot(0.66, -0.05), rot(0.86, 0.18), rot(0.8, 0.24)]);
  }
  arms.push(circle(0, 0, 0.18, 6));
  return arms;
};

const tree = () => [
  [[-0.5, 0.05], [0.5, 0.05], [0.15, 0.45], [0.35, 0.45], [0, 0.9], [-0.35, 0.45], [-0.15, 0.45]] as Polygon,
  [[-0.65, -0.35], [0.65, -0.35], [0.25, 0.1], [-0.25, 0.1]] as Polygon,
  [[-0.12, -0.6], [0.12, -0.6], [0.12, -0.3], [-0.12, -0.3]] as Polygon,
];

export const ICONS: Record<string, () => Polygon[]> = {
  heart,
  star: () => star(),
  paw,
  crown,
  note,
  bolt,
  flower,
  cloud,
  shield,
  snowflake,
  tree,
  circle: () => [circle(0, 0, 1, 96)],
  hexagon: () => [circle(0, 0, 1, 6)],
};

export const ICON_IDS = Object.keys(ICONS);

/** Icon outlines scaled to `size` mm tall and centred on the origin. */
export function iconPolygons(id: string, size: number): Polygon[] {
  const make = ICONS[id] ?? ICONS.heart;
  return normalize(make()).map((p) => p.map(([x, y]) => [x * size, y * size] as Vec2));
}

/** Emoji used to label icons in drop-downs. */
export const ICON_EMOJI: Record<string, string> = {
  heart: '❤', star: '★', paw: '🐾', crown: '♛', note: '♪', bolt: '⚡', flower: '✿', cloud: '☁',
  shield: '🛡', snowflake: '❄', tree: '🎄', circle: '●', hexagon: '⬢',
};
