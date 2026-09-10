import * as THREE from 'three';
import { fmtNum, KM_PER_AU, KM_PER_LY, LY_PER_PC, smoothstep } from '../../core/units';
import { lang } from '../../core/i18n';

/**
 * Shared building blocks of the zoom chapter: unit constants, seeded random numbers, design-token colours,
 * procedural sprite textures, a generic "world size with pixel floor" point-cloud shader, fresnel shells,
 * wire rings and a Voronoi-edge sampler for schematic cosmic-web filaments.
 */

export const DEG = Math.PI / 180;
export const M_PER_AU = KM_PER_AU * 1e3;
export const M_PER_LY = KM_PER_LY * 1e3;
export const M_PER_PC = M_PER_LY * LY_PER_PC;          // 3.0857e16
export const M_PER_KPC = M_PER_PC * 1e3;
export const M_PER_MPC = M_PER_PC * 1e6;
export const C_M_S = 299_792_458;

export type RGB = [number, number, number];

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
/** Box–Muller normal deviate from a uniform generator. */
export function gaussian(rand: () => number): () => number {
  return () => Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-9))) * Math.cos(2 * Math.PI * rand());
}

/** Design token (e.g. '--gold') as raw sRGB floats for shader uniforms (no colour management). */
export function tokenRgb(name: string, fallback: string): RGB {
  let v = '';
  try { v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); } catch { /* ignore */ }
  const h = (v || fallback).replace('#', '');
  if (h.length === 3) return [parseInt(h[0] + h[0], 16) / 255, parseInt(h[1] + h[1], 16) / 255, parseInt(h[2] + h[2], 16) / 255];
  if (h.length === 6) return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
  return [1, 1, 1];
}
export function hexRgb(hex: number): RGB { return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]; }
export function mixRgb(a: RGB, b: RGB, k: number): RGB { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
export function scaleRgb(a: RGB, k: number): RGB { return [a[0] * k, a[1] * k, a[2] * k]; }

/** Layer/object fade window helper: 1 inside [lo+w, hi−w], smooth edges. */
export function window01(x: number, lo: number, hi: number, w = 0.5): number {
  return smoothstep(lo, lo + w, x) * (1 - smoothstep(hi - w, hi, x));
}

// ---------------------------------------------------------------------------------------------
// Procedural textures (cached)
// ---------------------------------------------------------------------------------------------
/** Point sprites are sampled at 1–10 px: skip the mip chain (broken on some software GL stacks, unnecessary for a smooth blob). */
function noMips(t: THREE.Texture): void { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; }
let glowTex: THREE.Texture | null = null;
/** Soft radial glow (for point sprites and glows). */
export function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const s = 64, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(255,255,255,0.8)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.25)');
  grad.addColorStop(0.75, 'rgba(255,255,255,0.05)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, s, s);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  noMips(glowTex);
  return glowTex;
}

let galTex: THREE.Texture | null = null;
/** Elliptical galaxy glow with a bright core (sprites for LMC/SMC/M31/M33). */
export function galaxyTexture(): THREE.Texture {
  if (galTex) return galTex;
  const s = 128, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d')!;
  g.translate(s / 2, s / 2); g.scale(1, 0.55);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, s / 2);
  grad.addColorStop(0, 'rgba(255,250,235,1)');
  grad.addColorStop(0.1, 'rgba(255,240,215,0.85)');
  grad.addColorStop(0.35, 'rgba(210,205,255,0.35)');
  grad.addColorStop(0.7, 'rgba(180,170,255,0.08)');
  grad.addColorStop(1, 'rgba(160,150,255,0)');
  g.fillStyle = grad; g.fillRect(-s / 2, -s / 2, s, s);
  galTex = new THREE.CanvasTexture(c);
  galTex.colorSpace = THREE.SRGBColorSpace;
  noMips(galTex);
  return galTex;
}

