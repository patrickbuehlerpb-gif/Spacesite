# Common rules for chapter agents

You are implementing ONE chapter of **KOSMOS**, an interactive website about the universe built on real astronomical data
(Vite + TypeScript + three.js, repo at `/home/user/Spacesite`). Inspiration: the visual language of Brian Cox's BBC series
"Universe" (cinematic, precise, awe without kitsch) and sen.com/live (live data from space).

## Read first
1. `ARCHITECTURE.md` (framework, chapter contract, data formats, tooling)
2. `src/core/*.ts`, `src/data/*.ts`, `src/live/api.ts`, `src/styles/*.css`
3. the stub in your chapter folder and `docs/briefs/<your chapter>.md`

## Concurrency: other agents work in the SAME working tree right now
* Only create/edit files inside **your own folder** `src/chapters/<id>/` (plus files explicitly listed in your brief).
* Never edit `src/core`, `src/data`, `src/live`, `src/styles`, `src/chapters/registry.ts`, `index.html`, `package.json`, `scripts/`
  or other chapters. If you need a helper that does not exist, implement it inside your folder.
* Do not run `npm install`, do not `git commit`/`push`/`stash`/`checkout`, do not delete files you did not create.
* `public/data/*.bin|json` are produced by data agents; if your brief says a dataset "will exist", poll for the file
  (`ls -la public/data`) before testing; while waiting, build everything else.

## Verification loop (mandatory)
* Typecheck only your files: `npx tsc --noEmit 2>&1 | grep -E "src/chapters/<id>"` → must print nothing. Errors elsewhere are
  other agents' work in progress – ignore them.
* Screenshots: `node scripts/shot.mjs "#/<route>" shots/<id>-N.png --wait 2500 [--click ".btn.primary"] [--mobile] [--mock] [--fps]`
  (`--click ".btn.primary"` dismisses the intro; `--eval "js"` runs JS in the page and prints the result; `--key ArrowUp` presses keys).
  The script exits 1 on runtime errors – fix them. **Look at every PNG** (Read tool) and iterate on composition, contrast,
  label overlap and readability until it looks like a documentary still. Minimum: 6 screenshots including one `--mobile`
  and one after an interaction (object clicked / camera moved / control used). Software WebGL is slow (5–15 fps); judge
  performance from code (draw calls, allocations), not from `--fps`.
* Both languages: at least one screenshot with `--lang en`.

## Design & content
* Follow tokens/components in `src/styles` (`panel`, `btn`, `stat`, `kv`, `hud`, `info-card`, `chip`, `field`, `intro`, `label3d`).
  Chapter CSS: `src/chapters/<id>/style.css`, every selector prefixed with `.ch-<id>` (add that class to `this.root`).
* Strings: `src/chapters/<id>/strings.ts` → `registerStrings('<id>', {de}, {en})`, imported at the top of the chapter module.
  German first, then English. Tone: sober, precise, enthusiastic (Brian Cox): short sentences, real numbers, no fluff.
  Numbers through `units.ts` formatters (locale-aware). Use `<em>` in titles for the gold italic accent.
* Every chapter opens with `showIntro(...)` (kicker "Kapitel N · KOSMOS" style, title = `t('chapter.<id>.title')`, blurb, hint line
  with the controls). Skip the intro when `ctx.param` deep-links to an object.
* Every chapter shows ≥ 3 striking real numbers (`stat()`), every clickable object opens an `infoCard`, every panel has a
  small source line (e.g. "Daten: HYG v4.1 / Hipparcos").
* Cinematic camera moves via `tween()` / `flyCamera()` / `OrbitRig.flyTo()` (1.5–4 s, eased). Respect `ctx.app.reducedMotion`.
* Touch: drag = look/rotate, pinch = zoom, tap = select. Panels ≤ `calc(100vw - 2*var(--gutter))`, stack panels on
  narrow screens (media query in your style.css). Keyboard shortcuts are a bonus, never a requirement.
* Performance: 60 fps on a laptop GPU with 100k points. One `Points` per catalogue, `LineSegments` for lines, no per-frame
  allocations in `tick()`, ≤ ~60 CSS2D labels visible at once, no `new Vector3()` inside loops that run per frame.
* Clean-up: window/document listeners → `this.onDispose(fn)`; controls/timers/intervals/fetch loops → `teardown()`.
  Scene geometry/materials/textures are disposed automatically by BaseChapter.
* Accessibility basics: buttons are `<button>`, inputs have labels, colour is never the only carrier of meaning.

## Deliverable
When done, your final answer (structured output) must list: files created, features implemented, how you verified
(screenshot paths + what each shows), data checks you performed with the values, known limitations, and core API you
wished existed. Do not stop early: the chapter must be complete, beautiful and error-free.
