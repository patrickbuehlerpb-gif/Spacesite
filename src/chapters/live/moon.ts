/**
 * Moon helpers: phase names, next new/full moon search, and an SVG drawing of today's Moon.
 * The disc is the real near side (orthographic projection of public/textures/moon.jpg, north up,
 * lunar east = right, i.e. the view from the northern hemisphere); the shadow is an SVG path whose
 * terminator ellipse follows the illuminated fraction. Waxing → lit on the right, waning → left.
 */
import { moonPhase } from '../../data/solarsystem';
import { textureUrl } from '../../core/Loader';

export type MoonPhaseKey = 'new' | 'waxCrescent' | 'firstQ' | 'waxGibbous' | 'full' | 'wanGibbous' | 'lastQ' | 'wanCrescent';

export function moonPhaseKey(phase: number): MoonPhaseKey {
  if (phase < 0.03 || phase > 0.97) return 'new';
  if (phase < 0.22) return 'waxCrescent';
  if (phase < 0.28) return 'firstQ';
  if (phase < 0.47) return 'waxGibbous';
  if (phase < 0.53) return 'full';
  if (phase < 0.72) return 'wanGibbous';
  if (phase < 0.78) return 'lastQ';
  return 'wanCrescent';
}

/** JD of the next new (phase → 0) or full (phase → 0.5) moon after jd0. Scans 6-h steps, then bisects. */
export function nextMoonEvent(jd0: number, which: 'new' | 'full'): number {
  // f crosses zero upward at the event
  const f = (jd: number) => {
    const p = moonPhase(jd).phase;
    return which === 'full' ? p - 0.5 : ((p + 0.5) % 1) - 0.5;
  };
  const step = 0.25;
  let a = jd0, fa = f(a);
  for (let i = 0; i < 140; i++) {
    const b = a + step, fb = f(b);
    if (fa < 0 && fb >= 0 && fb - fa < 0.5) {
      let lo = a, hi = b;
      for (let k = 0; k < 24; k++) { const mid = (lo + hi) / 2; if (f(mid) < 0) lo = mid; else hi = mid; }
      return (lo + hi) / 2;
    }
    a = b; fa = fb;
  }
  return jd0 + 29.53;
}

/** SVG path (centre 0,0 radius r) of the dark part of the disc for a phase 0..1. */
export function moonShadowPath(phase: number, r: number): string {
  const k = Math.cos(2 * Math.PI * phase); // 1 new, 0 quarters, −1 full
  const rx = Math.max(0.001, Math.abs(k) * r);
  const waxing = phase < 0.5;
  if (waxing) {
    // dark on the left: top → left → bottom, back along the terminator
    return `M0,${-r} A${r},${r} 0 0 0 0,${r} A${rx},${r} 0 0 ${k > 0 ? 0 : 1} 0,${-r} Z`;
  }
  // dark on the right: top → right → bottom, back along the terminator
  return `M0,${-r} A${r},${r} 0 0 1 0,${r} A${rx},${r} 0 0 ${k > 0 ? 1 : 0} 0,${-r} Z`;
}

let discPromise: Promise<string> | null = null;
/** Data-URL of the near side rendered orthographically (size px). Cached per page. */
export function moonDiscDataUrl(size = 256): Promise<string> {
  if (discPromise) return discPromise;
  discPromise = new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const sw = img.naturalWidth, sh = img.naturalHeight;
        const src = document.createElement('canvas');
        src.width = sw; src.height = sh;
        const sg = src.getContext('2d', { willReadFrequently: true })!;
        sg.drawImage(img, 0, 0);
        const data = sg.getImageData(0, 0, sw, sh).data;
        const out = document.createElement('canvas');
        out.width = out.height = size;
        const og = out.getContext('2d')!;
        const id = og.createImageData(size, size);
        const px = id.data;
        const R = size / 2;
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
          const nx = (x + 0.5 - R) / R, ny = (R - (y + 0.5)) / R;
          const rr = nx * nx + ny * ny;
          if (rr > 1) continue;
          const nz = Math.sqrt(1 - rr);
          const lat = Math.asin(ny), lon = Math.atan2(nx, nz);
          const u = lon / (2 * Math.PI) + 0.5, v = 0.5 - lat / Math.PI;
          const sx = Math.min(sw - 1, Math.max(0, Math.floor(u * sw))), sy = Math.min(sh - 1, Math.max(0, Math.floor(v * sh)));
          const si = (sy * sw + sx) * 4, oi = (y * size + x) * 4;
          // limb darkening + edge anti-aliasing
          const edge = Math.min(1, (1 - Math.sqrt(rr)) * R * 1.5);
          const shade = 0.72 + 0.28 * nz;
          px[oi] = data[si] * shade; px[oi + 1] = data[si + 1] * shade; px[oi + 2] = data[si + 2] * shade; px[oi + 3] = 255 * edge;
        }
        og.putImageData(id, 0, 0);
        resolve(out.toDataURL('image/png'));
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error('moon texture'));
    img.src = textureUrl('moon.jpg');
  });
  discPromise.catch(() => (discPromise = null));
  return discPromise;
}

/** Complete SVG markup of the Moon for a phase (0..1). `disc` = data URL from moonDiscDataUrl (or null → flat disc). */
export function moonSvg(phase: number, disc: string | null, size = 180): string {
  const r = 100;
  const shadow = moonShadowPath(phase, r);
  const fill = disc ? `<image href="${disc}" x="-100" y="-100" width="200" height="200" clip-path="url(#mclip)"/>` : `<circle r="${r}" fill="#cfcac0"/>`;
  return `<svg class="moon-svg" viewBox="-104 -104 208 208" width="${size}" height="${size}" role="img" aria-hidden="true">
    <defs>
      <clipPath id="mclip"><circle r="${r}"/></clipPath>
      <filter id="mblur" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.6"/></filter>
      <radialGradient id="mglow" cx="50%" cy="50%" r="50%"><stop offset="80%" stop-color="rgba(255,240,210,0)"/><stop offset="100%" stop-color="rgba(255,240,210,0.25)"/></radialGradient>
    </defs>
    <circle r="${r + 3}" fill="url(#mglow)"/>
    ${fill}
    <g clip-path="url(#mclip)"><path d="${shadow}" fill="rgba(5,7,13,0.92)" filter="url(#mblur)"/></g>
    <circle r="${r}" fill="none" stroke="rgba(255,255,255,0.08)"/>
  </svg>`;
}
