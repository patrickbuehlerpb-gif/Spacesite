import type { Exoplanet } from '../../data/exoplanets';

/**
 * Data model for the exoplanets chapter: planets grouped into host systems, derived quantities
 * (luminosity, habitable zone, semi-major axis from Kepler's third law), size classes, discovery
 * timeline and filters. Pure functions – no DOM, no three.js.
 */

/** Discovery-method groups used for colour/shape (timing, astrometry and the rest fold into 'other'). */
export type Method = 'transit' | 'RV' | 'imaging' | 'microlensing' | 'other';
export const METHODS: Method[] = ['transit', 'RV', 'imaging', 'microlensing', 'other'];
/** Raw method values in the data, in the order the filter chips are shown. */
export const RAW_METHODS = ['transit', 'RV', 'imaging', 'microlensing', 'timing', 'astrometry', 'other'] as const;
export type RawMethod = typeof RAW_METHODS[number];

export function methodGroup(m: string): Method {
  return m === 'transit' || m === 'RV' || m === 'imaging' || m === 'microlensing' ? m : 'other';
}
export function rawMethod(m: string): RawMethod {
  return (RAW_METHODS as readonly string[]).includes(m) ? (m as RawMethod) : 'other';
}

export type SizeClass = 'earth' | 'super' | 'neptune' | 'jupiter' | 'unknown';
export const SIZES: SizeClass[] = ['earth', 'super', 'neptune', 'jupiter', 'unknown'];

/** Size class by radius (R⊕); when the radius is unknown, by mass (M⊕) as a fallback. */
export function sizeClass(p: Exoplanet): SizeClass {
  const r = p.radiusE;
  if (r != null && r > 0) return r < 1.6 ? 'earth' : r < 2.5 ? 'super' : r < 6 ? 'neptune' : 'jupiter';
  const m = p.massE;
  if (m != null && m > 0) return m < 2 ? 'earth' : m < 10 ? 'super' : m < 50 ? 'neptune' : 'jupiter';
  return 'unknown';
}

/** Rough mass→radius estimate (R⊕) for planets without a measured radius (Chen & Kipping-like broken power law). */
export function estimateRadiusE(massE: number): number {
  if (massE < 2) return Math.pow(massE, 0.28);
  if (massE < 130) return 1.2 * Math.pow(massE / 2, 0.59);
  return 11.2 * Math.pow(massE / 318, 0.02);
}

export interface HostSystem {
  i: number;
  name: string;
  /** name without the "(Doppelstern)" suffix */
  label: string;
  binary: boolean;
  planets: PlanetView[];
  /** equatorial cartesian, parsec, z = north (catalogue frame); null if no distance */
  xyz: [number, number, number] | null;
  dist: number | null;
  teff: number | null;
  mass: number | null;
  radius: number | null;
  /** L☉ from R & T, or M^3.5 – null if unknown */
  lum: number | null;
  /** optimistic habitable zone (AU) */
  hzIn: number | null;
  hzOut: number | null;
  /** fractional discovery time of the first planet (see PlanetView.t) */
  firstT: number;
}

export interface PlanetView {
  p: Exoplanet;
  sys: HostSystem;
  /** fractional discovery time: year + rank within that year → smooth playback */
  t: number;
  /** semi-major axis in AU (measured or derived) */
  sma: number | null;
  smaDerived: boolean;
  size: SizeClass;
  group: Method;
  raw: RawMethod;
}

export interface Catalog {
  planets: PlanetView[];
  hosts: HostSystem[];
  byHost: Map<string, HostSystem>;
  /** lower-cased name → planet (for search / deep links) */
  byPlanet: Map<string, PlanetView>;
  minYear: number;
  maxYear: number;
  /** planets sorted by t ascending */
  timeline: PlanetView[];
  updated: string;
  source: string;
}

export function luminosity(radius: number | null, teff: number | null, mass: number | null): number | null {
  if (radius != null && teff != null && radius > 0 && teff > 0) return radius * radius * Math.pow(teff / 5772, 4);
  if (mass != null && mass > 0) return Math.pow(mass, 3.5);
  return null;
}

/** Semi-major axis (AU) from period (days) and stellar mass (M☉): a³ = M · P² (P in years). */
export function smaFromPeriod(periodDays: number, stMass: number): number {
  const P = periodDays / 365.25;
  return Math.cbrt(stMass * P * P);
}

