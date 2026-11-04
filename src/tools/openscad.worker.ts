// SPDX-License-Identifier: AGPL-3.0-or-later
// Runs OpenSCAD away from the page, so a slow script cannot freeze it and "Stop" can simply end the worker.
export interface ScadRequest {
  source: string;
  defines: string[];
}

self.onmessage = async (e: MessageEvent<ScadRequest>) => {
  try {
    const { renderScad } = await import('../core/openscad');
    self.postMessage(await renderScad(e.data.source, e.data.defines));
  } catch (err) {
    self.postMessage({ failed: true, log: [err instanceof Error ? err.message : String(err)] });
  }
};
