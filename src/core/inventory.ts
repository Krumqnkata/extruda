// SPDX-License-Identifier: AGPL-3.0-or-later
// Filament stock and print log. Pure functions: the page decides where the data lives.
import { filamentMeters, MATERIALS } from './calc';

/** Browser storage key for grams handed over from the STL analyzer, used once. */
export const PENDING_KEY = 'extruda.inventory.pending';

export interface Spool {
  id: string;
  brand: string;
  material: string;
  colorName: string;
  color: string; // #rrggbb
  diameter: number;
  /** Filament on a full spool, grams. */
  net: number;
  /** What the spool cost when full. */
  price: number;
  /** Filament left, grams. */
  remaining: number;
  /** Weight of the empty spool, grams; remembered for weighing. */
  emptySpool: number;
}

export interface LogEntry {
  id: string;
  date: string; // YYYY-MM-DD
  spoolId: string;
  /** Kept so the log still reads well after a spool is deleted. */
  spoolName: string;
  name: string;
  grams: number;
  cost: number;
}

export interface Inventory {
  version: 1;
  spools: Spool[];
  log: LogEntry[];
  /** A spool at or below this many grams counts as running low. */
  lowGrams: number;
  currency: string;
}

export const EMPTY_INVENTORY: Inventory = { version: 1, spools: [], log: [], lowGrams: 100, currency: '€' };

let counter = 0;
const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;

const materialName = (material: string) => MATERIALS.find((m) => m.id === material)?.name ?? material;

export const spoolName = (s: Pick<Spool, 'brand' | 'material' | 'colorName'>) => [s.brand, materialName(s.material), s.colorName].filter(Boolean).join(' ');

const density = (material: string) => MATERIALS.find((m) => m.id === material || m.name === material)?.density ?? 1.24;

export function spoolMeters(s: Spool): number {
  return filamentMeters(s.remaining, s.diameter, density(s.material));
}

export function spoolValue(s: Spool): number {
  return s.net > 0 ? (s.remaining / s.net) * s.price : 0;
}

export const isLow = (s: Spool, inv: Inventory) => s.remaining <= inv.lowGrams;

export function addSpool(inv: Inventory, s: Omit<Spool, 'id' | 'remaining'> & { remaining?: number }): Inventory {
  const spool: Spool = { ...s, id: newId('s'), remaining: s.remaining ?? s.net };
  return { ...inv, spools: [...inv.spools, spool] };
}

export function updateSpool(inv: Inventory, id: string, patch: Partial<Omit<Spool, 'id'>>): Inventory {
  return { ...inv, spools: inv.spools.map((s) => (s.id === id ? { ...s, ...patch } : s)) };
}

/** The log keeps its entries, so past costs stay in the totals. */
export function deleteSpool(inv: Inventory, id: string): Inventory {
  return { ...inv, spools: inv.spools.filter((s) => s.id !== id) };
}

/** Sets what is left from a weighing of the spool with filament on it. */
export function weighSpool(inv: Inventory, id: string, weight: number): Inventory {
  return {
    ...inv,
    spools: inv.spools.map((s) => (s.id === id ? { ...s, remaining: Math.max(0, weight - s.emptySpool) } : s)),
  };
}

/** Takes a print off a spool. A spool cannot go below zero; the log records what was really taken. */
export function recordPrint(inv: Inventory, spoolId: string, grams: number, name: string, date: string): Inventory {
  const spool = inv.spools.find((s) => s.id === spoolId);
  if (!spool || !(grams > 0)) return inv;
  const taken = Math.min(grams, spool.remaining);
  const cost = spool.net > 0 ? (taken / spool.net) * spool.price : 0;
  const entry: LogEntry = { id: newId('l'), date, spoolId, spoolName: spoolName(spool), name, grams: taken, cost };
  return {
    ...inv,
    spools: inv.spools.map((s) => (s.id === spoolId ? { ...s, remaining: s.remaining - taken } : s)),
    log: [entry, ...inv.log],
  };
}

/** Removes a log entry and gives the filament back, if the spool still exists. */
export function undoEntry(inv: Inventory, entryId: string): Inventory {
  const entry = inv.log.find((e) => e.id === entryId);
  if (!entry) return inv;
  return {
    ...inv,
    log: inv.log.filter((e) => e.id !== entryId),
    spools: inv.spools.map((s) => (s.id === entry.spoolId ? { ...s, remaining: Math.min(s.net, s.remaining + entry.grams) } : s)),
  };
}

export interface Totals {
  spools: number;
  grams: number;
  value: number;
  low: number;
  usedGrams: number;
  usedCost: number;
}

/** Stock on hand, plus what the log shows for dates starting with `period` (such as "2026-11"). */
export function totals(inv: Inventory, period: string): Totals {
  const used = inv.log.filter((e) => e.date.startsWith(period));
  return {
    spools: inv.spools.length,
    grams: inv.spools.reduce((sum, s) => sum + s.remaining, 0),
    value: inv.spools.reduce((sum, s) => sum + spoolValue(s), 0),
    low: inv.spools.filter((s) => isLow(s, inv)).length,
    usedGrams: used.reduce((sum, e) => sum + e.grams, 0),
    usedCost: used.reduce((sum, e) => sum + e.cost, 0),
  };
}

// ---------------------------------------------------------------- backup files

const text = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
const positive = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
const hexColor = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : '#888888');
const isoDate = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '1970-01-01');

/** Reads a backup; everything is checked, because a file can contain anything. Returns undefined if it is not one. */
export function parseBackup(json: string): Inventory | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (r.version !== 1 || !Array.isArray(r.spools) || !Array.isArray(r.log)) return undefined;
  const records = (list: unknown[]) => list.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null);
  const seen = new Set<string>();
  const uniqueId = (v: unknown, prefix: string) => {
    const id = text(v, 40);
    if (id && !seen.has(id)) {
      seen.add(id);
      return id;
    }
    return newId(prefix);
  };
  return {
    version: 1,
    lowGrams: positive(r.lowGrams) || EMPTY_INVENTORY.lowGrams,
    currency: text(r.currency, 6) || EMPTY_INVENTORY.currency,
    spools: records(r.spools).map((s) => ({
      id: uniqueId(s.id, 's'),
      brand: text(s.brand),
      material: text(s.material, 40) || 'pla',
      colorName: text(s.colorName),
      color: hexColor(s.color),
      diameter: positive(s.diameter) || 1.75,
      net: positive(s.net),
      price: positive(s.price),
      remaining: positive(s.remaining),
      emptySpool: positive(s.emptySpool),
    })),
    log: records(r.log).map((e) => ({
      id: uniqueId(e.id, 'l'),
      date: isoDate(e.date),
      spoolId: text(e.spoolId, 40),
      spoolName: text(e.spoolName),
      name: text(e.name),
      grams: positive(e.grams),
      cost: positive(e.cost),
    })),
  };
}
