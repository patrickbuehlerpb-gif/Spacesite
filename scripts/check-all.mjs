#!/usr/bin/env node
/** Smoke-test every chapter route with scripts/shot.mjs (desktop + mobile). Exit 1 if any fails. */
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
const here = dirname(new URL(import.meta.url).pathname);
const routes = [['', 'home'], ['sterne', 'stars'], ['sonnensystem', 'solarsystem'], ['exoplaneten', 'exoplanets'], ['galaxien', 'galaxies'], ['zoom', 'zoom'], ['zeit', 'timeline'], ['live', 'live']];
let failed = 0;
for (const [route, id] of routes) {
  for (const variant of [[], ['--mobile'], ['--lang', 'en']]) {
    const args = [resolve(here, 'shot.mjs'), `#/${route}`, `shots/check-${id}${variant.includes('--mobile') ? '-mobile' : variant.includes('en') ? '-en' : ''}.png`, '--wait', '2000', '--mock', '--click', '.btn.primary', ...variant];
    try {
      const out = execFileSync('node', args, { encoding: 'utf8', timeout: 180000 });
      console.log(`✓ ${id} ${variant.join(' ')}\n${out.trim().split('\n').filter((l) => l.startsWith('[')).join('\n')}`);
    } catch (e) {
      failed++;
      console.log(`✗ ${id} ${variant.join(' ')}\n${(e.stdout || '').toString()}\n${(e.stderr || '').toString()}`);
    }
  }
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
