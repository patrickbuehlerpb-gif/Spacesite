import { SEC_PER_YEAR, fmtNum, fmtYears, fmtKm, clamp, lerp } from '../../core/units';
import { lang, locale } from '../../core/i18n';
import { T0, T0_YR, type TlEvent } from './events';

/**
 * Time model of the timeline chapter.
 *
 * Axis coordinate u ∈ [0, 1]. The past occupies [0, PAST_SHARE], the future (PAST_SHARE, 1].
 *  - Past: x = log10(t / (T₀ − t)), t = seconds since the Big Bang. For t ≪ T₀ this is log10(t) (the early
 *    universe spreads out decade by decade); for t → T₀ it becomes −log10(years before today), so recent history
 *    (dinosaurs, Homo sapiens, radio) gets its own room instead of collapsing onto the "today" pixel.
 *    Range: Planck time … 10 years before today.
 *  - Future: log10(years from now), 10 … 10¹⁰⁰ years.
 * Physics (approximations, anchored on measured values): T ∝ 1/a, radiation era a ∝ t^½ (T = 3 000 K at
 * recombination), matter era a ∝ t^⅔ (T = 2.725 K today), de Sitter future a ∝ e^{H∞ t}.
 */
export const PAST_SHARE = 0.6;
export const T_PLANCK = 5.39e-44;
export const T_INFLATION = 1e-32;
export const T_REC = 380_000 * SEC_PER_YEAR;
export const T_CMB = 2.725;
export const R_OBS_LY = 46.5e9;
export const M_PER_LY = 9.4607304725808e15;
const TAU_MIN_YR = 10;
const FUT_LOG_MIN = 1, FUT_LOG_MAX = 100;
const X_MIN = Math.log10(T_PLANCK / T0);
const X_MAX = Math.log10(T0_YR / TAU_MIN_YR);
/** e-folds per Gyr of the de Sitter future (H∞ = H₀·√Ω_Λ ≈ 58 km/s/Mpc) */
const H_FUTURE = 0.059;

export interface Moment {
  kind: 'past' | 'today' | 'future';
  u: number;
  /** seconds since the Big Bang (past/today) */
  t: number;
  /** years before today (past) */
  ago: number;
  /** years from now (future) */
  yrs: number;
}

export function uFromPast(t: number): number {
  const tt = clamp(t, T_PLANCK, T0 - TAU_MIN_YR * SEC_PER_YEAR);
  const x = Math.log10(tt / (T0 - tt));
  return ((x - X_MIN) / (X_MAX - X_MIN)) * PAST_SHARE;
}
export function uFromFuture(yrs: number): number {
  const y = clamp(Math.log10(Math.max(yrs, 1)), FUT_LOG_MIN, FUT_LOG_MAX);
  return PAST_SHARE + ((y - FUT_LOG_MIN) / (FUT_LOG_MAX - FUT_LOG_MIN)) * (1 - PAST_SHARE);
}
export function eventU(e: TlEvent): number {
  if (e.id === 'today') return PAST_SHARE;
  return e.kind === 'past' ? uFromPast(e.t) : uFromFuture(e.t);
}

export function moment(u: number): Moment {
  u = clamp(u, 0, 1);
  if (Math.abs(u - PAST_SHARE) < 1e-7) return { kind: 'today', u: PAST_SHARE, t: T0, ago: 0, yrs: 0 };
  if (u < PAST_SHARE) {
    const x = lerp(X_MIN, X_MAX, u / PAST_SHARE);
    const r = 10 ** x;
    const t = (T0 * r) / (1 + r);
    return { kind: 'past', u, t, ago: (T0 - t) / SEC_PER_YEAR, yrs: 0 };
  }
  const y = lerp(FUT_LOG_MIN, FUT_LOG_MAX, (u - PAST_SHARE) / (1 - PAST_SHARE));
  return { kind: 'future', u, t: T0, ago: 0, yrs: 10 ** y };
}