// ---------------------------------------------------------------------------------------------
// Generic point cloud: per-point world size (0 = fixed pixel size), colour, brightness, pixel floor.
// ---------------------------------------------------------------------------------------------
const CLOUD_VERT = /* glsl */ `
attribute float aSize; attribute vec3 aColor; attribute float aB; attribute float aMin;
uniform float uProj, uPR, uAlpha, uMaxPx, uPx;
varying vec3 vColor; varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dist = max(-mv.z, 1e-9);
  float px = aSize > 0.0 ? aSize * uProj / dist : uPx;
  float p = clamp(px, aMin, uMaxPx);
  vAlpha = uAlpha * aB * step(0.0, -mv.z);
  vColor = aColor;
  gl_PointSize = p * uPR;
  gl_Position = projectionMatrix * mv;
}`;
const CLOUD_FRAG = /* glsl */ `
uniform sampler2D uTex;
varying vec3 vColor; varying float vAlpha;
void main() {
  vec4 t = texture2D(uTex, gl_PointCoord);
  gl_FragColor = vec4(vColor * t.a, t.a * vAlpha);
}`;

export interface CloudUniforms { uProj: { value: number }; uPR: { value: number }; uAlpha: { value: number }; uMaxPx: { value: number }; uPx: { value: number }; uTex: { value: THREE.Texture } }
export interface Cloud {
  points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  uniforms: CloudUniforms;
  positions: Float32Array;
  /** call after editing `positions` */
  commit(): void;
  setAlpha(k: number): void;
  setProj(height: number, fovDeg: number): void;
}
export interface CloudOpts {
  positions: Float32Array;
  /** world diameter per point (0 → fixed pixel size `px`) */
  sizes?: Float32Array | number;
  colors?: Float32Array | RGB;
  /** brightness 0..1 per point */
  bright?: Float32Array | number;
  /** pixel floor per point */
  minPx?: Float32Array | number;
  maxPx?: number;
  px?: number;
  alpha?: number;
  blending?: THREE.Blending;
  depthTest?: boolean;
  texture?: THREE.Texture;
}

function fill1(n: number, v: Float32Array | number | undefined, def: number): Float32Array {
  if (v instanceof Float32Array) return v;
  const a = new Float32Array(n); a.fill(v ?? def); return a;
}
function fill3(n: number, v: Float32Array | RGB | undefined): Float32Array {
  if (v instanceof Float32Array) return v;
  const a = new Float32Array(n * 3);
  const c = v ?? [1, 1, 1];
  for (let i = 0; i < n; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; }
  return a;
}

