// SPDX-License-Identifier: AGPL-3.0-or-later
// Settings ↔ URL-safe text, so a design can be sent as a link.

export function encodeState(state: object, omit: string[] = []): string {
  const copy: Record<string, unknown> = { ...(state as Record<string, unknown>) };
  for (const k of omit) delete copy[k];
  const bytes = new TextEncoder().encode(JSON.stringify(copy));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Returns only keys that exist in `defaults` with the same type; anything else is ignored. */
export function decodeState<T extends object>(text: string, defaults: T): Partial<T> {
  try {
    const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const raw = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    const out: Partial<T> = {};
    for (const k of Object.keys(defaults) as (keyof T & string)[]) {
      if (k in raw && typeof raw[k] === typeof defaults[k]) (out as Record<string, unknown>)[k] = raw[k];
    }
    return out;
  } catch {
    return {};
  }
}

/** Splits "#/tool/sub?s=…" into the route path and its query parameters. */
export function parseHash(hash: string): { path: string; params: URLSearchParams } {
  const raw = hash.replace(/^#\/?/, '');
  const q = raw.indexOf('?');
  return q < 0 ? { path: raw, params: new URLSearchParams() } : { path: raw.slice(0, q), params: new URLSearchParams(raw.slice(q + 1)) };
}
