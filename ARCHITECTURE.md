# KOSMOS – Architecture & contributor guide

Interactive journey through real astronomical data. Static site: **Vite + TypeScript + three.js**, hash routing, no backend.
Deployable to any static host (GitHub Pages, Vercel, Netlify). German UI by default, English via toggle.

```
index.html              single page; <canvas id="gl"> + <div id="ui"> (chapter UI) + <div id="chrome"> (global nav)
src/main.ts             boots App
src/core/               framework (DO NOT restructure; extend carefully)
  App.ts                one WebGLRenderer, render loop, chapter switching with fade, loading screen, window.__kosmos flags
  BaseChapter.ts        base class: scene, camera, UI root, CSS2D labels, disposal
  types.ts              Chapter / ChapterContext interfaces
  Router.ts             #/path/param hash routing (navigate(), parseHash())
  i18n.ts               t('ns.key'), registerStrings(ns, de, en), lang(), locale(), pick({de,en})
  units.ts              constants (KM_PER_AU, LY_PER_PC, …), fmtNum/fmtDistanceLy/fmtKm/fmtLightTime/fmtYears/fmtKelvin, raDecToXYZ, clamp/lerp
  ui.ts                 DOM helpers: el, button, panel, slider, chip, stat, kv, hud, showIntro, infoCard, toast, icons
  StarPoints.ts         GPU star renderer (magnitude-correct sizes from absMag + camera distance), colorsFromBv
  CameraRig.ts          flyCamera(), OrbitRig (drag/scroll/pinch orbit, tweenable)
  FreeFlight.ts         WASD + drag first-person flight
  tween.ts              tween(ms, k=>…, ease) ticked by App; cancelAllTweens on chapter switch
  Loader.ts             loadJSON/loadBinary from public/data with progress + cache; dataUrl(), textureUrl()
  color.ts              bvToRgb, teffToBv, kelvinToCss, spectralClassFromBv
  chrome.ts             top bar, nav, language toggle, credits modal
  strings.ts            core + chapter title/blurb strings (de/en)
  Earth.ts              createEarth(radius) – day/night/specular/clouds/atmosphere shaders; latLonToVector3()
  Sun.ts                createSun(radius) – animated granulation shader + corona sprite
src/data/               dataset loaders + types (formats documented in each file)
  stars.ts              109k stars (HYG) – loadStarCatalog(), loadStarNames(), loadConstellations(), searchStars()
  galaxies.ts           43k galaxies (2MRS) – loadGalaxyCatalog(), loadGalaxyNames()
  exoplanets.ts         exoplanets (OEC) – loadExoplanets()
  solarsystem.ts        BODIES (physical data + DE/EN blurbs), bodyPosition(id, jd) heliocentric ecliptic AU (JPL elements),
                        orbitPath(), moonGeocentric(), moonPhase(), subsolarPoint(), eclToEq()/eqToEcl(), julianDate()
  bin.ts                binary catalogue reader
src/chapters/<id>/      one folder per chapter; default-export a class implementing Chapter (extend BaseChapter)
  registry.ts           chapter list: id, hash path, nav flag, accent, lazy loader
src/live/api.ts         browser-side API clients: fetchISS/fetchISSPositions, fetchUpcomingLaunches, fetchAstronautsInSpace,
                        fetchSpaceWeather (+kpLevel), fetchNeoFeed, fetchAPOD, SDO image urls, Sen YouTube embed.
                        All return {data, at, stale}; localStorage cache; throw LiveError when nothing is available.
                        The sandbox has NO internet for these hosts → test with `node scripts/shot.mjs … --mock` (fixtures in scripts/mock/).
src/styles/             tokens.css (design tokens), base.css, ui.css (components), chrome.css
public/data/            generated datasets (committed; rebuild with `npm run data`)
public/textures/        Earth/Moon textures (three.js / NASA)
scripts/                data build scripts (Node, no deps) + shot.mjs (headless screenshot smoke test)
raw/                    downloaded raw sources (gitignored; auto-downloaded by scripts)
```

## Chapters

