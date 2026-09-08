# Chapter brief: galaxies (`#/galaxien`, folder `src/chapters/galaxies/`, class `GalaxiesChapter`)

Fly through 43’000 galaxies of the 2MASS Redshift Survey – the cosmic web. Data files `public/data/galaxies.bin`,
`galaxies-names.json`, `galaxy-landmarks.json` are being produced by a data agent right now – poll for them
(formats: `src/data/galaxies.ts`; landmarks: `[{ name, en, ra, dec, dist (Mpc), kind: 'cluster'|'supercluster'|'galaxy'|'void'|'wall',
blurb: {de,en}, numbers: [{label:{de,en}, value}] }]`).

## Scene (unit = megaparsec, equatorial frame rotated so north is +Y)
* `loadGalaxyCatalog()` → one `Points` with a custom shader (write it in your folder; you may adapt `StarPoints`): point size from
  K magnitude (bright = bigger, 2–7 px), colour by type (elliptical/lenticular → warm gold-rose, spiral → cyan-blue, irregular →
  violet, unknown → soft white), additive blending, gentle twinkle-free. Optional "Farbe = Fluchtgeschwindigkeit" mode (colour by cz,
  blue→red) toggled by a chip – explains Hubble's law visually.
* The Milky Way at the origin: a procedural spiral galaxy (~30’000 points in a disc of 0,03 Mpc diameter with 2–4 arms, bulge,
  slight thickness, warm centre / blue arms) – sized correctly (it will be tiny at survey scale; that's the point: zoom in and
  find it). Label "Milchstrasse (du bist hier)".
* Landmarks: labels (`label3d`) + faint wire circles for clusters (radius ~1–2 Mpc) and larger, dimmer ones for superclusters.
* The "zone of avoidance" (no galaxies along the Milky Way plane) is real – add a toggle "Galaktische Ebene" that draws a faint
  great-circle band and explain it in a small note.
* Distance-limit slider (show galaxies within 20 … 430 Mpc → 65 Mio … 1,4 Mrd. Lichtjahre, log) – points beyond fade out.

## Camera & tour
* Start far out (~350 Mpc), the whole survey in view, slow auto-rotation; intro. `OrbitRig` around the origin (min radius 0.05,
  max 800) + "Freiflug" chip (`FreeFlight`, speed in Mio. Lj/s).
* **Tour** (panel, "Reise durch das kosmische Netz"): stops in order – Milchstrasse → Andromeda (M31) → Lokale Gruppe → Virgo-Haufen
  (M87) → Laniakea / Grosser Attraktor (Norma) → Coma-Haufen → Perseus-Pisces → Shapley → "Rand der Karte". Each stop: fly there
  (`rig.flyTo`, 3–5 s), show a narration card (name, distance in Mio. Lichtjahre, light-travel sentence "Dieses Licht startete, als
  auf der Erde …" with a matching real event: 2,5 Mio. Jahre = erste Werkzeuge der Gattung Homo; 54 Mio. = Eozän, erste Wale;
  100 Mio. = Kreidezeit; 320 Mio. = Karbon; 650 Mio. = vor der kambrischen Explosion), numbers, ▶ next / ⏸.
* Picking: click → nearest galaxy (screen space) → info card: name (common name if in names.json, else "2MASS-Galaxie" + 2MASX id
  if available else index), type, distance (Mio. Lj), recession velocity (cz km/s, note "Hubble-Fluss"), light-travel time,
  K magnitude; "Dorthin fliegen" button.

## Stats
"43’000 Galaxien", "Reichweite ≈ 1,4 Mrd. Lichtjahre – 3 % des beobachtbaren Universums", "Milchstrasse: eine von ~2 Billionen".
Source line: "Daten: 2MASS Redshift Survey (Huchra et al. 2012), H₀ = 70".

## Verification
Screenshots: full survey (the web/fan structure and the empty galactic-plane band must be visible), Virgo cluster stop with card,
Milky Way close-up, colour-by-redshift mode, mobile, EN. Data checks via `--eval`: count ≈ 43’000; Andromeda present at ≈ 0,78 Mpc;
Virgo cluster galaxies at ≈ 16 Mpc.
