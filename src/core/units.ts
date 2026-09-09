import { locale, lang } from './i18n';

// Physical constants ------------------------------------------------------
export const KM_PER_AU = 149_597_870.7;
export const KM_PER_LY = 9.4607304725808e12;
export const LY_PER_PC = 3.2615637771;
export const KM_PER_PC = KM_PER_LY * LY_PER_PC;
export const AU_PER_PC = KM_PER_PC / KM_PER_AU; // ≈ 206 265
export const C_KM_S = 299_792.458;
export const SEC_PER_DAY = 86_400;
export const SEC_PER_YEAR = 31_557_600; // Julian year
export const EARTH_RADIUS_KM = 6_371;
export const SUN_RADIUS_KM = 695_700;
export const H0 = 70; // km/s/Mpc, used for Hubble-flow distances of galaxies

// Number formatting -------------------------------------------------------
export interface NumOpts { digits?: number; maxDigits?: number; compact?: boolean }

export function fmtNum(n: number, opts: NumOpts = {}): string {
  if (!Number.isFinite(n)) return '–';
  const { digits, maxDigits, compact } = opts;
  const f = new Intl.NumberFormat(locale(), {
    minimumFractionDigits: digits ?? 0,
    maximumFractionDigits: maxDigits ?? digits ?? (Math.abs(n) < 10 ? 2 : Math.abs(n) < 100 ? 1 : 0),
    notation: compact ? 'compact' : 'standard',
  });
  const out = f.format(n);
  // de-CH gives 109’400.5 – keep the apostrophe thousands but use the comma decimal that all texts use.
  return lang() === 'de' ? out.replace(/\.(?=\d)/g, ',') : out;
}

/** Scientific-ish formatting for huge/tiny numbers, e.g. "1,5 × 10^22". Returns HTML. */
export function fmtSci(n: number, digits = 2): string {
  if (n === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(n)));
  const m = n / 10 ** e;
  return `${fmtNum(m, { digits })} × 10<sup>${e}</sup>`;
}

/** Pluralised unit helper: de/en pair; count decides the plural. */
function unit(n: number, de: [string, string], en: [string, string]): string {
  const one = Math.abs(n - 1) < 1e-9;
  return lang() === 'de' ? (one ? de[0] : de[1]) : (one ? en[0] : en[1]);
}

/** Format a distance given in parsecs with a sensible unit (ly / Mio. ly / Mrd. ly). */
export function fmtDistancePc(pc: number): string {
  const ly = pc * LY_PER_PC;
  return fmtDistanceLy(ly);
}

export function fmtDistanceLy(ly: number): string {
  const de = lang() === 'de';
  if (!Number.isFinite(ly)) return '–';
  if (ly < 0.01) {
    const au = ly * KM_PER_LY / KM_PER_AU;
    if (au < 0.01) return `${fmtNum(au * KM_PER_AU, { digits: 0 })} km`;
    return `${fmtNum(au, { maxDigits: 2 })} ${de ? 'AE' : 'AU'}`;
  }
  if (ly < 1_000) return `${fmtNum(ly, { maxDigits: ly < 10 ? 2 : 1 })} ${unit(ly, ['Lichtjahr', 'Lichtjahre'], ['light-year', 'light-years'])}`;
  if (ly < 1_000_000) return `${fmtNum(ly, { digits: 0 })} ${de ? 'Lichtjahre' : 'light-years'}`;
  if (ly < 1_000_000_000) return `${fmtNum(ly / 1e6, { maxDigits: 2 })} ${de ? 'Mio. Lichtjahre' : 'million light-years'}`;
  return `${fmtNum(ly / 1e9, { maxDigits: 2 })} ${de ? 'Mrd. Lichtjahre' : 'billion light-years'}`;
}

/** Format kilometres with automatic scaling (km → Mio. km → AU). */
export function fmtKm(km: number): string {
  const de = lang() === 'de';
  if (km < 1e6) return `${fmtNum(km, { digits: 0 })} km`;
  if (km < 5e7) return `${fmtNum(km / 1e6, { maxDigits: 2 })} ${de ? 'Mio. km' : 'million km'}`;
  return `${fmtNum(km / KM_PER_AU, { maxDigits: 2 })} ${de ? 'AE' : 'AU'}`;
}

/** Format a light-travel time given in seconds, e.g. "8 Min 20 s", "4,2 Jahre". */
export function fmtLightTime(seconds: number): string {
  const de = lang() === 'de';
  if (seconds < 60) return `${fmtNum(seconds, { maxDigits: 1 })} s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60), s = Math.round(seconds % 60);
    return `${m} min ${s} s`;
  }
  if (seconds < SEC_PER_DAY) {
    const h = Math.floor(seconds / 3600), m = Math.round((seconds % 3600) / 60);
    return `${h} h ${m} min`;
  }
  if (seconds < SEC_PER_YEAR) return `${fmtNum(seconds / SEC_PER_DAY, { maxDigits: 1 })} ${de ? 'Tage' : 'days'}`;
  const y = seconds / SEC_PER_YEAR;
  return fmtYears(y);
}

/** Format a duration in years (e.g. ages, light-times): "4,2 Jahre", "13,8 Mrd. Jahre". */
export function fmtYears(y: number): string {
  const de = lang() === 'de';
  if (y < 1000) return `${fmtNum(y, { maxDigits: y < 10 ? 2 : 0 })} ${unit(y, ['Jahr', 'Jahre'], ['year', 'years'])}`;
  if (y < 1e6) return `${fmtNum(y, { digits: 0 })} ${de ? 'Jahre' : 'years'}`;
  if (y < 1e9) return `${fmtNum(y / 1e6, { maxDigits: 2 })} ${de ? 'Mio. Jahre' : 'million years'}`;
  return `${fmtNum(y / 1e9, { maxDigits: 2 })} ${de ? 'Mrd. Jahre' : 'billion years'}`;
}

/** Format a temperature in Kelvin, optionally with °C. */
export function fmtKelvin(k: number, withC = true): string {
  if (!Number.isFinite(k)) return '–';
  const s = `${fmtNum(k, { digits: 0 })} K`;
  return withC && k < 5000 ? `${s} (${fmtNum(k - 273.15, { digits: 0 })} °C)` : s;
}

/** Convert RA/Dec (degrees) + distance to equatorial cartesian (x→RA 0h, z→north). Same frame as the star catalog. */
export function raDecToXYZ(raDeg: number, decDeg: number, dist: number): [number, number, number] {
  const ra = (raDeg * Math.PI) / 180, dec = (decDeg * Math.PI) / 180;
  const c = Math.cos(dec);
  return [dist * c * Math.cos(ra), dist * c * Math.sin(ra), dist * Math.sin(dec)];
}

/** Absolute → apparent magnitude at a distance in parsecs. */
export function apparentMag(absMag: number, distPc: number): number {
  return absMag + 5 * (Math.log10(Math.max(distPc, 1e-9)) - 1);
}

/** Luminosity relative to the Sun from absolute magnitude. */
export function lumFromAbsMag(absMag: number): number {
  return 10 ** (0.4 * (4.83 - absMag));
}

export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
