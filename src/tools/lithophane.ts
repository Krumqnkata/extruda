// SPDX-License-Identifier: AGPL-3.0-or-later
import { download, partsToSTL, to3MF } from '../core/export';
import { LITHO_DEFAULTS, lithophane, toGray, type GrayImage, type LithoParams } from '../core/lithophane';
import type { Part } from '../core/mesh';
import { Viewer, type ViewPart } from '../core/viewer';
import { t } from '../i18n';
import { button, check, debounce, el, hint, persisted, range, save, section, segmented, type Ctl } from '../ui/form';
import { icons } from '../ui/icons';
import { statusText, toolShell } from '../ui/modelTool';

type State = LithoParams & { contrast: number; brightness: number; backlight: boolean };

const MAX_PIXELS = 1200;

// The picture survives switching tools or language, but is never written to storage.
let picture: { name: string; source: CanvasImageSource; width: number; height: number } | undefined;

function demoPicture(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 480;
  c.height = 320;
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, 320);
  sky.addColorStop(0, '#1b2a4a');
  sky.addColorStop(1, '#f7c58b');
  g.fillStyle = sky;
  g.fillRect(0, 0, 480, 320);
  g.fillStyle = '#fff6dc';
  g.beginPath();
  g.arc(330, 170, 56, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#0d1424';
  g.beginPath();
  g.moveTo(0, 320);
  g.lineTo(0, 230);
  g.lineTo(90, 160);
  g.lineTo(170, 225);
  g.lineTo(250, 150);
  g.lineTo(380, 250);
  g.lineTo(480, 200);
  g.lineTo(480, 320);
  g.fill();
  g.fillStyle = '#ffffff';
  g.font = 'bold 44px "x-russo", system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText('Extruda', 240, 300);
  return c;
}

function toGrayImage(src: CanvasImageSource, w: number, h: number, s: State): GrayImage {
  const k = Math.min(1, MAX_PIXELS / Math.max(w, h));
  const cw = Math.max(2, Math.round(w * k));
  const ch = Math.max(2, Math.round(h * k));
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(src, 0, 0, cw, ch);
  return toGray(g.getImageData(0, 0, cw, ch).data, cw, ch, s.contrast, s.brightness);
}

/** Light passing through: thin areas glow, thick areas stay dark. */
function backlightColors(thickness: Float32Array, s: State): Float32Array {
  const out = new Float32Array(thickness.length * 3);
  const tr = (x: number) => Math.exp(-1.1 * x);
  const lo = tr(s.maxThickness), hi = tr(s.minThickness);
  for (let i = 0; i < thickness.length; i++) {
    const b = Math.min(1, Math.max(0, (tr(thickness[i]) - lo) / (hi - lo || 1))) * 0.92 + 0.05;
    out[i * 3] = b;
    out[i * 3 + 1] = b * 0.9;
    out[i * 3 + 2] = b * 0.72;
  }
  return out;
}

