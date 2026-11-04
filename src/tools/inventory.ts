// SPDX-License-Identifier: AGPL-3.0-or-later
// Filament stock and print log, kept only in this browser.
import { MATERIALS } from '../core/calc';
import { download } from '../core/export';
import {
  addSpool, deleteSpool, EMPTY_INVENTORY, isLow, parseBackup, PENDING_KEY, recordPrint, spoolMeters, spoolName, spoolValue, totals, undoEntry, updateSpool, weighSpool,
  type Inventory, type Spool,
} from '../core/inventory';
import { fmt, getLang, t, tr } from '../i18n';
import { button, color, el, hint, number, section, select, text, type Ctl } from '../ui/form';
import { icons } from '../ui/icons';

const KEY = 'extruda.inventory';

function load(): Inventory {
  try {
    return parseBackup(localStorage.getItem(KEY) ?? '') ?? EMPTY_INVENTORY;
  } catch {
    return EMPTY_INVENTORY;
  }
}

const today = () => new Date().toISOString().slice(0, 10);

const NEW_SPOOL = { brand: '', material: 'pla', colorName: '', color: '#ff7a1a', diameter: 1.75, net: 1000, price: 20, emptySpool: 200 };

export function mount(container: HTMLElement): () => void {
  let inv = load();
  const problem = el('p', { class: 'hint warn', role: 'alert' });
  const summary = el('div', { class: 'stat-row' });
  const list = el('div', { class: 'spool-list' });
  const logBox = el('div', {});

  const money = (n: number) => `${fmt(n, 2)} ${inv.currency}`;
  const day = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(getLang() === 'bg' ? 'bg-BG' : 'en-GB');
  };

  const commit = (next: Inventory) => {
    inv = next;
    try {
      localStorage.setItem(KEY, JSON.stringify(inv));
      problem.textContent = '';
    } catch {
      problem.textContent = tr(['Could not save: browser storage is full or blocked. Export a backup so you do not lose this.', 'Не успях да запазя: паметта на браузъра е пълна или блокирана. Свали резервно копие, за да не загубиш данните.']);
    }
    render();
  };

  // ------------------------------------------------------------ record a print

  const record = { spool: '', grams: 0, name: '' };
  try {
    const pending = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null') as { grams?: unknown; name?: unknown } | null;
    localStorage.removeItem(PENDING_KEY);
    if (pending && typeof pending.grams === 'number') {
      record.grams = pending.grams;
      if (typeof pending.name === 'string') record.name = pending.name;
    }
  } catch {
    /* nothing handed over */
  }
  const recordBox = el('div', {});
  const renderRecord = () => {
    if (!inv.spools.length) {
      recordBox.replaceChildren(hint(tr(['Add a spool below first.', 'Първо добави масура отдолу.'])));
      return;
    }
    if (!inv.spools.some((s) => s.id === record.spool)) record.spool = inv.spools[0].id;
    const ctl: Ctl<typeof record> = { state: record, change() {} };
    recordBox.replaceChildren(
      el(
        'div',
        { class: 'fields' },
        select(ctl, 'spool', tr(['Spool', 'Масура']), inv.spools.map((s) => [s.id, `${spoolName(s) || tr(['Unnamed', 'Без име'])} · ${fmt(s.remaining, 0)} ${t('u.g')}`])),
        number(ctl, 'grams', tr(['Filament used', 'Използван филамент']), { unit: t('u.g'), min: 0 }),
        text(ctl, 'name', tr(['What you printed', 'Какво принтира'])),
      ),
      el(
        'div',
        { class: 'row' },
        button(tr(['Take off the spool', 'Извади от масурата']), () => {
          const { spool, grams } = record;
          const name = record.name.trim();
          if (!(grams > 0)) return;
          record.grams = 0;
          record.name = '';
          commit(recordPrint(inv, spool, grams, name, today()));
        }, { primary: true }),
      ),
    );
  };

  // ------------------------------------------------------------ spools

  const spoolCard = (s: Spool): HTMLElement => {
    const share = s.net > 0 ? Math.min(1, s.remaining / s.net) : 0;
    const low = isLow(s, inv);
    const bar = el('div', { class: 'spool-fill' });
    bar.style.width = `${(share * 100).toFixed(1)}%`;
    bar.style.background = s.color;
    const dot = el('span', { class: 'spool-dot', 'aria-hidden': 'true' });
    dot.style.background = s.color;

    const weigh = { weight: s.remaining + s.emptySpool };
    const weighCtl: Ctl<typeof weigh> = { state: weigh, change() {} };
    const edit = { ...s };
    const editCtl: Ctl<typeof edit> = { state: edit, change() {} };

    return el(
      'article',
      { class: low ? 'card spool low' : 'card spool' },
      el('header', { class: 'spool-head' }, dot, el('strong', {}, spoolName(s) || tr(['Unnamed spool', 'Масура без име'])), low && el('span', { class: 'spool-flag' }, tr(['Running low', 'Свършва']))),
      el('div', { class: 'spool-bar', role: 'img', 'aria-label': `${fmt(share * 100, 0)}%` }, bar),
      el(
        'p',
        { class: 'hint' },
        `${fmt(s.remaining, 0)} / ${fmt(s.net, 0)} ${t('u.g')} · ${fmt(spoolMeters(s), 0)} ${t('u.m')} · ${money(spoolValue(s))}`,
      ),
      el(
        'details',
        {},
        el('summary', {}, tr(['Weigh or edit', 'Претегли или редактирай'])),
        el(
          'div',
          { class: 'section-body spool-edit' },
          number(weighCtl, 'weight', tr(['Spool weight now', 'Тегло на масурата сега']), { unit: t('u.g'), min: 0 }),
          button(tr(['Update from weight', 'Обнови по теглото']), () => commit(weighSpool(inv, s.id, weigh.weight))),
          ...spoolFields(editCtl),
          el(
            'div',
            { class: 'row' },
            button(tr(['Save changes', 'Запази промените']), () => {
              const { id: _id, ...patch } = edit;
              commit(updateSpool(inv, s.id, patch));
            }),
            button(tr(['Delete spool', 'Изтрий масурата']), () => {
              if (window.confirm(tr([`Delete ${spoolName(s) || 'this spool'}? The print log stays.`, `Да изтрия ли ${spoolName(s) || 'тази масура'}? Дневникът остава.`]))) commit(deleteSpool(inv, s.id));
            }),
          ),
        ),
      ),
    );
  };

  /** The fields shared by the new-spool form and the edit form. */
  function spoolFields<S extends typeof NEW_SPOOL>(ctl: Ctl<S>): Node[] {
    return [
      text(ctl, 'brand', t('f.brand')),
      select(ctl, 'material', t('f.material'), MATERIALS.map((m) => [m.id, m.name])),
      text(ctl, 'colorName', t('f.colorName')),
      color(ctl, 'color', t('f.color')),
      number(ctl, 'diameter', t('c.diameter'), { unit: t('u.mm'), step: 0.05, min: 0.5 }),
      number(ctl, 'net', tr(['Filament when full', 'Филамент при нова масура']), { unit: t('u.g'), min: 0 }),
      number(ctl, 'price', tr(['Price when full', 'Цена при нова масура']), { unit: inv.currency, min: 0 }),
      number(ctl, 'emptySpool', t('c.spoolEmpty'), { unit: t('u.g'), min: 0 }),
    ];
  }

  // ------------------------------------------------------------ log and totals

  const renderLog = () => {
    if (!inv.log.length) {
      logBox.replaceChildren(hint(tr(['Nothing logged yet.', 'Още няма записи.'])));
      return;
    }
    logBox.replaceChildren(
      el(
        'div',
        { class: 'table-wrap' },
        el(
          'table',
          { class: 'guide-table' },
          el(
            'thead',
            {},
            el('tr', {}, ...[tr(['Date', 'Дата']), tr(['Print', 'Принт']), tr(['Spool', 'Масура']), tr(['Used', 'Използвано']), tr(['Cost', 'Цена'])].map((h) => el('th', { scope: 'col' }, h)), el('th', { scope: 'col' }, '')),
          ),
          el(
            'tbody',
            {},
            ...inv.log.slice(0, 100).map((e) =>
              el(
                'tr',
                {},
                el('td', { class: 'nowrap' }, day(e.date)),
                el('td', {}, e.name),
                el('td', {}, e.spoolName),
                el('td', { class: 'nowrap' }, `${fmt(e.grams, 1)} ${t('u.g')}`),
                el('td', { class: 'nowrap' }, money(e.cost)),
                el('td', {}, el('button', { type: 'button', class: 'btn link-btn', onclick: () => commit(undoEntry(inv, e.id)) }, tr(['Undo', 'Отмени']))),
              ),
            ),
          ),
        ),
      ),
      inv.log.length > 100 ? hint(tr(['Showing the latest 100 entries. The backup has them all.', 'Показани са последните 100 записа. В резервното копие са всички.'])) : '',
    );
  };

  const stat = (label: string, value: string, warn = false) =>
    el('div', { class: warn ? 'card stat warn-stat' : 'card stat' }, el('span', { class: 'hint' }, label), el('strong', {}, value));

  const render = () => {
    const sum = totals(inv, today().slice(0, 7));
    summary.replaceChildren(
      stat(tr(['Filament in stock', 'Филамент на склад']), `${fmt(sum.grams / 1000, 2)} kg`),
      stat(tr(['Stock value', 'Стойност']), money(sum.value)),
      stat(tr(['Used this month', 'Използвано този месец']), `${fmt(sum.usedGrams, 0)} ${t('u.g')} · ${money(sum.usedCost)}`),
      stat(tr(['Running low', 'Свършват']), String(sum.low), sum.low > 0),
    );
    list.replaceChildren(...inv.spools.map(spoolCard));
    if (!inv.spools.length) list.append(hint(tr(['No spools yet.', 'Още няма масури.'])));
    renderRecord();
    renderLog();
  };

  // ------------------------------------------------------------ add, settings, backup

  const fresh = { ...NEW_SPOOL };
  const freshCtl: Ctl<typeof fresh> = { state: fresh, change() {} };
  const settings = { lowGrams: inv.lowGrams, currency: inv.currency };
  const settingsCtl: Ctl<typeof settings> = {
    state: settings,
    change() {
      commit({ ...inv, lowGrams: settings.lowGrams, currency: settings.currency.slice(0, 6) });
    },
  };

  const importInput = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    importInput.value = '';
    if (!file) return;
    const backup = parseBackup(await file.text());
    if (!backup) {
      problem.textContent = tr(['This file is not an Extruda backup, so nothing was changed.', 'Това не е резервно копие на Extruda, затова нищо не е променено.']);
      return;
    }
    const ask = tr([
      `Replace what is here with ${backup.spools.length} spool(s) and ${backup.log.length} log entries from the file?`,
      `Да заменя ли текущите данни с ${backup.spools.length} масури и ${backup.log.length} записа от файла?`,
    ]);
    if (window.confirm(ask)) commit(backup);
  });

  container.append(
    el(
      'div',
      { class: 'page' },
      el('header', { class: 'page-head' }, el('h1', {}, t('tool.inventory.title')), el('p', {}, t('tool.inventory.desc'))),
      el(
        'p',
        { class: 'card notice' },
        el('span', { class: 'icon', html: icons.lock, 'aria-hidden': 'true' }),
        tr(['Saved only in this browser, on this device. Clearing browser data deletes it, so export a backup now and then.', 'Пази се само в този браузър на това устройство. Изчистването на данните на браузъра го изтрива, затова сваляй резервно копие от време на време.']),
      ),
      problem,
      summary,
      el('h2', { class: 'section-title' }, tr(['Record a print', 'Запиши принт'])),
      el('div', { class: 'card calc' }, recordBox),
      el('h2', { class: 'section-title' }, tr(['Spools', 'Масури'])),
      list,
      el(
        'div',
        { class: 'card calc inventory-add' },
        section(
          tr(['Add a spool', 'Добави масура']),
          el('div', { class: 'fields' }, ...spoolFields(freshCtl)),
          button(tr(['Add spool', 'Добави масура']), () => {
            commit(addSpool(inv, { ...fresh }));
            fresh.brand = '';
            fresh.colorName = '';
          }, { primary: true }),
        ),
      ),
      el('h2', { class: 'section-title' }, tr(['Print log', 'Дневник'])),
      logBox,
      el('h2', { class: 'section-title' }, tr(['Settings and backup', 'Настройки и резервно копие'])),
      el(
        'div',
        { class: 'card calc' },
        el(
          'div',
          { class: 'fields' },
          number(settingsCtl, 'lowGrams', tr(['Warn when a spool is below', 'Предупреди под']), { unit: t('u.g'), min: 0 }),
          text(settingsCtl, 'currency', t('c.currency')),
        ),
        importInput,
        el(
          'div',
          { class: 'row' },
          button(tr(['Export backup', 'Свали резервно копие']), () => download(JSON.stringify(inv, null, 2), `extruda-filament-${today()}.json`, 'application/json'), { icon: icons.download }),
          button(tr(['Import backup', 'Зареди резервно копие']), () => importInput.click(), { icon: icons.upload }),
        ),
      ),
    ),
  );
  render();
  return () => {};
}
