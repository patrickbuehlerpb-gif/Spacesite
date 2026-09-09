import * as THREE from 'three';
import { raDecToXYZ } from '../../core/units';
import type { StarCatalog, Constellation } from '../../data/stars';
import type { Landmark } from './landmarks';

/**
 * Static scene objects of the stars chapter, all in catalogue coordinates (equatorial J2000, parsecs, z = north).
 * The chapter puts them into a group rotated −90° about X so that north ends up +Y.
 */

/** Read a colour token from tokens.css (never hardcode colours in chapter code). */
export function cssColor(token: string, fallback: string): THREE.Color {
  const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return new THREE.Color(v || fallback);
}

let glow: THREE.Texture | null = null;
/** Very soft radial glow for nebulae / clusters / the galactic core (procedural, no asset). */
export function glowTexture(): THREE.Texture {
  if (glow) return glow;
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.14)');
  grad.addColorStop(0.8, 'rgba(255,255,255,0.03)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  glow = new THREE.CanvasTexture(c);
  glow.colorSpace = THREE.SRGBColorSpace;
  return glow;
}

/** All constellation figures as ONE LineSegments (679 segments), cyan at 25 % opacity. */
export function buildConstellationLines(cat: StarCatalog, cons: Constellation[], color: THREE.Color): THREE.LineSegments {
  let n = 0;
  for (const c of cons) for (const l of c.lines) n += Math.max(0, l.length - 1);
  const arr = new Float32Array(n * 6);
  let o = 0;
  const p = cat.pos;
  for (const c of cons) {
    for (const l of c.lines) {
      for (let k = 0; k + 1 < l.length; k++) {
        const a = l[k], b = l[k + 1];
        if (a >= cat.count || b >= cat.count) continue;
        arr[o++] = p[a * 3]; arr[o++] = p[a * 3 + 1]; arr[o++] = p[a * 3 + 2];
        arr[o++] = p[b * 3]; arr[o++] = p[b * 3 + 1]; arr[o++] = p[b * 3 + 2];
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(o < arr.length ? arr.subarray(0, o) : arr, 3));
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false, depthTest: false });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.renderOrder = -1;
  return lines;
}

/**
 * Anchor for a constellation name: the mean direction of its member stars, placed at their median distance
 * (clamped) so the label sits inside the figure as seen from the Sun.
 */
export function constellationAnchor(cat: StarCatalog, con: Constellation): [number, number, number] {
  const seen = new Set<number>();
  let x = 0, y = 0, z = 0;
  const dists: number[] = [];
  for (const l of con.lines) for (const i of l) {
    if (i >= cat.count || seen.has(i)) continue;
    seen.add(i);
    const d = cat.dist[i] || 1;
    x += cat.pos[i * 3] / d; y += cat.pos[i * 3 + 1] / d; z += cat.pos[i * 3 + 2] / d;
    dists.push(d);
  }
  const len = Math.hypot(x, y, z) || 1;
  dists.sort((a, b) => a - b);
  const med = dists.length ? dists[dists.length >> 1] : 100;
  const r = Math.min(500, Math.max(20, med));
  return [(x / len) * r, (y / len) * r, (z / len) * r];
}

/** Faint scale rings around the Sun in the catalogue's XY plane (the celestial equator plane). */
export function buildRings(radiiPc: number[], color: THREE.Color, segments = 240): THREE.LineSegments {
  const arr = new Float32Array(radiiPc.length * segments * 6);
  let o = 0;
  for (const r of radiiPc) {
    for (let k = 0; k < segments; k++) {
      const a0 = (k / segments) * Math.PI * 2, a1 = ((k + 1) / segments) * Math.PI * 2;
      arr[o++] = r * Math.cos(a0); arr[o++] = r * Math.sin(a0); arr[o++] = 0;
      arr[o++] = r * Math.cos(a1); arr[o++] = r * Math.sin(a1); arr[o++] = 0;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, depthTest: false });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  return lines;
}

/** Soft additive sprite for a landmark (size in parsecs → scales with distance like a real object). */
export function createLandmarkSprite(lm: Landmark, color: THREE.Color): THREE.Sprite {
  const opacity = lm.kind === 'globular' ? 0.7 : lm.kind === 'nebula' ? 0.6 : lm.kind === 'core' ? 0.5 : lm.kind === 'remnant' ? 0.5 : 0.32;
  const mat = new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
  const s = new THREE.Sprite(mat);
  const [x, y, z] = raDecToXYZ(lm.ra, lm.dec, lm.distPc);
  s.position.set(x, y, z);
  s.scale.set(lm.size, lm.size, 1);
  s.renderOrder = -2;
  return s;
}