export function mount(container: HTMLElement): () => void {
  const defaults: State = { ...LITHO_DEFAULTS, contrast: 1, brightness: 0, backlight: true };
  const state = persisted('lithophane', defaults);
  const shell = toolShell(t('tool.lithophane.title'), t('tool.lithophane.desc'));
  container.append(shell.root);
  const viewer = new Viewer(shell.host);
  let parts: Part[] = [];
  let disposed = false;

  const setStatus = (s: string, kind = 'ok') => {
    shell.status.textContent = s;
    shell.status.dataset.kind = kind;
  };

  let gray: GrayImage | undefined;
  const regray = () => {
    const pic = picture ?? { name: 'demo', source: demoPicture(), width: 480, height: 320 };
    gray = toGrayImage(pic.source, pic.width, pic.height, state);
  };

  const rebuild = () => {
    setStatus(t('s.building'), 'busy');
    setTimeout(() => {
      if (disposed) return;
      if (!gray) regray();
      const res = lithophane(gray!, state);
      const part: ViewPart = { name: 'Lithophane', color: '#f3eee4', mesh: res.mesh, smooth: true };
      if (state.backlight) part.colors = backlightColors(res.thickness, state);
      parts = [part];
      viewer.setParts([part]);
      setStatus(statusText(parts));
    }, 16);
  };
  const scheduleRebuild = debounce(rebuild, 200);

  const ctl: Ctl<State> = {
    state,
    change(structural) {
      save('lithophane', state);
      if (structural) renderControls();
      scheduleRebuild();
    },
  };
  // Contrast and brightness change the source pixels, the rest only the mesh.
  const imageCtl: Ctl<State> = {
    state,
    change(structural) {
      gray = undefined;
      ctl.change(structural);
    },
  };

  const fileInput = el('input', { type: 'file', accept: 'image/*', hidden: true });
  const loadFile = (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      picture = { name: file.name, source: img, width: img.naturalWidth, height: img.naturalHeight };
      gray = undefined;
      renderControls();
      rebuild();
    };
    img.src = url;
  };
  fileInput.addEventListener('change', () => loadFile(fileInput.files?.[0]));

  const dropZone = () => {
    const zone = el(
      'button',
      { type: 'button', class: 'drop', onclick: () => fileInput.click() },
      el('span', { class: 'icon', html: icons.image, 'aria-hidden': 'true' }),
      el('span', {}, picture ? picture.name : t('f.drop')),
    );
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('over');
      loadFile(e.dataTransfer?.files[0]);
    });
    return zone;
  };

  const renderControls = () => {
    shell.controls.replaceChildren(
      section(
        t('sec.image'),
        dropZone(),
        fileInput,
        range(imageCtl, 'contrast', t('f.contrast'), { min: 0.3, max: 2.5, step: 0.05, unit: '×' }),
        range(imageCtl, 'brightness', t('f.brightness'), { min: -0.5, max: 0.5, step: 0.01 }),
        check(ctl, 'invert', t('f.invert')),
        check(ctl, 'mirror', t('f.mirror')),
      ),
      section(
        t('sec.shape'),
        segmented(ctl, 'shape', t('f.litho.shape'), [
          ['flat', t('f.litho.flat')],
          ['curved', t('f.litho.curved')],
          ['cylinder', t('f.litho.cylinder')],
        ]),
        state.shape === 'curved' && range(ctl, 'angle', t('f.angle'), { min: 20, max: 300, step: 5, unit: t('u.deg') }),
        range(ctl, 'width', t('f.width'), { min: 30, max: 250, step: 1, unit: t('u.mm') }),
        range(ctl, 'border', t('f.frame'), { min: 0, max: 10, step: 0.5, unit: t('u.mm') }),
      ),
      section(
        t('sec.thickness'),
        range(ctl, 'minThickness', t('f.minT'), { min: 0.4, max: 3, step: 0.1, unit: t('u.mm') }),
        range(ctl, 'maxThickness', t('f.maxT'), { min: 1.5, max: 8, step: 0.1, unit: t('u.mm') }),
        range(ctl, 'resolution', t('f.resolution'), { min: 1, max: 8, step: 0.5, unit: t('u.perMm') }),
        check(ctl, 'backlight', t('f.backlight')),
        hint(t('f.lithoHint')),
      ),
      el(
        'div',
        { class: 'panel-foot' },
        button(t('a.defaults'), () => {
          Object.assign(state, defaults);
          imageCtl.change(true);
        }, { icon: icons.refresh }),
      ),
    );
  };

  const name = () => `lithophane_${(picture?.name ?? 'demo').replace(/\.[^.]+$/, '')}`;
  shell.actions.append(
    button(t('a.stl'), () => download(partsToSTL(parts, 'Extruda lithophane'), `${name()}.stl`, 'model/stl'), { primary: true, icon: icons.download }),
    button(t('a.3mf'), () => download(to3MF(parts, 'Lithophane'), `${name()}.3mf`, 'model/3mf'), { icon: icons.layers }),
    el('button', { type: 'button', class: 'btn icon-only', title: t('a.reset'), 'aria-label': t('a.reset'), onclick: () => viewer.resetView(), html: icons.view }),
  );

  renderControls();
  // Wait for the demo font so the sample picture renders with it.
  if (document.fonts) void document.fonts.load('44px "x-russo"').finally(rebuild);
  else rebuild();

  return () => {
    disposed = true;
    viewer.dispose();
  };
}
