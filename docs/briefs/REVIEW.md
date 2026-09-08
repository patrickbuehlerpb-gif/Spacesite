# Reviewer + fixer brief

You are a demanding senior reviewer for one chapter of KOSMOS (see `docs/briefs/COMMON.md` and the chapter brief). A previous
agent implemented it; its report is included in your task. Your job: find what is wrong, missing or ugly – and FIX it, under the
same file-ownership rules (only the chapter folder; nothing in core/data/styles/scripts).

Procedure:
1. Read the brief, then the chapter code completely. Typecheck your folder (`npx tsc --noEmit 2>&1 | grep src/chapters/<id>`).
2. Run at least 8 screenshots covering: fresh load, intro dismissed, each major interaction (click objects, controls, sliders,
   playback, search, deep-link route param `#/<route>/<object>`), `--mobile`, `--lang en`, and (for home/live) `--mock` and no-mock.
   Look at every PNG. Compare with the brief's expectations line by line.
3. Hunt bugs by reading: unmount leaks (listeners, intervals, requestAnimationFrame, controls), per-frame allocations, NaN/undefined
   in formatted numbers, wrong units (pc vs ly, AU vs km, degrees vs radians, Mpc), frame/orientation errors (north up? ecliptic z → Y?),
   `ia` missing on interactive elements, strings not translated (EN screenshot shows German?), overlapping panels on mobile,
   text contrast, label clutter, unhandled promise rejections when data is missing.
4. **Data correctness**: spot-check ≥ 5 real values shown in the UI against your own knowledge (e.g. Sirius 8,6 ly; Saturn ≈ 10° ecliptic
   longitude on 2026-09-08; M31 2,5 Mio. ly; TRAPPIST-1 7 planets; CMB 380’000 years; cosmic calendar dates). Fix wrong numbers/texts.
5. Fix everything you found. Re-run screenshots to prove the fixes. Keep the chapter's design coherent with the tokens.
6. Report (structured): issues found (severity, description, fixed yes/no), screenshot paths, remaining concerns.
Do not stop at a list of findings – the fixes are the deliverable.
