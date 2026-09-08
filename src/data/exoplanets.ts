import { loadJSON } from '../core/Loader';
import { raDecToXYZ } from '../core/units';

/**
 * Exoplanets (public/data/exoplanets.json, built by scripts/build-exoplanets.mjs from the Open Exoplanet Catalogue).
 * Columnar JSON to keep it small; `loadExoplanets()` returns row objects.
 */
export interface ExoplanetTable {
  n: number;
  source: string;
  updated: string;
  name: string[];
  host: string[];
  ra: (number | null)[];      // deg
  dec: (number | null)[];     // deg
  dist: (number | null)[];    // parsec
  mass: (number | null)[];    // Jupiter masses
  radius: (number | null)[];  // Jupiter radii
  period: (number | null)[];  // days
  sma: (number | null)[];     // AU
  ecc: (number | null)[];
  teq: (number | null)[];     // K (equilibrium/measured temperature)
  year: (number | null)[];
  method: string[];           // 'transit' | 'RV' | 'imaging' | 'microlensing' | 'timing' | 'astrometry' | 'other'
  stMass: (number | null)[];  // solar masses
  stRadius: (number | null)[];// solar radii
  stTeff: (number | null)[];  // K
  hz: (0 | 1)[];              // 1 = orbits inside the (optimistic) habitable zone of its star
}

export interface Exoplanet {
  i: number;
  name: string;
  host: string;
  ra: number | null; dec: number | null; dist: number | null;
  /** xyz in parsecs (null if no distance) */
  xyz: [number, number, number] | null;
  mass: number | null; radius: number | null; period: number | null; sma: number | null; ecc: number | null; teq: number | null;
  year: number | null; method: string;
  stMass: number | null; stRadius: number | null; stTeff: number | null;
  hz: boolean;
  /** Earth masses / radii (convenience) */
  massE: number | null; radiusE: number | null;
}

export const JUPITER_MASS_E = 317.8;
export const JUPITER_RADIUS_E = 11.21;

let cache: Promise<Exoplanet[]> | null = null;
export function loadExoplanets(): Promise<Exoplanet[]> {
  if (cache) return cache;
  cache = loadJSON<ExoplanetTable>('exoplanets.json', 'Exoplaneten').then((tb) => {
    const out: Exoplanet[] = [];
    for (let i = 0; i < tb.n; i++) {
      const ra = tb.ra[i], dec = tb.dec[i], dist = tb.dist[i];
      const xyz = ra != null && dec != null && dist != null ? raDecToXYZ(ra, dec, dist) : null;
      out.push({
        i, name: tb.name[i], host: tb.host[i], ra, dec, dist, xyz,
        mass: tb.mass[i], radius: tb.radius[i], period: tb.period[i], sma: tb.sma[i], ecc: tb.ecc[i], teq: tb.teq[i],
        year: tb.year[i], method: tb.method[i], stMass: tb.stMass[i], stRadius: tb.stRadius[i], stTeff: tb.stTeff[i],
        hz: tb.hz[i] === 1,
        massE: tb.mass[i] != null ? tb.mass[i]! * JUPITER_MASS_E : null,
        radiusE: tb.radius[i] != null ? tb.radius[i]! * JUPITER_RADIUS_E : null,
      });
    }
    return out;
  });
  cache.catch(() => (cache = null));
  return cache;
}
