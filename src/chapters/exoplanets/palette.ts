import type { Method, SizeClass } from './systems';

/**
 * Chart colours (dataviz reference palette, dark steps). Validated with the dataviz validator against
 * the panel surface #0a0f1c: adjacent order transit→RV→imaging→microlensing→other passes every gate
 * (worst adjacent CVD ΔE 13.0, normal-vision 27). No 5-hue set passes the all-pairs test that a
 * scatter needs, so the scatter adds a second channel: marker SHAPE per method + click-to-emphasise.
 */
export const METHOD_COLOR: Record<Method, string> = {
  transit: '#3987e5',      // blue  (slot 1)
  RV: '#d95926',           // orange (slot 2)
  imaging: '#9085e9',      // violet (slot 7)
  microlensing: '#008300', // green (slot 6)
  other: '#d55181',        // magenta (slot 5)
};

/** Ordinal ramp (blue, light→dark = small→large), validated with --ordinal; unknown = neutral. */
export const SIZE_COLOR: Record<SizeClass, string> = {
  earth: '#86b6ef',
  super: '#5598e7',
  neptune: '#2a78d6',
  jupiter: '#1c5cab',
  unknown: '#4a5266',
};

/** Expose the palette as CSS custom properties on the chapter root (used by style.css). */
export function applyPalette(root: HTMLElement): void {
  for (const k in METHOD_COLOR) root.style.setProperty(`--viz-${k}`, METHOD_COLOR[k as Method]);
  for (const k in SIZE_COLOR) root.style.setProperty(`--viz-size-${k}`, SIZE_COLOR[k as SizeClass]);
}

/** Marker shape per method (composite encoding hue × shape). Returns an SVG path `d` centred on (cx, cy). */
export function markerPath(m: Method, cx: number, cy: number, r: number): string {
  switch (m) {
    case 'transit': return `M${cx - r},${cy}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`;
    case 'RV': return `M${cx},${cy - r}L${cx + r},${cy}L${cx},${cy + r}L${cx - r},${cy}Z`;
    case 'imaging': return `M${cx},${cy - r}L${cx + r * 0.95},${cy + r * 0.62}L${cx - r * 0.95},${cy + r * 0.62}Z`;
    case 'microlensing': { const s = r * 0.86; return `M${cx - s},${cy - s}h${2 * s}v${2 * s}h${-2 * s}Z`; }
    case 'other': return `M${cx - r},${cy - r}L${cx + r},${cy + r}M${cx + r},${cy - r}L${cx - r},${cy + r}`;
  }
}

/** True for shapes drawn as strokes (no fill). */
export const STROKE_SHAPE: Record<Method, boolean> = { transit: false, RV: false, imaging: false, microlensing: false, other: true };

/** Small inline SVG icon for legends / chips. */
export function legendIcon(m: Method, color = METHOD_COLOR[m]): string {
  const d = markerPath(m, 6, 6, 4.2);
  return STROKE_SHAPE[m]
    ? `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.8"/></svg>`
    : `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="${d}" fill="${color}"/></svg>`;
}
