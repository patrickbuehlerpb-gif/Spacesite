# Chapter brief: solarsystem (`#/sonnensystem`, folder `src/chapters/solarsystem/`, class `SolarSystemChapter`)

The solar system at the real current date, computed from NASA/JPL Keplerian elements (`src/data/solarsystem.ts`).

## Scene (heliocentric ecliptic frame from `bodyPosition()`; scene unit: 1 AU = 10 units; map ecliptic z → three.js Y (up))
* Sun: `createSun(r)`; planets/dwarfs/Halley with `bodyPosition(id, jd)` every frame; orbits via `orbitPath()` as `Line` loops
  (body colour, 35 % opacity). Probes (Voyager 1/2, New Horizons) as small diamond sprites + labels with a faint dotted line
  from the Sun.
* Two size modes (toggle "Massstab": "sichtbar" (default) vs "echt"): visible mode uses an exaggerated radius
  (e.g. `r = 0.05 + 0.35 * log10(radiusKm / 1000)` scene units, Sun ≈ 1.2) so planets are visible from afar; true mode uses real
  radii (planets become dots – say so in a toast). Moon around Earth: visible mode at 3 planet radii, true mode at the real
  distance (`moonGeocentric`).
* Materials (write `PlanetMaterials.ts` in your folder): procedural ShaderMaterials or canvas-generated textures by `look`:
  Jupiter (banded fbm noise, a Great Red Spot), Saturn (softer bands) + rings (RingGeometry with a procedural radial
  transparency/colour texture, real proportions `rings.inner/outer`, tilt 26.7°), Mars (rust with darker fbm regions + polar caps),
  Venus (creamy cloud swirls), Mercury/Moon (grey with crater-like noise), Uranus (pale cyan, faint bands), Neptune (deep blue),
  ice bodies (white/grey noise), comet (white sprite + a faint tail pointing away from the Sun). Earth: `createEarth(r)` with
  `setSunDirection(-earthPos)`. Light: `PointLight` at the Sun (+ low ambient) for any Standard/Phong materials.
* Axial tilt applied per body; rotation animated with the real rotation period scaled by the time speed.
* Asteroid belt: ~4’000 points 2.1–3.3 AU (statistical, slight inclination), Kuiper belt: ~3’000 points 30–50 AU – both faint,
  labelled "schematisch" in the info card of the belts (clickable via a small label).
* Labels: CSS2D names for all bodies (planets always; dwarfs/probes when the camera is far enough; hide the label of the
  focused body).

## Time control (panel bottom centre)
* `simJD` starts at now (`julianDate(new Date())`). Big readable date + time (locale). Buttons: ⏮ −1 step, ⏯ play/pause, ⏭ +1 step,
  "Jetzt". Speed chips: 1 s/s, 1 min/s, 1 h/s, 1 d/s, 1 Woche/s, 1 Monat/s, 1 Jahr/s. Date input to jump (1800–2050 valid range
  of the elements – clamp and show a hint). "Mein Geburtstag" input → jumps to that date and shows "So stand das Sonnensystem, als
  du geboren wurdest" toast.
* Live readouts (kv): Erde–Sonne (AE + Mio. km), Lichtlaufzeit Sonne→Erde, Erde–Mars, Erde–Jupiter, Voyager 1 Entfernung + Lichtlaufzeit.
  Use `distanceAU`, `fmtKm`, `fmtLightTime`.

## Camera
`OrbitRig` around the focused body (default: Sun, radius ≈ 60 units, phi ≈ 1.1). Click a body/label → `rig.flyTo({ target, radius })`
+ follow mode (target tracks the body every frame) + info card. Body list (left panel, scrollable): Sun, planets, dwarfs, Halley,
probes, with a colour dot; current focus highlighted. "Übersicht" button returns to the Sun view. Route param `#/sonnensystem/mars`.

## Info card
name, kind (Planet/Zwergplanet/Komet/Sonde), blurb, then kv: Radius, Masse (× Erde or kg via `fmtSci`), Tag (rotation),
Jahr (period; in Erdjahren above 1000 d), Temperatur (`fmtKelvin`), Monde, Schwerkraft (× Erde), Entfernung zur Sonne jetzt,
Entfernung zur Erde jetzt, Lichtlaufzeit Erde↔Körper; then the facts as bullet lines. Source line: "Bahnelemente: NASA/JPL".

## Verification
Screenshots: overview with orbits + labels, focused on Saturn (rings), Earth close-up (day/night, clouds), time set to a birthday,
true-scale mode, mobile, EN. Data checks (print with `--eval`): on 2026-09-08 Earth heliocentric longitude ≈ 345°, Saturn ≈ 10°,
Jupiter ≈ 129°, Earth–Sun ≈ 1,008 AE; Earth at perihelion on 2026-01-04 ≈ 0,983 AE.
