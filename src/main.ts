// SPDX-License-Identifier: AGPL-3.0-or-later
// Extruda – free in-browser 3D print workshop. Copyright (C) 2026 Krumqnkata.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU Affero General Public License as published by the Free Software Foundation, version 3 or later.
import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { registerFontFaces } from './core/fonts';
import { getLang, onLangChange, setLang, t } from './i18n';
import { parseHash } from './core/share';
import { GROUPS, TOOLS, type ToolEntry } from './tools';
import { el } from './ui/form';
import { icons } from './ui/icons';

const REPO = 'https://github.com/Krumqnkata/extruda';
const LOGO = `${import.meta.env.BASE_URL}logo.svg`;

// ---------------------------------------------------------------- theme

type Theme = 'light' | 'dark';
function storedTheme(): Theme | null {
  try {
    const v = localStorage.getItem('extruda.theme');
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}
const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
const currentTheme = (): Theme => (document.documentElement.dataset.theme as Theme | undefined) ?? (systemDark() ? 'dark' : 'light');

function applyTheme(theme: Theme | null): void {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  window.dispatchEvent(new Event('themechange'));
}

// ---------------------------------------------------------------- shell

const app = document.getElementById('app')!;
const main = el('main', { id: 'main' });

const currentRoute = () => parseHash(location.hash).path.split('/')[0];

function navLink(tool: ToolEntry, route: string): HTMLElement {
  return el(
    'a',
    { href: `#/${tool.id}`, class: route === tool.id ? 'active' : '', 'aria-current': route === tool.id ? 'page' : null },
    el('span', { class: 'icon', html: tool.icon, 'aria-hidden': 'true' }),
    el('span', {}, t(tool.title)),
  );
}

function header(): HTMLElement {
  const route = currentRoute();
  const nav = el(
    'nav',
    { class: 'nav', 'aria-label': t('home.tools') },
    ...GROUPS.map((g) => {
      const tools = TOOLS.filter((x) => x.group === g.id);
      if (tools.length === 1) return navLink(tools[0], route);
      const active = tools.some((x) => x.id === route);
      return el(
        'details',
        { class: active ? 'nav-group active' : 'nav-group' },
        el('summary', {}, t(g.title), el('span', { class: 'icon chevron', html: icons.chevron, 'aria-hidden': 'true' })),
        el('div', { class: 'nav-menu' }, ...tools.map((x) => navLink(x, route))),
      );
    }),
  );
  const menu = el('button', { type: 'button', class: 'btn icon-only menu-btn', 'aria-label': t('nav.menu'), 'aria-expanded': 'false', html: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>' });
  menu.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menu.setAttribute('aria-expanded', String(open));
    // On phones the menu shows every group expanded.
    nav.querySelectorAll('details').forEach((d) => (d.open = open));
  });
  return el(
    'header',
    { class: 'top' },
    el('a', { href: '#/', class: 'brand', 'aria-label': 'Extruda' }, el('img', { src: LOGO, alt: '', width: 32, height: 32 }), el('span', {}, 'Extruda')),
    nav,
    el(
      'div',
      { class: 'top-actions' },
      el('button', { type: 'button', class: 'btn ghost lang', title: t('lang.switch'), onclick: () => setLang(getLang() === 'bg' ? 'en' : 'bg') },
        el('span', { class: 'icon', html: icons.globe, 'aria-hidden': 'true' }), getLang() === 'bg' ? 'EN' : 'BG'),
      el('button', {
        type: 'button',
        class: 'btn icon-only ghost',
        title: t('theme.toggle'),
        'aria-label': t('theme.toggle'),
        html: currentTheme() === 'dark' ? icons.sun : icons.moon,
        onclick: () => {
          const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
          try {
            localStorage.setItem('extruda.theme', next);
          } catch {
            /* storage unavailable */
          }
          applyTheme(next);
          renderChrome();
        },
      }),
      el('a', { class: 'btn icon-only ghost', href: REPO, target: '_blank', rel: 'noopener', title: 'GitHub', 'aria-label': 'GitHub', html: icons.github }),
      menu,
    ),
  );
}

function footer(): HTMLElement {
  return el(
    'footer',
    { class: 'foot' },
    el('p', { class: 'private' }, el('span', { class: 'icon', html: icons.lock, 'aria-hidden': 'true' }), t('footer.private')),
    el(
      'p',
      {},
      `© 2026 Krumqnkata · `,
      el('a', { href: `${REPO}/blob/main/LICENSE`, target: '_blank', rel: 'noopener' }, t('footer.license')),
      ' · ',
      el('a', { href: REPO, target: '_blank', rel: 'noopener' }, t('footer.source')),
    ),
    el('p', { class: 'muted' }, t('footer.yours')),
  );
}

function home(container: HTMLElement): void {
  const feature = (icon: string, title: Parameters<typeof t>[0], text: Parameters<typeof t>[0]) =>
    el('div', { class: 'feature' }, el('span', { class: 'icon badge', html: icon, 'aria-hidden': 'true' }), el('h3', {}, t(title)), el('p', {}, t(text)));
  container.append(
    el(
      'div',
      { class: 'home' },
      el(
        'section',
        { class: 'hero' },
        el('div', { class: 'hero-text' },
          el('p', { class: 'eyebrow' }, t('app.tagline')),
          el('h1', {}, t('home.title')),
          el('p', { class: 'lead' }, t('home.subtitle')),
          el('div', { class: 'hero-cta' },
            el('a', { class: 'btn primary big', href: '#/keychain' }, t('home.cta'), el('span', { class: 'icon', html: icons.arrow, 'aria-hidden': 'true' })),
            el('a', { class: 'btn big', href: REPO, target: '_blank', rel: 'noopener' }, el('span', { class: 'icon', html: icons.github, 'aria-hidden': 'true' }), 'GitHub'))),
        el('div', { class: 'hero-art', 'aria-hidden': 'true' }, el('img', { src: LOGO, alt: '' })),
      ),
      ...GROUPS.flatMap((g) => [
        el('h2', { class: 'section-title' }, t(g.title)),
        el(
          'div',
          { class: 'cards' },
          ...TOOLS.filter((tool) => tool.group === g.id).map((tool) =>
            el('a', { class: 'card tool-card', href: `#/${tool.id}` },
              el('span', { class: 'icon badge', html: tool.icon, 'aria-hidden': 'true' }),
              el('h3', {}, t(tool.title)),
              el('p', {}, t(tool.desc)),
              el('span', { class: 'go icon', html: icons.arrow, 'aria-hidden': 'true' })),
          ),
        ),
      ]),
      el(
        'div',
        { class: 'features' },
        feature(icons.lock, 'home.f1.title', 'home.f1.text'),
        feature(icons.layers, 'home.f2.title', 'home.f2.text'),
        feature(icons.type, 'home.f3.title', 'home.f3.text'),
      ),
    ),
  );
}

// ---------------------------------------------------------------- routing

let cleanup: (() => void) | undefined;
let routeToken = 0;

async function route(): Promise<void> {
  const token = ++routeToken;
  cleanup?.();
  cleanup = undefined;
  main.replaceChildren();
  const tool = TOOLS.find((x) => x.id === currentRoute());
  document.title = tool ? `${t(tool.title)} · Extruda` : `Extruda · ${t('app.tagline')}`;
  document.body.dataset.page = tool ? 'tool' : 'home';
  if (!tool) {
    home(main);
    return;
  }
  const mod = await tool.load();
  if (token !== routeToken) return;
  cleanup = mod.mount(main);
  window.scrollTo(0, 0);
}

function renderChrome(): void {
  app.replaceChildren(header(), main, footer());
}

function rerender(): void {
  renderChrome();
  void route();
}

document.documentElement.lang = getLang();
applyTheme(storedTheme());
registerFontFaces();
window.addEventListener('hashchange', rerender);
// Close open navigation menus when clicking anywhere else.
document.addEventListener('click', (e) => {
  if (document.querySelector('.nav.open')) return;
  for (const d of document.querySelectorAll<HTMLDetailsElement>('.nav-group[open]')) {
    if (!d.contains(e.target as Node)) d.open = false;
  }
});
onLangChange(rerender);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (storedTheme()) return;
  window.dispatchEvent(new Event('themechange'));
  renderChrome();
});
rerender();

function toast(message: string): void {
  const note = el('div', { class: 'toast', role: 'status' }, message);
  document.body.append(note);
  setTimeout(() => note.remove(), 4000);
}

registerSW({ immediate: true, onOfflineReady: () => toast(t('pwa.offline')) });