| id          | route            | folder                   | what it is                                                     |
|-------------|------------------|--------------------------|----------------------------------------------------------------|
| home        | `#/`             | chapters/home            | hero: real night sky, title, live ticker, chapter menu           |
| stars       | `#/sterne`       | chapters/stars           | free flight through 109k real stars, search, constellation lines |
| solarsystem | `#/sonnensystem` | chapters/solarsystem     | Keplerian solar system at the real current date, time control    |
| exoplanets  | `#/exoplaneten`  | chapters/exoplanets      | 3D map + charts of confirmed exoplanets                          |
| galaxies    | `#/galaxien`     | chapters/galaxies        | fly through 43k galaxies (cosmic web), Local Group, names        |
| zoom        | `#/zoom`         | chapters/zoom            | continuous log-scale zoom Earth → observable universe            |
| timeline    | `#/zeit`         | chapters/timeline        | scrubbable 13.8 Gyr timeline + future                            |
| live        | `#/live`         | chapters/live            | live dashboard: ISS on 3D Earth, launches, astronauts, space weather, NEOs, APOD, Sen video |

## Chapter contract

```ts
export default class FooChapter extends BaseChapter {
  readonly id = 'foo';
  protected async setup() { /* load data, build scene, add UI via this.addUI(...) */ }
  protected tick(dt: number, elapsed: number) { /* per frame */ }
  protected teardown() { /* remove window listeners etc. (scene objects are disposed automatically) */ }
}
```

* `this.scene`, `this.camera` (PerspectiveCamera), `this.root` (chapter UI root), `this.ctx.renderer`, `this.ctx.param` (route param).
* Deep links: `#/sterne/Sirius` → `ctx.param === 'Sirius'`. When only the param changes while the chapter is open, the App dispatches `kosmos:param` (CustomEvent, detail = param) on `ctx.ui`.
* Every interactive DOM element needs class **`ia`** (the UI layer is pointer-events:none by default).
* Use `this.label(text, cls, parent, offset)` for CSS2D labels (auto-enables the label renderer).
* Register strings in `strings.ts` inside your chapter folder: `registerStrings('foo', {…}, {…})` and import it in the chapter module. Keys `chapter.<id>.title|subtitle|blurb|nav` already exist in core.
* Use `showIntro(this.root, { kicker, title: t('chapter.foo.title'), blurb: t('chapter.foo.blurb') })` on mount (skip when `ctx.param` deep-links to an object).
* Clean up: window/document listeners → `this.onDispose(fn)`; controls → dispose in `teardown()`. Scene geometry/materials/textures are disposed by BaseChapter.
* Never hardcode colours/fonts: use CSS variables from `tokens.css` and component classes from `ui.css` (`panel`, `btn`, `stat`, `kv`, `hud`, `info-card`, `chip`, `field`).
* Numbers go through `units.ts` formatters (locale-aware: de-CH / en-US).
* Respect `this.ctx.app.reducedMotion` (shorter/no auto camera flights).
* Mobile: everything must be usable with touch (drag = look/rotate, pinch = zoom, tap = select). Keep panels within `calc(100vw - 2*var(--gutter))`.
* Performance target: 60 fps on a laptop GPU with 100k points; avoid per-frame allocations; use `Points`/instancing, not thousands of meshes.

## Data frames & units

* Star and galaxy catalogues: **equatorial J2000 cartesian**. x → RA 0h / Dec 0°, y → RA 6h, z → north celestial pole. Stars in **parsecs**, galaxies in **megaparsecs**. Convert RA/Dec+distance with `raDecToXYZ()`.
* Solar system chapter uses its own heliocentric ecliptic frame in AU (document it in the chapter).
* three.js is y-up; the catalogues are z-up (north pole = +z). Either rotate the catalogue group by `-90°` about X so north points up, or set `camera.up = (0,0,1)`. Pick one per chapter and be consistent.

## Visual language (Brian Cox / BBC "Universe" feel)

Deep black-blue background, thin glass panels, big gold tabular numbers, serif italic display titles (`<em>` inside titles is the gold accent), cyan for selections/hot things, violet for galaxies, rose for danger/red giants. Cinematic camera moves (ease-in-out, 1.5–3 s), subtle bloom-like glow via additive sprites, no gimmicks. Every chapter shows at least three striking real numbers (via `stat()`), and every clickable object opens an `infoCard`.

## Tooling

```
npm run dev          # local dev server
npm run typecheck    # tsc --noEmit  – must pass
npm run build        # production build – must pass
npm run data         # rebuild public/data from raw sources
node scripts/shot.mjs "#/sterne" shots/stars.png --wait 2500 [--click ".btn.primary"] [--mobile] [--fps]
```

`shot.mjs` fails (exit 1) on uncaught errors or if the chapter never sets `window.__kosmos.ready`. Look at the PNG to judge the visuals.
