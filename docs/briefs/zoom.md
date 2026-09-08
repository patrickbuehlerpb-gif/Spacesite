# Chapter brief: zoom (`#/zoom`, folder `src/chapters/zoom/`, class `ZoomChapter`)

**The flagship.** A continuous, seamless zoom from the Earth's surface to the edge of the observable universe – powers of ten,
but through real data at every scale. Think "Powers of Ten" (Eames) meets Brian Cox.

## Core mechanic
One scalar `logD` = log10(camera distance from Earth in metres), range 6.9 (≈ 8’000 km, Earth fills the view) … 26.7
(4.4·10²⁶ m, the observable universe). Controls: mouse wheel / trackpad, vertical drag on touch, a vertical log slider on the right
(with tick labels 10⁷ … 10²⁶ and named ticks: Erde, Mond, Sonne, Neptun, Voyager 1, Oortsche Wolke, Proxima, Milchstrasse,
Andromeda, Virgo, Laniakea, Universum), keyboard ↑/↓, and a **"Reise" autoplay** (zooms out at ~0.35 decades/s, pausing 3 s at
each milestone card; ⏯ and speed chips). Horizontal drag rotates the view direction (all layers share one orientation quaternion).

## Layered rendering (this is how you avoid float precision problems)
Keep N layers, each with its own `THREE.Scene`, own unit (metres per scene unit) and a visibility window in logD. Every frame:
`renderer.autoClear = false; renderer.clear();` then for each visible layer (far → near): set the layer camera at distance
`10^logD / unit` from the origin along the shared direction, near/far = distance·[1e-3, 1e3] (clamped), render, `renderer.clearDepth()`.
Layer opacity = smoothstep in/out at the window edges (drive a uniform/material opacity). Layers and content (all centred on Earth;
for scales ≥ 1e13 m the Earth–Sun offset is irrelevant, so centre those on the Sun):
1. **Erde** (unit 1e6 m; window 6.9–9.5): `createEarth`, real sun direction (`subsolarPoint`), the Moon (real distance 384’400 km,
   real size, `moonGeocentric` direction), a thin ISS orbit ring (418 km), GPS shell (20’200 km), geostationary ring (35’786 km).
2. **Sonnensystem** (unit 1e9 m; window 9–14): Sun (`createSun`), planets at real positions now (`bodyPosition`; planet
   sizes = max(real, 2 px) via sprites), orbit lines, Voyager 1/2 + New Horizons markers, Kuiper belt ring, heliopause sphere
   (~120 AU, faint), Oort cloud shell (2’000–100’000 AU, very faint particle shell), "Lichtstunde/Lichttag" rings.
3. **Sterne** (unit 1 pc; window 13.5–20.5): `loadStarCatalog` + `createStarPoints` (Sun at the origin, add it), nearest-star labels
   (Proxima, Alpha Cen, Barnard, Sirius…), the "Radioblase" sphere (100 ly: how far our first broadcasts have travelled),
   constellation lines fading out beyond ~10 pc, the Orion arm hint.
4. **Milchstrasse** (unit 1 kpc; window 19.5–23): procedural galaxy (~40’000 points, 30 kpc disc, 4 arms, bulge, bar, dust lanes
   darkening, warm centre/blue arms), the Sun's position marker at 8,2 kpc from the centre, Sgr A* label, the Magellanic Clouds
   (LMC 50 kpc, SMC 62 kpc) and Andromeda (780 kpc) + M33 as small sprites with labels.
5. **Galaxien** (unit 1 Mpc; window 22–25.5): `loadGalaxyCatalog` (file `public/data/galaxies.bin` is being produced by a data
   agent right now – poll for it) as points coloured softly, landmarks from `public/data/galaxy-landmarks.json` (Virgo, Coma,
   Laniakea/Great Attractor, Shapley) as labels; a subtle procedural "cosmic web" of filaments beyond the survey edge (marked
   schematisch in the milestone card).
6. **Universum** (unit 1e24 m; window 24.5–26.7): the CMB as a huge sphere (radius 4.4·10²⁶ m) with a procedural anisotropy
   texture (fbm noise tinted like the Planck map, orange/blue), seen from inside as we approach it, plus a faint procedural
   large-scale-structure point cloud (~50’000 points, fbm-clustered) filling the volume. Label "Kosmischer Mikrowellenhintergrund –
   380’000 Jahre nach dem Urknall".

## HUD / narration
* Top-centre readout: current scale as "10¹² m" + human units (`fmtKm` / `fmtDistanceLy`) + light-travel time
  ("Licht braucht hierhin 55 Minuten") – computed every frame from logD.
* An on-screen **ruler** (bottom-left): a bar whose length represents the current decade, labelled (e.g. "1 Mio. km").
* **Milestone cards** (bottom-right glass card, DE/EN, appear when logD crosses the value, dismiss on passing): Mond 3,8·10⁸ m ·
  Sonne 1,5·10¹¹ · Neptun 4,5·10¹² · Voyager 1 (compute from `bodyPosition('voyager1')`) · Heliopause 1,8·10¹³ · Oortsche Wolke
  ~1e15–1e16 · Proxima 4,0·10¹⁶ · Radioblase 9,5·10¹⁷ · Orion-Arm · Milchstrasse 1e21 · Andromeda 2,4·10²² · Lokale Gruppe 5e22 ·
  Virgo-Haufen 5e23 · Laniakea 5e24 · 2MRS-Rand 4e24 · Beobachtbares Universum 4,4·10²⁶. Each card: title, one number, two sentences.
* Intro overlay, then start at logD 7.1 with the real Earth lit correctly. "Reise" button in the intro starts autoplay.

## Notes
* Precompute layer contents once; keep `tick()` allocation-free.
* Textures/point clouds must be disposed on unmount (BaseChapter disposes `this.scene` only – dispose your extra scenes in
  `teardown()` with `disposeScene` from `src/core/BaseChapter.ts`).
* Mobile: slider + drag must work; hide the ruler on very small screens.

## Verification
Screenshots at logD ≈ 7.1 (Earth), 8.7 (Earth+Moon), 12.5 (solar system), 16.8 (nearest stars), 21 (Milky Way), 23.5 (cosmic web),
26.5 (CMB), plus autoplay mid-run with a milestone card, mobile, EN. Use `--eval` to set logD via a small debug hook you expose on
`window.__zoom` (e.g. `window.__zoom.set(21)`).
