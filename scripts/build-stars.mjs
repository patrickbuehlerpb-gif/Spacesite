#!/usr/bin/env node
/**
 * HYG v4.1 → public/data/stars.bin + stars-names.json
 * Frame: equatorial J2000 cartesian in parsecs (HYG's own x,y,z). Sun excluded. Sorted by apparent magnitude.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { ensureRaw, parseCSV, num, OUT } from './lib/raw.mjs';
import { writeCatalog } from './lib/bin.mjs';

const HYG_URL = 'https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv';
const src = await ensureRaw('hygdata_v41.csv', HYG_URL);
const rows = parseCSV(readFileSync(src, 'utf8'));
const H = Object.fromEntries(rows[0].map((h, i) => [h, i]));
const col = (r, k) => r[H[k]];

const stars = [];
for (let r = 1; r < rows.length; r++) {
  const row = rows[r];
  if (row.length < rows[0].length) continue;
  const id = col(row, 'id');
  if (id === '0') continue;                       // the Sun
  const dist = num(col(row, 'dist'));
  if (dist == null || dist <= 0 || dist >= 90000) continue; // 100000 = unknown parallax in HYG
  const x = num(col(row, 'x')), y = num(col(row, 'y')), z = num(col(row, 'z'));
  const absmag = num(col(row, 'absmag')), mag = num(col(row, 'mag'));
  if ([x, y, z, absmag, mag].some((v) => v == null)) continue;
  let ci = num(col(row, 'ci'));
  if (ci == null) ci = 0.6;
  stars.push({
    x, y, z, absmag, mag, ci,
    hip: num(col(row, 'hip')) ?? 0,
    hd: num(col(row, 'hd')), hr: num(col(row, 'hr')), gl: col(row, 'gl') || undefined,
    proper: col(row, 'proper') || undefined, bayer: col(row, 'bayer') || undefined,
    flam: num(col(row, 'flam')), con: col(row, 'con') || undefined, spect: col(row, 'spect') || undefined,
    dist,
  });
}
stars.sort((a, b) => a.mag - b.mag);
const N = stars.length;
console.log(`[stars] ${N} stars kept (of ${rows.length - 1} rows)`);

const pos = new Float32Array(N * 3), absMag = new Float32Array(N), ci = new Float32Array(N), hip = new Uint32Array(N);
stars.forEach((s, i) => { pos[i * 3] = s.x; pos[i * 3 + 1] = s.y; pos[i * 3 + 2] = s.z; absMag[i] = s.absmag; ci[i] = s.ci; hip[i] = s.hip; });

mkdirSync(OUT, { recursive: true });
const bytes = writeCatalog(resolve(OUT, 'stars.bin'), 'KSTR', N, [
  { name: 'pos', type: 'f32', comps: 3, data: pos },
  { name: 'absMag', type: 'f32', data: absMag },
  { name: 'ci', type: 'f32', data: ci },
  { name: 'hip', type: 'u32', data: hip },
]);
console.log(`[stars] stars.bin ${(bytes / 1e6).toFixed(2)} MB`);

// Names index: proper names, Bayer/Flamsteed designations, all naked-eye stars, everything within 20 pc.
const names = [];
stars.forEach((s, i) => {
  if (s.proper || s.bayer || s.flam || s.mag <= 6.5 || s.dist < 20 || s.hr) {
    const n = { i };
    if (s.proper) n.name = s.proper;
    if (s.bayer) n.bayer = s.bayer;
    if (s.flam) n.flam = s.flam;
    if (s.con) n.con = s.con;
    if (s.spect) n.spect = s.spect;
    if (s.hd) n.hd = s.hd;
    if (s.hr) n.hr = s.hr;
    if (s.gl) n.gl = s.gl;
    names.push(n);
  }
});
writeFileSync(resolve(OUT, 'stars-names.json'), JSON.stringify(names));
console.log(`[stars] stars-names.json ${names.length} entries`);

// HIP → index map for downstream scripts (constellation lines)
const hipIndex = {};
stars.forEach((s, i) => { if (s.hip) hipIndex[s.hip] = i; });
writeFileSync(resolve(OUT, '..', '..', 'raw', 'hip-index.json'), JSON.stringify(hipIndex));

// Sanity checks against well-known values
const byName = (n) => stars.findIndex((s) => s.proper === n);
for (const [n, expLy] of [['Sirius', 8.6], ['Proxima Centauri', 4.24], ['Betelgeuse', 548], ['Vega', 25], ['Polaris', 433]]) {
  const i = byName(n);
  const ly = i >= 0 ? stars[i].dist * 3.26156 : NaN;
  console.log(`[check] ${n}: index ${i}, ${ly.toFixed(1)} ly (expected ≈ ${expLy})`);
}
