// SPDX-License-Identifier: AGPL-3.0-or-later
// Tiny DOM helpers and form controls bound directly to a state object.

type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') e.className = String(v);
    else if (k === 'html') e.innerHTML = String(v);
    else if (k === 'value') (e as HTMLInputElement).value = String(v);
    else if (k === 'checked') (e as HTMLInputElement).checked = Boolean(v);
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c != null && c !== false) e.append(c);
  return e;
}

export interface Ctl<S> {
  state: S;
  /** `structural` re-renders the control panel (for choices that show or hide other fields). */
  change(structural?: boolean): void;
}

let uid = 0;
const nextId = () => `f${++uid}`;

function field(label: string, id: string, control: Node, hint?: string): HTMLElement {
  return el('div', { class: 'field' }, el('label', { for: id }, label), control, hint ? el('p', { class: 'hint' }, hint) : null);
}

export function range<S>(
  ctl: Ctl<S>,
  key: keyof S & string,
  label: string,
  o: { min: number; max: number; step: number; unit?: string },
): HTMLElement {
  const id = nextId();
  const value = Number(ctl.state[key]);
  const num = el('input', { id, type: 'number', min: o.min, max: o.max, step: o.step, value, inputmode: 'decimal' });
  const slider = el('input', { type: 'range', min: o.min, max: o.max, step: o.step, value, 'aria-label': label, tabindex: -1 });
  const set = (v: number, from: HTMLInputElement) => {
    if (!Number.isFinite(v)) return;
    (ctl.state as Record<string, unknown>)[key] = v;
    if (from !== num) num.value = String(v);
    if (from !== slider) slider.value = String(v);
    ctl.change();
  };
  slider.addEventListener('input', () => set(Number(slider.value), slider));
  num.addEventListener('input', () => {
    if (num.value.trim() !== '') set(Number(num.value.replace(',', '.')), num);
  });
  return el(
    'div',
    { class: 'field range' },
    el('label', { for: id }, label),
    el('div', { class: 'range-row' }, slider, el('span', { class: 'num' }, num, o.unit ? el('span', { class: 'unit' }, o.unit) : null)),
  );
}

export function number<S>(
  ctl: Ctl<S>,
  key: keyof S & string,
  label: string,
  o: { unit?: string; unitClass?: string; step?: number; min?: number; max?: number } = {},
): HTMLElement {
  const id = nextId();
  const input = el('input', { id, type: 'number', step: o.step ?? 'any', min: o.min, max: o.max, value: Number(ctl.state[key]), inputmode: 'decimal' });
  input.addEventListener('input', () => {
    const v = Number(input.value.replace(',', '.'));
    if (input.value.trim() === '' || !Number.isFinite(v)) return;
    (ctl.state as Record<string, unknown>)[key] = v;
    ctl.change();
  });
  const unit = o.unit ? el('span', { class: o.unitClass ? `unit ${o.unitClass}` : 'unit' }, o.unit) : null;
  return field(label, id, el('span', { class: 'num wide' }, input, unit));
}

export function select<S>(
  ctl: Ctl<S>,
  key: keyof S & string,
  label: string,
  options: [string, string][],
  o: { fontPreview?: boolean; hint?: string } = {},
): HTMLElement {
  const id = nextId();
  const sel = el('select', { id });
  for (const [value, text] of options) {
    const opt = el('option', { value }, text);
    if (o.fontPreview) opt.style.fontFamily = `"x-${value}", system-ui`;
    sel.append(opt);
  }
  sel.value = String(ctl.state[key]);
  if (o.fontPreview) sel.style.fontFamily = `"x-${sel.value}", system-ui`;
  sel.addEventListener('change', () => {
    (ctl.state as Record<string, unknown>)[key] = sel.value;
    if (o.fontPreview) sel.style.fontFamily = `"x-${sel.value}", system-ui`;
    ctl.change(true);
  });
  return field(label, id, sel, o.hint);
}

