#!/usr/bin/env node
/**
 * Stellarium "modern" sky culture (HIP-based lines) + d3-celestial names → public/data/constellations.json
 * Lines reference star indices of stars.bin (run build-stars.mjs first).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ensureRaw, OUT, RAW } from './lib/raw.mjs';

const stel = JSON.parse(readFileSync(await ensureRaw('stellarium_modern_index.json', 'https://raw.githubusercontent.com/Stellarium/stellarium/master/skycultures/modern/index.json'), 'utf8'));
const names = JSON.parse(readFileSync(await ensureRaw('celestial_constellations.json', 'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/constellations.json'), 'utf8'));
const hipIndex = JSON.parse(readFileSync(resolve(RAW, 'hip-index.json'), 'utf8'));

const nameBy = {};
for (const f of names.features) nameBy[f.id] = f.properties;

const out = [];
let missing = 0, segs = 0;
for (const c of stel.constellations) {
  const abbr = c.id.split(' ').pop();
  const p = nameBy[abbr];
  if (!p) { console.warn(`[con] no name for ${abbr}`); continue; }
  const lines = [];
  for (const poly of c.lines) {
    let cur = [];
    for (const hip of poly) {
      const idx = hipIndex[hip];
      if (idx === undefined) { missing++; if (cur.length > 1) lines.push(cur); cur = []; continue; }
      cur.push(idx);
    }
    if (cur.length > 1) lines.push(cur);
  }
  segs += lines.length;
  out.push({ abbr, de: p.de || p.name, en: p.en || p.name, lat: p.la || p.name, gen: p.gen || '', lines });
}
writeFileSync(resolve(OUT, 'constellations.json'), JSON.stringify(out));
console.log(`[con] ${out.length} constellations, ${segs} polylines, ${missing} missing HIP references`);
