// SPDX-License-Identifier: AGPL-3.0-or-later
// A printable 3D map. This is the one tool that talks to an outside service, and only when asked.
import { download, partsToSTL, to3MF } from '../core/export';
import type { Part } from '../core/mesh';
import { loadHeights, PLACES, terrainMesh, TILE_SIZE, tileUrl, type HeightGrid } from '../core/terrain';
import { Viewer } from '../core/viewer';
import { fmt, t, tr } from '../i18n';
import { button, check, color, debounce, el, hint, number, persisted, range, save, section, select, type Ctl } from '../ui/form';
import { icons } from '../ui/icons';
import { statusText, toolShell } from '../ui/modelTool';

const DEFAULTS = { place: 'musala', lat: 42.1794, lon: 23.5853, radius: 6, width: 120, exaggeration: 1.5, base: 3, detail: 256, flatSea: true, color: '#22c55e' };
type State = typeof DEFAULTS;

async function loadTile(z: number, x: number, y: number): Promise<Uint8ClampedArray> {
  const res = await fetch(tileUrl(z, x, y));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const c = document.createElement('canvas');
  c.width = TILE_SIZE;
  c.height = TILE_SIZE;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bitmap, 0, 0, TILE_SIZE, TILE_SIZE);
  bitmap.close();
  return g.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data;
}

// The last download stays in memory, so model settings can change without fetching again.
let loaded: { grid: HeightGrid; radius: number; label: string } | undefined;

