import { t } from '../../core/i18n';
import { fmtNum } from '../../core/units';
import { kelvinToCss } from '../../core/color';
import { estimateRadiusE, type HostSystem } from './systems';

/**
 * Inline SVG of a planetary system for the info card: star at the left (size ∝ log R★, colour from Teff),
 * planets as circles (size ∝ log radius) placed on a logarithmic distance axis, the optimistic habitable
 * zone as a green band and the "Earth equivalent" tick at 1 AU·√L. Returns null when nothing can be placed.
 */
export interface DiagramResult { svg: string; usedEstimate: boolean; usedDerived: boolean }

const W = 560, H = 150, X0 = 84, X1 = 546, YP = 76, YAXIS = 118;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function systemDiagram(sys: HostSystem): DiagramResult | null {
  const placed = sys.planets.filter((v) => v.sma != null && v.sma > 0);
  const vals = placed.map((v) => v.sma as number);
  if (sys.hzIn != null && sys.hzOut != null) vals.push(sys.hzIn, sys.hzOut);
  if (!vals.length) return null;
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (vals.length === 1) { lo *= 0.2; hi *= 5; } else { lo *= 0.55; hi *= 1.8; }
  const llo = Math.log10(lo), lhi = Math.log10(hi);
  const x = (a: number) => X0 + ((Math.log10(a) - llo) / (lhi - llo)) * (X1 - X0);

  const parts: string[] = [];
  // habitable zone band
  if (sys.hzIn != null && sys.hzOut != null) {
    const a = x(sys.hzIn), b = x(sys.hzOut);
    parts.push(`<rect class="hzband" x="${a.toFixed(1)}" y="40" width="${Math.max(2, b - a).toFixed(1)}" height="72" rx="3"/>`);
    parts.push(`<text class="hzlab" x="${a.toFixed(1)}" y="34">${esc(t('exoplanets.hzBand'))}</text>`);
  }
  // Earth-equivalent tick (1 AU · √L)
  if (sys.lum != null) {
    const e = x(Math.sqrt(sys.lum));
    parts.push(`<line class="earth" x1="${e.toFixed(1)}" y1="44" x2="${e.toFixed(1)}" y2="${YAXIS}"/>`);
    parts.push(`<circle cx="${e.toFixed(1)}" cy="${YAXIS}" r="4" fill="none" stroke="var(--gold)" stroke-width="1"/><line x1="${(e - 4).toFixed(1)}" y1="${YAXIS}" x2="${(e + 4).toFixed(1)}" y2="${YAXIS}" stroke="var(--gold)" stroke-width="1"/><line x1="${e.toFixed(1)}" y1="${YAXIS - 4}" x2="${e.toFixed(1)}" y2="${YAXIS + 4}" stroke="var(--gold)" stroke-width="1"/>`);
    parts.push(`<text class="earthlab" x="${e.toFixed(1)}" y="${YAXIS + 16}">⊕</text>`);
  }
  // axis + decade ticks
  parts.push(`<line class="axis" x1="${X0 - 10}" y1="${YAXIS}" x2="${X1 + 4}" y2="${YAXIS}"/>`);
  const k0 = Math.ceil(llo), k1 = Math.floor(lhi);
  const step = k1 - k0 > 5 ? 2 : 1;
  for (let k = k0; k <= k1; k += step) {
    const tx = x(10 ** k);
    parts.push(`<line class="tick" x1="${tx.toFixed(1)}" y1="${YAXIS}" x2="${tx.toFixed(1)}" y2="${YAXIS + 5}"/>`);
    parts.push(`<text class="ticklab" x="${tx.toFixed(1)}" y="${YAXIS + 18}">${fmtNum(10 ** k, { maxDigits: Math.max(0, -k) })} ${t('exoplanets.au')}</text>`);
  }
  // star
  const rs = sys.radius != null && sys.radius > 0 ? Math.min(26, Math.max(5, 12 + 8 * Math.log10(sys.radius))) : 9;
  const col = sys.teff != null && sys.teff > 1000 ? kelvinToCss(sys.teff) : '#c9cfdb';
  parts.push(`<defs><radialGradient id="xo-star-glow"><stop offset="0" stop-color="${col}" stop-opacity="0.55"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient></defs>`);
  parts.push(`<circle cx="36" cy="${YP}" r="${(rs * 2.2).toFixed(1)}" fill="url(#xo-star-glow)"/>`);
  parts.push(`<circle cx="36" cy="${YP}" r="${rs.toFixed(1)}" fill="${col}"/>`);
  // planets (sorted by distance) with label collision avoidance
  let usedEstimate = false, usedDerived = false;
  let lastBelow = -Infinity, lastAbove = -Infinity;
  for (const v of placed) {
    const px = x(v.sma as number);
    let rE = v.p.radiusE, est = false;
    if (rE == null || rE <= 0) { est = true; rE = v.p.massE != null && v.p.massE > 0 ? estimateRadiusE(v.p.massE) : 1; usedEstimate = usedEstimate || v.p.massE != null; }
    if (v.smaDerived) usedDerived = true;
    const r = Math.min(9, Math.max(2, 2 + 3.2 * Math.log10(1 + rE)));
    const cls = `pl${v.p.hz ? ' hz' : ''}${est ? ' est' : ''}`;
    parts.push(`<circle class="${cls}" cx="${px.toFixed(1)}" cy="${YP}" r="${r.toFixed(1)}"><title>${esc(v.p.name)}</title></circle>`);
    let name = v.p.name.startsWith(sys.label) ? v.p.name.slice(sys.label.length).trim() : v.p.name;
    if (!name) name = v.p.name;
    if (name.length > 8) name = name.slice(0, 7) + '…';
    const width = name.length * 7 + 6;
    if (px - lastBelow > width) { parts.push(`<text class="pn" x="${px.toFixed(1)}" y="${(YP + r + 13).toFixed(1)}">${esc(name)}</text>`); lastBelow = px; }
    else if (px - lastAbove > width) { parts.push(`<text class="pn" x="${px.toFixed(1)}" y="${(YP - r - 6).toFixed(1)}">${esc(name)}</text>`); lastAbove = px; }
  }
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(sys.label)}">${parts.join('')}</svg>`;
  return { svg, usedEstimate, usedDerived };
}