export function buildCatalog(rows: Exoplanet[], updated: string, source: string): Catalog {
  // --- discovery timeline: fractional years so playback spreads a year's discoveries evenly
  const byYear = new Map<number, Exoplanet[]>();
  for (const p of rows) { const y = p.year ?? 0; let a = byYear.get(y); if (!a) byYear.set(y, a = []); a.push(p); }
  const tOf = new Map<number, number>(); // planet index → t
  for (const [y, list] of byYear) {
    list.sort((a, b) => a.name.localeCompare(b.name));
    list.forEach((p, k) => tOf.set(p.i, y + (k + 0.5) / list.length));
  }
  const years = rows.map((p) => p.year).filter((y): y is number => y != null);
  const minYear = years.length ? Math.min(...years) : 1989;
  const maxYear = years.length ? Math.max(...years) : new Date().getFullYear();

  // --- hosts
  const hosts: HostSystem[] = [];
  const byHost = new Map<string, HostSystem>();
  const planets: PlanetView[] = [];
  const byPlanet = new Map<string, PlanetView>();
  for (const p of rows) {
    let sys = byHost.get(p.host);
    if (!sys) {
      const binary = /\(Doppelstern\)$/.test(p.host);
      const lum = luminosity(p.stRadius, p.stTeff, p.stMass);
      sys = {
        i: hosts.length, name: p.host, label: p.host.replace(/\s*\(Doppelstern\)$/, ''), binary, planets: [],
        xyz: p.xyz, dist: p.dist, teff: p.stTeff, mass: p.stMass, radius: p.stRadius, lum,
        hzIn: lum != null ? 0.75 * Math.sqrt(lum) : null, hzOut: lum != null ? 1.77 * Math.sqrt(lum) : null,
        firstT: Infinity,
      };
      hosts.push(sys); byHost.set(p.host, sys);
    } else {
      // fill gaps from later rows of the same host
      if (sys.xyz == null && p.xyz) { sys.xyz = p.xyz; sys.dist = p.dist; }
      if (sys.teff == null && p.stTeff != null) sys.teff = p.stTeff;
      if (sys.mass == null && p.stMass != null) sys.mass = p.stMass;
      if (sys.radius == null && p.stRadius != null) sys.radius = p.stRadius;
      if (sys.lum == null) { sys.lum = luminosity(sys.radius, sys.teff, sys.mass); if (sys.lum != null) { sys.hzIn = 0.75 * Math.sqrt(sys.lum); sys.hzOut = 1.77 * Math.sqrt(sys.lum); } }
    }
    let sma = p.sma, smaDerived = false;
    if ((sma == null || sma <= 0) && p.period != null && p.period > 0 && sys.mass != null && sys.mass > 0) { sma = smaFromPeriod(p.period, sys.mass); smaDerived = true; }
    const t = tOf.get(p.i) ?? 0;
    const v: PlanetView = { p, sys, t, sma: sma != null && sma > 0 ? sma : null, smaDerived, size: sizeClass(p), group: methodGroup(p.method), raw: rawMethod(p.method) };
    sys.planets.push(v);
    if (t < sys.firstT) sys.firstT = t;
    planets.push(v);
    byPlanet.set(p.name.toLowerCase(), v);
  }
  for (const h of hosts) h.planets.sort((a, b) => (a.sma ?? Infinity) - (b.sma ?? Infinity) || a.p.name.localeCompare(b.p.name));
  const timeline = planets.slice().sort((a, b) => a.t - b.t);
  return { planets, hosts, byHost, byPlanet, minYear, maxYear, timeline, updated, source };
}

// ------------------------------------------------------------------------------------------ filters
export interface Filters {
  methods: Set<RawMethod>;
  sizes: Set<SizeClass>;
  hzOnly: boolean;
  /** parsec; Infinity = no limit */
  maxDistPc: number;
}

export function defaultFilters(): Filters {
  return { methods: new Set(RAW_METHODS), sizes: new Set(SIZES), hzOnly: false, maxDistPc: Infinity };
}

/** Static filter test (everything except the discovery year, which the GPU handles). */
export function passes(v: PlanetView, f: Filters): boolean {
  if (!f.methods.has(v.raw)) return false;
  if (!f.sizes.has(v.size)) return false;
  if (f.hzOnly && !v.p.hz) return false;
  if (f.maxDistPc !== Infinity) { const d = v.sys.dist; if (d == null || d > f.maxDistPc) return false; }
  return true;
}

