import { loadBinary, loadJSON } from '../core/Loader';
import { readCatalog } from './bin';

/**
 * Star catalogue (public/data/stars.bin, built by scripts/build-stars.mjs from HYG v4.1).
 * Frame: equatorial J2000 cartesian, unit parsec. x → RA 0h/Dec 0, y → RA 6h, z → north celestial pole.
 * The Sun is NOT included (add it yourself at the origin if needed). Stars are sorted by apparent
 * magnitude as seen from Earth, brightest first, so index 0 is Sirius.
 */
export interface StarCatalog {
  count: number;
  /** xyz in parsecs, 3 per star */
  pos: Float32Array;
  absMag: Float32Array;
  /** B-V colour index */
  ci: Float32Array;
  /** Hipparcos id (0 = none) */
  hip: Uint32Array;
  /** distance from the Sun in parsecs (computed) */
  dist: Float32Array;
  /** apparent magnitude from Earth (computed) */
  mag: Float32Array;
}

export interface StarName {
  /** index into the catalogue arrays */
  i: number;
  /** proper name (e.g. "Sirius") */
  name?: string;
  /** Bayer designation, e.g. "Alp" */
  bayer?: string;
  /** Flamsteed number */
  flam?: number;
  /** constellation abbreviation, e.g. "CMa" */
  con?: string;
  /** spectral type */
  spect?: string;
  hd?: number;
  hr?: number;
  gl?: string;
}

export interface StarNamesIndex {
  list: StarName[];
  byIndex: Map<number, StarName>;
}

export interface Constellation {
  abbr: string;
  de: string;
  en: string;
  lat: string;
  /** polylines as star indices into the catalogue */
  lines: number[][];
}

const GREEK: Record<string, string> = {
  Alp: 'α', Bet: 'β', Gam: 'γ', Del: 'δ', Eps: 'ε', Zet: 'ζ', Eta: 'η', The: 'θ', Iot: 'ι', Kap: 'κ', Lam: 'λ', Mu: 'μ',
  Nu: 'ν', Xi: 'ξ', Omi: 'ο', Pi: 'π', Rho: 'ρ', Sig: 'σ', Tau: 'τ', Ups: 'υ', Phi: 'φ', Chi: 'χ', Psi: 'ψ', Ome: 'ω',
};

/** Display name: proper name, else Bayer/Flamsteed + constellation, else HIP/HD number. */
export function starDisplayName(n: StarName | undefined, hip?: number): string {
  if (n?.name) return n.name;
  if (n?.bayer && n.con) return `${GREEK[n.bayer.replace(/-?\d+$/, '')] ?? n.bayer}${n.bayer.match(/\d+$/)?.[0] ?? ''} ${n.con}`;
  if (n?.flam && n.con) return `${n.flam} ${n.con}`;
  if (n?.hd) return `HD ${n.hd}`;
  if (n?.gl) return n.gl;
  if (hip) return `HIP ${hip}`;
  return '★';
}

let catalog: Promise<StarCatalog> | null = null;
export function loadStarCatalog(): Promise<StarCatalog> {
  if (catalog) return catalog;
  catalog = loadBinary('stars.bin', 'Sterne').then((buf) => {
    const { count, arrays } = readCatalog(buf, 'KSTR', [
      { name: 'pos', type: 'f32', comps: 3 },
      { name: 'absMag', type: 'f32' },
      { name: 'ci', type: 'f32' },
      { name: 'hip', type: 'u32' },
    ]);
    const pos = arrays.pos as Float32Array;
    const absMag = arrays.absMag as Float32Array;
    const dist = new Float32Array(count);
    const mag = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const d = Math.hypot(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      dist[i] = d;
      mag[i] = absMag[i] + 5 * (Math.log10(Math.max(d, 1e-6)) - 1);
    }
    return { count, pos, absMag, ci: arrays.ci as Float32Array, hip: arrays.hip as Uint32Array, dist, mag };
  });
  catalog.catch(() => (catalog = null));
  return catalog;
}

let names: Promise<StarNamesIndex> | null = null;
export function loadStarNames(): Promise<StarNamesIndex> {
  if (names) return names;
  names = loadJSON<StarName[]>('stars-names.json', 'Sternnamen').then((list) => ({ list, byIndex: new Map(list.map((n) => [n.i, n])) }));
  names.catch(() => (names = null));
  return names;
}

let cons: Promise<Constellation[]> | null = null;
export function loadConstellations(): Promise<Constellation[]> {
  if (cons) return cons;
  cons = loadJSON<Constellation[]>('constellations.json', 'Sternbilder');
  cons.catch(() => (cons = null));
  return cons;
}

/** Simple search over names (proper, Bayer, HIP/HD). Returns up to `limit` matches. */
export function searchStars(idx: StarNamesIndex, q: string, limit = 12): StarName[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const out: StarName[] = [];
  for (const n of idx.list) {
    const hay = `${n.name ?? ''} ${n.bayer ?? ''} ${n.con ?? ''} ${n.flam ?? ''} hd${n.hd ?? ''} ${n.gl ?? ''}`.toLowerCase();
    if (hay.includes(s)) { out.push(n); if (out.length >= limit) break; }
  }
  // proper-name prefix matches first
  out.sort((a, b) => Number(!(a.name ?? '').toLowerCase().startsWith(s)) - Number(!(b.name ?? '').toLowerCase().startsWith(s)));
  return out;
}
