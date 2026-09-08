#!/usr/bin/env node
/**
 * Open Exoplanet Catalogue (raw/oec_systems/*.xml) → public/data/exoplanets.json
 *
 * Columnar JSON, exact format documented in src/data/exoplanets.ts (ExoplanetTable). Confirmed planets only.
 * Units: RA/Dec in degrees (J2000), distance in parsecs, planet mass/radius in Jupiter units, period in days,
 * semi-major axis in AU, temperatures in kelvin, stellar mass/radius in solar units.
 * Hosts: planets inside <star> → that star; planets directly inside <binary> (circumbinary) → the binary's first star
 * for the stellar parameters, host label "<system> (Doppelstern)"; free-floating planets (directly inside <system>)
 * → host label = system name, no stellar parameters.
 * hz = 1 when the semi-major axis lies inside an optimistic Kopparapu-style habitable zone 0.75·√L … 1.77·√L AU
 * (L from stellar radius & temperature, or ≈ M^3.5 when only the mass is known).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { ensureRaw, RAW, OUT } from './lib/raw.mjs';
import { parseXML, child, children, num, text } from './lib/xml.mjs';

const REPO = 'https://github.com/OpenExoplanetCatalogue/open_exoplanet_catalogue.git';
const SOURCE = 'Open Exoplanet Catalogue';
const SIZE_TARGET = 1.2e6; // bytes

// ---------------------------------------------------------------------------------------------- source folder
let SRC;
try {
  SRC = await ensureRaw('oec_systems'); // no single download URL exists → only succeeds when the folder is already there
} catch {
  console.error(
    `[exoplanets] Missing ${resolve(RAW, 'oec_systems')}.\n` +
    `The Open Exoplanet Catalogue has no single download URL. Fetch the system files with\n\n` +
    `    git clone --depth 1 ${REPO} raw/oec_systems\n\n` +
    `(the XML files then live in raw/oec_systems/systems/, which this script picks up automatically),\n` +
    `or copy/symlink the repository's systems/ folder to raw/oec_systems/. Then re-run: node scripts/build-exoplanets.mjs`,
  );
  process.exit(1);
}
if (existsSync(resolve(SRC, 'systems'))) SRC = resolve(SRC, 'systems');
const files = readdirSync(SRC).filter((f) => f.endsWith('.xml')).sort();
if (!files.length) {
  console.error(`[exoplanets] No *.xml files in ${SRC}. See: git clone --depth 1 ${REPO} raw/oec_systems`);
  process.exit(1);
}
console.log(`[exoplanets] ${files.length} system files in ${SRC}`);

// ---------------------------------------------------------------------------------------------- helpers
const firstName = (node) => (node && text(node, 'name')) || null;

/** "HH MM SS.s" / "+DD MM SS" (also "H:M:S" or a plain decimal) → decimal value in the leading unit; null if unparsable. */
function sexagesimal(s) {
  if (s == null) return null;
  const t = s.trim();
  if (!t) return null;
  const neg = t[0] === '-';
  const parts = t.replace(/^[+-]/, '').split(/[\s:]+/).filter(Boolean).map(Number);
  if (!parts.length || parts.length > 3 || parts.some((v) => !Number.isFinite(v))) return null;
  const [a = 0, b = 0, c = 0] = parts;
  return (neg ? -1 : 1) * (a + b / 60 + c / 3600);
}
function parseRA(s) {
  const v = sexagesimal(s);
  if (v == null) return null;
  const isDegrees = /^\s*[+-]?\d+(\.\d+)?\s*$/.test(s) && v > 24; // lone decimal > 24 h can only be degrees
  const deg = isDegrees ? v : v * 15;
  return deg >= 0 && deg < 360 ? deg : ((deg % 360) + 360) % 360;
}
function parseDec(s) {
  const v = sexagesimal(s);
  return v != null && Math.abs(v) <= 90 ? v : null;
}

