# Data brief: exoplanets (Open Exoplanet Catalogue) → `public/data/exoplanets.json`

You own: `scripts/build-exoplanets.mjs`, `scripts/lib/xml.mjs` (new), the output file. Read `ARCHITECTURE.md`,
`scripts/lib/raw.mjs`, `scripts/build-stars.mjs` (pattern) and `src/data/exoplanets.ts` (the reader = the exact columnar format
you must produce). Do not edit anything else; other agents work concurrently; do not commit.

## Source
`raw/oec_systems/*.xml` – 4’081 system files from https://github.com/OpenExoplanetCatalogue/open_exoplanet_catalogue
(nightly updated; MIT). Structure (nested!):
```
<system><name>…</name><name>alias</name><rightascension>HH MM SS.s</rightascension><declination>+DD MM SS</declination>
  <distance errorplus=".." errorminus="..">pc</distance>
  <star><name>…</name><mass>M☉</mass><radius>R☉</radius><temperature>K</temperature><metallicity/><spectraltype/>
    <planet><name>…</name><name>alias</name><list>Confirmed planets</list><mass upperlimit="…">MJup</mass><radius>RJup</radius>
      <period>days</period><semimajoraxis>AU</semimajoraxis><eccentricity/><temperature>K</temperature>
      <discoverymethod>transit|RV|imaging|microlensing|timing|astrometry</discoverymethod><discoveryyear/><lastupdate/>
    </planet></star>
  <binary><star>…</star><star>…</star><planet>…(circumbinary)</planet></binary>
</system>
```
Elements may be empty (`<mass/>`), may carry attributes (errorplus/errorminus/upperlimit/lowerlimit), values may be missing.
Write `scripts/lib/xml.mjs`: a small, dependency-free recursive XML parser (tags, attributes, text, self-closing; no namespaces,
no CDATA needed; entities &amp; &lt; &gt; &quot; &apos;) returning `{ tag, attrs, children, text }` nodes with helpers
`child(node, tag)`, `children(node, tag)`, `num(node, tag)`. Use `ensureRaw` only if the folder is missing (there is no single
download URL – in that case print instructions to `git clone --depth 1` the repo into `raw/oec_systems`).

## Processing
* Walk every system; for planets nested in `<star>` use that star as host; for planets directly under `<binary>` use the binary's
  first star as host (mark `host` with the system name + " (Doppelstern)").
* Keep planets whose `<list>` contains "Confirmed planets" (drop Controversial/Retracted/Kepler Objects of Interest/Solar System).
* Parse RA/Dec sexagesimal → degrees. Distance in pc (null if missing).
* Fields per `ExoplanetTable`: name (first `<name>`), host (first star `<name>`), ra, dec, dist, mass (MJup), radius (RJup), period (d),
  sma (AU), ecc, teq (K), year, method (normalise to: transit | RV | imaging | microlensing | timing | astrometry | other),
  stMass, stRadius, stTeff, hz.
* `hz`: 1 if sma is known and stellar luminosity L (from stRadius & stTeff: L = R²·(T/5772)⁴; if radius missing but mass known,
  L ≈ M^3.5) gives 0,75·√L ≤ sma ≤ 1,77·√L (optimistic Kopparapu-style zone). Else 0.
* Output columnar JSON: `{ n, source: "Open Exoplanet Catalogue", updated: "<YYYY-MM-DD of newest lastupdate or today>", name: [...],
  host: [...], … }` – arrays of equal length n, `null` for missing numbers. Round numbers to 4 significant digits to keep it small
  (target < 1,2 MB).
* Sort by host name then name.

## Sanity prints (in the script)
total planets, per method counts, per year (last 8 years), planets with distance, hz count, and checks: "Proxima Centauri b" dist ≈ 1,30 pc,
"TRAPPIST-1" has 7 planets, "51 Peg b" year 1995, "Kepler-452 b" exists, largest year present (should be 2025/2026).
Then verify the JSON loads and all arrays have length n. Final answer: structured summary with these numbers.
