# Contributing

Thanks for wanting to make Extruda better! Bug reports, tool ideas and pull requests are all welcome.
Issues can be written in English or Bulgarian.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173/extruda/
npm test           # geometry and calculator tests
npm run typecheck
```

## Where things live

- `src/core/` — geometry and maths with no UI: text outlines, model builders, lithophane mesh, exporters, calculators.
  New generators belong here so they can be unit-tested.
- `src/tools/` — one file per page. Register new tools in `src/tools/index.ts`.
- `src/i18n/` — every user-facing string, in `en.ts` and `bg.ts`. Add both.
- `src/models/` — the ready-made models gallery. **Adding a model is one entry** in `desk.ts`, `home.ts` or `gifts.ts`:
  labels as `['English', 'Български']` pairs, a parameter list and a `build()` function. The gallery page and
  `tests/gallery.test.ts` pick it up automatically.
- `tests/` — Vitest. Generated meshes should stay watertight; see `isWatertight` in `tests/helpers.ts`.

## Rules of thumb

- Everything runs in the browser. No servers, no trackers, no uploads.
- Keep models printable: closed meshes, sitting on z = 0, sensible minimum wall thickness.
- New fonts must support both Cyrillic and Latin and use an open license (OFL or similar). Add the license file next to the font and list it in `NOTICE.md`.

## License

Extruda is licensed under the [GNU AGPL v3.0 or later](LICENSE). By sending a pull request you agree
that your contribution is licensed the same way.
