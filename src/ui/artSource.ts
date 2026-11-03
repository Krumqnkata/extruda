// SPDX-License-Identifier: AGPL-3.0-or-later
// "Make it from text / icon / file" controls shared by the logo, stencil and cookie cutter tools.
import type { CrossSection, ManifoldToplevel } from 'manifold-3d';
import type { Font } from 'opentype.js';
import type { LogoLayer } from '../core/art';
import { toGray, type GrayImage } from '../core/lithophane';
import { emptyCS, type Shape2D } from '../core/models';
import { iconPolygons } from '../core/shapes';
import { fitArt, parseSvg, type Art } from '../core/svg';
import { centerShape, textToPolygons, type Polygon } from '../core/text';
import { traceImage } from '../core/trace';
import { t } from '../i18n';
import { check, el, hint, range, segmented, select, text, type Ctl } from './form';
import { icons } from './icons';
import { fontOptions, iconOptions } from './options';

export interface ArtState {
  font: string;
  source: 'text' | 'icon' | 'file';
  text: string;
  textHeight: number;
  icon: string;
  threshold: number;
  invertImage: boolean;
}

export const ART_DEFAULTS: Omit<ArtState, 'font' | 'text'> = {
  source: 'icon',
  textHeight: 20,
  icon: 'heart',
  threshold: 0.5,
  invertImage: false,
};

interface Loaded {
  name: string;
  svg?: Art;
  image?: GrayImage;
}

// Uploaded files stay in memory per tool; they are not written to storage or share links.
const files = new Map<string, Loaded>();

export function loadedFile(toolId: string): Loaded | undefined {
  return files.get(toolId);
}

const MAX_IMAGE = 600;

async function readFile(file: File): Promise<Loaded> {
  if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
    return { name: file.name, svg: parseSvg(await file.text()) };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const k = Math.min(1, MAX_IMAGE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(2, Math.round(img.naturalWidth * k)), h = Math.max(2, Math.round(img.naturalHeight * k));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(img, 0, 0, w, h);
    return { name: file.name, image: toGray(g.getImageData(0, 0, w, h).data, w, h) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A drop zone that loads an SVG or image into memory for `toolId`, then calls `onLoad`. */
export function artDropZone(toolId: string, onLoad: () => void): HTMLElement {
  const input = el('input', { type: 'file', accept: '.svg,image/svg+xml,image/png,image/jpeg,image/webp', hidden: true });
  const current = files.get(toolId);
  const load = async (file: File | undefined) => {
    if (!file) return;
    try {
      files.set(toolId, await readFile(file));
    } catch (err) {
      console.error(err);
    }
    onLoad();
  };
  input.addEventListener('change', () => void load(input.files?.[0]));
  const zone = el(
    'button',
    { type: 'button', class: 'drop', onclick: () => input.click() },
    el('span', { class: 'icon', html: icons.upload, 'aria-hidden': 'true' }),
    el('span', {}, current ? current.name : t('f.artDrop')),
  );
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('over');
    void load(e.dataTransfer?.files[0]);
  });
  return el('div', { class: 'field' }, zone, input);
}

/** Controls for picking the artwork. `ctl.change(true)` is called when a file finishes loading. */
export function artControls<S extends ArtState>(ctl: Ctl<S>, toolId: string): Node[] {
  const s = ctl.state;
  const f = files.get(toolId);
  return [
    segmented(ctl, 'source', t('f.source'), [
      ['text', t('f.source.text')],
      ['icon', t('f.source.icon')],
      ['file', t('f.source.file')],
    ]),
    s.source === 'text' && text(ctl, 'text', t('f.text'), { multiline: true, rows: 2, hint: t('f.textHint'), big: true }),
    s.source === 'text' && select(ctl, 'font', t('f.font'), fontOptions(), { fontPreview: true }),
    s.source === 'icon' && select(ctl, 'icon', t('f.icon'), iconOptions()),
    s.source === 'file' && artDropZone(toolId, () => ctl.change(true)),
    s.source === 'file' && f?.svg && hint(t('f.colorsFound', { n: new Set(f.svg.layers.map((l) => l.color)).size })),
    s.source === 'file' && f?.image && range(ctl, 'threshold', t('f.threshold'), { min: 0.05, max: 0.95, step: 0.01 }),
    s.source === 'file' && f?.image && check(ctl, 'invertImage', t('f.invertImage')),
    s.source === 'file' && hint(t('f.artHint')),
  ].filter(Boolean) as Node[];
}

function textPolys(font: Font, s: ArtState): Polygon[] {
  return centerShape(textToPolygons(font, s.text, { height: s.textHeight, align: 'center', lineHeight: 1.4 })).polygons;
}

/** The artwork as colour layers in paint order, scaled to `width` mm (0 keeps the natural size). */
export function artLayers(m: ManifoldToplevel, font: Font, s: ArtState, toolId: string, width: number, color: string): LogoLayer[] {
  const { CrossSection } = m;
  if (s.source === 'text') {
    const polys = textPolys(font, s);
    return polys.length ? [{ color, cs: scaleTo(CrossSection.ofPolygons(polys, 'NonZero'), width) }] : [];
  }
  if (s.source === 'icon') return [{ color, cs: scaleTo(CrossSection.ofPolygons(iconPolygons(s.icon, 50), 'NonZero'), width) }];
  const f = files.get(toolId);
  if (f?.svg?.layers.length) {
    const art = fitArt(f.svg, width > 0 ? width : f.svg.max[0] - f.svg.min[0]);
    return art.layers.map((l) => ({ color: l.color, cs: CrossSection.ofPolygons(l.polygons, l.fillRule) }));
  }
  if (f?.image) {
    const loops = traceImage(f.image, s.threshold, s.invertImage);
    if (!loops.length) return [];
    return [{ color, cs: scaleTo(CrossSection.ofPolygons(loops, 'EvenOdd'), width) }];
  }
  return [];
}

/** All artwork merged into one shape. */
export function artShape(m: ManifoldToplevel, font: Font, s: ArtState, toolId: string, width: number): CrossSection {
  const layers = artLayers(m, font, s, toolId, width, '#000000');
  return layers.length ? m.CrossSection.union(layers.map((l) => l.cs)) : emptyCS(m);
}

/** Uploaded artwork as fill-rule polygons, for the keychain's custom icon. */
export function artAsShape2D(toolId: string, s: Pick<ArtState, 'threshold' | 'invertImage'>): Shape2D | undefined {
  const f = files.get(toolId);
  if (f?.svg?.layers.length) return f.svg.layers.map((l) => ({ polygons: l.polygons, fillRule: l.fillRule }));
  if (f?.image) {
    const loops = traceImage(f.image, s.threshold, s.invertImage);
    return loops.length ? [{ polygons: loops, fillRule: 'EvenOdd' }] : undefined;
  }
  return undefined;
}

/** Scales a shape uniformly to `width` mm wide and centres it. */
export function scaleTo(cs: CrossSection, width: number): CrossSection {
  if (cs.isEmpty()) return cs;
  const b = cs.bounds();
  const w = b.max[0] - b.min[0];
  const centred = cs.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2]);
  return width > 0 && w > 0 ? centred.scale(width / w) : centred;
}
