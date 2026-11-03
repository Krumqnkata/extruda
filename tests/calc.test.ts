// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { eSteps, estimateWeight, filamentGrams, filamentMeters, flowRate, printCost } from '../src/core/calc';

describe('calculators', () => {
  it('prices a print', () => {
    const r = printCost({
      grams: 100,
      pricePerKg: 20,
      hours: 10,
      watts: 100,
      pricePerKwh: 0.2,
      printerPrice: 500,
      printerLifeHours: 5000,
      failurePercent: 10,
      laborCost: 1,
      markupPercent: 50,
    });
    expect(r.material).toBeCloseTo(2);
    expect(r.electricity).toBeCloseTo(0.2);
    expect(r.depreciation).toBeCloseTo(1);
    expect(r.failures).toBeCloseTo(0.32);
    expect(r.cost).toBeCloseTo(4.52);
    expect(r.price).toBeCloseTo(6.78);
  });

  it('converts a 1 kg PLA spool to about 335 m', () => {
    expect(filamentMeters(1000, 1.75, 1.24)).toBeCloseTo(335.3, 0);
    expect(filamentGrams(filamentMeters(250, 1.75, 1.24), 1.75, 1.24)).toBeCloseTo(250, 6);
  });

  it('calibrates E-steps and flow', () => {
    expect(eSteps(93, 100, 98)).toBeCloseTo(94.898, 3);
    expect(flowRate(100, 0.45, 0.5)).toBeCloseTo(90);
  });

  it('estimates weight from shell and infill', () => {
    // 20 mm cube: 8 cm³, 2400 mm² surface
    const w = estimateWeight(8000, 2400, 1.24, 20, 1.2);
    expect(w.shellCm3).toBeCloseTo(2.88);
    expect(w.infillCm3).toBeCloseTo(1.024);
    expect(w.grams).toBeCloseTo(4.84, 1);
  });
});
