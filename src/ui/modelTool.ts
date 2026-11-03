// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared page for the text-based model generators: controls on the left, live 3D preview on the right.
import type { ManifoldToplevel } from 'manifold-3d';
import type { Font } from 'opentype.js';
import { download, fileSafe, partsToSTL, to3MF } from '../core/export';
import { build } from '../core/manifold';
import { mergeMeshes, meshStats, type Part } from '../core/mesh';
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

export function toolShell(titleKey: Key, descKey: Key): ToolShell {
  const controls = el('div', { class: 'controls' });
  const host = el('div', { class: 'viewer-host' });
  const status = el('span', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const actions = el('div', { class: 'actions' });
  const stage = el('section', { class: 'stage' }, host, el('div', { class: 'stage-bar' }, status, actions));
  const root = el(
    'div',
    { class: 'tool' },
    el('aside', { class: 'panel' }, el('header', { class: 'panel-head' }, el('h1', {}, t(titleKey)), el('p', {}, t(descKey))), controls),
    stage,
  );
  return { root, controls, stage, host, status, actions };
}

export function statusText(parts: Part[]): string {
  const s = meshStats(mergeMeshes(parts.map((p) => p.mesh)));
  return t('s.ready', { tris: s.triangles.toLocaleString(), x: fmt(s.size[0]), y: fmt(s.size[1]), z: fmt(s.size[2]) });
}

export interface ModelToolSpec<S extends { font: string }> {
  id: string;
  titleKey: Key;
  descKey: Key;
  defaults: S;
  /** State keys that must never be written to browser storage (e.g. passwords). */
  privateKeys?: (keyof S)[];
  build(m: ManifoldToplevel, font: Font, state: S): Part[];
  fileName(state: S): string;
  controls(ctl: Ctl<S>): Node[];
  /** Status message shown while the model is empty. */
  emptyKey?: Key;
}

export function mountModelTool<S extends { font: string }>(spec: ModelToolSpec<S>, container: HTMLElement): () => void {
  const state = persisted(spec.id, spec.defaults);
  const shell = toolShell(spec.titleKey, spec.descKey);
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

  const renderControls = () => {
    const scroll = shell.controls.parentElement?.scrollTop ?? 0;
    shell.controls.replaceChildren(
      ...spec.controls(ctl),
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

  const name = () => fileSafe(spec.fileName(state), spec.id);
  const dl = [
    button(t('a.stl'), () => download(partsToSTL(parts, `Extruda ${spec.id}`), `${name()}.stl`, 'model/stl'), { primary: true, icon: icons.download }),
    button(t('a.3mf'), () => download(to3MF(parts, spec.fileName(state)), `${name()}.3mf`, 'model/3mf'), { icon: icons.layers }),
  ];
  shell.actions.append(
    ...dl,
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
