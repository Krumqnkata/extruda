// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Key } from '../i18n/en';
import { icons } from '../ui/icons';

export interface ToolEntry {
  id: string;
  icon: string;
  title: Key;
  desc: Key;
  load: () => Promise<{ mount(container: HTMLElement): () => void }>;
}

// Tools load on demand so the home page stays light.
export const TOOLS: ToolEntry[] = [
  { id: 'keychain', icon: icons.keychain, title: 'tool.keychain.title', desc: 'tool.keychain.desc', load: () => import('./keychain') },
  { id: 'sign', icon: icons.sign, title: 'tool.sign.title', desc: 'tool.sign.desc', load: () => import('./sign') },
  { id: 'qr', icon: icons.qr, title: 'tool.qr.title', desc: 'tool.qr.desc', load: () => import('./qr') },
  { id: 'lithophane', icon: icons.image, title: 'tool.lithophane.title', desc: 'tool.lithophane.desc', load: () => import('./lithophane') },
  { id: 'calculators', icon: icons.calc, title: 'tool.calc.title', desc: 'tool.calc.desc', load: () => import('./calculators') },
  { id: 'stl', icon: icons.cube, title: 'tool.stl.title', desc: 'tool.stl.desc', load: () => import('./stl-viewer') },
];
