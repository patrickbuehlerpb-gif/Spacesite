/** Star colour from B-V colour index (approximation after Mitchell Charity / Dan Bruton). Returns sRGB 0..1. */
export function bvToRgb(bv: number): [number, number, number] {
  bv = Math.max(-0.4, Math.min(2.0, bv));
  let r = 0, g = 0, b = 0, t = 0;
  if (bv < 0) { t = (bv + 0.4) / 0.4; r = 0.61 + 0.11 * t + 0.1 * t * t; }
  else if (bv < 0.4) { t = bv / 0.4; r = 0.83 + 0.17 * t; }
  else r = 1;
  if (bv < 0) { t = (bv + 0.4) / 0.4; g = 0.70 + 0.07 * t + 0.1 * t * t; }
  else if (bv < 0.4) { t = bv / 0.4; g = 0.87 + 0.11 * t; }
  else if (bv < 1.6) { t = (bv - 0.4) / 1.2; g = 0.98 - 0.16 * t; }
  else { t = (bv - 1.6) / 0.4; g = 0.82 - 0.5 * t * t; }
  if (bv < 0.4) b = 1;
  else if (bv < 1.5) { t = (bv - 0.4) / 1.1; b = 1 - 0.47 * t + 0.1 * t * t; }
  else if (bv < 1.94) { t = (bv - 1.5) / 0.44; b = 0.63 - 0.6 * t * t; }
  else b = 0;
  return [r, g, b];
}

/** Approximate B-V from effective temperature (Ballesteros' formula inverted numerically). */
export function teffToBv(teff: number): number {
  // Ballesteros 2012: T = 4600 * (1/(0.92 bv + 1.7) + 1/(0.92 bv + 0.62))
  let lo = -0.4, hi = 2.0;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const T = 4600 * (1 / (0.92 * mid + 1.7) + 1 / (0.92 * mid + 0.62));
    if (T > teff) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Blackbody-ish colour from temperature (K) for planets/stars UI swatches. Returns CSS string. */
export function kelvinToCss(k: number): string {
  const [r, g, b] = bvToRgb(teffToBv(k));
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

/** Rough spectral class letter from B-V. */
export function spectralClassFromBv(bv: number): string {
  if (bv < -0.3) return 'O';
  if (bv < 0.0) return 'B';
  if (bv < 0.3) return 'A';
  if (bv < 0.58) return 'F';
  if (bv < 0.81) return 'G';
  if (bv < 1.4) return 'K';
  return 'M';
}
