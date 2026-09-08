#!/usr/bin/env node
/** Rebuild every dataset in public/data. Raw sources are downloaded to raw/ when missing. */
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
const here = dirname(new URL(import.meta.url).pathname);
for (const s of ['build-stars.mjs', 'build-constellations.mjs', 'build-galaxies.mjs', 'build-exoplanets.mjs', 'build-dso.mjs']) {
  console.log(`\n=== ${s}`);
  try { execFileSync('node', [resolve(here, s)], { stdio: 'inherit' }); }
  catch (e) { console.error(`[build-all] ${s} failed`); process.exitCode = 1; }
}
