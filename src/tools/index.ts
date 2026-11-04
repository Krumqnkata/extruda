// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Key } from '../i18n/en';
import { icons } from '../ui/icons';

export type Group = 'make' | 'models' | 'parts' | 'mesh' | 'printer';

export interface ToolEntry {
  id: string;
  group: Group;
  icon: string;
  title: Key;
  desc: Key;
  /** Hash route when it differs from the id, e.g. a model inside the gallery. */
  route?: string;
  load: () => Promise<{ mount(container: HTMLElement): () => void }>;
}

export const GROUPS: { id: Group; title: Key }[] = [
  { id: 'make', title: 'group.make' },
  { id: 'models', title: 'group.models' },
  { id: 'parts', title: 'group.parts' },
  { id: 'mesh', title: 'group.mesh' },
  { id: 'printer', title: 'group.printer' },
];

// Tools load on demand so the home page stays light.
export const TOOLS: ToolEntry[] = [
  { id: 'keychain', group: 'make', icon: icons.keychain, title: 'tool.keychain.title', desc: 'tool.keychain.desc', load: () => import('./keychain') },
  { id: 'logo', group: 'make', icon: icons.shape, title: 'tool.logo.title', desc: 'tool.logo.desc', load: () => import('./logo') },
  { id: 'sign', group: 'make', icon: icons.sign, title: 'tool.sign.title', desc: 'tool.sign.desc', load: () => import('./sign') },
  { id: 'qr', group: 'make', icon: icons.qr, title: 'tool.qr.title', desc: 'tool.qr.desc', load: () => import('./qr') },
  { id: 'gridfinity', group: 'make', icon: icons.grid, title: 'tool.gridfinity.title', desc: 'tool.gridfinity.desc', load: () => import('./gridfinity') },
  { id: 'box', group: 'make', icon: icons.box, title: 'tool.box.title', desc: 'tool.box.desc', load: () => import('./box') },
  { id: 'cutter', group: 'make', icon: icons.cookie, title: 'tool.cutter.title', desc: 'tool.cutter.desc', load: () => import('./cutter') },
  { id: 'stencil', group: 'make', icon: icons.stencil, title: 'tool.stencil.title', desc: 'tool.stencil.desc', load: () => import('./stencil') },
  { id: 'lithophane', group: 'make', icon: icons.image, title: 'tool.lithophane.title', desc: 'tool.lithophane.desc', load: () => import('./lithophane') },
  { id: 'models', group: 'models', icon: icons.sparkles, title: 'tool.models.title', desc: 'tool.models.desc', load: () => import('./gallery') },
  { id: 'gear', group: 'parts', route: 'models/gear', icon: icons.gear, title: 'tool.gear.title', desc: 'tool.gear.desc', load: () => import('./gallery') },
  { id: 'bolt-nut', group: 'parts', route: 'models/bolt-nut', icon: icons.bolt, title: 'tool.bolt.title', desc: 'tool.bolt.desc', load: () => import('./gallery') },
  { id: 'pegboard', group: 'parts', route: 'models/pegboard', icon: icons.pegboard, title: 'tool.pegboard.title', desc: 'tool.pegboard.desc', load: () => import('./gallery') },
  { id: 'enclosure', group: 'parts', route: 'models/enclosure', icon: icons.chip, title: 'tool.enclosure.title', desc: 'tool.enclosure.desc', load: () => import('./gallery') },
  { id: 'hinge', group: 'parts', route: 'models/hinge', icon: icons.hinge, title: 'tool.hinge.title', desc: 'tool.hinge.desc', load: () => import('./gallery') },
  { id: 'snap-fit', group: 'parts', route: 'models/snap-fit', icon: icons.snap, title: 'tool.snap.title', desc: 'tool.snap.desc', load: () => import('./gallery') },
  { id: 'stl', group: 'mesh', icon: icons.cube, title: 'tool.stl.title', desc: 'tool.stl.desc', load: () => import('./stl-viewer') },
  { id: 'mesh-check', group: 'mesh', route: 'mesh/check', icon: icons.check, title: 'tool.meshcheck.title', desc: 'tool.meshcheck.desc', load: () => import('./mesh-tools') },
  { id: 'mesh', group: 'mesh', route: 'mesh/convert', icon: icons.swap, title: 'tool.meshconvert.title', desc: 'tool.meshconvert.desc', load: () => import('./mesh-tools') },
  { id: 'mesh-orient', group: 'mesh', route: 'mesh/orient', icon: icons.rotate, title: 'tool.meshorient.title', desc: 'tool.meshorient.desc', load: () => import('./mesh-tools') },
  { id: 'mesh-cut', group: 'mesh', route: 'mesh/cut', icon: icons.cut, title: 'tool.meshcut.title', desc: 'tool.meshcut.desc', load: () => import('./mesh-tools') },
  { id: 'calculators', group: 'printer', icon: icons.calc, title: 'tool.calc.title', desc: 'tool.calc.desc', load: () => import('./calculators') },
  { id: 'gcode', group: 'printer', icon: icons.code, title: 'tool.gcode.title', desc: 'tool.gcode.desc', load: () => import('./gcode') },
  { id: 'calibration', group: 'printer', icon: icons.ruler, title: 'tool.calibration.title', desc: 'tool.calibration.desc', load: () => import('./calibration') },
  { id: 'swatch', group: 'printer', icon: icons.swatch, title: 'tool.swatch.title', desc: 'tool.swatch.desc', load: () => import('./swatch') },
  { id: 'inventory', group: 'printer', icon: icons.spool, title: 'tool.inventory.title', desc: 'tool.inventory.desc', load: () => import('./inventory') },
  { id: 'guide', group: 'printer', icon: icons.book, title: 'tool.guide.title', desc: 'tool.guide.desc', load: () => import('./guide') },
  { id: 'quote', group: 'printer', icon: icons.quote, title: 'tool.quote.title', desc: 'tool.quote.desc', load: () => import('./quote') },
];
