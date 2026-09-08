import * as THREE from 'three';
import { starSpriteTexture } from '../../core/StarPoints';

/**
 * Procedural Milky Way: ~30 000 points in a disc of 0.03 Mpc diameter (100 000 ly) – bulge, bar, four
 * logarithmic arms (two major, two minor), a thin flaring disc, warm centre / blue arms with a sprinkle of
 * rose H II regions. Built in a local frame: disc in the XY plane, +Z = galactic north, +X = direction from the
 * galactic centre towards the Sun. The caller positions/orients the group (see galacticBasis in Landmarks.ts).
 *
 * Point sizes are perspective-attenuated (world size in Mpc) and the alpha collapses with sub-pixel sizes, so from
 * survey scale the whole galaxy vanishes – which is the point: it is one speck among 43 000.
 */
export interface MilkyWayOptions {
  points?: number;      // default 30 000
  radius?: number;      // Mpc, default 0.015 (50 000 ly)
  /** sRGB colours 0..1 */
  warm: [number, number, number];
  blue: [number, number, number];
  white: [number, number, number];
  rose: [number, number, number];
}

export interface MilkyWayUniforms { uHalfH: { value: number }; uPixelRatio: { value: number }; uAlpha: { value: number }; uTex: { value: THREE.Texture } }

const VERT = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
uniform float uHalfH, uPixelRatio, uAlpha;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float px = aSize * uHalfH / max(-mv.z, 1e-6);          // perspective size in px (aSize = world size in Mpc)
  float p = min(px, 26.0);
  float dim = clamp(p * p / 1.6, 0.0, 1.0);              // sub-pixel points fade instead of piling up
  vAlpha = uAlpha * dim * (0.55 + 0.45 * clamp(1.0 - px / 26.0, 0.0, 1.0));
  vColor = aColor;
  gl_PointSize = max(p, 1.0) * uPixelRatio;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uTex;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 t = texture2D(uTex, gl_PointCoord);
  gl_FragColor = vec4(vColor * t.a, t.a * vAlpha);
}`;

/** Deterministic PRNG (mulberry32) so the galaxy looks the same on every visit. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function createMilkyWay(o: MilkyWayOptions): { group: THREE.Group; points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>; uniforms: MilkyWayUniforms } {
  const N = o.points ?? 30000;
  const R = o.radius ?? 0.015;
  const rand = rng(20120926);
  const gauss = () => { // Box–Muller
    const u = Math.max(rand(), 1e-9), v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const size = new Float32Array(N);
  const mix = (a: [number, number, number], b: [number, number, number], k: number): [number, number, number] =>
    [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

  const PITCH = Math.tan((13 * Math.PI) / 180);   // pitch angle of the arms
  const BAR = (28 * Math.PI) / 180;                // bar angle relative to the Sun–centre line
  const scaleLen = 0.0042;                         // disc scale length (Mpc) ≈ 3.5 kpc… stretched a little for looks
  const unit = 0.00018;                            // base world size of a point (Mpc) ≈ 600 ly

  for (let i = 0; i < N; i++) {
    let x = 0, y = 0, z = 0;
    let c: [number, number, number];
    let s = unit;
    const u = rand();
    if (u < 0.14) {
      // bulge: flattened 3D gaussian, warm
      const r = Math.abs(gauss()) * 0.0022;
      const th = rand() * Math.PI * 2, ph = Math.acos(2 * rand() - 1);
      x = r * Math.sin(ph) * Math.cos(th); y = r * Math.sin(ph) * Math.sin(th); z = r * Math.cos(ph) * 0.62;
      c = mix(o.warm, o.white, 0.35 * rand());
      s = unit * (0.9 + rand() * 1.6);
    } else if (u < 0.22) {
      // bar
      const L = (rand() * 2 - 1) * 0.0048;
      const w = gauss() * 0.0009, h = gauss() * 0.0005;
      x = L * Math.cos(BAR) - w * Math.sin(BAR); y = L * Math.sin(BAR) + w * Math.cos(BAR); z = h;
      c = mix(o.warm, o.white, 0.25 * rand());
      s = unit * (0.8 + rand() * 1.2);
    } else {
      // disc: exponential radial profile, arms as log spirals
      let r = 0;
      do { r = -scaleLen * Math.log(Math.max(rand(), 1e-9)); } while (r < 0.0025 || r > R);
      const smooth = rand() < 0.32;                // inter-arm population
      let th: number;
      if (smooth) th = rand() * Math.PI * 2;
      else {
        const a = rand();
        const arm = a < 0.36 ? 0 : a < 0.72 ? 2 : a < 0.86 ? 1 : 3; // two major, two minor arms
        const spread = 0.16 + 0.14 * (r / R);
        th = Math.log(r / 0.0022) / PITCH + (arm * Math.PI) / 2 + BAR + gauss() * spread;
        r *= 1 + gauss() * 0.04;
      }
      x = r * Math.cos(th); y = r * Math.sin(th);
      z = gauss() * (0.00022 + 0.00025 * (r / R) * (r / R));
      const t = r / R;
      if (smooth) { c = mix(o.warm, o.white, 0.3 + 0.4 * t); s = unit * (0.6 + rand() * 0.9); }
      else {
        const q = rand();
        if (q < 0.05) { c = o.rose; s = unit * (1.3 + rand() * 1.4); }                   // H II regions
        else if (q < 0.22) { c = mix(o.blue, o.white, 0.15); s = unit * (1.4 + rand() * 1.8); } // OB associations
        else { c = mix(o.warm, o.blue, 0.35 + 0.6 * t); s = unit * (0.6 + rand() * 1.0); }
      }
    }
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    size[i] = s;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.computeBoundingSphere();
  const uniforms: MilkyWayUniforms = {
    uHalfH: { value: 450 },
    uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
    uAlpha: { value: 0.9 },
    uTex: { value: starSpriteTexture() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;

  // soft glow of the bulge (a sprite, shrinks with distance like everything else)
  const glowMat = new THREE.SpriteMaterial({ map: starSpriteTexture(), color: new THREE.Color(o.warm[0], o.warm[1], o.warm[2]), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.set(0.007, 0.0045, 1);

  const group = new THREE.Group();
  group.add(points, glow);
  return { group, points, uniforms };
}
