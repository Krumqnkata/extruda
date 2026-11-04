// SPDX-License-Identifier: AGPL-3.0-or-later
import { eSteps, filamentGrams, filamentMeters, flowRate, MATERIALS, printCost, spoolRemaining } from '../core/calc';
import { fmt, t } from '../i18n';
import type { Key } from '../i18n/en';
import { el, hint, number, persisted, save, select, text, type Ctl } from '../ui/form';

export const CALC_DEFAULTS = {
  currency: '€',
  grams: 45,
  pricePerKg: 20,
  hours: 3.5,
  watts: 120,
  pricePerKwh: 0.15,
  printerPrice: 600,
  printerLifeHours: 5000,
  failurePercent: 10,
  laborCost: 0,
  markupPercent: 50,
  material: 'pla',
  diameter: 1.75,
  weight: 1000,
  length: 100,
  steps: 93,
  requested: 100,
  left: 22,
  flow: 100,
  expected: 0.45,
  measured: 0.48,
  spoolTotal: 1100,
  spoolEmpty: 250,
  spoolNeed: 120,
};
type State = typeof CALC_DEFAULTS;

export function mount(container: HTMLElement): () => void {
  const state = persisted('calc', CALC_DEFAULTS);
  const results = new Map<string, HTMLElement>();
  const out = (id: string) => {
    const e = el('output', { class: 'result-value' });
    results.set(id, e);
    return e;
  };
  const row = (labelKey: Key, id: string, strong = false) =>
    el('div', { class: strong ? 'result strong' : 'result' }, el('span', {}, t(labelKey)), out(id));

  const update = () => {
    const s = state;
    const money = (n: number) => `${fmt(n, 2)} ${s.currency}`;
    const c = printCost(s);
    const set = (id: string, v: string) => {
      const e = results.get(id);
      if (e) e.textContent = v;
    };
    set('material', money(c.material));
    set('electricity', money(c.electricity));
    set('depreciation', money(c.depreciation));
    set('failures', money(c.failures));
    set('cost', money(c.cost));
    set('profit', money(c.profit));
    set('price', money(c.price));

    const density = MATERIALS.find((m) => m.id === s.material)?.density ?? 1.24;
    set('density', `${fmt(density, 2)} g/cm³`);
    set('meters', `${fmt(filamentMeters(s.weight, s.diameter, density), 1)} ${t('u.m')}`);
    set('grams', `${fmt(filamentGrams(s.length, s.diameter, density), 1)} ${t('u.g')}`);

    const steps = eSteps(s.steps, s.requested, 120 - s.left);
    set('steps', fmt(steps, 2));
    set('m92', t('c.estepsCmd', { cmd: `M92 E${steps.toFixed(2)} → M500` }));
    set('flow', `${fmt(flowRate(s.flow, s.expected, s.measured), 1)} %`);
    const spool = spoolRemaining(s.spoolTotal, s.spoolEmpty, s.spoolNeed, s.diameter, density);
    set('spoolLeft', `${fmt(spool.grams, 0)} ${t('u.g')} · ${fmt(spool.meters, 1)} ${t('u.m')}`);
    set('spoolVerdict', spool.spare >= 0 ? t('c.enough', { g: fmt(spool.spare, 0) }) : t('c.short', { g: fmt(-spool.spare, 0) }));
    results.get('spoolVerdict')?.classList.toggle('bad', spool.spare < 0);
    container.querySelectorAll('.unit.cur').forEach((u) => (u.textContent = s.currency));
  };

  const ctl: Ctl<State> = {
    state,
    change() {
      save('calc', state);
      update();
    },
  };

  const card = (titleKey: Key, ...children: (Node | false)[]) =>
    el('section', { class: 'card calc' }, el('h2', {}, t(titleKey)), ...children);
  const fields = (...children: Node[]) => el('div', { class: 'fields' }, ...children);

  container.append(
    el(
      'div',
      { class: 'page' },
      el('header', { class: 'page-head' }, el('h1', {}, t('tool.calc.title')), el('p', {}, t('tool.calc.desc'))),
      el(
        'div',
        { class: 'calc-grid' },
        card(
          'c.cost',
          fields(
            number(ctl, 'grams', t('c.grams'), { unit: t('u.g'), min: 0 }),
            number(ctl, 'pricePerKg', t('c.pricePerKg'), { unit: state.currency, unitClass: 'cur', min: 0 }),
            number(ctl, 'hours', t('c.hours'), { unit: t('u.h'), min: 0 }),
            number(ctl, 'watts', t('c.watts'), { unit: t('u.w'), min: 0 }),
            number(ctl, 'pricePerKwh', t('c.pricePerKwh'), { unit: state.currency, unitClass: 'cur', min: 0 }),
            number(ctl, 'printerPrice', t('c.printerPrice'), { unit: state.currency, unitClass: 'cur', min: 0 }),
            number(ctl, 'printerLifeHours', t('c.printerLife'), { unit: t('u.h'), min: 1 }),
            number(ctl, 'failurePercent', t('c.failure'), { unit: t('u.pct'), min: 0 }),
            number(ctl, 'laborCost', t('c.labor'), { unit: state.currency, unitClass: 'cur', min: 0 }),
            number(ctl, 'markupPercent', t('c.markup'), { unit: t('u.pct'), min: 0 }),
            text(ctl, 'currency', t('c.currency')),
          ),
          el(
            'div',
            { class: 'results' },
            row('c.material', 'material'),
            row('c.electricity', 'electricity'),
            row('c.depreciation', 'depreciation'),
            row('c.failures', 'failures'),
            row('c.totalCost', 'cost', true),
            row('c.profit', 'profit'),
            row('c.price', 'price', true),
          ),
        ),
        card(
          'c.filament',
          fields(
            select({ state, change: () => ctl.change() }, 'material', t('c.material2'), MATERIALS.map((m) => [m.id, m.name])),
            number(ctl, 'diameter', t('c.diameter'), { unit: t('u.mm'), step: 0.05, min: 0.5 }),
            number(ctl, 'weight', t('c.weight'), { unit: t('u.g'), min: 0 }),
            number(ctl, 'length', t('c.length'), { unit: t('u.m'), min: 0 }),
          ),
          el(
            'div',
            { class: 'results' },
            row('c.density', 'density'),
            el('div', { class: 'result strong' }, el('span', {}, `${t('c.weight')} → ${t('c.length')}`), out('meters')),
            el('div', { class: 'result strong' }, el('span', {}, `${t('c.length')} → ${t('c.weight')}`), out('grams')),
          ),
        ),
        card(
          'c.esteps',
          hint(t('c.estepsHint')),
          fields(
            number(ctl, 'steps', t('c.currentSteps'), { step: 0.01, min: 1 }),
            number(ctl, 'requested', t('c.requested'), { unit: t('u.mm'), min: 1 }),
            number(ctl, 'left', t('c.measuredLeft'), { unit: t('u.mm'), step: 0.1, min: 0 }),
          ),
          el('div', { class: 'results' }, row('c.newSteps', 'steps', true), el('p', { class: 'hint mono' }, out('m92'))),
        ),
        card(
          'c.flow',
          hint(t('c.flowHint')),
          fields(
            number(ctl, 'flow', t('c.currentFlow'), { unit: t('u.pct'), step: 0.1, min: 1 }),
            number(ctl, 'expected', t('c.expectedWall'), { unit: t('u.mm'), step: 0.01, min: 0.05 }),
            number(ctl, 'measured', t('c.measuredWall'), { unit: t('u.mm'), step: 0.01, min: 0.05 }),
          ),
          el('div', { class: 'results' }, row('c.newFlow', 'flow', true)),
        ),
        card(
          'c.spool',
          hint(t('c.spoolHint')),
          fields(
            number(ctl, 'spoolTotal', t('c.spoolTotal'), { unit: t('u.g'), min: 0 }),
            number(ctl, 'spoolEmpty', t('c.spoolEmpty'), { unit: t('u.g'), min: 0 }),
            number(ctl, 'spoolNeed', t('c.need'), { unit: t('u.g'), min: 0 }),
          ),
          el('div', { class: 'results' }, row('c.left', 'spoolLeft', true), el('p', { class: 'verdict' }, out('spoolVerdict'))),
        ),
      ),
    ),
  );
  update();
  return () => {};
}
