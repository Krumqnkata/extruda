// @vitest-environment happy-dom
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { fitArt, parseSvg } from '../src/core/svg';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">
  <rect x="0" y="0" width="100" height="50" fill="#ff0000"/>
  <circle cx="25" cy="25" r="10" fill="#0000ff"/>
  <path d="M60 10 L90 10 L90 40 L60 40 Z M70 20 L80 20 L80 30 L70 30 Z" fill="#0000ff" fill-rule="evenodd"/>
  <path d="M0 0 L10 10" stroke="#000" fill="none"/>
</svg>`;

describe('svg', () => {
  it('groups shapes by fill colour, keeps paint order and ignores strokes', () => {
    const art = parseSvg(svg);
    expect(art.layers.map((l) => l.color)).toEqual(['#ff0000', '#0000ff', '#0000ff']);
    expect(art.layers[2].fillRule).toBe('EvenOdd');
    expect(art.max[0] - art.min[0]).toBeCloseTo(100, 3);
  });

  it('scales to the requested width and flips y', () => {
    const art = fitArt(parseSvg(svg), 50);
    expect(art.max[0] - art.min[0]).toBeCloseTo(50, 3);
    expect(art.max[1] - art.min[1]).toBeCloseTo(25, 3);
    expect(art.min[0]).toBeCloseTo(-25, 3);
    // The circle sits left of centre and, with y flipped, at mid height.
    const circle = art.layers[1].polygons[0];
    const cx = circle.reduce((s, p) => s + p[0], 0) / circle.length;
    expect(cx).toBeCloseTo(-12.5, 0);
  });
});
