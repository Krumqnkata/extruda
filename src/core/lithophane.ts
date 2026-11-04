// SPDX-License-Identifier: AGPL-3.0-or-later
// Builds a closed lithophane mesh straight from a grayscale image (no CSG needed).
import { closedGrid } from './heightfield';
import type { TriMesh } from './mesh';

export interface LithoParams {
  width: number; // mm, image part only
  minThickness: number;
  maxThickness: number;
  border: number; // mm frame at full thickness
  resolution: number; // samples per mm
  shape: 'flat' | 'curved' | 'cylinder';
  angle: number; // degrees, for curved
  invert: boolean;
  mirror: boolean;
}

export const LITHO_DEFAULTS: LithoParams = {
  width: 100,
  minThickness: 0.8,
  maxThickness: 3.2,
  border: 3,
  resolution: 4,
  shape: 'flat',
  angle: 120,
  invert: false,
  mirror: false,
};

export interface GrayImage {
  width: number;
  height: number;
  data: Float32Array; // 0 = black, 1 = white, row 0 at the top
}

export const MAX_SAMPLES = 400_000;

export function sample(img: GrayImage, u: number, v: number): number {
  // Bilinear sample with u, v in [0, 1]; v = 0 is the bottom of the picture.
  const x = Math.min(img.width - 1, Math.max(0, u * (img.width - 1)));
  const y = Math.min(img.height - 1, Math.max(0, (1 - v) * (img.height - 1)));
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(img.width - 1, x0 + 1), y1 = Math.min(img.height - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  const d = img.data, w = img.width;
  const top = d[y0 * w + x0] * (1 - fx) + d[y0 * w + x1] * fx;
  const bot = d[y1 * w + x0] * (1 - fx) + d[y1 * w + x1] * fx;
  return top * (1 - fy) + bot * fy;
}

export interface LithoResult {
  mesh: TriMesh;
  /** Thickness per vertex, used for the back-lit preview. */
  thickness: Float32Array;
  size: [number, number];
}

export function lithophane(img: GrayImage, p: LithoParams): LithoResult {
  const wrap = p.shape === 'cylinder';
  const W = p.width + (wrap ? 0 : 2 * p.border);
  const imgH = (p.width * img.height) / img.width;
  const H = imgH + 2 * p.border;
  let res = p.resolution;
  if (W * H * res * res > MAX_SAMPLES) res = Math.sqrt(MAX_SAMPLES / (W * H));
  const cols = Math.max(2, Math.round(W * res));
  const rows = Math.max(2, Math.round(H * res));
  const nu = wrap ? cols : cols + 1; // a cylinder's last column joins the first
  const nv = rows + 1;
  const N = nu * nv;

  const thickness = new Float32Array(N * 2);
  const span = wrap ? Math.PI * 2 : (Math.min(Math.max(p.angle, 10), 300) * Math.PI) / 180;
  const R = W / span;
  const border = wrap ? 0 : p.border;
  const range = p.maxThickness - p.minThickness;

  const mesh = closedGrid(nu, nv, wrap, (i, j, top, out, o) => {
    const u = (i / cols) * W;
    const v = (j / rows) * H;
    const k = j * nu + i;
    let t: number;
    if (top) {
      t = p.maxThickness;
      const iu = (u - border) / p.width;
      const iv = (v - p.border) / imgH;
      if (iu >= 0 && iu <= 1 && iv >= 0 && iv <= 1) {
        let g = sample(img, p.mirror ? 1 - iu : iu, iv);
        if (p.invert) g = 1 - g;
        t = p.minThickness + (1 - g) * range; // dark pixels are thick and block light
      }
      thickness[k] = t;
    } else {
      t = thickness[k]; // the top of this sample was placed first
      thickness[N + k] = t;
    }
    const depth = top ? t : 0;
    if (p.shape === 'flat') {
      out[o] = u - W / 2;
      out[o + 1] = depth;
    } else {
      const a = (u / W - 0.5) * span;
      const r = R + depth;
      out[o] = r * Math.sin(a);
      out[o + 1] = r * Math.cos(a) - R;
    }
    out[o + 2] = v;
  });

  return { mesh, thickness, size: [W, H] };
}

/** Converts canvas pixels to perceived brightness. */
export function toGray(rgba: Uint8ClampedArray, width: number, height: number, contrast = 1, brightness = 0): GrayImage {
  const data = new Float32Array(width * height);
  for (let i = 0; i < data.length; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2], a = rgba[i * 4 + 3] / 255;
    let y = ((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255) * a + (1 - a); // transparent counts as white
    y = (y - 0.5) * contrast + 0.5 + brightness;
    data[i] = Math.min(1, Math.max(0, y));
  }
  return { width, height, data };
}
