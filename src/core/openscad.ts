// SPDX-License-Identifier: AGPL-3.0-or-later
// Runs OpenSCAD (WebAssembly, GPL-2.0-or-later). Over 10 MB, so only the worker loads this file.
import { createOpenSCAD } from 'openscad-wasm-prebuilt';

export interface ScadResult {
  /** The STL file, when the script produced 3D geometry. */
  stl?: string;
  log: string[];
}

/** One render in a fresh instance: OpenSCAD is built to run once per process. */
export async function renderScad(source: string, defines: string[]): Promise<ScadResult> {
  const log: string[] = [];
  const add = (s: string) => log.push(s);
  const scad = await createOpenSCAD({ print: add, printErr: add });
  const wasm = scad.getInstance();
  wasm.FS.writeFile('/input.scad', source);
  let code: number;
  try {
    code = wasm.callMain(['/input.scad', '-o', '/output.stl', ...defines]);
  } catch (err) {
    add(err instanceof Error ? err.message : String(err));
    return { log };
  }
  if (code !== 0) return { log };
  try {
    const stl = wasm.FS.readFile('/output.stl', { encoding: 'utf8' });
    return { stl: stl.length > 0 ? stl : undefined, log };
  } catch {
    return { log };
  }
}
