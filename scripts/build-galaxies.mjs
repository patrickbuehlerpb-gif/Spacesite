#!/usr/bin/env node
/**
 * 2MASS Redshift Survey (2MRS, Huchra et al. 2012) → public/data/galaxies.bin + galaxies-names.json + galaxy-landmarks.json
 *
 * Frame: equatorial J2000 cartesian in megaparsecs (x → RA 0h, y → RA 6h, z → north celestial pole), same orientation as
 * the star catalogue. Distances: Hubble flow d = cz_CMB / H0 (H0 = 70 km/s/Mpc) with cz corrected from the heliocentric
 * frame to the CMB frame (Planck 2018 dipole), except for nearby galaxies with well-established distances (OVERRIDES
 * below: Cepheid / TRGB / SBF / maser values from the literature). Sorted by distance, nearest first. The Milky Way is
 * not part of the catalogue.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { ensureRaw, parseCSV, OUT } from './lib/raw.mjs';
import { writeCatalog } from './lib/bin.mjs';
import { readBinTable } from './lib/fits.mjs';

const FITS_URL = 'https://raw.githubusercontent.com/geaddison/2MRSxCMB/main/data/2mrs_1175_done.fits';
const H0 = 70;                                    // km/s/Mpc (same as src/core/units.ts)
const V_CMB = 369.82, L_APEX = 264.021, B_APEX = 48.253; // Planck 2018 solar motion w.r.t. the CMB (km/s, galactic l/b in °)
const V_MIN = 300;                                // km/s – below this the Hubble-flow distance is meaningless
const D2R = Math.PI / 180;

// ---------------------------------------------------------------------------------------------------------------------
// Override table: galaxies whose Hubble-flow distance is wrong (peculiar velocities dominate within ~20 Mpc).
// d in Mpc from Cepheids (Freedman et al. 2001 / Riess et al.), TRGB (Karachentsev et al., Anand et al. 2021), SBF
// (Tonry et al. 2001, Mei et al. 2007, Blakeslee et al. 2009), the NGC 4258 maser (Reid et al. 2019) and the classic
// Local Group values. `id` = OpenNGC name (coordinates are taken from openngc_NGC.csv); non-NGC/IC objects carry ra/dec.
// ---------------------------------------------------------------------------------------------------------------------
const OVERRIDES = [
  // Local Group
  { id: 'LMC', ra: 80.8939, dec: -69.7561, d: 0.05, label: 'LMC' },
  { id: 'NGC0292', d: 0.06, label: 'SMC' },
  { id: 'NGC6822', d: 0.50, label: "Barnard's Galaxy" },
  { id: 'NGC0185', d: 0.62 },
  { id: 'NGC0147', d: 0.71 },
  { id: 'IC1613', d: 0.73 },
  { id: 'IC0010', d: 0.75 },
  { id: 'NGC0224', d: 0.78, label: 'M31' },
  { id: 'NGC0221', d: 0.80, label: 'M32' },
  { id: 'NGC0205', d: 0.82, label: 'M110' },
  { id: 'NGC0598', d: 0.84, label: 'M33' },
  { id: 'WLM', ra: 0.4921, dec: -15.4608, d: 0.93 },
  { id: 'NGC3109', d: 1.3 },
  { id: 'Sextans A', ra: 152.7533, dec: -4.7086, d: 1.4 },
  { id: 'Sextans B', ra: 150.0004, dec: 5.3322, d: 1.4 },
  // Sculptor group
  { id: 'NGC0300', d: 2.0 },
  { id: 'NGC0055', d: 2.1 },
  { id: 'NGC0247', d: 3.4 },
  { id: 'NGC0253', d: 3.5, label: 'Sculptor Galaxy' },
  { id: 'NGC7793', d: 3.9 },
  // Maffei / IC 342 group (mostly hidden behind the Milky Way)
  { id: 'Maffei 1', ra: 38.9825, dec: 59.6544, d: 3.0 },
  { id: 'Maffei 2', ra: 40.4796, dec: 59.6042, d: 3.1 },
  { id: 'IC0342', d: 3.3 },
  { id: 'NGC1569', d: 3.4 },
  { id: 'NGC0404', d: 3.1 },
  // M81 group
  { id: 'NGC2403', d: 3.2 },
  { id: 'NGC3034', d: 3.5, label: 'M82' },
  { id: 'NGC3031', d: 3.6, label: 'M81' },
  { id: 'NGC2976', d: 3.6 },
  { id: 'NGC3077', d: 3.8 },
  { id: 'IC2574', d: 4.0 },
  { id: 'NGC4236', d: 4.4 },
  // Centaurus A / M83 group
  { id: 'NGC5102', d: 3.4 },
  { id: 'NGC5253', d: 3.5 },
  { id: 'NGC4945', d: 3.7 },
  { id: 'NGC5128', d: 3.8, label: 'Centaurus A' },
  { id: 'NGC5236', d: 4.6, label: 'M83' },
  // Canes Venatici / Ursa Major neighbourhood
  { id: 'NGC4214', d: 2.9 },
  { id: 'NGC4449', d: 4.2 },
  { id: 'NGC4244', d: 4.4 },
  { id: 'NGC4395', d: 4.5 },
  { id: 'NGC4736', d: 4.6, label: 'M94' },
  { id: 'NGC4826', d: 5.3, label: 'M64' },
  { id: 'NGC6503', d: 5.3 },
  { id: 'NGC3621', d: 6.7 },
  { id: 'NGC5457', d: 6.7, label: 'M101' },
  { id: 'NGC4631', d: 7.4 },
  { id: 'NGC4258', d: 7.6, label: 'M106 (maser)' },
  { id: 'NGC6946', d: 7.7 },
  { id: 'NGC5194', d: 8.6, label: 'M51' },
  { id: 'NGC5195', d: 8.6 },
  { id: 'NGC5055', d: 8.9, label: 'M63' },
  { id: 'NGC0925', d: 9.2 },
  { id: 'NGC2683', d: 9.4 },
  { id: 'NGC6744', d: 9.4 },
  { id: 'NGC4594', d: 9.6, label: 'M104' },
  { id: 'NGC3115', d: 9.7 },
  { id: 'NGC0628', d: 9.8, label: 'M74' },
  // Leo I group / Leo triplet
  { id: 'NGC3351', d: 10.0, label: 'M95' },
  { id: 'NGC3627', d: 10.0, label: 'M66' },
  { id: 'NGC3379', d: 10.2, label: 'M105' },
  { id: 'NGC3368', d: 10.4, label: 'M96' },
  { id: 'NGC3623', d: 10.5, label: 'M65' },
  { id: 'NGC3628', d: 10.5 },
  { id: 'NGC1023', d: 11.0 },
  { id: 'NGC2090', d: 11.8 },
  { id: 'NGC4565', d: 12.0 },
  { id: 'NGC4725', d: 12.4 },
  { id: 'NGC3198', d: 13.8 },
  { id: 'NGC2841', d: 14.1 },
  { id: 'NGC1068', d: 14.4, label: 'M77' },
  { id: 'NGC7331', d: 14.7 },
  { id: 'NGC4536', d: 14.9 },
  { id: 'NGC5866', d: 15.3, label: 'M102' },
  // Virgo cluster
  { id: 'NGC4192', d: 15.0, label: 'M98' },
  { id: 'NGC4254', d: 15.0, label: 'M99' },
  { id: 'NGC4321', d: 15.2, label: 'M100' },
  { id: 'NGC4303', d: 15.5, label: 'M61' },
  { id: 'NGC4535', d: 15.8 },
  { id: 'NGC4552', d: 16.0, label: 'M89' },
  { id: 'NGC4621', d: 16.0, label: 'M59' },
  { id: 'NGC4548', d: 16.2, label: 'M91' },
  { id: 'NGC4486', d: 16.4, label: 'M87' },
  { id: 'NGC4472', d: 16.5, label: 'M49' },
  { id: 'NGC4501', d: 16.5, label: 'M88' },
  { id: 'NGC4569', d: 16.5, label: 'M90' },
  { id: 'NGC4579', d: 16.5, label: 'M58' },
  { id: 'NGC4649', d: 16.5, label: 'M60' },
  { id: 'NGC4406', d: 16.8, label: 'M86' },
  { id: 'NGC4414', d: 17.7 },
  { id: 'NGC4382', d: 17.9, label: 'M85' },
  { id: 'NGC4374', d: 18.0, label: 'M84' },
  // Fornax cluster
  { id: 'NGC1365', d: 18.0 },
  { id: 'NGC1399', d: 19.3 },
  { id: 'NGC1316', d: 19.5, label: 'Fornax A' },
];

// German / English common names keyed by OpenNGC name (or 2MRS CATID for non-NGC objects). OpenNGC's own "Common names"
// column (English) is used for everything not listed here.
const NAMES = {
  NGC0224: ['Andromeda-Galaxie', 'Andromeda Galaxy'],
  NGC0598: ['Dreiecksgalaxie', 'Triangulum Galaxy'],
  NGC0292: ['Kleine Magellansche Wolke', 'Small Magellanic Cloud'],
  NGC4594: ['Sombrero-Galaxie', 'Sombrero Galaxy'],
  NGC5194: ['Whirlpool-Galaxie', 'Whirlpool Galaxy'],
  NGC5457: ['Feuerrad-Galaxie', 'Pinwheel Galaxy'],
  NGC3034: ['Zigarren-Galaxie', 'Cigar Galaxy'],
  NGC3031: ['Bodes Galaxie', "Bode's Galaxy"],
  NGC5128: ['Centaurus A', 'Centaurus A'],
  NGC4826: ['Schwarzauge-Galaxie', 'Black Eye Galaxy'],
  NGC5055: ['Sonnenblumen-Galaxie', 'Sunflower Galaxy'],
  NGC5236: ['Südliche Feuerrad-Galaxie', 'Southern Pinwheel Galaxy'],
  NGC4486: ['Virgo A', 'Virgo A'],
  NGC4254: ['Coma-Feuerrad-Galaxie', 'Coma Pinwheel Galaxy'],
  NGC0628: ['Phantom-Galaxie', 'Phantom Galaxy'],
  NGC1068: ['Cetus A', 'Cetus A'],
  NGC4565: ['Nadel-Galaxie', 'Needle Galaxy'],
  NGC4244: ['Silbernadel-Galaxie', 'Silver Needle Galaxy'],
  NGC0891: ['Silbersplitter-Galaxie', 'Silver Sliver Galaxy'],
  NGC5907: ['Splitter-Galaxie', 'Splinter Galaxy'],
  NGC4631: ['Wal-Galaxie', 'Whale Galaxy'],
  NGC4656: ['Hockeyschläger-Galaxie', 'Hockey Stick Galaxy'],
  NGC6946: ['Feuerwerks-Galaxie', 'Fireworks Galaxy'],
  NGC6822: ['Barnards Galaxie', "Barnard's Galaxy"],
  NGC0253: ['Sculptor-Galaxie', 'Sculptor Galaxy'],
  NGC1316: ['Fornax A', 'Fornax A'],
  NGC1275: ['Perseus A', 'Perseus A'],
  NGC3115: ['Spindel-Galaxie', 'Spindle Galaxy'],
  NGC4038: ['Antennen-Galaxien', 'Antennae Galaxies'],
  NGC4039: ['Antennen-Galaxien', 'Antennae Galaxies'],
  NGC4567: ['Siamesische Zwillinge', 'Siamese Twins'],
  NGC4568: ['Siamesische Zwillinge', 'Siamese Twins'],
  NGC4435: ['Markarians Augen', "Markarian's Eyes"],
  NGC4438: ['Markarians Augen', "Markarian's Eyes"],
  NGC4676: ['Mäuse-Galaxien', 'The Mice'],
  NGC2685: ['Helix-Galaxie', 'Helix Galaxy'],
  NGC4651: ['Regenschirm-Galaxie', 'Umbrella Galaxy'],
  NGC4194: ['Medusa-Galaxie', 'Medusa Merger'],
  NGC2537: ['Bärentatzen-Galaxie', 'Bear Paw Galaxy'],
  IC2574: ['Coddingtons Nebel', "Coddington's Nebula"],
  NGC4490: ['Kokon-Galaxie', 'Cocoon Galaxy'],
  NGC3628: ['Hamburger-Galaxie', 'Hamburger Galaxy'],
  IC0342: ['Verborgene Galaxie', 'Hidden Galaxy'],
  '3C_273': ['3C 273 (Quasar)', '3C 273 (quasar)'],   // keyed by CATID – the brightest quasar in the sky, in 2MRS
};
const IGNORE_OPENNGC_NAMES = new Set(['NGC4990']);    // OpenNGC attaches "Cocoon Galaxy" to NGC 4990; it is NGC 4490

// ---------------------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------------------
/** Same as src/core/units.ts raDecToXYZ – equatorial cartesian, x → RA 0h, z → north. */
const raDecToXYZ = (ra, dec, d) => {
  const r = ra * D2R, q = dec * D2R, c = Math.cos(q);
  return [d * c * Math.cos(r), d * c * Math.sin(r), d * Math.sin(q)];
};
/** Angular separation in arcmin (haversine). */
const sepArcmin = (ra1, dec1, ra2, dec2) => {
  const dra = (ra2 - ra1) * D2R, ddec = (dec2 - dec1) * D2R;
  const a = Math.sin(ddec / 2) ** 2 + Math.cos(dec1 * D2R) * Math.cos(dec2 * D2R) * Math.sin(dra / 2) ** 2;
  return 2 * Math.asin(Math.sqrt(a)) / D2R * 60;
};
/** Normalise catalogue names: "NGC_0224", "NGC0224", "NGC 224" → "NGC224"; "IC_0342" → "IC342". Returns null otherwise. */
const normNGC = (s) => {
  const m = /^(NGC|IC)[_ ]?0*(\d+)([A-Za-z]?)$/.exec(s.trim());
  return m ? `${m[1]}${m[2]}${m[3].toUpperCase()}` : null;
};
const prettyNGC = (openNgcName) => {
  const m = /^(NGC|IC)0*(\d+)(.*)$/.exec(openNgcName);
  return m ? `${m[1]} ${m[2]}${m[3]}` : openNgcName;
};
const hmsToDeg = (s) => { const [h, m, sec] = s.split(':').map(Number); return (h + m / 60 + sec / 3600) * 15; };
const dmsToDeg = (s) => { const sign = s.startsWith('-') ? -1 : 1; const [d, m, sec] = s.replace(/^[-+]/, '').split(':').map(Number); return sign * (d + m / 60 + sec / 3600); };