export function createCloud(o: CloudOpts): Cloud {
  const n = o.positions.length / 3;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(o.positions, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(fill1(n, o.sizes, 0), 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(fill3(n, o.colors), 3));
  geo.setAttribute('aB', new THREE.BufferAttribute(fill1(n, o.bright, 1), 1));
  geo.setAttribute('aMin', new THREE.BufferAttribute(fill1(n, o.minPx, 1), 1));
  geo.computeBoundingSphere();
  const alpha = o.alpha ?? 1;
  const uniforms: CloudUniforms = {
    uProj: { value: 860 }, uPR: { value: Math.min(window.devicePixelRatio || 1, 2) }, uAlpha: { value: alpha },
    uMaxPx: { value: o.maxPx ?? 64 }, uPx: { value: o.px ?? 2 }, uTex: { value: o.texture ?? glowTexture() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>, vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG,
    transparent: true, depthWrite: false, depthTest: o.depthTest ?? false, blending: o.blending ?? THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return {
    points, uniforms, positions: o.positions,
    commit() { geo.attributes.position.needsUpdate = true; },
    setAlpha(k) { uniforms.uAlpha.value = alpha * k; },
    setProj(h, fov) { uniforms.uProj.value = h / 2 / Math.tan((fov * DEG) / 2); },
  };
}

// ---------------------------------------------------------------------------------------------
// Fresnel shell (heliopause, radio bubble): rim glow from outside, faint haze from inside.
// ---------------------------------------------------------------------------------------------
const SHELL_VERT = /* glsl */ `
varying vec3 vN; varying vec3 vP;
void main() { vN = normalize(mat3(modelMatrix) * normal); vec4 wp = modelMatrix * vec4(position, 1.0); vP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const SHELL_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uAlpha, uPower; uniform vec3 uCam;
varying vec3 vN; varying vec3 vP;
void main() {
  vec3 v = normalize(uCam - vP);
  float f = pow(1.0 - abs(dot(normalize(vN), v)), uPower);
  float a = uAlpha * (0.08 + 0.92 * f);
  gl_FragColor = vec4(uColor * a, a);
}`;
export interface Shell { mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>; setAlpha(k: number): void }
export function createShell(radius: number, color: RGB, alpha: number, power = 2.5, segments = 64): Shell {
  const uniforms = { uColor: { value: new THREE.Vector3(...color) }, uAlpha: { value: alpha }, uPower: { value: power }, uCam: { value: new THREE.Vector3() } };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: SHELL_VERT, fragmentShader: SHELL_FRAG, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, segments, segments / 2), mat);
  mesh.frustumCulled = false;
  mesh.onBeforeRender = (_r, _s, cam) => { uniforms.uCam.value.copy(cam.position); };
  return { mesh, setAlpha(k) { uniforms.uAlpha.value = alpha * k; } };
}

// ---------------------------------------------------------------------------------------------
// Wire rings: several circles in ONE LineSegments (orbits, shells, light-time rings)
// ---------------------------------------------------------------------------------------------
export interface RingSpec { radius: number; quaternion?: THREE.Quaternion; center?: THREE.Vector3; color?: RGB; dashed?: boolean }
export function createRings(specs: RingSpec[], color: RGB, opacity: number, segments = 128): THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> {
  const pos: number[] = [], col: number[] = [];
  const v = new THREE.Vector3();
  for (const s of specs) {
    const c = s.color ?? color;
    for (let k = 0; k < segments; k++) {
      if (s.dashed && k % 3 === 2) continue;
      for (const a of [(k / segments) * Math.PI * 2, ((k + 1) / segments) * Math.PI * 2]) {
        v.set(Math.cos(a) * s.radius, Math.sin(a) * s.radius, 0);
        if (s.quaternion) v.applyQuaternion(s.quaternion);
        if (s.center) v.add(s.center);
        pos.push(v.x, v.y, v.z); col.push(c[0], c[1], c[2]);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  return lines;
}

/** Quaternion that maps local +Z to the given world direction (ring plane normal). */
export function quatFromNormal(n: THREE.Vector3): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n.clone().normalize());
}
/** Orbit-plane quaternion from inclination and node (both radians) relative to the XY plane, node along +X. */
export function orbitQuat(inclination: number, node: number): THREE.Quaternion {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), inclination);
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), node).multiply(q);
}