/** Number of elements of the ascending array `ts` that are ≤ t (binary search). */
export function countUpTo(ts: Float64Array, t: number): number {
  let lo = 0, hi = ts.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (ts[mid] <= t) lo = mid + 1; else hi = mid; }
  return lo;
}

// ------------------------------------------------------------------------------------------ search
export interface SearchHit { sys: HostSystem; planet?: PlanetView; score: number }

export function searchSystems(cat: Catalog, q: string, limit = 8): SearchHit[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const hits: SearchHit[] = [];
  for (const h of cat.hosts) {
    const n = h.label.toLowerCase();
    if (n === s) hits.push({ sys: h, score: 0 });
    else if (n.startsWith(s)) hits.push({ sys: h, score: 1 });
    else if (n.includes(s)) hits.push({ sys: h, score: 3 });
    else {
      const pl = h.planets.find((v) => v.p.name.toLowerCase().includes(s));
      if (pl) hits.push({ sys: h, planet: pl, score: pl.p.name.toLowerCase().startsWith(s) ? 2 : 4 });
    }
  }
  hits.sort((a, b) => a.score - b.score || (b.sys.planets.length - a.sys.planets.length) || a.sys.label.localeCompare(b.sys.label));
  return hits.slice(0, limit);
}

/** Resolve a deep-link param: exact host name, exact planet name, else best search hit. */
export function resolveParam(cat: Catalog, param: string): HostSystem | undefined {
  const s = param.trim();
  if (!s) return undefined;
  const direct = cat.byHost.get(s) ?? cat.byHost.get(`${s} (Doppelstern)`);
  if (direct) return direct;
  const pl = cat.byPlanet.get(s.toLowerCase());
  if (pl) return pl.sys;
  const lower = s.toLowerCase();
  for (const h of cat.hosts) if (h.label.toLowerCase() === lower) return h;
  return searchSystems(cat, s, 1)[0]?.sys;
}

// ------------------------------------------------------------------------------------------ stats
export interface Stats {
  total: number; hz: number; hosts: number; multi: number;
  nearest: PlanetView | null; smallest: PlanetView | null; largest: PlanetView | null; earliest: PlanetView | null;
  medianDistPc: number | null;
  perYear: Map<number, number>;
  perMethod: Map<Method, number>;
  perRaw: Map<RawMethod, number>;
  perSize: Map<SizeClass, number>;
}

export function computeStats(cat: Catalog): Stats {
  let nearest: PlanetView | null = null, smallest: PlanetView | null = null, largest: PlanetView | null = null, earliest: PlanetView | null = null;
  let hz = 0;
  const dists: number[] = [];
  const perYear = new Map<number, number>(), perMethod = new Map<Method, number>(), perRaw = new Map<RawMethod, number>(), perSize = new Map<SizeClass, number>();
  for (const v of cat.planets) {
    const p = v.p;
    if (p.hz) hz++;
    if (p.dist != null) { dists.push(p.dist); if (!nearest || p.dist < nearest.p.dist!) nearest = v; }
    if (p.radiusE != null) {
      if (!smallest || p.radiusE < smallest.p.radiusE!) smallest = v;
      if (!largest || p.radiusE > largest.p.radiusE!) largest = v;
    }
    if (p.year != null && (!earliest || p.year < earliest.p.year! || (p.year === earliest.p.year && p.name < earliest.p.name))) earliest = v;
    if (p.year != null) perYear.set(p.year, (perYear.get(p.year) ?? 0) + 1);
    perMethod.set(v.group, (perMethod.get(v.group) ?? 0) + 1);
    perRaw.set(v.raw, (perRaw.get(v.raw) ?? 0) + 1);
    perSize.set(v.size, (perSize.get(v.size) ?? 0) + 1);
  }
  dists.sort((a, b) => a - b);
  const medianDistPc = dists.length ? dists[Math.floor(dists.length / 2)] : null;
  const multi = cat.hosts.filter((h) => h.planets.length > 1).length;
  return { total: cat.planets.length, hz, hosts: cat.hosts.length, multi, nearest, smallest, largest, earliest, medianDistPc, perYear, perMethod, perRaw, perSize };
}
