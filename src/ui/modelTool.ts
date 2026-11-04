// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared page for the model generators: controls on the left, live 3D preview on the right,
// downloads, share links and saved favourites.
import type { ManifoldToplevel } from 'manifold-3d';
import type { Font } from 'opentype.js';
import { download, fileSafe, objectsTo3MF, partsToSTL, type ModelObject } from '../core/export';
import { build } from '../core/manifold';
import { mergeMeshes, meshStats, type Part } from '../core/mesh';
import { decodeState, encodeState, parseHash, pickKnown } from '../core/share';
import { loadFont } from '../core/text';
import { Viewer } from '../core/viewer';
import { fmt, t } from '../i18n';
import type { Key } from '../i18n/en';
import { button, debounce, el, persisted, save, type Ctl } from './form';
import { icons } from './icons';

export interface ToolShell {
  root: HTMLElement;
  controls: HTMLElement;
  stage: HTMLElement;
  host: HTMLElement;
  status: HTMLElement;
  actions: HTMLElement;
}

export function toolShell(title: string, desc: string): ToolShell {
  const controls = el('div', { class: 'controls' });
  const host = el('div', { class: 'viewer-host' });
  const status = el('span', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const actions = el('div', { class: 'actions' });
  const stage = el('section', { class: 'stage' }, host, el('div', { class: 'stage-bar' }, status, actions));
  const root = el(
    'div',
    { class: 'tool' },
    el('aside', { class: 'panel' }, el('header', { class: 'panel-head' }, el('h1', {}, title), el('p', {}, desc)), controls),
    stage,
  );
  return { root, controls, stage, host, status, actions };
}

export function statusText(parts: Part[]): string {
  const s = meshStats(mergeMeshes(parts.map((p) => p.mesh)));
  return t('s.ready', { tris: s.triangles.toLocaleString(), x: fmt(s.size[0]), y: fmt(s.size[1]), z: fmt(s.size[2]) });
}

/** Groups parts into slicer objects: parts with the same `group` stay together, others stand alone. */
export function partsToObjects(parts: Part[], separate: boolean, title: string): ModelObject[] {
  if (!separate) return [{ name: title, parts }];
  const objects = new Map<string, ModelObject>();
  for (const part of parts) {
    const key = part.group ?? part.name;
    if (!objects.has(key)) objects.set(key, { name: key, parts: [] });
    objects.get(key)!.parts.push(part);
  }
  return [...objects.values()];
}

export interface ModelToolSpec<S extends { font: string }> {
  /** Storage key for settings and favourites. */
  id: string;
  /** Hash route used in share links; defaults to the id. */
  route?: string;
  title: string;
  desc: string;
  defaults: S;
  /** State keys that are never stored or shared (passwords). */
  privateKeys?: (keyof S)[];
  /** State keys kept on this device but left out of share links (e.g. a list of names). */
  linkOmit?: (keyof S)[];
  build(m: ManifoldToplevel, font: Font, state: S): Part[];
  fileName(state: S): string;
  controls(ctl: Ctl<S>): Node[];
  /** Status message shown while the model is empty. */
  emptyKey?: Key;
  /** Export each part (or part group) as its own object, e.g. a box and its lid. */
  separateObjects?: boolean;
}

interface Preset {
  name: string;
  state: Record<string, unknown>;
}

function loadPresets(id: string): Preset[] {
  try {
    const v = JSON.parse(localStorage.getItem(`extruda.presets.${id}`) ?? '[]');
    return Array.isArray(v) ? (v as Preset[]) : [];
  } catch {
    return [];
  }
}

function storePresets(id: string, presets: Preset[]): void {
  try {
    localStorage.setItem(`extruda.presets.${id}`, JSON.stringify(presets));
  } catch {
    /* storage unavailable */
  }
}

export function mountModelTool<S extends { font: string }>(spec: ModelToolSpec<S>, container: HTMLElement): () => void {
  const state = persisted(spec.id, spec.defaults);
  const shared = parseHash(location.hash).params.get('s');
  if (shared) Object.assign(state, decodeState(shared, spec.defaults));
  const omit = [...(spec.privateKeys ?? []), ...(spec.linkOmit ?? [])] as string[];
  const shell = toolShell(spec.title, spec.desc);
  container.append(shell.root);
  const viewer = new Viewer(shell.host);
  let parts: Part[] = [];
  let generation = 0;
  let disposed = false;

  const setStatus = (s: string, kind: 'ok' | 'busy' | 'error' = 'ok') => {
    shell.status.textContent = s;
    shell.status.dataset.kind = kind;
  };

  const rebuild = async () => {
    const gen = ++generation;
    setStatus(t('s.building'), 'busy');
    try {
      const font = await loadFont(state.font);
      const next = await build((m) => spec.build(m, font, state));
      if (disposed || gen !== generation) return;
      parts = next;
      viewer.setParts(parts);
      if (parts.length) setStatus(statusText(parts));
      else setStatus(t(spec.emptyKey ?? 's.empty'));
      dl.forEach((b) => (b.disabled = !parts.length));
    } catch (err) {
      if (gen !== generation) return;
      console.error(err);
      setStatus(t('s.error', { msg: err instanceof Error ? err.message : String(err) }), 'error');
    }
  };
  const scheduleRebuild = debounce(rebuild, 120);

  const ctl: Ctl<S> = {
    state,
    change(structural) {
      save(spec.id, state, spec.privateKeys);
      if (structural) renderControls();
      scheduleRebuild();
    },
  };

  const favourites = (): HTMLElement => {
    const presets = loadPresets(spec.id);
    const pick = el('select', { 'aria-label': t('p.favourites') }, el('option', { value: '' }, t('p.choose')));
    presets.forEach((p, i) => pick.append(el('option', { value: String(i) }, p.name)));
    pick.addEventListener('change', () => {
      const preset = presets[Number(pick.value)];
      if (!preset) return;
      Object.assign(state, spec.defaults, pickKnown(preset.state, spec.defaults));
      ctl.change(true);
    });
    const name = el('input', { type: 'text', placeholder: t('p.name'), 'aria-label': t('p.name'), maxlength: 40 });
    const saveBtn = button(t('p.save'), () => {
      const label = name.value.trim() || new Date().toLocaleString();
      const copy: Record<string, unknown> = { ...state };
      for (const k of spec.privateKeys ?? []) delete copy[k as string];
      storePresets(spec.id, [...presets.filter((p) => p.name !== label), { name: label, state: copy }]);
      renderControls();
    });
    const del = button(t('p.delete'), () => {
      const i = Number(pick.value);
      if (!pick.value || !presets[i]) return;
      storePresets(spec.id, presets.filter((_, j) => j !== i));
      renderControls();
    });
    return el(
      'details',
      { class: 'section' },
      el('summary', {}, t('p.favourites')),
      el('div', { class: 'section-body' }, presets.length ? el('div', { class: 'row' }, pick, del) : el('p', { class: 'hint' }, t('p.none')), el('div', { class: 'row' }, name, saveBtn)),
    );
  };

  const renderControls = () => {
    const scroll = shell.controls.parentElement?.scrollTop ?? 0;
    shell.controls.replaceChildren(
      ...spec.controls(ctl),
      favourites(),
      el(
        'div',
        { class: 'panel-foot' },
        button(t('a.defaults'), () => {
          Object.assign(state, spec.defaults);
          ctl.change(true);
        }, { icon: icons.refresh }),
      ),
    );
    if (shell.controls.parentElement) shell.controls.parentElement.scrollTop = scroll;
  };

  const shareLink = async () => {
    const url = `${location.origin}${location.pathname}#/${spec.route ?? spec.id}?s=${encodeState(state, omit)}`;
    try {
      await navigator.clipboard.writeText(url);
      setStatus(t('s.linkCopied'));
    } catch {
      window.prompt(t('a.share'), url);
    }
  };

  const name = () => fileSafe(spec.fileName(state), spec.id);
  const dl = [
    button(t('a.stl'), () => download(partsToSTL(parts, `Extruda ${spec.id}`), `${name()}.stl`, 'model/stl'), { primary: true, icon: icons.download }),
    button(t('a.3mf'), () => download(objectsTo3MF(partsToObjects(parts, !!spec.separateObjects, spec.fileName(state)), spec.fileName(state)), `${name()}.3mf`, 'model/3mf'), { icon: icons.layers }),
    button(t('a.3mfSlicer'), () => {
      download(objectsTo3MF(partsToObjects(parts, !!spec.separateObjects, spec.fileName(state)), spec.fileName(state), { slicerFilaments: true }), `${name()}_filaments.3mf`, 'model/3mf');
      setStatus(t('s.slicerBeta'));
    }, { icon: icons.palette }),
  ];
  shell.actions.append(
    ...dl,
    el('button', { type: 'button', class: 'btn icon-only', title: t('a.share'), 'aria-label': t('a.share'), onclick: () => void shareLink(), html: icons.link }),
    el('button', { type: 'button', class: 'btn icon-only', title: t('a.reset'), 'aria-label': t('a.reset'), onclick: () => viewer.resetView(), html: icons.view }),
  );
  dl.forEach((b) => (b.disabled = true));

  renderControls();
  setStatus(t('s.loading'), 'busy');
  void rebuild();

  return () => {
    disposed = true;
    viewer.dispose();
  };
}