// ---------------------------------------------------------------------------------------------
// Cosmic web sampler: points concentrated on the walls/filaments of a jittered Voronoi tessellation.
// The same seed + cell size gives the same structure in any unit, so layers can crossfade.
// ---------------------------------------------------------------------------------------------
export interface WebOpts {
  count: number; rMin: number; rMax: number;
  /** cell size in the same unit as rMin/rMax */
  cell: number; seed: number;
  /** 'shell' = constant count per radius (density ∝ 1/r²), 'volume' = uniform density */
  radial: 'shell' | 'volume';
  /** cell coordinates are offset by this (so different units still sample the same web) */
  cellScale?: number;
}
function hash3(x: number, y: number, z: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + s * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function sampleWeb(o: WebOpts): { pos: Float32Array; b: Float32Array } {
  const rand = rng(o.seed);
  const pos = new Float32Array(o.count * 3), b = new Float32Array(o.count);
  const cell = o.cell;
  const r3min = o.rMin ** 3, r3max = o.rMax ** 3;
  let n = 0, tries = 0;
  while (n < o.count && tries < o.count * 60) {
    tries++;
    const u = rand();
    const r = o.radial === 'shell' ? o.rMin + (o.rMax - o.rMin) * u : Math.cbrt(r3min + (r3max - r3min) * u);
    const z = 2 * rand() - 1, ph = rand() * Math.PI * 2, s = Math.sqrt(1 - z * z);
    const px = r * s * Math.cos(ph), py = r * s * Math.sin(ph), pz = r * z;
    const cx = Math.floor(px / cell), cy = Math.floor(py / cell), cz = Math.floor(pz / cell);
    let d1 = 1e30, d2 = 1e30, d3 = 1e30;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      const ix = cx + i, iy = cy + j, iz = cz + k;
      const sx = (ix + 0.12 + 0.76 * hash3(ix, iy, iz, 1)) * cell;
      const sy = (iy + 0.12 + 0.76 * hash3(ix, iy, iz, 2)) * cell;
      const sz = (iz + 0.12 + 0.76 * hash3(ix, iy, iz, 3)) * cell;
      const d = (px - sx) ** 2 + (py - sy) ** 2 + (pz - sz) ** 2;
      if (d < d1) { d3 = d2; d2 = d1; d1 = d; } else if (d < d2) { d3 = d2; d2 = d; } else if (d < d3) d3 = d;
    }
    const e = (Math.sqrt(d2) - Math.sqrt(d1)) / cell;       // 0 on a wall
    const f = (Math.sqrt(d3) - Math.sqrt(d1)) / cell;       // 0 on a filament (three cells meet)
    const w = Math.exp(-(e * e) / 0.0072) * (0.3 + 0.7 * Math.exp(-(f * f) / 0.03)) + 0.035;
    if (rand() > w) continue;
    pos[n * 3] = px; pos[n * 3 + 1] = py; pos[n * 3 + 2] = pz;
    b[n] = 0.35 + 0.65 * Math.min(1, w) * (0.6 + 0.4 * rand());
    n++;
  }
  return { pos: n < o.count ? pos.subarray(0, n * 3) : pos, b: n < o.count ? b.subarray(0, n) : b };
}

/** Random point on the unit sphere → out. */
export function randomDir(rand: () => number, out: THREE.Vector3): THREE.Vector3 {
  const z = 2 * rand() - 1, ph = rand() * Math.PI * 2, s = Math.sqrt(1 - z * z);
  return out.set(s * Math.cos(ph), s * Math.sin(ph), z);
}

// ---------------------------------------------------------------------------------------------
// Formatting helpers (locale-aware, on top of units.ts)
// ---------------------------------------------------------------------------------------------
export function fmtMioKm(mio: number, digits = 1): string {
  return `${fmtNum(mio, { maxDigits: digits })} ${lang() === 'de' ? 'Mio. km' : 'million km'}`;
}
export function fmtAU(au: number): string {
  return `${fmtNum(au, { maxDigits: au < 10 ? 2 : au < 100 ? 1 : 0 })} ${lang() === 'de' ? 'AE' : 'AU'}`;
}
export function fmtLy(ly: number): string {
  const de = lang() === 'de';
  if (ly < 1e3) return `${fmtNum(ly, { maxDigits: ly < 10 ? 2 : ly < 100 ? 1 : 0 })} ${de ? (Math.abs(ly - 1) < 1e-9 ? 'Lichtjahr' : 'Lichtjahre') : (Math.abs(ly - 1) < 1e-9 ? 'light-year' : 'light-years')}`;
  if (ly < 1e6) return `${fmtNum(ly, { digits: 0 })} ${de ? 'Lichtjahre' : 'light-years'}`;
  if (ly < 1e9) return `${fmtNum(ly / 1e6, { maxDigits: 1 })} ${de ? 'Mio. Lichtjahre' : 'million light-years'}`;
  return `${fmtNum(ly / 1e9, { maxDigits: 1 })} ${de ? 'Mrd. Lichtjahre' : 'billion light-years'}`;
}
/** Power-of-ten HTML, e.g. 10<sup>12</sup> m. */
export function fmtPow(exp: number, unit = 'm'): string { return `10<sup>${exp}</sup> ${unit}`; }