// Physics ------------------------------------------------------------------------------------------
/** Radiation temperature of the universe in kelvin (null where the model is meaningless). */
export function temperatureK(m: Moment): number | null {
  if (m.kind === 'future') return m.yrs > 1e12 ? null : T_CMB * Math.exp((-H_FUTURE * m.yrs) / 1e9);
  const t = m.kind === 'today' ? T0 : m.t;
  if (t < T_INFLATION) return null;
  return t < T_REC ? 3000 * Math.sqrt(T_REC / t) : T_CMB * (T0 / t) ** (2 / 3);
}
/** Radius (light-years) that today's observable universe had at that moment (∝ scale factor a = T₀/T). */
export function radiusLy(m: Moment): number | null {
  if (m.kind === 'future') return m.yrs > 2e11 ? null : R_OBS_LY * Math.exp((H_FUTURE * m.yrs) / 1e9);
  const T = temperatureK(m);
  return T == null ? null : (R_OBS_LY * T_CMB) / T;
}

// Cosmic calendar ------------------------------------------------------------------------------------
export interface CalDate { month: number; day: number; hour: number; minute: number; year: 1 | 2 }
const MONTH_LEN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/** 13.8 Gyr = one year: Big Bang = Jan 1 00:00, today = Dec 31 24:00. Future < 13.8 Gyr maps into a second year. */
export function cosmicCalendar(m: Moment): CalDate | null {
  if (m.kind === 'today') return { month: 11, day: 31, hour: 24, minute: 0, year: 1 };
  let f: number;
  if (m.kind === 'past') f = m.t / T0;
  else { if (m.yrs >= T0_YR) return null; f = 1 + m.yrs / T0_YR; }
  const days = f * 365;
  const year: 1 | 2 = days >= 365 ? 2 : 1;
  const d = days - (year - 1) * 365;
  const dayIdx = Math.min(364, Math.floor(d));
  const frac = d - Math.floor(d);
  let month = 0, rem = dayIdx;
  while (rem >= MONTH_LEN[month]) { rem -= MONTH_LEN[month]; month++; }
  const minutes = Math.floor(frac * 1440);
  return { month, day: rem + 1, hour: Math.floor(minutes / 60), minute: minutes % 60, year };
}
export function fmtCalDate(c: CalDate): string {
  return new Date(2001, c.month, c.day).toLocaleDateString(locale(), { day: 'numeric', month: 'long' });
}
export function fmtCalTime(c: CalDate): string {
  return `${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`;
}

// Formatting -----------------------------------------------------------------------------------------
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
export function sup(n: number): string {
  let o = n < 0 ? '⁻' : '';
  for (const c of String(Math.round(Math.abs(n)))) o += SUP[Number(c)];
  return o;
}
/** "10⁻³²", "3,2 × 10⁻⁵" – plain text (works inside SVG and stat tiles). */
export function pow10(v: number, digits = 1): string {
  if (v === 0) return '0';
  let e = Math.floor(Math.log10(v));
  let m = v / 10 ** e;
  if (Number(m.toFixed(digits)) >= 10) { m = 1; e += 1; }
  return Math.abs(m - 1) < 0.05 ? `10${sup(e)}` : `${fmtNum(m, { maxDigits: digits })} × 10${sup(e)}`;
}

