import { loadBinary, loadJSON } from '../core/Loader';
import { readCatalog } from './bin';

/**
 * Galaxy catalogue (public/data/galaxies.bin, built by scripts/build-galaxies.mjs from 2MRS).
 * Frame: equatorial J2000 cartesian, unit megaparsec (same orientation as the star catalogue).
 * Distances: Hubble flow d = cz_CMB / H0 (H0 = 70) except for nearby galaxies with known distances
 * (override table in the build script). Sorted by distance, nearest first. The Milky Way is NOT included.
 */
export interface GalaxyCatalog {
  count: number;
  /** xyz in Mpc */
  pos: Float32Array;
  /** 2MASS Ks total magnitude */
  kmag: Float32Array;
  /** heliocentric cz in km/s */
  cz: Float32Array;
  /** 0 unknown · 1 elliptical · 2 lenticular · 3 spiral · 4 irregular/peculiar */
  type: Uint8Array;
  /** distance in Mpc (computed) */
  dist: Float32Array;
}

export interface GalaxyName {
  i: number;
  name: string;      // common name, e.g. "Andromeda-Galaxie"
  en?: string;       // english name if different
  messier?: string;  // "M31"
  ngc?: string;      // "NGC 224"
}

let cat: Promise<GalaxyCatalog> | null = null;
export function loadGalaxyCatalog(): Promise<GalaxyCatalog> {
  if (cat) return cat;
  cat = loadBinary('galaxies.bin', 'Galaxien').then((buf) => {
    const { count, arrays } = readCatalog(buf, 'KGAL', [
      { name: 'pos', type: 'f32', comps: 3 },
      { name: 'kmag', type: 'f32' },
      { name: 'cz', type: 'f32' },
      { name: 'type', type: 'u8' },
    ]);
    const pos = arrays.pos as Float32Array;
    const dist = new Float32Array(count);
    for (let i = 0; i < count; i++) dist[i] = Math.hypot(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    return { count, pos, kmag: arrays.kmag as Float32Array, cz: arrays.cz as Float32Array, type: arrays.type as Uint8Array, dist };
  });
  cat.catch(() => (cat = null));
  return cat;
}

let names: Promise<GalaxyName[]> | null = null;
export function loadGalaxyNames(): Promise<GalaxyName[]> {
  if (names) return names;
  names = loadJSON<GalaxyName[]>('galaxies-names.json', 'Galaxiennamen');
  names.catch(() => (names = null));
  return names;
}
