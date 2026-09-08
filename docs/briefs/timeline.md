# Chapter brief: timeline (`#/zeit`, folder `src/chapters/timeline/`, class `TimelineChapter`)

13,8 billion years – and the future. A scrubbable, cinematic timeline with a 3D/shader backdrop that changes with the era.

## Timeline model
Time axis = log10(seconds since the Big Bang) for the past (10⁻³² s … 4,35·10¹⁷ s = 13,8 Gyr) and log10(years from now) for the
future (10² … 10¹⁰⁰ yr). Present it as ONE horizontal axis: left segment "Vergangenheit" (log), a "Heute" marker, right segment
"Zukunft" (log). Drag/scrub, wheel, ←/→ keys, and ▶ autoplay (slow, pauses at events). Show the current position as a big number
("380’000 Jahre nach dem Urknall" / "in 4,5 Mrd. Jahren"), and – for the past – the **kosmische Kalender** date (13,8 Gyr = 1 year:
Big Bang = 1. Januar 00:00, today = 31. Dezember 24:00; compute month/day/time), plus the universe's temperature and the size of
the observable universe at that time where meaningful (T ∝ 1/a, a(t) approximations: radiation era a ∝ t^½, matter era a ∝ t^⅔;
use anchor values: T = 2,725 K today, 3’000 K at recombination).

## Events (write them in `events.ts` as data: t in seconds or years, title, text, era, numbers; DE + EN; cite standard values)
Past: Urknall (0) · Inflation (10⁻³² s) · Quark-Gluon-Plasma (10⁻⁶ s, 10¹³ K) · Protonen und Neutronen (10⁻⁴ s) ·
Nukleosynthese (3 min: 75 % H, 25 % He) · Rekombination / CMB (380’000 J., 3’000 K) · Dunkles Zeitalter · Erste Sterne
(~180 Mio. J., Population III) · Erste Galaxien (JADES-GS-z14-0, 290 Mio. J. nach dem Urknall, JWST 2024) · Reionisation
(~1 Mrd. J.) · Milchstrasse: dicke Scheibe (~11 Mrd. J. vor heute) · Sternentstehungs-Maximum (~3,5 Mrd. J. nach Urknall) ·
Sonne entsteht (4,6 Mrd. J. vor heute) · Erde (4,54) · Mond-Entstehung (4,5) · Frühestes Leben (≥ 3,7 Mrd.) · Sauerstoff-Katastrophe
(2,4 Mrd.) · Komplexe Zellen (~1,8 Mrd.) · Kambrische Explosion (538 Mio.) · Dinosaurier-Ende (66 Mio.) · Homo sapiens (300’000) ·
Landwirtschaft (12’000) · Erste Radiosendungen (~1900) · Heute.
Future: Beteigeuze-Supernova (irgendwann in den nächsten 100’000 J.) · Nächster Halley-Besuch 2061 · Andromeda-Kollision beginnt
(4–4,5 Mrd.) · Ozeane verdampfen (~1 Mrd.) · Sonne wird Roter Riese (5 Mrd.) · Weisser Zwerg (~7,8 Mrd.) · Milchstrasse–Andromeda
verschmolzen ("Milkomeda", ~6 Mrd.) · Lokale Gruppe allein am Himmel (~100 Mrd.) · Letzte Sterne entstehen (10¹⁴ J.) · Ära der
Degeneration (10¹⁵–10³⁹) · Ära der Schwarzen Löcher (bis 10¹⁰⁰: Hawking-Verdampfung) · Wärmetod. Mark speculative items as
"Hypothese/Modell".

## Backdrop (the 3D canvas behind the UI)
A full-screen shader quad (`PlaneGeometry` in front of an orthographic camera or a large sphere) whose look is driven by the era:
* < 380’000 J.: glowing plasma (fbm noise, colour from temperature: white-blue → orange → deep red, brightness falling),
* Dark ages: near black with faint red glow,
* First stars/galaxies: blue-white points sparkle in (use `createStarPoints` with random positions or a subset of HYG rotated),
* Galaxy era → today: the real galaxy catalogue (`loadGalaxyCatalog`, if `public/data/galaxies.bin` exists yet – poll; fall back to
  stars) slowly rotating, then the real stars, and for "Sonne/Erde" events show `createSun`/`createEarth` softly,
* Future: reddening (red giant), then darkening to black with a single fading point (black-hole era).
Transitions are smooth (lerp parameters over 1 s).

## UI
Top: big number panel (time, cosmic calendar, temperature, size) as `stat()` tiles. Middle: event card (title, era chip, text,
numbers as kv, "Quelle/Modell" line). Bottom: the axis (SVG) with event ticks (hover title), the "Heute" marker, and ▶ controls.
Event list drawer (right, scroll) to jump. Mobile: axis full width, cards stack. Route param `#/zeit/cmb` etc. (event ids).

## Verification
Screenshots: Big Bang plasma, CMB event, first galaxies, today, Andromeda collision, black-hole era, mobile, EN. Check the cosmic
calendar: dinosaur extinction ≈ 30. Dezember; Homo sapiens ≈ 31. Dezember 23:52; recombination ≈ 1. Januar 00:14.