const METHODS = new Set(['transit', 'RV', 'imaging', 'microlensing', 'timing', 'astrometry']);
function normaliseMethod(s) {
  const t = (s || '').trim();
  if (METHODS.has(t)) return t;
  const l = t.toLowerCase();
  if (l === 'rv' || l.includes('radial')) return 'RV';
  if (l.startsWith('transit')) return 'transit';
  if (l.includes('imag')) return 'imaging';
  if (l.includes('lens')) return 'microlensing';
  if (l.includes('timing') || l.includes('ttv')) return 'timing';
  if (l.includes('astrom')) return 'astrometry';
  return 'other';
}

function parseYear(s) {
  const y = parseInt(s, 10);
  return Number.isFinite(y) && y >= 1900 && y <= 2100 ? y : null;
}

/** OEC <lastupdate> is "YY/MM/DD"; tolerate "YYYY-MM-DD" / "YYYY/MM/DD". Returns "YYYY-MM-DD" or null. */
function parseLastUpdate(s) {
  if (!s) return null;
  let m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  let y, mo, d;
  if (m) { y = 2000 + +m[1]; mo = +m[2]; d = +m[3]; }
  else {
    m = s.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (!m) return null;
    y = +m[1]; mo = +m[2]; d = +m[3];
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Stellar luminosity in L☉ from radius & Teff (L = R²·(T/5772)⁴) or, failing that, from mass (L ≈ M^3.5). */
function luminosity(stRadius, stTeff, stMass) {
  if (stRadius != null && stTeff != null && stRadius > 0 && stTeff > 0) return stRadius * stRadius * (stTeff / 5772) ** 4;
  if (stMass != null && stMass > 0) return stMass ** 3.5;
  return null;
}
function inHabitableZone(sma, L) {
  if (sma == null || L == null) return 0;
  const s = Math.sqrt(L);
  return sma >= 0.75 * s && sma <= 1.77 * s ? 1 : 0;
}

/** Round to `digits` significant digits (null passthrough). */
const sig = (v, digits = 4) => (v == null ? null : Number(v.toPrecision(digits)));

/** Depth-first first <star> under a <binary> (the binary may contain sub-binaries). */
function firstStar(binary) {
  for (const c of binary.children) {
    if (c.tag === 'star') return c;
    if (c.tag === 'binary') { const s = firstStar(c); if (s) return s; }
  }
  return null;
}

const DROP_LISTS = ['Controversial', 'Retracted planet candidate', 'Kepler Objects of Interest', 'Solar System'];

// ---------------------------------------------------------------------------------------------- walk the catalogue
const rows = [];
const dropped = {};
let planetsSeen = 0, unnamed = 0, newestUpdate = null, parseErrors = 0;

/** Collect { planet, star, host } triples from a <system>/<binary> subtree. */
function collect(node, systemName, out) {
  for (const c of node.children) {
    if (c.tag === 'star') {
      for (const p of children(c, 'planet')) out.push({ planet: p, star: c, host: firstName(c) ?? systemName });
    } else if (c.tag === 'binary') {
      const star = firstStar(c);
      for (const p of children(c, 'planet')) out.push({ planet: p, star, host: `${systemName} (Doppelstern)` });
      collect(c, systemName, out); // stars (S-type planets) and nested binaries inside this binary (its own planets are done above)
    } else if (c.tag === 'planet' && node.tag === 'system') { // free-floating ("orphan") planet directly under <system>
      out.push({ planet: c, star: null, host: systemName });
    }
  }
}

for (const f of files) {
  let system;
  try {
    system = parseXML(readFileSync(resolve(SRC, f), 'utf8'));
  } catch (e) {
    parseErrors++;
    console.warn(`[exoplanets] ${f}: ${e.message}`);
    continue;
  }
  if (system.tag !== 'system') { parseErrors++; console.warn(`[exoplanets] ${f}: root is <${system.tag}>, expected <system>`); continue; }
  const systemName = firstName(system) ?? f.replace(/\.xml$/, '');
  const ra = parseRA(text(system, 'rightascension'));
  const dec = parseDec(text(system, 'declination'));
  const dist = num(system, 'distance');

  const found = [];
  collect(system, systemName, found);
  for (const { planet, star, host } of found) {
    planetsSeen++;
    const lists = children(planet, 'list').map((l) => l.text);
    const drop = lists.find((l) => DROP_LISTS.includes(l));
    if (drop) { dropped[drop] = (dropped[drop] ?? 0) + 1; continue; }
    if (!lists.includes('Confirmed planets')) { dropped['(not confirmed)'] = (dropped['(not confirmed)'] ?? 0) + 1; continue; }
    const name = firstName(planet);
    if (!name) { unnamed++; continue; }

    const upd = parseLastUpdate(text(planet, 'lastupdate'));
    if (upd && (!newestUpdate || upd > newestUpdate)) newestUpdate = upd;

    const stMass = star ? num(star, 'mass') : null;
    const stRadius = star ? num(star, 'radius') : null;
    const stTeff = star ? num(star, 'temperature') : null;
    const sma = num(planet, 'semimajoraxis');

    rows.push({
      name, host, ra, dec,
      dist: dist != null && dist > 0 ? dist : null,
      mass: num(planet, 'mass'), radius: num(planet, 'radius'), period: num(planet, 'period'), sma,
      ecc: num(planet, 'eccentricity'), teq: num(planet, 'temperature'),
      year: parseYear(text(planet, 'discoveryyear')), method: normaliseMethod(text(planet, 'discoverymethod')),
      stMass, stRadius, stTeff,
      hz: inHabitableZone(sma, luminosity(stRadius, stTeff, stMass)),
    });
  }
}

// ---------------------------------------------------------------------------------------------- sort + write
const cmp = (a, b) => a.localeCompare(b, 'en', { numeric: true }) || (a < b ? -1 : a > b ? 1 : 0);
rows.sort((a, b) => cmp(a.host, b.host) || cmp(a.name, b.name));
const n = rows.length;
const today = new Date().toISOString().slice(0, 10);
const col = (k, digits = 4) => rows.map((r) => sig(r[k], digits));
const table = {
  n,
  source: SOURCE,
  updated: newestUpdate ?? today,
  name: rows.map((r) => r.name),
  host: rows.map((r) => r.host),
  ra: col('ra', 6), dec: col('dec', 6), // positions keep 6 significant digits (~0.001°); 4 would be ~0.05°
  dist: col('dist'), mass: col('mass'), radius: col('radius'), period: col('period'), sma: col('sma'), ecc: col('ecc'), teq: col('teq'),
  year: rows.map((r) => r.year),
  method: rows.map((r) => r.method),
  stMass: col('stMass'), stRadius: col('stRadius'), stTeff: col('stTeff'),
  hz: rows.map((r) => r.hz),
};
mkdirSync(OUT, { recursive: true });
const outPath = resolve(OUT, 'exoplanets.json');
const json = JSON.stringify(table);
writeFileSync(outPath, json);
const bytes = Buffer.byteLength(json);
console.log(`[exoplanets] wrote ${outPath} (${(bytes / 1e3).toFixed(0)} KB${bytes > SIZE_TARGET ? ' – ABOVE the 1.2 MB target!' : ''})`);

// ---------------------------------------------------------------------------------------------- sanity prints
const count = (arr) => { const m = new Map(); for (const v of arr) m.set(v, (m.get(v) ?? 0) + 1); return m; };
const fmtMap = (m, sortByKey = false) =>
  [...m.entries()].sort(sortByKey ? (a, b) => (a[0] > b[0] ? 1 : -1) : (a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(', ');

console.log(`[exoplanets] planets seen ${planetsSeen}, kept ${n} confirmed, dropped { ${fmtMap(new Map(Object.entries(dropped)))} }` +
  (unnamed ? `, ${unnamed} without a name` : '') + (parseErrors ? `, ${parseErrors} files failed to parse` : ''));
console.log(`[exoplanets] systems ${files.length}, distinct hosts ${new Set(table.host).size}, updated ${table.updated}` +
  (newestUpdate ? ' (newest <lastupdate>)' : ' (today – no <lastupdate> found)'));
console.log(`[exoplanets] per method: ${fmtMap(count(table.method))}`);
const years = table.year.filter((y) => y != null);
const maxYear = years.length ? Math.max(...years) : null;
if (maxYear != null) {
  const yc = count(years);
  const last8 = [];
  for (let y = maxYear - 7; y <= maxYear; y++) last8.push(`${y}: ${yc.get(y) ?? 0}`);
  console.log(`[exoplanets] per year (last 8): ${last8.join(', ')}  (no year: ${n - years.length})`);
}
console.log(`[exoplanets] with distance ${table.dist.filter((d) => d != null).length} / ${n}, with RA/Dec ${table.ra.filter((v, i) => v != null && table.dec[i] != null).length}, ` +
  `with sma ${table.sma.filter((v) => v != null).length}, with mass ${table.mass.filter((v) => v != null).length}, with radius ${table.radius.filter((v) => v != null).length}`);
console.log(`[exoplanets] habitable zone (hz=1): ${table.hz.filter((h) => h === 1).length}`);
const dupNames = [...count(table.name).entries()].filter(([, c]) => c > 1);
if (dupNames.length) console.log(`[exoplanets] note: ${dupNames.length} duplicate planet names, e.g. ${dupNames.slice(0, 3).map(([k]) => k).join(', ')}`);

// Checks against well-known values
const byName = (nm) => table.name.indexOf(nm);
const check = (label, ok, detail) => console.log(`[check] ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` – ${detail}` : ''}`);
{
  const i = byName('Proxima Centauri b');
  check('Proxima Centauri b dist ≈ 1.30 pc', i >= 0 && table.dist[i] != null && Math.abs(table.dist[i] - 1.30) < 0.02, i >= 0 ? `${table.dist[i]} pc, host "${table.host[i]}"` : 'not found');
}
{
  const c = table.host.filter((h) => h === 'TRAPPIST-1').length;
  check('TRAPPIST-1 has 7 planets', c === 7, `${c} planets`);
}
{
  const i = byName('51 Peg b');
  check('51 Peg b year 1995', i >= 0 && table.year[i] === 1995, i >= 0 ? `year ${table.year[i]}, method ${table.method[i]}` : 'not found');
}
{
  const i = byName('Kepler-452 b');
  check('Kepler-452 b exists', i >= 0, i >= 0 ? `hz=${table.hz[i]}, sma ${table.sma[i]} AU, dist ${table.dist[i]} pc` : 'not found');
}
check('largest year present is 2025/2026', maxYear === 2025 || maxYear === 2026, `max year ${maxYear}` + (maxYear != null && maxYear < 2025 ? ' – raw snapshot is older than expected; re-clone the catalogue to refresh' : ''));

// Structural verification: the written file loads and every column has length n
const back = JSON.parse(readFileSync(outPath, 'utf8'));
const cols = ['name', 'host', 'ra', 'dec', 'dist', 'mass', 'radius', 'period', 'sma', 'ecc', 'teq', 'year', 'method', 'stMass', 'stRadius', 'stTeff', 'hz'];
const bad = cols.filter((k) => !Array.isArray(back[k]) || back[k].length !== back.n);
if (bad.length || back.n !== n || n === 0) {
  console.error(`[exoplanets] VERIFY FAILED: n=${back.n}, bad columns: ${bad.join(', ') || '-'}`);
  process.exitCode = 1;
} else console.log(`[verify] exoplanets.json loads, n=${back.n}, all ${cols.length} columns have length n`);
