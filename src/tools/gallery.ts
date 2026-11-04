// SPDX-License-Identifier: AGPL-3.0-or-later
// "Ready-made models": a searchable gallery and a generic page for each model.
import { parseHash } from '../core/share';
import { t, tr } from '../i18n';
import type { Key } from '../i18n/en';
import { CATEGORIES, findModel, GALLERY } from '../models';
import type { Category, GalleryModel, Param, Values } from '../models/types';
import { check, color, el, hint, range, section, select, text, type Ctl } from '../ui/form';
import { icons } from '../ui/icons';
import { mountModelTool } from '../ui/modelTool';
import { fontOptions } from '../ui/options';

type State = Values & { font: string };

const UNITS: Record<string, Key> = { mm: 'u.mm', deg: 'u.deg', '%': 'u.pct' };

function paramControls(model: GalleryModel, ctl: Ctl<State>): Node[] {
  const out: Node[] = [el('a', { class: 'back-link', href: '#/models' }, `← ${t('m.back')}`)];
  let title = tr(['Settings', 'Настройки']);
  let fields: Node[] = [];
  let swatches: Node[] = [];
  const flush = () => {
    if (swatches.length) fields.push(el('div', { class: 'swatches' }, ...swatches));
    if (fields.length) out.push(section(title, ...fields));
    fields = [];
    swatches = [];
  };
  for (const p of model.params as Param[]) {
    if ('section' in p) {
      flush();
      title = tr(p.section);
      continue;
    }
    if ('hint' in p) {
      fields.push(hint(tr(p.hint)));
      continue;
    }
    const label = tr(p.label);
    switch (p.type) {
      case 'range':
        fields.push(range(ctl, p.key, label, { min: p.min, max: p.max, step: p.step, unit: p.unit ? t(UNITS[p.unit]) : undefined }));
        break;
      case 'text':
        fields.push(text(ctl, p.key, label, { multiline: p.multiline, rows: p.multiline ? 2 : undefined }));
        break;
      case 'select':
        fields.push(select(ctl, p.key, label, p.options.map(([v, l]) => [v, tr(l)])));
        break;
      case 'font':
        fields.push(select(ctl, p.key, label, fontOptions(), { fontPreview: true }));
        break;
      case 'check':
        fields.push(check(ctl, p.key, label));
        break;
      case 'color':
        swatches.push(color(ctl, p.key, label));
        break;
    }
  }
  flush();
  return out;
}

function mountModel(model: GalleryModel, container: HTMLElement): () => void {
  return mountModelTool<State>(
    {
      id: `model-${model.id}`,
      route: `models/${model.id}`,
      title: tr(model.title),
      desc: tr(model.desc),
      defaults: { ...model.defaults },
      separateObjects: model.separate,
      build: (m, font, s) => model.build(m, font, s),
      fileName: (s) => `${model.id}${typeof s.text === 'string' && s.text.trim() ? `_${s.text.split('\n')[0]}` : ''}`,
      controls: (ctl) => paramControls(model, ctl),
    },
    container,
  );
}

let category: Category | 'all' = 'all';
let query = '';

function mountGallery(container: HTMLElement): () => void {
  const grid = el('div', { class: 'cards' });
  const empty = el('p', { class: 'hint' });
  const chips = el('div', { class: 'chips', role: 'toolbar' });

  const render = () => {
    const q = query.trim().toLowerCase();
    const matches = GALLERY.filter((m) => {
      if (category !== 'all' && m.category !== category) return false;
      if (!q) return true;
      return [...m.title, ...m.desc].some((s) => s.toLowerCase().includes(q));
    });
    grid.replaceChildren(
      ...matches.map((m) =>
        el(
          'a',
          { class: 'card tool-card', href: `#/models/${m.id}` },
          el('span', { class: 'badge emoji', 'aria-hidden': 'true' }, m.emoji),
          el('h3', {}, tr(m.title)),
          el('p', {}, tr(m.desc)),
          el('span', { class: 'go icon', html: icons.arrow, 'aria-hidden': 'true' }),
        ),
      ),
    );
    empty.textContent = matches.length ? '' : t('m.empty');
    chips.replaceChildren(
      ...(['all', ...CATEGORIES] as const).map((c) =>
        el(
          'button',
          {
            type: 'button',
            class: c === category ? 'chip active' : 'chip',
            'aria-pressed': String(c === category),
            onclick: () => {
              category = c;
              render();
            },
          },
          c === 'all' ? t('m.all') : t(`m.cat.${c}` as Key),
        ),
      ),
    );
  };

  const search = el('input', { type: 'search', placeholder: t('m.search'), 'aria-label': t('m.search'), value: query });
  search.addEventListener('input', () => {
    query = search.value;
    render();
  });

  container.append(
    el(
      'div',
      { class: 'page' },
      el('header', { class: 'page-head' }, el('h1', {}, t('tool.models.title')), el('p', {}, t('tool.models.desc'))),
      el('div', { class: 'gallery-bar' }, search, chips),
      grid,
      empty,
    ),
  );
  render();
  return () => {};
}

export function mount(container: HTMLElement): () => void {
  const sub = parseHash(location.hash).path.split('/')[1];
  const model = sub ? findModel(sub) : undefined;
  return model ? mountModel(model, container) : mountGallery(container);
}
