// SPDX-License-Identifier: AGPL-3.0-or-later
// Loads the Manifold WASM geometry kernel once and converts its output to plain arrays.
import Module from 'manifold-3d';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { cleanup, garbageCollectManifold } from 'manifold-3d/lib/garbage-collector.js';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import type { TriMesh } from './mesh';

let loading: Promise<ManifoldToplevel> | undefined;

export function getManifold(): Promise<ManifoldToplevel> {
  loading ??= Module(typeof window === 'undefined' ? undefined : { locateFile: () => wasmUrl }).then((m) => {
    m.setup();
    // Every object returned by the wrapped API is freed by cleanup(), so callers never leak WASM memory.
    return garbageCollectManifold(m);
  });
  return loading;
}

/** Runs a geometry build and frees every intermediate WASM object afterwards. */
export async function build<T>(fn: (m: ManifoldToplevel) => T): Promise<T> {
  const m = await getManifold();
  try {
    return fn(m);
  } finally {
    cleanup();
  }
}

export function toTriMesh(solid: Manifold): TriMesh {
  const mesh = solid.getMesh();
  const stride = mesh.numProp;
  const count = mesh.vertProperties.length / stride;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = mesh.vertProperties[i * stride];
    positions[i * 3 + 1] = mesh.vertProperties[i * stride + 1];
    positions[i * 3 + 2] = mesh.vertProperties[i * stride + 2];
  }
  return { positions, indices: new Uint32Array(mesh.triVerts) };
}
