# Chapter brief: stars (`#/sterne`, folder `src/chapters/stars/`, class `StarsChapter`)

Free flight through 109’400 real stars (HYG: Hipparcos/Gliese/Yale). The signature "fly through real data" experience.

## Scene (unit = parsec, equatorial frame; rotate the catalogue group so the north pole is +Y)
* `loadStarCatalog()` → `createStarPoints(pos, absMag, colors, { size: 7, maxSize: 90 })`. Add the Sun as an extra star at the
  origin (absMag 4.83, B-V 0.65) – a separate 1-point `Points` or a sprite with a label "Sonne".
* Constellation lines (`loadConstellations()`) as one `LineSegments` (cyan, 25 % opacity), toggleable; constellation name labels
  (CSS2D, `label3d dim`) at the centroid of each figure, visible only while the camera is within ~3 pc of the Sun (they only make
  sense from Earth) – fade with distance.
* Landmarks (hard-code RA/Dec/distance, label + short DE/EN blurb): Orion Nebula (M42, 412 pc), Pleiades (136 pc), Hyades (47 pc),
  Galactic centre direction (Sgr A*, 8’200 pc – place a label far away), Crab Nebula (2’000 pc), Omega Centauri (5’200 pc),
  Alpha Centauri system, Barnard's Star. Render as soft sprites/labels; use `raDecToXYZ`.
* Distance rings around the Sun in the galactic plane? Simpler: three faint circles of radius 10 / 100 / 1000 ly in the plane of
  the ecliptic-ish (XY of the equatorial frame is fine) with tiny labels, toggle "Massstab".

## Controls
* `FreeFlight` (drag to look, WASD/arrows, Shift boost, wheel = speed). Speed shown in the HUD as "Lichtjahre pro Sekunde"
  (convert pc→ly) plus "warp factor"-style hint: at 1 ly/s you'd reach Proxima in 4 s. Speed range 0.01 ly/s … 5’000 ly/s.
* Touch: drag = look; on-screen throttle buttons (▲ forward / ▼ back, hold to fly) using `setThrottle`, and a speed slider.
* **Autopilot**: search box (`searchStars`, dropdown of results, proper names first) and a "Berühmte Sterne" list
  (Sirius, Alpha Centauri = "Rigil Kentaurus", Proxima Centauri, Beteigeuze, Rigel, Wega, Polaris, Antares, Deneb, Aldebaran,
  Arktur, Canopus, Achernar, Barnards Pfeilstern, UY Scuti if present, Sonne). Selecting flies the camera (`flyCamera`, 3–5 s,
  eased, look-at target) to a point 0.3 % of the distance in front of the star (min 0.01 pc), then opens the info card.
  While autopilot runs, FreeFlight is disabled; any drag cancels it.
* **Picking**: click/tap → nearest star in screen space (project all stars once per click; weight by brightness so a bright star
  wins over a faint one within 12 px). Selected star gets a ring marker (sprite) and an info card.
* "Zurück zur Sonne" button, and `Esc` closes the card.
* Route param: `#/sterne/Betelgeuse` (name or HIP number) → skip intro and autopilot there.

## Info card content (real numbers)
name (proper / Bayer / HIP), constellation (German name from `Constellation.de`), spectral type, colour swatch (`bvToRgb`),
distance from Sun (ly, `fmtDistancePc`), distance from your current position, apparent magnitude from Earth, absolute magnitude,
luminosity in Suns (`lumFromAbsMag`, formatted "×"), and the line "Das Licht, das du siehst, verliess diesen Stern vor
{years} Jahren" (= distance in ly). For the Sun show the Sun's numbers.

## HUD (bottom centre)
"Entfernung zur Sonne {x} Lichtjahre · Tempo {v} Lj/s · {n} Sterne im Katalog". Top-left panel: search + famous list (collapsible
on mobile). Top-right: toggles (Sternbilder, Namen, Massstab). Bottom-right: controls hint (`t('ui.flyHint')`).

## Stats for the intro / first panel
"109’400 Sterne", "Nächster Stern: Proxima Centauri, 4,25 Lichtjahre", "Fernster Stern im Katalog: {x} Lichtjahre".

## Verification
Screenshots: from Earth with constellations (should look like the real sky), after autopilot to Betelgeuse with info card open,
mid-flight far out (Milky Way disc visible as a band), mobile, EN. Data checks: Sirius 8,6 Lj, Proxima 4,2 Lj, Vega 25 Lj, Polaris ≈ 433 Lj.
