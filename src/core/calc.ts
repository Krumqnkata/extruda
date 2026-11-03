// SPDX-License-Identifier: AGPL-3.0-or-later
// Formulas behind the calculators and the STL analyzer.

export interface Material {
  id: string;
  name: string;
  density: number; // g/cm³
}

export const MATERIALS: Material[] = [
  { id: 'pla', name: 'PLA', density: 1.24 },
  { id: 'petg', name: 'PETG', density: 1.27 },
  { id: 'abs', name: 'ABS', density: 1.04 },
  { id: 'asa', name: 'ASA', density: 1.07 },
  { id: 'tpu', name: 'TPU', density: 1.21 },
  { id: 'pa', name: 'Nylon (PA)', density: 1.14 },
  { id: 'pc', name: 'PC', density: 1.2 },
  { id: 'resin', name: 'Resin', density: 1.15 },
];

export interface CostInput {
  grams: number;
  pricePerKg: number;
  hours: number;
  watts: number;
  pricePerKwh: number;
  printerPrice: number;
  printerLifeHours: number;
  failurePercent: number;
  laborCost: number;
  markupPercent: number;
}

export interface CostResult {
  material: number;
  electricity: number;
  depreciation: number;
  failures: number;
  labor: number;
  cost: number;
  profit: number;
  price: number;
}

export function printCost(c: CostInput): CostResult {
  const material = (c.grams / 1000) * c.pricePerKg;
  const electricity = (c.watts / 1000) * c.hours * c.pricePerKwh;
  const depreciation = c.printerLifeHours > 0 ? (c.printerPrice / c.printerLifeHours) * c.hours : 0;
  const base = material + electricity + depreciation;
  const failures = base * (c.failurePercent / 100);
  const cost = base + failures + c.laborCost;
  const profit = cost * (c.markupPercent / 100);
  return { material, electricity, depreciation, failures, labor: c.laborCost, cost, profit, price: cost + profit };
}

/** Grams of filament in `meters` of strand. */
export function filamentGrams(meters: number, diameterMm: number, density: number): number {
  const r = diameterMm / 20; // cm
  return Math.PI * r * r * meters * 100 * density;
}

export function filamentMeters(grams: number, diameterMm: number, density: number): number {
  const r = diameterMm / 20;
  return grams / density / (Math.PI * r * r) / 100;
}

/** New steps/mm after asking for `requested` mm of filament and measuring `actual`. */
export function eSteps(current: number, requested: number, actual: number): number {
  return actual > 0 ? (current * requested) / actual : current;
}

/** New flow multiplier from a single-wall cube: expected vs measured wall thickness. */
export function flowRate(current: number, expected: number, measured: number): number {
  return measured > 0 ? (current * expected) / measured : current;
}

export interface WeightEstimate {
  shellCm3: number;
  infillCm3: number;
  grams: number;
}

/**
 * Rough print weight: walls and top/bottom skins approximated as surface area × shell thickness,
 * the rest filled at the infill ratio.
 */
export function estimateWeight(volumeMm3: number, areaMm2: number, density: number, infillPercent: number, shellMm: number): WeightEstimate {
  const shell = Math.min(volumeMm3, areaMm2 * shellMm);
  const inner = Math.max(0, volumeMm3 - shell);
  const infill = inner * (infillPercent / 100);
  const grams = ((shell + infill) / 1000) * density;
  return { shellCm3: shell / 1000, infillCm3: infill / 1000, grams };
}
