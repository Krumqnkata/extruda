// SPDX-License-Identifier: AGPL-3.0-or-later
import { MATERIAL_GUIDE, PROBLEMS, type Problem } from '../data/guide';
import { t, tr } from '../i18n';
import { el, hint } from '../ui/form';

function matches(p: Problem, q: string): boolean {
  return [...p.title, ...p.looks, ...p.fixes.flat()].some((s) => s.toLowerCase().includes(q));
}

let query = '';

export function mount(container: HTMLElement): () => void {
  const list = el('div', { class: 'guide-problems' });
  const empty = el('p', { class: 'hint' });

  const render = () => {
    const q = query.trim().toLowerCase();
    const found = PROBLEMS.filter((p) => !q || matches(p, q));
    list.replaceChildren(
      ...found.map((p) =>
        el(
          'details',
          { class: 'card guide-problem', open: q !== '' },
          el('summary', {}, tr(p.title)),
          el('p', { class: 'hint' }, tr(p.looks)),
          el('ul', {}, ...p.fixes.map((fix) => el('li', {}, tr(fix)))),
        ),
      ),
    );
    empty.textContent = found.length ? '' : tr(['Nothing found. Try another word.', 'Нищо не е намерено. Опитай с друга дума.']);
  };

  const search = el('input', {
    type: 'search',
    placeholder: tr(['What is going wrong? For example: strings, warping', 'Какъв е проблемът? Например: нишки, изкривяване']),
    'aria-label': tr(['Search problems', 'Търси проблем']),
    value: query,
  });
  search.addEventListener('input', () => {
    query = search.value;
    render();
  });

  const head = (s: string) => el('th', { scope: 'col' }, s);
  container.append(
    el(
      'div',
      { class: 'page' },
      el('header', { class: 'page-head' }, el('h1', {}, t('tool.guide.title')), el('p', {}, t('tool.guide.desc'))),
      el('h2', { class: 'section-title' }, tr(['Materials', 'Материали'])),
      hint(tr(['Typical ranges. The label on your spool comes first.', 'Типични стойности. Етикетът на твоята масура е с предимство.'])),
      el(
        'div',
        { class: 'table-wrap' },
        el(
          'table',
          { class: 'guide-table' },
          el(
            'thead',
            {},
            el(
              'tr',
              {},
              head(tr(['Material', 'Материал'])),
              head(tr(['Nozzle', 'Дюза'])),
              head(tr(['Bed', 'Плоча'])),
              head(tr(['Enclosure', 'Затворена камера'])),
              head(tr(['Good for', 'Подходящ за'])),
              head(tr(['Watch out', 'Внимавай'])),
            ),
          ),
          el(
            'tbody',
            {},
            ...MATERIAL_GUIDE.map((m) =>
              el(
                'tr',
                {},
                el('th', { scope: 'row' }, m.name),
                el('td', { class: 'nowrap' }, m.nozzle),
                el('td', { class: 'nowrap' }, m.bed),
                el('td', {}, tr(m.enclosure)),
                el('td', {}, tr(m.good)),
                el('td', {}, tr(m.watch)),
              ),
            ),
          ),
        ),
      ),
      el('h2', { class: 'section-title' }, tr(['Print problems', 'Проблеми при принтиране'])),
      el('div', { class: 'gallery-bar' }, search),
      list,
      empty,
    ),
  );
  render();
  return () => {};
}
