// SPDX-License-Identifier: AGPL-3.0-or-later
// A customer quote, printed to PDF by the browser so Cyrillic works without an embedded font library.
import { printCost, quoteTotals, type QuoteRow } from '../core/calc';
import { fmt, getLang, t, tr } from '../i18n';
import { button, el, hint, number, persisted, save, section, text, type Ctl } from '../ui/form';
import { icons } from '../ui/icons';
import { CALC_DEFAULTS } from './calculators';

const today = () => new Date().toISOString().slice(0, 10);

const DEFAULTS = {
  business: '',
  contact: '',
  logo: '',
  customer: '',
  customerContact: '',
  number: '1',
  date: '',
  validDays: 14,
  currency: '€',
  discount: 0,
  vat: 0,
  note: '',
  rows: [{ desc: '', qty: 1, price: 0 }] as QuoteRow[],
};
type State = typeof DEFAULTS;

const LOGO_SIZE = 480;

/** Shrinks an image so the logo fits in browser storage. */
function readLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, LOGO_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Unreadable image'));
    };
    img.src = url;
  });
}

function calculatorPrice(): number {
  try {
    const stored = JSON.parse(localStorage.getItem('extruda.calc') ?? '{}') as Partial<typeof CALC_DEFAULTS>;
    return printCost({ ...CALC_DEFAULTS, ...stored }).price;
  } catch {
    return printCost(CALC_DEFAULTS).price;
  }
}