export function mount(container: HTMLElement): () => void {
  const state = persisted('terrain', DEFAULTS);
  const shell = toolShell(t('tool.terrain.title'), t('tool.terrain.desc'));
  container.append(shell.root);
  const viewer = new Viewer(shell.host);
  let parts: Part[] = [];
  let firstBuild = true;
  let disposed = false;
  const readout = el('p', { class: 'readout', hidden: true });

  const setStatus = (s: string, kind = 'ok') => {
    shell.status.textContent = s;
    shell.status.dataset.kind = kind;
  };

  const rebuild = () => {
    if (!loaded || disposed) return;
    const r = terrainMesh(loaded.grid, { width: state.width, areaKm: loaded.radius * 2, exaggeration: state.exaggeration, base: state.base, flatSea: state.flatSea });
    parts = [{ name: 'Terrain', color: state.color, mesh: r.mesh }];
    const part = { ...parts[0], smooth: true };
    viewer.setParts([part], { fit: firstBuild });
    firstBuild = false;
    readout.hidden = false;
    readout.textContent = tr([
      `${loaded.label}: heights ${fmt(r.min, 0)}–${fmt(r.max, 0)} m. Model height ${fmt(r.height)} mm.`,
      `${loaded.label}: височини ${fmt(r.min, 0)}–${fmt(r.max, 0)} м. Височина на модела ${fmt(r.height)} мм.`,
    ]);
    setStatus(statusText(parts));
  };
  const scheduleRebuild = debounce(rebuild, 200);

  const fetchArea = async () => {
    setStatus(tr(['Downloading elevation data…', 'Изтегляне на данни за релефа…']), 'busy');
    try {
      const grid = await loadHeights(state.lat, state.lon, state.radius, state.detail, loadTile);
      if (disposed) return;
      const place = PLACES.find((p) => p.id === state.place);
      loaded = { grid, radius: state.radius, label: place ? tr(place.name) : `${state.lat.toFixed(3)}, ${state.lon.toFixed(3)}` };
      firstBuild = true;
      rebuild();
    } catch (err) {
      console.error(err);
      setStatus(navigator.onLine === false
        ? tr(['You are offline. This tool needs the internet to download elevation data.', 'Нямаш интернет. Този инструмент го използва, за да изтегли данните за релефа.'])
        : tr(['Could not download the elevation data. Try again in a moment.', 'Данните за релефа не можаха да се изтеглят. Опитай пак след малко.']), 'error');
    }
  };

  const areaCtl: Ctl<State> = {
    state,
    change(structural) {
      save('terrain', state);
      if (structural) renderControls();
    },
  };
  const placeCtl: Ctl<State> = {
    state,
    change() {
      const p = PLACES.find((x) => x.id === state.place);
      if (p) {
        state.lat = p.lat;
        state.lon = p.lon;
        state.radius = p.radius;
      }
      save('terrain', state);
      renderControls();
    },
  };
  const modelCtl: Ctl<State> = {
    state,
    change(structural) {
      save('terrain', state);
      if (structural) renderControls();
      scheduleRebuild();
    },
  };

  const renderControls = () => {
    shell.controls.replaceChildren(
      el(
        'div',
        { class: 'card notice' },
        el('span', { class: 'icon', html: icons.globe, 'aria-hidden': 'true' }),
        tr([
          'Unlike the other tools, this one downloads map data. When you press the button, the area you chose is requested from Amazon Web Services, which hosts the public elevation data. Nothing is sent before that.',
          'За разлика от другите инструменти, този изтегля данни от карта. Когато натиснеш бутона, избраната област се изисква от Amazon Web Services, където са публичните данни за релефа. Преди това нищо не се изпраща.',
        ]),
      ),
      section(
        tr(['Area', 'Област']),
        select(placeCtl, 'place', tr(['Place', 'Място']), [...PLACES.map((p) => [p.id, tr(p.name)] as [string, string]), ['custom', tr(['Other coordinates', 'Други координати'])]]),
        state.place === 'custom' && number(areaCtl, 'lat', tr(['Latitude', 'Географска ширина']), { step: 0.0001, min: -85, max: 85 }),
        state.place === 'custom' && number(areaCtl, 'lon', tr(['Longitude', 'Географска дължина']), { step: 0.0001, min: -180, max: 180 }),
        range(areaCtl, 'radius', tr(['Distance from the centre', 'Разстояние от центъра']), { min: 0.5, max: 100, step: 0.5, unit: 'km' }),
        range(areaCtl, 'detail', t('f.resolution'), { min: 64, max: 512, step: 32 }),
        button(tr(['Download this area', 'Изтегли тази област']), () => void fetchArea(), { primary: true, icon: icons.download }),
        readout,
      ),
      section(
        tr(['Model', 'Модел']),
        range(modelCtl, 'width', t('f.width'), { min: 40, max: 300, step: 1, unit: t('u.mm') }),
        range(modelCtl, 'exaggeration', tr(['Height exaggeration', 'Преувеличение на височината']), { min: 0.5, max: 8, step: 0.1, unit: '×' }),
        range(modelCtl, 'base', t('f.base'), { min: 0.6, max: 15, step: 0.2, unit: t('u.mm') }),
        check(modelCtl, 'flatSea', tr(['Flat sea', 'Равно море'])),
        color(modelCtl, 'color', t('f.color')),
        hint(tr(['Real terrain looks flat at this scale, so 1.5–3× usually reads best. Not for navigation.', 'В такъв мащаб истинският релеф изглежда плосък, затова 1,5–3× обикновено стои най-добре. Не е за навигация.'])),
      ),
      el(
        'p',
        { class: 'hint' },
        tr(['Terrain data: ', 'Данни за релефа: ']),
        el('a', { href: 'https://registry.opendata.aws/terrain-tiles/', target: '_blank', rel: 'noopener' }, 'Terrain Tiles'),
        tr([' by Mapzen. SRTM, GMTED2010 and 3DEP data courtesy of the U.S. Geological Survey; ETOPO1 from NOAA; ', ' от Mapzen. Данни SRTM, GMTED2010 и 3DEP с любезното съдействие на Геоложката служба на САЩ; ETOPO1 от NOAA; ']),
        el('a', { href: 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md', target: '_blank', rel: 'noopener' }, tr(['all sources', 'всички източници'])),
        '.',
      ),
    );
  };

  shell.actions.append(
    button(t('a.stl'), () => {
      if (parts.length) download(partsToSTL(parts, 'Extruda terrain'), 'terrain.stl', 'model/stl');
    }, { primary: true, icon: icons.download }),
    button(t('a.3mf'), () => {
      if (parts.length) download(to3MF(parts, 'Terrain'), 'terrain.3mf', 'model/3mf');
    }, { icon: icons.layers }),
    el('button', { type: 'button', class: 'btn icon-only', title: t('a.reset'), 'aria-label': t('a.reset'), onclick: () => viewer.resetView(), html: icons.view }),
  );

  renderControls();
  if (loaded) rebuild();
  else setStatus(tr(['Choose an area and press the download button.', 'Избери област и натисни бутона за изтегляне.']));

  return () => {
    disposed = true;
    viewer.dispose();
  };
}
