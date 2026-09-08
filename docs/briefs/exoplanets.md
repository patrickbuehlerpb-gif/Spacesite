# Chapter brief: exoplanets (`#/exoplaneten`, folder `src/chapters/exoplanets/`, class `ExoplanetsChapter`)

Thousands of confirmed exoplanets (Open Exoplanet Catalogue, nightly-updated). Data file `public/data/exoplanets.json`
(format: `src/data/exoplanets.ts`) is being produced by a data agent right now – poll for it; `loadExoplanets()` returns rows.

## View A – 3D map (default)
* Unit = parsec, equatorial frame rotated so north is +Y. Sun at the origin (gold sprite + label). One `Points` for host stars
  (group planets by `host`; position from `xyz`; colour from `stTeff` via `teffToBv`→`bvToRgb`, white-ish if unknown; size by
  number of planets, 2–6 px, additive). Faint HYG background stars (`loadStarCatalog`, `size: 4`, `alpha: 0.35`) for context.
* Distance rings at 10 / 100 / 1’000 / 10’000 ly with labels. `OrbitRig` around the Sun, default radius 60 pc; wheel zooms
  (log). Double-click / "Freiflug" chip switches to `FreeFlight`.
* Picking: click → nearest host star in screen space → info card + ring marker + camera `flyTo` (rig target = star, radius = 2 pc).
* **Filters panel** (top-left): discovery method chips (Transit, Radialgeschwindigkeit, Direkte Abbildung, Mikrolinse, Timing,
  Astrometrie, andere), size class chips (Erdähnlich < 1,6 R⊕ · Supererde 1,6–2,5 · Neptunartig 2,5–6 · Jupiterartig > 6 · unbekannt),
  "Bewohnbare Zone" toggle, distance slider (max ly, log), **year slider 1989–today with ▶ playback**: planets appear in discovery
  order (animate over ~25 s; the counter "Bekannte Planeten: {n}" runs up – this must look spectacular: dim points, then pop with
  a brief bright flash when discovered).
* Search (host or planet name, e.g. "TRAPPIST-1", "Proxima", "Kepler-452"). Route param `#/exoplaneten/TRAPPIST-1`.

## Info card (host system)
Host name, distance (ly + light-time sentence), star: Teff (`fmtKelvin`), mass/radius in Suns; then **system diagram** as inline
SVG: the star on the left, planets as circles sized by radius (log), placed by log(sma); habitable zone drawn as a green band
(compute from stellar luminosity L = R²·(T/5772)⁴, optimistic HZ 0,75·√L … 1,77 AU·√L; if unknown, hide the band); Earth
reference tick at 1 AU·√L. Below: a table of planets: name, mass (× Erde or × Jupiter, choose the sensible one), radius,
period (days / years), distance (AU), temperature, discovery year & method, "in bewohnbarer Zone" chip.

## View B – charts ("Diagramm" tab, replaces the 3D view with a full-width glass panel; the 3D scene keeps rendering dimly)
Before writing charts, run the Skill tool with `dataviz` and follow it (colour, axes, legend, tooltip rules). Inline SVG:
1. Scatter: orbital period (log x, days) vs. planet mass (log y, Earth masses) or radius (toggle); dots coloured by discovery
   method (5 colours from tokens/dataviz palette), Earth/Jupiter/Neptune/Mercury marked as reference glyphs; hover tooltip with name;
   click → opens the host info card in view A.
2. Discoveries per year (bars) with the milestones 1995 (51 Peg b), 2009 (Kepler), 2014 & 2016 (Kepler validation batches),
   2018 (TESS), 2022 (5000th planet) annotated.
3. Method share (horizontal stacked bar) and size-class share.

## Stats (intro panel / top of the chart view)
Total confirmed, in habitable zone, nearest (Proxima Centauri b – 4,2 Lj), smallest/largest, earliest discovery (1992 PSR B1257+12 or
1995 51 Peg b depending on data), median distance. Source line: "Daten: Open Exoplanet Catalogue, Stand {updated}".

## Verification
Screenshots: map overview, TRAPPIST-1 info card with system diagram, year playback mid-way (e.g. 2009), chart view, mobile, EN.
Data checks via `--eval`: count > 5000; Proxima b exists with dist ≈ 1,3 pc; TRAPPIST-1 has 7 planets; 51 Peg b year 1995.