/** Sky grid (1° cells) for fast neighbour lookup. */
class SkyIndex {
  constructor() { this.cells = new Map(); }
  key(ra, dec) { return `${Math.floor(((ra % 360) + 360) % 360)}:${Math.floor(dec)}`; }
  add(ra, dec, item) { const k = this.key(ra, dec); (this.cells.get(k) ?? this.cells.set(k, []).get(k)).push({ ra, dec, item }); }
  /** nearest item within `maxArcmin` (optionally filtered). */
  nearest(ra, dec, maxArcmin, filter) {
    let best = null, bestSep = maxArcmin;
    const cosd = Math.max(Math.cos(dec * D2R), 0.05);
    const dRa = Math.ceil(maxArcmin / 60 / cosd) + 1;
    for (let dd = -1; dd <= 1; dd++) for (let dr = -dRa; dr <= dRa; dr++) {
      const list = this.cells.get(`${Math.floor((((ra + dr) % 360) + 360) % 360)}:${Math.floor(dec) + dd}`);
      if (!list) continue;
      for (const e of list) {
        if (filter && !filter(e.item)) continue;
        const s = sepArcmin(ra, dec, e.ra, e.dec);
        if (s < bestSep) { bestSep = s; best = e.item; }
      }
    }
    return best ? { item: best, sep: bestSep } : null;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// 1. Read 2MRS
// ---------------------------------------------------------------------------------------------------------------------
const fitsPath = await ensureRaw('2mrs_1175_done.fits', FITS_URL);
const table = readBinTable(readFileSync(fitsPath));
const N0 = table.rows;
const RA = table.column('RA'), DEC = table.column('DEC'), GLON = table.column('GLON'), GLAT = table.column('GLAT');
const MKTC = table.column('MKTC'), TYPE = table.column('TYPE'), V = table.column('V'), CATID = table.column('CATID');
console.log(`[galaxies] 2MRS: ${N0} rows, ${table.columns.length} columns`);

// ---------------------------------------------------------------------------------------------------------------------
// 2. OpenNGC (names, Messier numbers, coordinates for the override table)
// ---------------------------------------------------------------------------------------------------------------------
const ngcRows = parseCSV(readFileSync(resolve(process.env.RAW_DIR ?? resolve(OUT, '..', '..', 'raw'), 'openngc_NGC.csv'), 'utf8'), ';');
const NH = Object.fromEntries(ngcRows[0].map((h, i) => [h, i]));
const openngc = new Map();          // normalised name → { name, ra, dec, messier?, common?, isGalaxy }
const ngcIndex = new SkyIndex();
const byMessier = new Map();
for (let r = 1; r < ngcRows.length; r++) {
  const row = ngcRows[r];
  if (row.length < 10) continue;
  const name = row[NH.Name], type = row[NH.Type];
  if (!row[NH.RA] || !row[NH.Dec]) continue;
  const key = normNGC(name);
  if (!key) continue;
  const entry = {
    name, ra: hmsToDeg(row[NH.RA]), dec: dmsToDeg(row[NH.Dec]), isGalaxy: type.startsWith('G'),
    messier: row[NH.M] ? parseInt(row[NH.M], 10) : undefined,
    common: !IGNORE_OPENNGC_NAMES.has(name) && row[NH['Common names']] ? row[NH['Common names']].split(',')[0].trim() : undefined,
  };
  openngc.set(key, entry);
  if (entry.isGalaxy) ngcIndex.add(entry.ra, entry.dec, entry);
  if (entry.messier) byMessier.set(entry.messier, entry);
}
console.log(`[galaxies] OpenNGC: ${openngc.size} objects, ${byMessier.size} Messier`);

// ---------------------------------------------------------------------------------------------------------------------
// 3. Per-galaxy processing
// ---------------------------------------------------------------------------------------------------------------------
const catKey = (catid) => normNGC(catid) ?? (/^MESSIER_(\d+)([a-z]?)$/.exec(catid) ? `M${parseInt(RegExp.$1, 10)}${RegExp.$2}` : null);
const survey = new SkyIndex();
for (let i = 0; i < N0; i++) if (Number.isFinite(RA[i]) && Number.isFinite(DEC[i])) survey.add(RA[i], DEC[i], i);

// Override matches: by CATID first, then by position within 3′
const override = new Map();         // row index → { d, id }
const byCatKey = new Map();
for (let i = 0; i < N0; i++) { const k = catKey(CATID[i]); if (k && !byCatKey.has(k)) byCatKey.set(k, i); }
const unmatched = [];
for (const o of OVERRIDES) {
  const key = normNGC(o.id);
  const ngc = key ? openngc.get(key) : null;
  let idx = key ? byCatKey.get(key) : undefined;
  if (idx === undefined && ngc?.messier) idx = byCatKey.get(`M${ngc.messier}`) ?? byCatKey.get(`M${ngc.messier}a`);
  const ra = ngc?.ra ?? o.ra, dec = ngc?.dec ?? o.dec;
  if (idx === undefined && ra !== undefined) {
    const hit = survey.nearest(ra, dec, 3, (i) => !override.has(i));
    if (hit) idx = hit.item;
  }
  if (idx === undefined) { unmatched.push(o.id); continue; }
  if (!override.has(idx)) override.set(idx, { d: o.d, id: o.label ?? o.id });
}
console.log(`[galaxies] overrides: ${override.size} matched, ${unmatched.length} not in 2MRS (${unmatched.join(', ')})`);

const typeCode = (s) => {
  const m = /^\s*(-?\d+)/.exec(s);
  if (!m) return 0;
  const t = parseInt(m[1], 10);
  if (t >= 90) return 0;            // ZCAT 98/99 = unclassified
  if (t <= -4) return 1;            // E
  if (t <= -1) return 2;            // S0
  if (t <= 9) return 3;             // Sa … Sm
  return 4;                         // Im / peculiar / compact
};

const sinBa = Math.sin(B_APEX * D2R), cosBa = Math.cos(B_APEX * D2R);
const gal = [];
let dropMissing = 0, dropSlow = 0;
for (let i = 0; i < N0; i++) {
  const v = V[i];
  if (!Number.isFinite(v) || v <= -900 || !Number.isFinite(RA[i]) || !Number.isFinite(DEC[i]) || !Number.isFinite(MKTC[i])) { dropMissing++; continue; }
  const b = GLAT[i] * D2R, l = GLON[i] * D2R;
  const vcmb = v + V_CMB * (Math.sin(b) * sinBa + Math.cos(b) * cosBa * Math.cos(l - L_APEX * D2R));
  const ov = override.get(i);
  if (!ov && vcmb < V_MIN) { dropSlow++; continue; }
  const d = ov ? ov.d : vcmb / H0;
  const [x, y, z] = raDecToXYZ(RA[i], DEC[i], d);
  gal.push({ src: i, x, y, z, d, kmag: MKTC[i], cz: v, vcmb, type: typeCode(TYPE[i]), ov: ov?.id });
}
gal.sort((a, b) => a.d - b.d);
const N = gal.length;
console.log(`[galaxies] dropped ${dropMissing} (V missing/≤ −900) + ${dropSlow} (cz_CMB < ${V_MIN} km/s, no known distance) → ${N} kept`);

// ---------------------------------------------------------------------------------------------------------------------
// 4. galaxies.bin
// ---------------------------------------------------------------------------------------------------------------------
const pos = new Float32Array(N * 3), kmag = new Float32Array(N), cz = new Float32Array(N), type = new Uint8Array(N);
gal.forEach((g, i) => { pos[i * 3] = g.x; pos[i * 3 + 1] = g.y; pos[i * 3 + 2] = g.z; kmag[i] = g.kmag; cz[i] = g.cz; type[i] = g.type; });
mkdirSync(OUT, { recursive: true });
const bytes = writeCatalog(resolve(OUT, 'galaxies.bin'), 'KGAL', N, [
  { name: 'pos', type: 'f32', comps: 3, data: pos },
  { name: 'kmag', type: 'f32', data: kmag },
  { name: 'cz', type: 'f32', data: cz },
  { name: 'type', type: 'u8', data: type },
]);
console.log(`[galaxies] galaxies.bin ${(bytes / 1e6).toFixed(2)} MB`);

// ---------------------------------------------------------------------------------------------------------------------
// 5. galaxies-names.json – Messier objects and galaxies with a common name
// ---------------------------------------------------------------------------------------------------------------------
const names = [];
let matchedByCat = 0, matchedByPos = 0;
const usedNgc = new Set();
gal.forEach((g, i) => {
  const catid = CATID[g.src];
  const key = catKey(catid);
  let ngc = null;
  if (key) {
    if (key.startsWith('M')) { const m = /^M(\d+)([a-z]?)$/.exec(key); if (m[2] !== 'b') ngc = byMessier.get(parseInt(m[1], 10)) ?? null; }
    else ngc = openngc.get(key) ?? null;
    if (ngc) matchedByCat++;
  }
  if (!ngc) {
    const hit = ngcIndex.nearest(RA[g.src], DEC[g.src], 1, (e) => !usedNgc.has(e.name));
    if (hit) { ngc = hit.item; matchedByPos++; }
  }
  if (ngc) usedNgc.add(ngc.name);
  const ngcKey = ngc ? normNGC(ngc.name) : null;
  const custom = (ngcKey && NAMES[ngc.name]) || NAMES[catid];
  const messier = ngc?.messier;
  const common = custom ? custom[0] : ngc?.common;
  if (!messier && !common) return;
  const n = { i, name: common ?? `Messier ${messier}` };
  if (custom && custom[1] !== custom[0]) n.en = custom[1];
  if (messier) n.messier = `M${messier}`;
  if (ngc) n.ngc = prettyNGC(ngc.name);
  names.push(n);
});
writeFileSync(resolve(OUT, 'galaxies-names.json'), JSON.stringify(names));
console.log(`[galaxies] galaxies-names.json ${names.length} entries (${names.filter((n) => n.messier).length} Messier; OpenNGC matches: ${matchedByCat} by name, ${matchedByPos} by position)`);

// ---------------------------------------------------------------------------------------------------------------------
// 6. galaxy-landmarks.json – curated structures for tours and labels (dist in Mpc, radius in Mpc)
//    numbers[].value is a plain number where the unit lives in the label (so the chapter can format it locale-aware).
// ---------------------------------------------------------------------------------------------------------------------
const L = (de, en) => ({ de, en });
const LANDMARKS = [
  { id: 'milkyway', name: 'Milchstrasse', en: 'Milky Way', ra: 0, dec: 0, dist: 0, kind: 'galaxy', radius: 0.015,
    blurb: L('Unsere Heimatgalaxie: eine Balkenspirale mit 100 bis 400 Milliarden Sternen. Die Sonne kreist 26’000 Lichtjahre vom Zentrum entfernt, einmal in 230 Millionen Jahren.',
             'Our home galaxy: a barred spiral of 100 to 400 billion stars. The Sun orbits 26,000 light-years from the centre, once every 230 million years.'),
    numbers: [{ label: L('Sterne (Mrd.)', 'Stars (billions)'), value: 200 }, { label: L('Durchmesser (Lichtjahre)', 'Diameter (light-years)'), value: 100000 }, { label: L('Sonne–Zentrum (Lichtjahre)', 'Sun–centre (light-years)'), value: 26000 }] },
  { id: 'lmc', name: 'Grosse Magellansche Wolke', en: 'Large Magellanic Cloud', ra: 80.894, dec: -69.756, dist: 0.05, kind: 'galaxy', radius: 0.005,
    blurb: L('Die grösste Begleitgalaxie der Milchstrasse, 163’000 Lichtjahre entfernt und von der Südhalbkugel mit blossem Auge sichtbar. 1987 explodierte hier die nächste Supernova seit 400 Jahren.',
             'The Milky Way’s largest satellite, 163,000 light-years away and visible to the naked eye from the southern hemisphere. In 1987 it hosted the closest supernova in 400 years.'),
    numbers: [{ label: L('Entfernung (Lichtjahre)', 'Distance (light-years)'), value: 163000 }, { label: L('Sterne (Mrd.)', 'Stars (billions)'), value: 30 }, { label: L('Supernova', 'Supernova'), value: 'SN 1987A' }] },
  { id: 'smc', name: 'Kleine Magellansche Wolke', en: 'Small Magellanic Cloud', ra: 13.158, dec: -72.800, dist: 0.06, kind: 'galaxy', radius: 0.004,
    blurb: L('Eine Zwerggalaxie in 200’000 Lichtjahren Entfernung. Hier entdeckte Henrietta Leavitt 1912 die Perioden-Leuchtkraft-Beziehung der Cepheiden – den ersten Massstab für das Universum.',
             'A dwarf galaxy 200,000 light-years away. Here Henrietta Leavitt discovered the Cepheid period–luminosity relation in 1912 – the first yardstick for the universe.'),
    numbers: [{ label: L('Entfernung (Lichtjahre)', 'Distance (light-years)'), value: 200000 }, { label: L('Sterne (Mio.)', 'Stars (millions)'), value: 3000 }, { label: L('Leavitts Entdeckung', 'Leavitt’s discovery'), value: 1912 }] },
  { id: 'm31', name: 'Andromeda-Galaxie', en: 'Andromeda Galaxy', ra: 10.685, dec: 41.269, dist: 0.78, kind: 'galaxy', radius: 0.035,
    blurb: L('Die nächste grosse Spiralgalaxie, 2,5 Millionen Lichtjahre entfernt, mit rund einer Billion Sternen. Sie nähert sich uns mit 110 km/s – in etwa 4,5 Milliarden Jahren verschmelzen beide Galaxien.',
             'The nearest large spiral, 2.5 million light-years away, with about a trillion stars. It is approaching us at 110 km/s – in roughly 4.5 billion years the two galaxies will merge.'),
    numbers: [{ label: L('Entfernung (Mio. Lichtjahre)', 'Distance (million light-years)'), value: 2.5 }, { label: L('Sterne (Mrd.)', 'Stars (billions)'), value: 1000 }, { label: L('Annäherung (km/s)', 'Approach speed (km/s)'), value: 110 }] },
  { id: 'm33', name: 'Dreiecksgalaxie', en: 'Triangulum Galaxy', ra: 23.462, dec: 30.660, dist: 0.84, kind: 'galaxy', radius: 0.01,
    blurb: L('Die drittgrösste Galaxie der Lokalen Gruppe, 2,7 Millionen Lichtjahre entfernt. Ihre Sternentstehungsregion NGC 604 ist 40-mal grösser als der Orionnebel.',
             'The third-largest galaxy of the Local Group, 2.7 million light-years away. Its star-forming region NGC 604 is 40 times larger than the Orion Nebula.'),
    numbers: [{ label: L('Entfernung (Mio. Lichtjahre)', 'Distance (million light-years)'), value: 2.7 }, { label: L('Sterne (Mrd.)', 'Stars (billions)'), value: 40 }, { label: L('Durchmesser (Lichtjahre)', 'Diameter (light-years)'), value: 60000 }] },
  { id: 'localgroup', name: 'Lokale Gruppe', en: 'Local Group', ra: 10.685, dec: 41.269, dist: 0.4, kind: 'cluster', radius: 1.5,
    blurb: L('Milchstrasse, Andromeda, M33 und über 80 Zwerggalaxien in einem Volumen von 10 Millionen Lichtjahren Durchmesser – durch die Schwerkraft gebunden, vom Rest der Expansion abgekoppelt.',
             'The Milky Way, Andromeda, M33 and more than 80 dwarf galaxies in a volume 10 million light-years across – bound by gravity, decoupled from the cosmic expansion.'),
    numbers: [{ label: L('Galaxien', 'Galaxies'), value: 80 }, { label: L('Durchmesser (Mio. Lichtjahre)', 'Diameter (million light-years)'), value: 10 }, { label: L('Masse (Billionen Sonnen)', 'Mass (trillion Suns)'), value: 2 }] },
  { id: 'cena', name: 'Centaurus A', en: 'Centaurus A', ra: 201.365, dec: -43.019, dist: 3.8, kind: 'galaxy', radius: 0.03,
    blurb: L('Die nächste aktive Radiogalaxie, 12 Millionen Lichtjahre entfernt: ein Schwarzes Loch von 55 Millionen Sonnenmassen schleudert Jets über eine Million Lichtjahre ins All.',
             'The nearest active radio galaxy, 12 million light-years away: a black hole of 55 million solar masses hurls jets more than a million light-years into space.'),
    numbers: [{ label: L('Entfernung (Mio. Lichtjahre)', 'Distance (million light-years)'), value: 12 }, { label: L('Schwarzes Loch (Mio. Sonnenmassen)', 'Black hole (million solar masses)'), value: 55 }, { label: L('Jet-Länge (Mio. Lichtjahre)', 'Jet length (million light-years)'), value: 1 }] },
  { id: 'm81group', name: 'M81-Gruppe', en: 'M81 Group', ra: 148.9, dec: 69.1, dist: 3.6, kind: 'cluster', radius: 0.6,
    blurb: L('Eine der nächsten Galaxiengruppen, 12 Millionen Lichtjahre entfernt: die Spirale M81 und die Starburst-Galaxie M82, die zehnmal schneller Sterne bildet als die Milchstrasse.',
             'One of the nearest galaxy groups, 12 million light-years away: the spiral M81 and the starburst galaxy M82, which forms stars ten times faster than the Milky Way.'),
    numbers: [{ label: L('Entfernung (Mio. Lichtjahre)', 'Distance (million light-years)'), value: 12 }, { label: L('Galaxien', 'Galaxies'), value: 40 }, { label: L('Sternbildung M82 (× Milchstrasse)', 'Star formation in M82 (× Milky Way)'), value: 10 }] },
  { id: 'sculptor', name: 'Sculptor-Gruppe', en: 'Sculptor Group', ra: 11.9, dec: -25.3, dist: 3.5, kind: 'cluster', radius: 0.8,
    blurb: L('Eine lockere Galaxiengruppe am Südpol der Milchstrasse mit NGC 253, NGC 55 und NGC 300 – 11 Millionen Lichtjahre entfernt und Teil des Filaments, in dem auch wir liegen.',
             'A loose group at the Milky Way’s south galactic pole containing NGC 253, NGC 55 and NGC 300 – 11 million light-years away and part of the filament we live in.'),
    numbers: [{ label: L('Entfernung (Mio. Lichtjahre)', 'Distance (million light-years)'), value: 11 }, { label: L('Helle Galaxien', 'Bright galaxies'), value: 6 }] },
  { id: 'virgo', name: 'Virgo-Haufen', en: 'Virgo Cluster', ra: 187.7, dec: 12.4, dist: 16.5, kind: 'cluster', radius: 2.2,
    blurb: L('Der nächste grosse Galaxienhaufen, 54 Millionen Lichtjahre entfernt, mit rund 1’300 Galaxien. Seine Schwerkraft bremst die Lokale Gruppe – wir fallen auf ihn zu.',
             'The nearest large galaxy cluster, 54 million light-years away, with about 1,300 galaxies. Its gravity tugs on the Local Group – we are falling towards it.'),
    numbers: [{ label: L('Galaxien', 'Galaxies'), value: 1300 }, { label: L('Entfernung (Mio. Lichtjahre)', 'Distance (million light-years)'), value: 54 }, { label: L('Masse (Billiarden Sonnen)', 'Mass (quadrillion Suns)'), value: 1.2 }] },
  { id: 'fornax', name: 'Fornax-Haufen', en: 'Fornax Cluster', ra: 54.6, dec: -35.5, dist: 19.3, kind: 'cluster', radius: 1.2,
    blurb: L('Der zweitnächste Galaxienhaufen, 63 Millionen Lichtjahre entfernt: kompakt, von der Riesenelliptischen NGC 1399 dominiert, mit der Radiogalaxie Fornax A am Rand.',
             'The second-nearest galaxy cluster, 63 million light-years away: compact, dominated by the giant elliptical NGC 1399, with the radio galaxy Fornax A on its outskirts.'),
    numbers: [{ label: L('Entfernung (Mio. Lichtjahre)', 'Distance (million light-years)'), value: 63 }, { label: L('Helle Galaxien', 'Bright galaxies'), value: 60 }] },
  { id: 'centaurus', name: 'Centaurus-Haufen', en: 'Centaurus Cluster', ra: 192.2, dec: -41.3, dist: 52, kind: 'cluster', radius: 2,
    blurb: L('Ein Haufen aus Hunderten Galaxien, 170 Millionen Lichtjahre entfernt, um die Riesengalaxie NGC 4696. Er gehört zum Hydra-Centaurus-Superhaufen, der uns Richtung Grosser Attraktor zieht.',
             'A cluster of hundreds of galaxies, 170 million light-years away, around the giant NGC 4696. It belongs to the Hydra–Centaurus Supercluster that pulls us towards the Great Attractor.'),
    numbers: [{ label: L('Entfernung (Mio. Lichtjahre)', 'Distance (million light-years)'), value: 170 }, { label: L('Galaxien', 'Galaxies'), value: 300 }] },
  { id: 'hydra', name: 'Hydra-Haufen', en: 'Hydra Cluster', ra: 159.2, dec: -27.5, dist: 58, kind: 'cluster', radius: 2,
    blurb: L('Ein kugelförmiger Haufen mit rund 160 hellen Galaxien, 190 Millionen Lichtjahre entfernt – die Nordflanke des Hydra-Centaurus-Superhaufens.',
             'A roughly spherical cluster of about 160 bright galaxies, 190 million light-years away – the northern flank of the Hydra–Centaurus Supercluster.'),
    numbers: [{ label: L('Entfernung (Mio. Lichtjahre)', 'Distance (million light-years)'), value: 190 }, { label: L('Helle Galaxien', 'Bright galaxies'), value: 160 }] },
  { id: 'norma', name: 'Norma-Haufen / Grosser Attraktor', en: 'Norma Cluster / Great Attractor', ra: 243.6, dec: -60.9, dist: 68, kind: 'cluster', radius: 3,
    blurb: L('Im Kern des Grossen Attraktors, 220 Millionen Lichtjahre entfernt, halb versteckt hinter der Milchstrasse. Eine Masse von zehntausend Billionen Sonnen zieht die Milchstrasse mit 600 km/s an.',
             'At the core of the Great Attractor, 220 million light-years away, half hidden behind the Milky Way. A mass of ten thousand trillion Suns pulls the Milky Way along at 600 km/s.'),
    numbers: [{ label: L('Entfernung (Mio. Lichtjahre)', 'Distance (million light-years)'), value: 220 }, { label: L('Unsere Geschwindigkeit dorthin (km/s)', 'Our speed towards it (km/s)'), value: 600 }, { label: L('Masse (Billiarden Sonnen)', 'Mass (quadrillion Suns)'), value: 10 }] },
  { id: 'perseus', name: 'Perseus-Haufen', en: 'Perseus Cluster', ra: 49.95, dec: 41.51, dist: 73, kind: 'cluster', radius: 3,
    blurb: L('Der hellste Galaxienhaufen am Röntgenhimmel, 240 Millionen Lichtjahre entfernt. Sein heisses Gas schwingt im tiefsten je gemessenen «Ton»: ein B, 57 Oktaven unter dem Kammerton.',
             'The brightest galaxy cluster in the X-ray sky, 240 million light-years away. Its hot gas rings with the deepest “note” ever detected: a B-flat 57 octaves below middle C.'),
    numbers: [{ label: L('Entfernung (Mio. Lichtjahre)', 'Distance (million light-years)'), value: 240 }, { label: L('Galaxien', 'Galaxies'), value: 1000 }, { label: L('Tiefster Ton (Oktaven unter Kammerton)', 'Deepest note (octaves below middle C)'), value: 57 }] },
  { id: 'leo', name: 'Leo-Haufen (Abell 1367)', en: 'Leo Cluster (Abell 1367)', ra: 176.15, dec: 19.83, dist: 92, kind: 'cluster', radius: 2.5,
    blurb: L('Ein junger, noch wachsender Haufen in 300 Millionen Lichtjahren Entfernung, in dem gerade mehrere Galaxiengruppen zusammenstürzen. Mit dem Coma-Haufen bildet er den Coma-Superhaufen.',
             'A young, still-growing cluster 300 million light-years away where several galaxy groups are colliding right now. Together with the Coma Cluster it forms the Coma Supercluster.'),
    numbers: [{ label: L('Entfernung (Mio. Lichtjahre)', 'Distance (million light-years)'), value: 300 }, { label: L('Helle Galaxien', 'Bright galaxies'), value: 70 }] },
  { id: 'coma', name: 'Coma-Haufen', en: 'Coma Cluster', ra: 194.95, dec: 27.98, dist: 100, kind: 'cluster', radius: 3,
    blurb: L('Über 1’000 Galaxien in 320 Millionen Lichtjahren Entfernung. Hier stellte Fritz Zwicky 1933 fest, dass die Galaxien viel zu schnell sind – die erste Spur der Dunklen Materie.',
             'More than 1,000 galaxies 320 million light-years away. Here Fritz Zwicky noticed in 1933 that the galaxies move far too fast – the first trace of dark matter.'),
    numbers: [{ label: L('Galaxien', 'Galaxies'), value: 1000 }, { label: L('Entfernung (Mio. Lichtjahre)', 'Distance (million light-years)'), value: 320 }, { label: L('Zwickys Entdeckung', 'Zwicky’s discovery'), value: 1933 }] },
  { id: 'hercules', name: 'Hercules-Haufen', en: 'Hercules Cluster', ra: 241.3, dec: 17.7, dist: 155, kind: 'cluster', radius: 3,
    blurb: L('Ein ungewöhnlich unruhiger Haufen in 500 Millionen Lichtjahren Entfernung, voller Spiralgalaxien und Kollisionen – ein Haufen, der noch nicht fertig ist.',
             'An unusually turbulent cluster 500 million light-years away, full of spirals and collisions – a cluster still in the making.'),
    numbers: [{ label: L('Entfernung (Mio. Lichtjahre)', 'Distance (million light-years)'), value: 500 }, { label: L('Galaxien', 'Galaxies'), value: 200 }] },
  { id: 'laniakea', name: 'Laniakea', en: 'Laniakea', ra: 243.6, dec: -60.9, dist: 68, kind: 'supercluster', radius: 80,
    blurb: L('Unser Superhaufen, 2014 definiert: 100’000 Galaxien in einem Bereich von 520 Millionen Lichtjahren, die alle zum Grossen Attraktor hin strömen. Der Name ist hawaiianisch für «unermesslicher Himmel».',
             'Our supercluster, defined in 2014: 100,000 galaxies in a region 520 million light-years across, all streaming towards the Great Attractor. The name is Hawaiian for “immeasurable heaven”.'),
    numbers: [{ label: L('Galaxien', 'Galaxies'), value: 100000 }, { label: L('Durchmesser (Mio. Lichtjahre)', 'Diameter (million light-years)'), value: 520 }, { label: L('Masse (Billiarden Sonnen)', 'Mass (quadrillion Suns)'), value: 100 }] },
  { id: 'perseuspisces', name: 'Perseus-Pisces-Superhaufen', en: 'Perseus–Pisces Supercluster', ra: 25, dec: 35, dist: 70, kind: 'supercluster', radius: 30,
    blurb: L('Eine der grössten Strukturen in unserer Nähe: ein 250 Millionen Lichtjahre langes Filament aus Galaxienhaufen, das sich vom Perseus-Haufen bis in die Fische zieht.',
             'One of the largest structures nearby: a filament of galaxy clusters 250 million light-years long, stretching from the Perseus Cluster into Pisces.'),
    numbers: [{ label: L('Länge (Mio. Lichtjahre)', 'Length (million light-years)'), value: 250 }, { label: L('Entfernung (Mio. Lichtjahre)', 'Distance (million light-years)'), value: 230 }] },
  { id: 'pavoindus', name: 'Pavo-Indus-Superhaufen', en: 'Pavo–Indus Supercluster', ra: 315, dec: -50, dist: 60, kind: 'supercluster', radius: 20,
    blurb: L('Ein Superhaufen am Südhimmel, rund 200 Millionen Lichtjahre entfernt, der Laniakea mit dem Perseus-Pisces-Filament verbindet.',
             'A supercluster in the southern sky, some 200 million light-years away, linking Laniakea with the Perseus–Pisces filament.'),
    numbers: [{ label: L('Entfernung (Mio. Lichtjahre)', 'Distance (million light-years)'), value: 200 }, { label: L('Galaxienhaufen', 'Galaxy clusters'), value: 5 }] },
  { id: 'shapley', name: 'Shapley-Superhaufen', en: 'Shapley Supercluster', ra: 202.5, dec: -31.5, dist: 200, kind: 'supercluster', radius: 20,
    blurb: L('Die dichteste Massenkonzentration im nahen Universum: über 25 Galaxienhaufen in 650 Millionen Lichtjahren Entfernung. Auch sie zieht an uns – hinter dem Grossen Attraktor.',
             'The densest concentration of mass in the nearby universe: more than 25 galaxy clusters 650 million light-years away. It too pulls on us – from behind the Great Attractor.'),
    numbers: [{ label: L('Entfernung (Mio. Lichtjahre)', 'Distance (million light-years)'), value: 650 }, { label: L('Galaxienhaufen', 'Galaxy clusters'), value: 25 }, { label: L('Masse (Billiarden Sonnen)', 'Mass (quadrillion Suns)'), value: 10000 }] },
  { id: 'greatwall', name: 'Grosse Mauer (CfA2)', en: 'CfA2 Great Wall', ra: 190, dec: 30, dist: 100, kind: 'wall', radius: 60,
    blurb: L('1989 von Margaret Geller und John Huchra entdeckt: eine Wand aus Galaxien, 500 Millionen Lichtjahre lang, 200 Millionen breit und nur 15 Millionen dick. Der Coma-Haufen sitzt in ihrer Mitte.',
             'Discovered in 1989 by Margaret Geller and John Huchra: a wall of galaxies 500 million light-years long, 200 million wide and only 15 million thick. The Coma Cluster sits at its centre.'),
    numbers: [{ label: L('Länge (Mio. Lichtjahre)', 'Length (million light-years)'), value: 500 }, { label: L('Dicke (Mio. Lichtjahre)', 'Thickness (million light-years)'), value: 15 }, { label: L('Entdeckt', 'Discovered'), value: 1989 }] },
  { id: 'sloanwall', name: 'Sloan Great Wall', en: 'Sloan Great Wall', ra: 200, dec: -1, dist: 340, kind: 'wall', radius: 200,
    blurb: L('Eine der grössten bekannten Strukturen: 1,4 Milliarden Lichtjahre lang, 2003 im Sloan Digital Sky Survey gefunden – am äusseren Rand dieser Karte.',
             'One of the largest structures known: 1.4 billion light-years long, found in 2003 in the Sloan Digital Sky Survey – at the outer edge of this map.'),
    numbers: [{ label: L('Länge (Mrd. Lichtjahre)', 'Length (billion light-years)'), value: 1.4 }, { label: L('Entfernung (Mrd. Lichtjahre)', 'Distance (billion light-years)'), value: 1.1 }] },
  { id: 'localvoid', name: 'Lokale Leere', en: 'Local Void', ra: 270, dec: 6, dist: 23, kind: 'void', radius: 20,
    blurb: L('Direkt neben der Lokalen Gruppe beginnt eine fast leere Blase von mindestens 150 Millionen Lichtjahren Durchmesser. Ihr «Sog» – eigentlich fehlende Anziehung – schiebt uns mit 260 km/s von ihr weg.',
             'Right next to the Local Group begins an almost empty bubble at least 150 million light-years across. Its “push” – really a lack of pull – moves us away from it at 260 km/s.'),
    numbers: [{ label: L('Durchmesser (Mio. Lichtjahre)', 'Diameter (million light-years)'), value: 150 }, { label: L('Unsere Fluchtgeschwindigkeit (km/s)', 'Our speed away from it (km/s)'), value: 260 }] },
  { id: 'bootesvoid', name: 'Boötes-Void', en: 'Boötes Void', ra: 218, dec: 26, dist: 215, kind: 'void', radius: 50,
    blurb: L('Die «Grosse Leere»: 330 Millionen Lichtjahre Durchmesser und nur etwa 60 Galaxien, wo man 2’000 erwarten würde. Lebten wir in ihrer Mitte, hätten wir bis in die 1960er keine andere Galaxie gekannt.',
             'The “Great Nothing”: 330 million light-years across and only about 60 galaxies where 2,000 would be expected. If we lived at its centre, we would not have known of any other galaxy until the 1960s.'),
    numbers: [{ label: L('Durchmesser (Mio. Lichtjahre)', 'Diameter (million light-years)'), value: 330 }, { label: L('Galaxien', 'Galaxies'), value: 60 }, { label: L('Entdeckt', 'Discovered'), value: 1981 }] },
];
writeFileSync(resolve(OUT, 'galaxy-landmarks.json'), JSON.stringify(LANDMARKS, null, 1));
console.log(`[galaxies] galaxy-landmarks.json ${LANDMARKS.length} landmarks`);

// ---------------------------------------------------------------------------------------------------------------------
// 7. Sanity checks
// ---------------------------------------------------------------------------------------------------------------------
const find = (key) => gal.findIndex((g) => catKey(CATID[g.src]) === key);
const iM31 = find('M31'), iM87 = find('M87'), iM33 = find('M33'), iCenA = find('NGC5128'), iM101 = names.find((n) => n.messier === 'M101')?.i ?? -1;
console.log(`[check] M31: index ${iM31}, ${gal[iM31]?.d.toFixed(2)} Mpc (must be 0.78)`);
console.log(`[check] M33: index ${iM33}, ${gal[iM33]?.d.toFixed(2)} Mpc (≈ 0.84)`);
console.log(`[check] Centaurus A: index ${iCenA}, ${gal[iCenA]?.d.toFixed(2)} Mpc (≈ 3.8)`);
console.log(`[check] M87: index ${iM87}, ${gal[iM87]?.d.toFixed(2)} Mpc (≈ 16.4)`);
console.log(`[check] M101: index ${iM101}, ${gal[iM101]?.d.toFixed(2)} Mpc (≈ 6.7)`);
const within = (r) => gal.filter((g) => g.d < r).length;
console.log(`[check] within 20 Mpc: ${within(20)} · within 100 Mpc: ${within(100)} · beyond 430 Mpc: ${N - within(430)}`);
console.log(`[check] farthest: ${gal[N - 1].d.toFixed(0)} Mpc (${CATID[gal[N - 1].src]}, cz ${gal[N - 1].cz} km/s) · 99.9th percentile ${gal[Math.floor(N * 0.999)].d.toFixed(0)} Mpc (≈ 430)`);
const tc = [0, 0, 0, 0, 0];
for (const g of gal) tc[g.type]++;
console.log(`[check] types: unknown ${(tc[0] / N * 100).toFixed(1)}% · E ${(tc[1] / N * 100).toFixed(1)}% · S0 ${(tc[2] / N * 100).toFixed(1)}% · S ${(tc[3] / N * 100).toFixed(1)}% · Irr/pec ${(tc[4] / N * 100).toFixed(1)}%`);
const nan = gal.filter((g) => ![g.x, g.y, g.z, g.kmag, g.cz].every(Number.isFinite)).length;
console.log(`[check] NaN rows: ${nan} · kmag range ${Math.min(...kmag).toFixed(2)} … ${Math.max(...kmag).toFixed(2)} · cz range ${Math.min(...cz)} … ${Math.max(...cz)} km/s`);
