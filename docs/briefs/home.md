# Chapter brief: home (`#/`, folder `src/chapters/home/`, class `HomeChapter`)

The landing page. Cinematic hero over the REAL night sky, chapter menu, and a live ticker.

## Scene
* Background: the star catalogue rendered from Earth's point of view (camera at the origin, `createStarPoints(..., { size: 9 })`,
  catalogue group rotated so that the north celestial pole is up: rotate the group `-90°` about X, or set `camera.up`).
  The Milky Way band must be recognisable (it emerges from star density) – choose a view direction along the galactic plane
  (e.g. towards Sagittarius/Scorpius, RA ≈ 17.8h, Dec ≈ −29°, or Cygnus) and pan/drift the camera very slowly (≈ 0.2°/s).
  Add faint constellation lines (`loadConstellations()`, `LineSegments`, cyan at ~18 % opacity) that slowly breathe in and out
  (opacity oscillating over ~20 s), and 8–12 CSS2D labels for the brightest stars in view (`loadStarNames()`).
  Subtle mouse parallax (camera yaw/pitch ±1.5° following the pointer, eased) on desktop.
* No intro overlay on home.

## UI (root is scrollable: `this.root.classList.add('scroll')`, `overflow-y:auto`)
1. **Hero** (100vh): kicker "Eine Reise durch echte Daten des Universums" / EN, huge serif title "KOSMOS", one-line sub-claim
   (e.g. "109’400 Sterne · 43’000 Galaxien · tausende fremde Welten – alles echt, alles interaktiv."), primary CTA
   "Reise beginnen" → `navigate('zoom')`, secondary ghost "Live aus dem All" → `navigate('live')`. A scroll cue at the bottom.
2. **Live ticker** (thin glass strip, fixed at the bottom of the viewport, `.ia`): items with a green live dot:
   * ISS: "ISS · 27’600 km/h · 418 km hoch · über 21,4° N 45,1° W" (`fetchISS`, refresh every 5 s, animate the numbers),
   * "{n} Menschen im All" (`fetchAstronautsInSpace`),
   * "Nächster Start: {name} in 1 d 04 h 12 min" (`fetchUpcomingLaunches(3)`, countdown ticking every second, skip launches
     whose `net` is in the past),
   * "Seit du hier bist: Erde {x} km weiter um die Sonne" (29,78 km/s, ticks every 100 ms) – computed locally, always works.
   Each network item fails independently: on `LiveError` simply omit it. Use `--mock` to test.
3. **Chapter menu**: cards for the 7 chapters (registry order, skip home): accent-coloured hairline, `t('chapter.<id>.title')`
   (render the `<em>`), `subtitle`, one striking number per card (hard-code: "109’400 Sterne", "8 Planeten · 5 Zwergplaneten",
   "5’900+ Exoplaneten" (use "tausende" if unsure), "43’000 Galaxien", "10²⁷ Meter", "13,8 Mrd. Jahre", "Live").
   Hover: lift + glow; click → `navigate(meta.path)`. Grid: 3 columns desktop, 2 tablet, 1 mobile.
4. **"Wusstest du?"** strip: 3–4 `stat()` tiles with real numbers (e.g. light from the Sun 8 min 20 s; 100–400 Mrd. Sterne in der
   Milchstrasse; Andromeda 2,5 Mio. Lichtjahre und nähert sich mit 110 km/s; beobachtbares Universum 93 Mrd. Lichtjahre Durchmesser).
5. Footer line: data sources (short) + a link that opens the credits (`showCredits()` from `src/core/chrome.ts`).

## Strings
All in `strings.ts` (de/en). Title strings for chapters already exist under `chapter.*`.

## Verification
Screenshots: hero desktop (de + en), hero mobile, scrolled-to-cards, ticker with `--mock`, ticker without `--mock` (must not error).
Check that the Milky Way band is visible and star colours vary (blue Rigel vs orange Betelgeuse).
