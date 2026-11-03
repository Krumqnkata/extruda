// SPDX-License-Identifier: AGPL-3.0-or-later
// Bundled fonts (SIL Open Font License), all with Cyrillic and Latin glyphs.

export interface FontInfo {
  id: string;
  name: string;
  file: string;
}

export const FONTS: FontInfo[] = [
  { id: 'russo', name: 'Russo One', file: 'RussoOne-Regular.ttf' },
  { id: 'days', name: 'Days One', file: 'DaysOne-Regular.ttf' },
  { id: 'lobster', name: 'Lobster', file: 'Lobster-Regular.ttf' },
  { id: 'pacifico', name: 'Pacifico', file: 'Pacifico-Regular.ttf' },
  { id: 'seymour', name: 'Seymour One', file: 'SeymourOne-Regular.ttf' },
  { id: 'rubikmono', name: 'Rubik Mono One', file: 'RubikMonoOne-Regular.ttf' },
  { id: 'ptsans', name: 'PT Sans Bold', file: 'PT_Sans-Web-Bold.ttf' },
  { id: 'pangolin', name: 'Pangolin', file: 'Pangolin-Regular.ttf' },
  { id: 'yeseva', name: 'Yeseva One', file: 'YesevaOne-Regular.ttf' },
];

/** Registers the bundled fonts with the page so the font picker can preview them. */
export function registerFontFaces(): void {
  const css = FONTS.map(
    (f) => `@font-face{font-family:"x-${f.id}";src:url("${import.meta.env.BASE_URL}fonts/${f.file}");font-display:swap}`,
  ).join('\n');
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}