/** Years as a readable quantity: "380’000 Jahre", "13,8 Mrd. Jahre", "10¹⁵ Jahre". */
export function fmtYearsBig(y: number): string {
  if (y < 1e12) return fmtYears(y);
  return `${pow10(y)} ${lang() === 'de' ? 'Jahre' : 'years'}`;
}
/** Seconds since the Big Bang as a readable quantity. */
export function fmtSince(t: number): string {
  const de = lang() === 'de';
  if (t < 1e-3) return `${pow10(t)} s`;
  if (t < 60) return `${fmtNum(t, { maxDigits: t < 10 ? 1 : 0 })} s`;
  if (t < 3600) { const v = t / 60; return `${fmtNum(v, { maxDigits: v < 10 ? 1 : 0 })} ${de ? (Math.abs(v - 1) < 0.05 ? 'Minute' : 'Minuten') : (Math.abs(v - 1) < 0.05 ? 'minute' : 'minutes')}`; }
  if (t < 86_400) { const v = t / 3600; return `${fmtNum(v, { maxDigits: 1 })} ${de ? 'Stunden' : 'hours'}`; }
  if (t < SEC_PER_YEAR) { const v = t / 86_400; return `${fmtNum(v, { maxDigits: v < 10 ? 1 : 0 })} ${de ? 'Tage' : 'days'}`; }
  return fmtYearsBig(t / SEC_PER_YEAR);
}
/** "vor 66 Mio. Jahren" / "66 million years ago" */
export function fmtAgo(years: number): string {
  const s = fmtYearsBig(years);
  return lang() === 'de' ? `vor ${s.replace(/Jahre$/, 'Jahren')}` : `${s} ago`;
}
/** "in 4,5 Mrd. Jahren" / "in 4.5 billion years" */
export function fmtIn(years: number): string {
  const s = fmtYearsBig(years);
  return lang() === 'de' ? `in ${s.replace(/Jahre$/, 'Jahren')}` : `in ${s}`;
}
export function fmtTemp(k: number): string {
  if (k >= 1e6) return `${pow10(k)} K`;
  if (k >= 100) return `${fmtNum(k, { digits: 0 })} K`;
  if (k >= 1) return `${fmtNum(k, { maxDigits: k < 10 ? 3 : 1 })} K`;
  if (k >= 1e-3) return `${fmtNum(k, { maxDigits: 3 })} K`;
  return `${pow10(k)} K`;
}
/** Radius in light-years with automatic unit (m … billion ly). */
export function fmtRadius(ly: number): string {
  const de = lang() === 'de';
  if (ly >= 1e12) return `${fmtNum(ly / 1e12, { maxDigits: 1 })} ${de ? 'Bio. Lj' : 'trillion ly'}`;
  if (ly >= 1e9) return `${fmtNum(ly / 1e9, { maxDigits: 1 })} ${de ? 'Mrd. Lj' : 'billion ly'}`;
  if (ly >= 1e6) return `${fmtNum(ly / 1e6, { maxDigits: 1 })} ${de ? 'Mio. Lj' : 'million ly'}`;
  if (ly >= 0.05) return `${fmtNum(ly, { maxDigits: ly < 10 ? 2 : ly < 100 ? 1 : 0 })} ${de ? 'Lj' : 'ly'}`;
  const m = ly * M_PER_LY;
  if (m >= 1e3) return fmtKm(m / 1e3);                       // km → Mio. km → AE
  if (m >= 1) return `${fmtNum(m, { maxDigits: 1 })} m`;
  if (m >= 1e-2) return `${fmtNum(m * 100, { maxDigits: 1 })} cm`;
  if (m >= 1e-3) return `${fmtNum(m * 1000, { maxDigits: 1 })} mm`;
  return `${pow10(m)} m`;
}

/** Short label for an event's own time (drawer list, card kicker, hover). */
export function eventWhen(e: TlEvent, short = false): string {
  const de = lang() === 'de';
  if (e.id === 'today') return de ? 'Heute' : 'Today';
  if (e.id === 'bigbang') return short ? 't = 0' : de ? 't = 0 · Planck-Zeit 5,4 × 10⁻⁴⁴ s' : 't = 0 · Planck time 5.4 × 10⁻⁴⁴ s';
  if (e.kind === 'future') return short ? fmtYearsBig(e.t) : fmtIn(e.t);
  if (e.t < T0 / 2) { const s = fmtSince(e.t); return short ? s : de ? `${s} nach dem Urknall` : `${s} after the Big Bang`; }
  const ago = (T0 - e.t) / SEC_PER_YEAR;
  return short ? fmtYearsBig(ago) : fmtAgo(ago);
}
