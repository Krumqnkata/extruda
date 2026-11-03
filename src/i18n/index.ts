// SPDX-License-Identifier: AGPL-3.0-or-later
import { bg } from './bg';
import { en, type Key } from './en';

export type Lang = 'bg' | 'en';
const dicts = { bg, en };

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('extruda.lang');
    if (saved === 'bg' || saved === 'en') return saved;
  } catch {
    /* storage unavailable */
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('bg') ? 'bg' : 'en';
}

let lang: Lang = typeof window === 'undefined' ? 'en' : initialLang();
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return lang;
}

export function setLang(next: Lang): void {
  lang = next;
  try {
    localStorage.setItem('extruda.lang', next);
  } catch {
    /* storage unavailable */
  }
  document.documentElement.lang = next;
  listeners.forEach((fn) => fn());
}

export function onLangChange(fn: () => void): void {
  listeners.add(fn);
}

export function t(key: Key, vars?: Record<string, string | number>): string {
  let s = dicts[lang][key] ?? en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

/** Locale-aware number formatting with a fixed number of decimals. */
export function fmt(n: number, digits = 1): string {
  return n.toLocaleString(lang === 'bg' ? 'bg-BG' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