export function segmented<S>(ctl: Ctl<S>, key: keyof S & string, label: string, options: [string, string][], hint?: string): HTMLElement {
  const name = nextId();
  const group = el('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label });
  for (const [value, text] of options) {
    const input = el('input', { type: 'radio', name, value, checked: String(ctl.state[key]) === value });
    input.addEventListener('change', () => {
      (ctl.state as Record<string, unknown>)[key] = value;
      ctl.change(true);
    });
    group.append(el('label', {}, input, el('span', {}, text)));
  }
  return el('div', { class: 'field' }, el('span', { class: 'label' }, label), group, hint ? el('p', { class: 'hint' }, hint) : null);
}

export function text<S>(
  ctl: Ctl<S>,
  key: keyof S & string,
  label: string,
  o: { multiline?: boolean; rows?: number; hint?: string; placeholder?: string; type?: string; big?: boolean } = {},
): HTMLElement {
  const id = nextId();
  const input = o.multiline
    ? el('textarea', { id, rows: o.rows ?? 2, placeholder: o.placeholder, spellcheck: 'false' })
    : el('input', { id, type: o.type ?? 'text', placeholder: o.placeholder, spellcheck: 'false', autocomplete: 'off' });
  input.value = String(ctl.state[key] ?? '');
  if (o.big) input.classList.add('big');
  input.addEventListener('input', () => {
    (ctl.state as Record<string, unknown>)[key] = input.value;
    ctl.change();
  });
  return field(label, id, input, o.hint);
}

export function check<S>(ctl: Ctl<S>, key: keyof S & string, label: string): HTMLElement {
  const input = el('input', { type: 'checkbox', checked: Boolean(ctl.state[key]) });
  input.addEventListener('change', () => {
    (ctl.state as Record<string, unknown>)[key] = input.checked;
    ctl.change(true);
  });
  return el('label', { class: 'check' }, input, el('span', {}, label));
}

export function color<S>(ctl: Ctl<S>, key: keyof S & string, label: string): HTMLElement {
  const id = nextId();
  const input = el('input', { id, type: 'color', value: String(ctl.state[key]) });
  input.addEventListener('input', () => {
    (ctl.state as Record<string, unknown>)[key] = input.value;
    ctl.change();
  });
  return el('label', { class: 'swatch', for: id }, input, el('span', {}, label));
}

export function section(title: string, ...children: Child[]): HTMLElement {
  return el('details', { class: 'section', open: true }, el('summary', {}, title), el('div', { class: 'section-body' }, ...children));
}

export function hint(s: string): HTMLElement {
  return el('p', { class: 'hint' }, s);
}

export function button(label: string, onClick: () => void, o: { primary?: boolean; icon?: string } = {}): HTMLButtonElement {
  return el(
    'button',
    { type: 'button', class: o.primary ? 'btn primary' : 'btn', onclick: onClick },
    o.icon ? el('span', { class: 'icon', html: o.icon, 'aria-hidden': 'true' }) : null,
    label,
  );
}

// ---------------------------------------------------------------- persistence

export function persisted<T extends object>(key: string, defaults: T): T {
  const state = { ...defaults };
  try {
    const saved = JSON.parse(localStorage.getItem(`extruda.${key}`) ?? '{}') as Record<string, unknown>;
    for (const k of Object.keys(defaults) as (keyof T & string)[]) {
      if (k in saved && typeof saved[k] === typeof defaults[k]) (state as Record<string, unknown>)[k] = saved[k];
    }
  } catch {
    /* corrupt or unavailable storage: keep defaults */
  }
  return state;
}

export function save<T extends object>(key: string, state: T, omit: (keyof T)[] = []): void {
  try {
    const copy = { ...state };
    for (const k of omit) delete copy[k];
    localStorage.setItem(`extruda.${key}`, JSON.stringify(copy));
  } catch {
    /* storage unavailable */
  }
}

export function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}
