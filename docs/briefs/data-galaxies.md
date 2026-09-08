# Data brief: galaxies (2MRS) → `public/data/galaxies.bin`, `galaxies-names.json`, `galaxy-landmarks.json`

You own: `scripts/build-galaxies.mjs`, `scripts/lib/fits.mjs` (new), the three output files. Read `ARCHITECTURE.md`,
`scripts/lib/raw.mjs`, `scripts/lib/bin.mjs`, `scripts/build-stars.mjs` (pattern to follow) and `src/data/galaxies.ts` (the
reader = the format you must produce). Do not edit anything else. Other agents work in the tree concurrently; do not commit.

## Source
`raw/2mrs_1175_done.fits` (43’533 rows, FITS BINTABLE, big-endian). Columns (see header via a quick node script):
TMID (16A), RA, DEC, GLON, GLAT (E = float32), MKC/MHC/MJC, MKTC (Ks total mag) …, TYPE (5A, ZCAT morphological T-type as
text e.g. "-5", "3", "10"; may be blank), V (J = int32, heliocentric cz km/s), CATID (28A, e.g. "NGC0224", "UGC00454", "IC…",
"ESO…", "MCG…"). Write a small FITS BINTABLE parser in `scripts/lib/fits.mjs` (read the primary header, then the extension
header cards: NAXIS1 row bytes, NAXIS2 rows, TFORMn/TTYPEn; data starts after the header padded to 2880; TFORM 'E' float32 BE,
'J' int32 BE, 'I' int16 BE, 'nA' ascii). Download URL for `ensureRaw` fallback:
`https://raw.githubusercontent.com/geaddison/2MRSxCMB/main/data/2mrs_1175_done.fits`.

## Processing
1. cz_helio → cz_CMB: v_cmb = v + 369,82 · [ sin(b)·sin(b_apex) + cos(b)·cos(b_apex)·cos(l − l_apex) ] with the CMB dipole apex
   l = 264,021°, b = 48,253° (Planck 2018) using GLON/GLAT.
2. Distance d = v_cmb / H0 with H0 = 70 km/s/Mpc, **except** for galaxies in the override table (known distances, Mpc): match by
   CATID/NGC name or by RA/Dec within 3 arcmin. Curate ~40 nearby galaxies with well-established distances (e.g. M31 0,78, M33 0,84,
   M32 0,80, M110 0,80, NGC 205, NGC 185, NGC 147, IC 10 0,75, NGC 6822 0,50, WLM 0,93, IC 1613 0,73, NGC 3109 1,3, NGC 55 2,1,
   NGC 300 2,0, NGC 247 3,4, NGC 253 3,5, M81 3,6, M82 3,5, NGC 3077, IC 342 3,3, Maffei 1 3,0, Maffei 2 3,1, NGC 4945 3,6,
   Centaurus A (NGC 5128) 3,8, M83 4,6, NGC 5253, M94 4,7, M64 5,3, M101 6,4, M51 8,6, M63 8,9, M104 9,6, M106 7,2, M65/M66/NGC 3628
   ~10, M96/M95/M105 ~10, M77 14,4, M74 9,8, NGC 6946 7,7, NGC 1023 10,5, M87 16,4, M49 16, M60 16,5, M86 15,2, M84 16,8,
   NGC 4565 12, NGC 1316 (Fornax A) 19, NGC 1399 19, M100 16, M99 15, M98 15, M91, M88, M90 …). Cite the values you are confident
   about; leave out doubtful ones.
3. Galaxies with v_cmb < 300 km/s and no override → drop (distance unreliable). Also drop rows with V ≤ −900 or missing.
   Print how many were dropped. Expected kept ≈ 42’500–43’300.
4. Position: `raDecToXYZ(RA, DEC, d)` (same formula as `src/core/units.ts`) in **Mpc**, equatorial frame.
5. type code: parse the leading integer of TYPE: ≤ −4 → 1 (elliptical), −3…−1 → 2 (lenticular), 0…9 → 3 (spiral), ≥ 10 → 4
   (irregular/peculiar), blank/unparseable → 0.
6. Sort by distance ascending. Write `galaxies.bin` with magic `KGAL`, fields pos f32×3 (Mpc), kmag f32 (MKTC), cz f32 (heliocentric),
   type u8 – exactly as `src/data/galaxies.ts` reads it (use `writeCatalog`).
7. `galaxies-names.json`: `[{ i, name, en?, messier?, ngc? }]` for galaxies with a Messier number or a common name. Sources:
   `raw/openngc_NGC.csv` (`;`-separated; columns Name, RA (hh:mm:ss.s), Dec (±dd:mm:ss), Type, …, M (Messier number), Common names)
   – cross-match by CATID (e.g. "NGC0224" ↔ "NGC0224") first, then by coordinates within 1 arcmin. German names for the famous
   ones (Andromeda-Galaxie, Dreiecksgalaxie, Sombrero-Galaxie, Whirlpool-Galaxie, Feuerrad-Galaxie (M101), Zigarren-Galaxie (M82),
   Bodes Galaxie (M81), Centaurus A, Schwarzauge-Galaxie (M64), Sonnenblumen-Galaxie (M63), …) with `en` english.
8. `galaxy-landmarks.json`: curated structures for tours/labels:
   `[{ id, name, en, ra, dec, dist, kind, radius?, blurb: {de,en}, numbers: [{ label:{de,en}, value }] }]` with kind ∈
   galaxy | cluster | supercluster | void | wall. Include at least: Milchstrasse (dist 0), Andromeda (M31), M33, LMC (0,05), SMC (0,06),
   Centaurus A, M81-Gruppe, Virgo-Haufen (RA 187,7 Dec +12,4, 16,5 Mpc, ~1’300 Galaxien), Fornax-Haufen (19 Mpc), Coma-Haufen (RA 194,95
   Dec +27,98, 100 Mpc, ~1’000 Galaxien), Perseus-Haufen (RA 49,95 Dec +41,51, 73 Mpc), Norma-Haufen / Grosser Attraktor (RA 243,6
   Dec −60,9, 68 Mpc), Centaurus-Haufen (52 Mpc), Hydra-Haufen (58 Mpc), Hercules-Haufen (RA 241,3 Dec +17,7, 155 Mpc), Shapley-
   Superhaufen (RA 202,5 Dec −31,5, 200 Mpc, dichteste Struktur in unserer Nachbarschaft), Laniakea (centre ≈ Grosser Attraktor,
   radius ~80 Mpc, 100’000 Galaxien), Perseus-Pisces-Superhaufen, Pavo-Indus, Leo-Haufen (Abell 1367, 92 Mpc), Coma-Wall / CfA2
   Great Wall, Lokale Leere (Local Void, RA ~ 18h Dec +6°, ~ 23 Mpc, radius ~ 20 Mpc), Boötes-Void (RA 218 Dec +26, 215 Mpc,
   radius ~ 50 Mpc). Blurbs 1–2 sentences DE/EN with one memorable number each.
9. Add `build-galaxies.mjs` sanity prints: total kept, M31 index & distance (must be 0,78), M87 distance (≈ 16,4), count within
   20 Mpc, farthest distance (≈ 430 Mpc), the fraction of type codes.

## Verification
Run the script, then verify with a small node script reading `galaxies.bin` via `scripts/lib/bin.mjs` (`readCatalog`) that:
count matches, no NaN, positions sane, sorted by distance, names indices valid. Report the numbers. Also run
`node scripts/build-all.mjs`? No – only your script (others may be missing). Final answer: structured summary with the checks.