export function mount(container: HTMLElement): () => void {
  const state = persisted('quote', DEFAULTS);
  if (!state.date) state.date = today();
  const sheet = el('section', { class: 'quote-sheet' });
  const rowsBox = el('div', { class: 'quote-rows' });

  const money = (n: number) => `${fmt(n, 2)} ${state.currency}`;

  const renderSheet = () => {
    const totals = quoteTotals(state.rows, state.discount, state.vat);
    const date = new Date(state.date);
    const valid = new Date(date.getTime() + state.validDays * 86400000);
    const locale = getLang() === 'bg' ? 'bg-BG' : 'en-GB';
    const day = (d: Date) => (Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale));
    const line = (label: string, value: string, strong = false) =>
      el('div', { class: strong ? 'quote-total strong' : 'quote-total' }, el('span', {}, label), el('span', {}, value));
    sheet.replaceChildren(
      el(
        'header',
        { class: 'quote-head' },
        el(
          'div',
          {},
          state.logo && el('img', { src: state.logo, alt: '', class: 'quote-logo' }),
          el('strong', {}, state.business),
          el('p', { class: 'quote-lines' }, state.contact),
        ),
        el(
          'div',
          { class: 'quote-meta' },
          el('h2', {}, tr(['Quote', 'Оферта'])),
          el('p', {}, `№ ${state.number}`),
          el('p', {}, `${tr(['Date', 'Дата'])}: ${day(date)}`),
          state.validDays > 0 && el('p', {}, `${tr(['Valid until', 'Валидна до'])}: ${day(valid)}`),
        ),
      ),
      el('div', { class: 'quote-to' }, el('span', { class: 'hint' }, tr(['For', 'За'])), el('strong', {}, state.customer), el('p', { class: 'quote-lines' }, state.customerContact)),
      el(
        'table',
        { class: 'quote-table' },
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            el('th', { scope: 'col' }, tr(['Item', 'Описание'])),
            el('th', { scope: 'col', class: 'num-col' }, tr(['Qty', 'Брой'])),
            el('th', { scope: 'col', class: 'num-col' }, tr(['Unit price', 'Ед. цена'])),
            el('th', { scope: 'col', class: 'num-col' }, tr(['Amount', 'Сума'])),
          ),
        ),
        el(
          'tbody',
          {},
          ...state.rows.map((r) =>
            el(
              'tr',
              {},
              el('td', {}, r.desc),
              el('td', { class: 'num-col' }, String(r.qty)),
              el('td', { class: 'num-col' }, money(r.price)),
              el('td', { class: 'num-col' }, money(r.qty * r.price)),
            ),
          ),
        ),
      ),
      el(
        'div',
        { class: 'quote-totals' },
        (state.discount > 0 || state.vat > 0) && line(tr(['Subtotal', 'Междинна сума']), money(totals.subtotal)),
        state.discount > 0 && line(`${tr(['Discount', 'Отстъпка'])} ${state.discount}%`, `−${money(totals.discount)}`),
        state.vat > 0 && line(`${tr(['VAT', 'ДДС'])} ${state.vat}%`, money(totals.vat)),
        line(tr(['Total', 'Общо']), money(totals.total), true),
      ),
      state.note && el('p', { class: 'quote-lines quote-note' }, state.note),
      el('p', { class: 'hint quote-legal' }, tr(['This is a quote, not a tax invoice.', 'Това е оферта, а не данъчна фактура.'])),
    );
  };

  const ctl: Ctl<State> = {
    state,
    change() {
      save('quote', state);
      renderSheet();
    },
  };

  const renderRows = () => {
    rowsBox.replaceChildren(
      ...state.rows.map((r, i) => {
        const rowCtl: Ctl<QuoteRow> = { state: r, change: () => ctl.change() };
        return el(
          'div',
          { class: 'quote-row' },
          text(rowCtl, 'desc', tr(['Item', 'Описание'])),
          number(rowCtl, 'qty', tr(['Qty', 'Брой']), { min: 0, step: 1 }),
          number(rowCtl, 'price', tr(['Unit price', 'Ед. цена']), { min: 0, step: 0.01 }),
          el('button', {
            type: 'button',
            class: 'btn icon-only',
            title: tr(['Remove', 'Премахни']),
            'aria-label': tr(['Remove', 'Премахни']),
            html: '&times;',
            onclick: () => {
              state.rows.splice(i, 1);
              if (!state.rows.length) state.rows.push({ desc: '', qty: 1, price: 0 });
              renderRows();
              ctl.change();
            },
          }),
        );
      }),
    );
  };

  const addRow = (desc: string, price: number) => {
    const blank = state.rows.length === 1 && !state.rows[0].desc && !state.rows[0].price;
    if (blank) state.rows.pop();
    state.rows.push({ desc, qty: 1, price });
    renderRows();
    ctl.change();
  };

  const logoInput = el('input', { type: 'file', accept: 'image/*', hidden: true });
  logoInput.addEventListener('change', () => {
    const file = logoInput.files?.[0];
    if (!file) return;
    void readLogo(file).then((data) => {
      state.logo = data;
      ctl.change();
    });
  });

  renderRows();
  renderSheet();
  container.append(
    el(
      'div',
      { class: 'page quote-page' },
      el('header', { class: 'page-head quote-editor' }, el('h1', {}, t('tool.quote.title')), el('p', {}, t('tool.quote.desc'))),
      el(
        'div',
        { class: 'quote-layout' },
        el(
          'div',
          { class: 'card calc quote-editor' },
          section(
            tr(['Your details', 'Твоите данни']),
            text(ctl, 'business', tr(['Business or name', 'Фирма или име'])),
            text(ctl, 'contact', tr(['Contact details', 'Данни за контакт']), { multiline: true, rows: 3 }),
            logoInput,
            el(
              'div',
              { class: 'row' },
              button(tr(['Add a logo', 'Добави лого']), () => logoInput.click(), { icon: icons.image }),
              button(tr(['Remove logo', 'Махни логото']), () => {
                state.logo = '';
                logoInput.value = '';
                ctl.change();
              }),
            ),
          ),
          section(
            tr(['Customer', 'Клиент']),
            text(ctl, 'customer', tr(['Name', 'Име'])),
            text(ctl, 'customerContact', tr(['Contact details', 'Данни за контакт']), { multiline: true, rows: 2 }),
          ),
          section(
            tr(['Items', 'Позиции']),
            rowsBox,
            el(
              'div',
              { class: 'row' },
              button(tr(['Add a line', 'Добави ред']), () => addRow('', 0)),
              button(tr(['Add the calculator price', 'Добави цената от калкулатора']), () => addRow(tr(['3D print', '3D принт']), Math.round(calculatorPrice() * 100) / 100), { icon: icons.calc }),
            ),
          ),
          section(
            tr(['Details', 'Детайли']),
            text(ctl, 'number', tr(['Quote number', 'Номер на офертата'])),
            text(ctl, 'date', tr(['Date', 'Дата']), { type: 'date' }),
            number(ctl, 'validDays', tr(['Valid for', 'Валидна за']), { unit: tr(['days', 'дни']), min: 0, step: 1 }),
            text(ctl, 'currency', t('c.currency')),
            number(ctl, 'discount', tr(['Discount', 'Отстъпка']), { unit: '%', min: 0, max: 100 }),
            number(ctl, 'vat', tr(['VAT (0 if you are not registered)', 'ДДС (0, ако не си регистриран)']), { unit: '%', min: 0, max: 100 }),
            text(ctl, 'note', tr(['Note for the customer', 'Бележка към клиента']), { multiline: true, rows: 3 }),
          ),
          hint(tr(['Saved only in this browser.', 'Пази се само в този браузър.'])),
          el('div', { class: 'row' }, button(tr(['Save as PDF', 'Запази като PDF']), () => window.print(), { primary: true, icon: icons.download })),
          hint(tr(['In the print window, choose "Save as PDF" as the destination.', 'В прозореца за печат избери „Запази като PDF“ като принтер.'])),
        ),
        sheet,
      ),
    ),
  );
  return () => {};
}
