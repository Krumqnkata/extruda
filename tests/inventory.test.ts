// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  addSpool, deleteSpool, EMPTY_INVENTORY, isLow, parseBackup, recordPrint, spoolMeters, spoolName, spoolValue, totals, undoEntry, updateSpool, weighSpool,
  type Inventory,
} from '../src/core/inventory';

const pla = { brand: 'Acme', material: 'pla', colorName: 'Red', color: '#ff0000', diameter: 1.75, net: 1000, price: 20, emptySpool: 200 };

function withSpool(): { inv: Inventory; id: string } {
  const inv = addSpool(EMPTY_INVENTORY, pla);
  return { inv, id: inv.spools[0].id };
}

describe('filament stock', () => {
  it('a new spool starts full and knows its length and value', () => {
    const { inv } = withSpool();
    const s = inv.spools[0];
    expect(s.remaining).toBe(1000);
    expect(spoolName(s)).toBe('Acme PLA Red');
    expect(spoolValue(s)).toBeCloseTo(20);
    expect(spoolMeters(s)).toBeCloseTo(335.3, 0);
  });

  it('does not change the inventory it was given', () => {
    const { inv, id } = withSpool();
    recordPrint(inv, id, 100, 'Test', '2026-11-04');
    expect(inv.spools[0].remaining).toBe(1000);
    expect(inv.log).toHaveLength(0);
    expect(EMPTY_INVENTORY.spools).toHaveLength(0);
  });

  it('takes a print off the spool and logs its cost', () => {
    const { inv, id } = withSpool();
    const after = recordPrint(inv, id, 250, 'Keychain', '2026-11-04');
    expect(after.spools[0].remaining).toBe(750);
    expect(after.log[0]).toMatchObject({ name: 'Keychain', grams: 250, date: '2026-11-04' });
    expect(after.log[0].cost).toBeCloseTo(5);
    expect(spoolValue(after.spools[0])).toBeCloseTo(15);
  });

  it('never goes below zero and logs only what was really there', () => {
    const { inv, id } = withSpool();
    const after = recordPrint(inv, id, 1500, 'Too big', '2026-11-04');
    expect(after.spools[0].remaining).toBe(0);
    expect(after.log[0].grams).toBe(1000);
  });

  it('ignores prints with no weight or an unknown spool', () => {
    const { inv, id } = withSpool();
    expect(recordPrint(inv, id, 0, 'x', '2026-11-04')).toBe(inv);
    expect(recordPrint(inv, id, -5, 'x', '2026-11-04')).toBe(inv);
    expect(recordPrint(inv, 'nope', 5, 'x', '2026-11-04')).toBe(inv);
  });

  it('undo gives the filament back and removes the entry', () => {
    const { inv, id } = withSpool();
    const after = recordPrint(inv, id, 250, 'Oops', '2026-11-04');
    const undone = undoEntry(after, after.log[0].id);
    expect(undone.spools[0].remaining).toBe(1000);
    expect(undone.log).toHaveLength(0);
  });

  it('weighing sets what is left, using the empty spool weight', () => {
    const { inv, id } = withSpool();
    expect(weighSpool(inv, id, 700).spools[0].remaining).toBe(500);
    expect(weighSpool(inv, id, 100).spools[0].remaining).toBe(0);
  });

  it('flags low spools', () => {
    const { inv, id } = withSpool();
    expect(isLow(inv.spools[0], inv)).toBe(false);
    const low = updateSpool(inv, id, { remaining: 100 });
    expect(isLow(low.spools[0], low)).toBe(true);
  });

  it('keeps log entries after a spool is deleted, and undo still works', () => {
    const { inv, id } = withSpool();
    const used = recordPrint(inv, id, 100, 'Gift', '2026-11-04');
    const gone = deleteSpool(used, id);
    expect(gone.spools).toHaveLength(0);
    expect(gone.log[0].spoolName).toContain('Acme');
    expect(undoEntry(gone, gone.log[0].id).log).toHaveLength(0);
  });

  it('adds up stock and what a period used', () => {
    let { inv, id } = withSpool();
    inv = recordPrint(inv, id, 100, 'Oct', '2026-10-30');
    inv = recordPrint(inv, id, 200, 'Nov', '2026-11-02');
    const t = totals(inv, '2026-11');
    expect(t).toMatchObject({ spools: 1, grams: 700, usedGrams: 200, low: 0 });
    expect(t.usedCost).toBeCloseTo(4);
    expect(t.value).toBeCloseTo(14);
  });
});

describe('backup files', () => {
  it('survives a round trip', () => {
    const { inv, id } = withSpool();
    const used = recordPrint(inv, id, 100, 'Име на кирилица', '2026-11-04');
    expect(parseBackup(JSON.stringify(used))).toEqual(used);
  });

  it('rejects files that are not a backup', () => {
    for (const bad of ['not json', '[]', 'null', '{}', '{"version":2,"spools":[],"log":[]}', '{"version":1,"spools":"x","log":[]}']) {
      expect(parseBackup(bad), bad).toBeUndefined();
    }
  });

  it('cleans up odd values instead of trusting them', () => {
    const parsed = parseBackup(JSON.stringify({
      version: 1,
      lowGrams: -1,
      spools: [
        { id: 'a', color: 'url(evil)', net: 'lots', remaining: -5, brand: 42 },
        { id: 'a', color: '#00FF00', net: 500, remaining: 100 },
        'junk',
      ],
      log: [{ id: 'l', date: 'yesterday', grams: Number.MAX_VALUE, spoolId: 'a' }],
    }))!;
    expect(parsed.lowGrams).toBe(100);
    expect(parsed.spools).toHaveLength(2);
    expect(parsed.spools[0]).toMatchObject({ color: '#888888', net: 0, remaining: 0, brand: '', diameter: 1.75 });
    expect(parsed.spools[1].id).not.toBe('a'); // ids stay unique
    expect(parsed.spools[1].color).toBe('#00FF00');
    expect(parsed.log[0].date).toBe('1970-01-01');
  });
});
