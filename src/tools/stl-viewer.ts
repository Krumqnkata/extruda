// SPDX-License-Identifier: AGPL-3.0-or-later
import * as THREE from 'three';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { estimateWeight, filamentMeters, MATERIALS } from '../core/calc';
import { meshStats, mergeMeshes, type MeshStats, type TriMesh } from '../core/mesh';
import { Viewer } from '../core/viewer';
import { fmt, t } from '../i18n';
import type { Key } from '../i18n/en';
import { el, hint, number, persisted, range, save, select, type Ctl } from '../ui/form';
import { icons } from '../ui/icons';
import { toolShell } from '../ui/modelTool';

const DEFAULTS = { material: 'pla', infill: 15, shell: 1.2, pricePerKg: 20, currency: '€', scale: 100 };
type State = typeof DEFAULTS;

// Keeps the last opened model while switching pages or language.
let loaded: { name: string; mesh: TriMesh } | undefined;

function objectToMesh(root: THREE.Object3D): TriMesh {
  root.updateMatrixWorld(true);
  const meshes: TriMesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    geo.applyMatrix4(m.matrixWorld);
    const positions = new Float32Array(geo.getAttribute('position').array);
    meshes.push({ positions, indices: Uint32Array.from({ length: positions.length / 3 }, (_, i) => i) });
    geo.dispose();
  });
  return mergeMeshes(meshes);
}

async function parseFile(file: File): Promise<TriMesh> {
  const buf = await file.arrayBuffer();
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === '3mf') return objectToMesh(new ThreeMFLoader().parse(buf));
  if (ext === 'obj') return objectToMesh(new OBJLoader().parse(new TextDecoder().decode(buf)));
  const geo = new STLLoader().parse(buf);
  return objectToMesh(new THREE.Mesh(geo));
}

export function mount(container: HTMLElement): () => void {
  const state = persisted('stl', DEFAULTS);
  const shell = toolShell('tool.stl.title', 'tool.stl.desc');
  shell.root.classList.add('analyzer');
  container.append(shell.root);
  const viewer = new Viewer(shell.host);
  let stats: MeshStats | undefined;

  const statsBox = el('div', { class: 'results' });
  const fileInput = el('input', { type: 'file', accept: '.stl,.3mf,.obj', hidden: true });

  const showStats = () => {
    if (!stats) {
      statsBox.replaceChildren(hint(t('stl.hint')));
      return;
    }
    const k = state.scale / 100;
    const density = MATERIALS.find((m) => m.id === state.material)?.density ?? 1.24;
    const volume = stats.volume * k ** 3;
    const area = stats.area * k ** 2;
    const w = estimateWeight(volume, area, density, state.infill, state.shell);
    const row = (key: Key, value: string, strong = false) =>
      el('div', { class: strong ? 'result strong' : 'result' }, el('span', {}, t(key)), el('output', { class: 'result-value' }, value));
    statsBox.replaceChildren(
      row('stl.size', `${stats.size.map((v) => fmt(v * k)).join(' × ')} ${t('u.mm')}`),
      row('stl.volume', `${fmt(volume / 1000, 2)} cm³`),
      row('stl.area', `${fmt(area / 100, 1)} cm²`),
      row('stl.triangles', stats.triangles.toLocaleString()),
      row('stl.weight', `${fmt(w.grams, 1)} ${t('u.g')}`, true),
      row('stl.length', `${fmt(filamentMeters(w.grams, 1.75, density), 2)} ${t('u.m')}`),
      row('stl.cost', `${fmt((w.grams / 1000) * state.pricePerKg, 2)} ${state.currency}`, true),
      hint(t('stl.estimateHint')),
    );
  };

  const show = () => {
    if (!loaded) return;
    stats = meshStats(loaded.mesh);
    // Centre on the plate so the preview grid sits under the model.
    const p = loaded.mesh.positions.slice();
    const [sx, sy] = stats.size;
    const [mx, my, mz] = stats.min;
    const k = state.scale / 100;
    for (let i = 0; i < p.length; i += 3) {
      p[i] = (p[i] - mx - sx / 2) * k;
      p[i + 1] = (p[i + 1] - my - sy / 2) * k;
      p[i + 2] = (p[i + 2] - mz) * k;
    }
    viewer.setParts([{ name: loaded.name, color: '#ff7a1a', mesh: { positions: p, indices: loaded.mesh.indices } }], { fit: true });
    shell.status.textContent = loaded.name;
    shell.status.dataset.kind = 'ok';
    showStats();
  };

  const open = async (file: File | undefined) => {
    if (!file) return;
    shell.status.textContent = t('s.building');
    shell.status.dataset.kind = 'busy';
    try {
      loaded = { name: file.name, mesh: await parseFile(file) };
      show();
    } catch (err) {
      console.error(err);
      shell.status.textContent = t('stl.error');
      shell.status.dataset.kind = 'error';
    }
  };
  fileInput.addEventListener('change', () => void open(fileInput.files?.[0]));

  const zone = el(
    'button',
    { type: 'button', class: 'drop', onclick: () => fileInput.click() },
    el('span', { class: 'icon', html: icons.upload, 'aria-hidden': 'true' }),
    el('span', {}, t('stl.drop')),
  );
  // The whole page accepts dropped files, not just the button.
  const onDrag = (e: DragEvent) => {
    e.preventDefault();
    shell.root.classList.toggle('over', e.type === 'dragover');
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    shell.root.classList.remove('over');
    void open(e.dataTransfer?.files[0]);
  };
  shell.root.addEventListener('dragover', onDrag);
  shell.root.addEventListener('dragleave', onDrag);
  shell.root.addEventListener('drop', onDrop);

  const ctl: Ctl<State> = {
    state,
    change() {
      save('stl', state);
      showStats();
    },
  };
  // Scaling changes the preview geometry, the other settings only the numbers.
  const scaleCtl: Ctl<State> = {
    state,
    change() {
      save('stl', state);
      if (loaded) show();
    },
  };

  shell.controls.append(
    zone,
    fileInput,
    statsBox,
    el(
      'div',
      { class: 'fields' },
      select(ctl, 'material', t('stl.material'), MATERIALS.map((m) => [m.id, `${m.name} · ${m.density} g/cm³`])),
      range(ctl, 'infill', t('stl.infill'), { min: 0, max: 100, step: 1, unit: t('u.pct') }),
      range(ctl, 'shell', t('stl.shell'), { min: 0.4, max: 4, step: 0.1, unit: t('u.mm') }),
      range(scaleCtl, 'scale', t('stl.scale'), { min: 10, max: 400, step: 1, unit: t('u.pct') }),
      number(ctl, 'pricePerKg', t('stl.price'), { unit: state.currency, min: 0 }),
    ),
  );
  shell.actions.append(
    el('button', { type: 'button', class: 'btn primary', onclick: () => fileInput.click() }, el('span', { class: 'icon', html: icons.upload }), t('a.open')),
    el('button', { type: 'button', class: 'btn icon-only', title: t('a.reset'), 'aria-label': t('a.reset'), onclick: () => viewer.resetView(), html: icons.view }),
  );

  if (loaded) show();
  else {
    showStats();
    shell.status.textContent = t('stl.hint');
  }
  return () => viewer.dispose();
}
