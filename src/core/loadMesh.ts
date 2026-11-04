// SPDX-License-Identifier: AGPL-3.0-or-later
// Reads STL, 3MF and OBJ files into plain triangle meshes.
import * as THREE from 'three';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { mergeMeshes, type TriMesh } from './mesh';

export function objectToMesh(root: THREE.Object3D): TriMesh {
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

export function parseMesh(buf: ArrayBuffer, fileName: string): TriMesh {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === '3mf') return objectToMesh(new ThreeMFLoader().parse(buf));
  if (ext === 'obj') return objectToMesh(new OBJLoader().parse(new TextDecoder().decode(buf)));
  return objectToMesh(new THREE.Mesh(new STLLoader().parse(buf)));
}

export async function parseFile(file: File): Promise<TriMesh> {
  return parseMesh(await file.arrayBuffer(), file.name);
}

/** Merges vertices at the same position (files such as STL repeat them for every triangle). */
export function weldVertices(mesh: TriMesh, tolerance = 1e-4): TriMesh {
  const p = mesh.positions;
  const ids = new Map<string, number>();
  const remap = new Uint32Array(p.length / 3);
  const out: number[] = [];
  const k = 1 / tolerance;
  for (let i = 0; i < remap.length; i++) {
    const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
    const key = `${Math.round(x * k)},${Math.round(y * k)},${Math.round(z * k)}`;
    let id = ids.get(key);
    if (id === undefined) {
      id = ids.size;
      ids.set(key, id);
      out.push(x, y, z);
    }
    remap[i] = id;
  }
  const indices = new Uint32Array(mesh.indices.length);
  for (let i = 0; i < indices.length; i++) indices[i] = remap[mesh.indices[i]];
  return { positions: new Float32Array(out), indices };
}
