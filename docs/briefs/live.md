# Chapter brief: live (`#/live`, folder `src/chapters/live/`, class `LiveChapter`)

"Gerade jetzt": what happens in space this very second (sen.com/live spirit). Uses `src/live/api.ts` (read it fully). The sandbox
has no internet for these hosts – **always test with `--mock`** and once without (must degrade gracefully, no errors).

## Hero: the live Earth
* 3D `createEarth(1)` with the real sun direction from `subsolarPoint(julianDate(new Date()))` (rotate the globe by GMST so
  longitudes are right: use `setRotation` + `latLonToVector3` consistently), slow auto-orbit camera (`OrbitRig`, drag to rotate,
  pinch/wheel zoom 1.8–6). Stars behind (`createStarPoints`, faint).
* **ISS marker** at live lat/lon/alt (`fetchISS` every 5 s; interpolate smoothly between fixes). Ground track: past 45 min and next
  45 min from `fetchISSPositions` (10 timestamps, every 5 min ahead; cache 10 min) as a line on the globe (future dotted).
  Footprint circle (radius from `footprint`). Label "ISS · 27’594 km/h".
* Stats row over the globe (`stat()`): Höhe (km), Geschwindigkeit (km/h), Position (lat/lon), Tag/Nacht (visibility), Umläufe seit
  1998 (≈ 15,5/Tag since 1998-11-20 – label "ca."), Menschen im All (count).
* "Wo bin ich?" button: `navigator.geolocation` → marker + distance to the ISS + elevation angle (is it above your horizon right
  now? show "Die ISS ist gerade {x}° über/unter deinem Horizont"). Handle denial gracefully.

## Panels (scrollable grid below the hero; each panel independent: loading → data → "offline"/stale states; "Stand: vor 3 min")
1. **Menschen im All** (`fetchAstronautsInSpace`): count as big number, list with name, agency, nationality, flights, spacewalks;
   group ISS vs. Tiangong by agency heuristic (CNSA → Tiangong) – label the heuristic.
2. **Nächste Starts** (`fetchUpcomingLaunches(8)`): live countdown (d h min s), name, provider, rocket, pad/location, status chip
   (Go/TBD/TBC colours), mission blurb (collapsible), link to webcast when present. First item featured big.
3. **Weltraumwetter** (`fetchSpaceWeather`, `kpLevel`): Kp gauge (0–9 arc, colour by level), solar wind speed & density, Bz (nT,
   note "negativ = Polarlicht-günstig"), F10.7; Kp sparkline (SVG, last 24 h). Explain in one line what Kp means.
4. **Die Sonne jetzt** (`sdoUrl`): 4 tabs (AIA 171, 304, 193, HMI) with captions (what each wavelength shows), refreshed every
   15 min. Images are plain `<img>`.
5. **Asteroiden diese Woche** (`fetchNeoFeed`): table: name, date/time, size (m, min–max), miss distance (Mondentfernungen +
   km), speed (km/s), "potenziell gefährlich" chip; highlight the closest; note DEMO_KEY limits; link to JPL.
6. **Bild des Tages** (`fetchAPOD`): image (click → hdurl), title, credit, explanation (collapsible, EN original).
7. **Live-Video der Erde**: Sen embed (`SEN_EMBED_URL`, iframe with `allow="autoplay; encrypted-media"`, loading="lazy") behind a
   play overlay (only load the iframe on click to save bandwidth), link to `SEN_URL`. Credit "Sen".
8. **Mond heute**: `moonPhase(jd)` → SVG moon drawing with the correct illuminated fraction and orientation (waxing/waning),
   phase name (Neumond, zunehmende Sichel, …), illuminated %, next full/new moon dates (search forward with `moonPhase`).
9. **Tiefer Raum jetzt** (all local): Voyager 1 & 2, New Horizons distance (AU + km, ticking every second via `bodyPosition`) and
   light-time; days since JWST launch (2021-12-25), Apollo 11 (1969-07-20), Sputnik (1957-10-04); "Licht, das jetzt die Erde erreicht,
   startete von der Sonne vor 8 min 20 s" style lines.
10. **Einstellungen**: NASA API key input (`setNasaKey`, explain DEMO_KEY limits, link https://api.nasa.gov), refresh-all button.

## Behaviour
* All fetch loops (setInterval) are cleared in `teardown()`. Countdown timers tick once per second (one interval for all).
* Pause polling when `document.hidden`.
* Layout: hero 60vh with globe, then a 3-column card grid (1 column mobile). Each card: `panel` with `panel-title` and a small
  source line.

## Verification
Screenshots with `--mock` (hero with ISS marker + track, panels), scrolled panels, mobile, EN, and one WITHOUT `--mock` showing
the graceful offline states (no console errors, no uncaught rejections). Check the moon phase for today (2026-09-08: waning crescent,
~10 %, new moon 11 Sep) and Voyager 1 ≈ 172 AE.
