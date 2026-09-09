import * as THREE from 'three';
import { glowTexture, rng, gaussian, mixRgb, type RGB } from './util';

/**
 * Procedural Milky Way for the zoom chapter (unit: kpc). ~40 000 stars in a 30 kpc disc: exponential disc, bulge,
 * bar, two major + two minor logarithmic arms plus the Orion spur through the Sun's position, blue OB associations
 * and rose H II regions along the arms, dust lanes (normal-blended dark points along the inner arm edges) and a
 * warm bulge glow. Local frame: disc in XY, +Z = galactic north, +X = from the centre towards the Sun, the Sun at
 * (8.2, 0, 0). Point sizes are perspective-attenuated with a sub-pixel alpha collapse, so from megaparsec distances
 * the galaxy shrinks to a smudge instead of piling up.
 */
export interface MilkyWayColors { warm: RGB; blue: RGB; white: RGB; rose: RGB }
export interface MilkyWay { group: THREE.Group; setAlpha(k: number): void; setProj(height: number, fovDeg: number): void }

const VERT = /* glsl */ `
attribute float aSize; attribute vec3 aColor;
uniform float uProj, uPR, uAlpha, uMaxPx;
varying vec3 vColor; varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float px = aSize * uProj / max(-mv.z, 1e-6);
  float p = min(px, uMaxPx);
  float dim = clamp(p * p / 1.44, 0.0, 1.0);
  vAlpha = uAlpha * dim * (0.5 + 0.5 * clamp(1.0 - px / uMaxPx, 0.0, 1.0)) * step(0.0, -mv.z);
  vColor = aColor;
  gl_PointSize = max(p, 1.0) * uPR;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */ `
uniform sampler2D uTex;
varying vec3 vColor; varying float vAlpha;
void main() {
  vec4 t = texture2D(uTex, gl_PointCoord);
  gl_FragColor = vec4(vColor * t.a, t.a * vAlpha);
}`;

const R = 15;                       // disc radius (kpc)
const PITCH = Math.tan(13 * Math.PI / 180);
const ARM_PHASE = 0.9;              // arm 0 passes ~0.6 kpc inside the Sun (Sagittarius arm), a minor arm ~2.8 kpc outside (Perseus)
const BAR = 28 * Math.PI / 180;     // bar angle relative to the Sun–centre line
const SCALE_LEN = 4.2;

function armTheta(r: number, arm: number): number { return Math.log(r / 2.2) / PITCH + (arm * Math.PI) / 2 + ARM_PHASE; }

function makePoints(pos: Float32Array, col: Float32Array, size: Float32Array, alpha: number, maxPx: number, blending: THREE.Blending): { points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>; uniforms: Record<string, THREE.IUniform> } {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.computeBoundingSphere();
  const uniforms: Record<string, THREE.IUniform> = { uProj: { value: 860 }, uPR: { value: Math.min(window.devicePixelRatio || 1, 2) }, uAlpha: { value: alpha }, uMaxPx: { value: maxPx }, uTex: { value: glowTexture() } };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: false, blending });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, uniforms };
}

export function createMilkyWay(c: MilkyWayColors, count = 40000): MilkyWay {
  const rand = rng(19770905);
  const gauss = gaussian(rand);
  const N = count;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N);
  const unit = 0.16;                // base world diameter of a point (kpc)

  const set = (i: number, x: number, y: number, z: number, cc: RGB, s: number) => {
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    col[i * 3] = cc[0]; col[i * 3 + 1] = cc[1]; col[i * 3 + 2] = cc[2];
    size[i] = s;
  };
  const discR = () => { let r = 0; do { r = -SCALE_LEN * Math.log(Math.max(rand(), 1e-9)); } while (r < 2.4 || r > R); return r; };

  for (let i = 0; i < N; i++) {
    const u = rand();
    if (u < 0.13) {                                    // bulge
      const r = Math.abs(gauss()) * 2.0;
      const th = rand() * Math.PI * 2, ph = Math.acos(2 * rand() - 1);
      set(i, r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph) * 0.6, mixRgb(c.warm, c.white, 0.35 * rand()), unit * (0.9 + rand() * 1.5));
    } else if (u < 0.2) {                              // bar
      const L = (rand() * 2 - 1) * 4.5, w = gauss() * 0.8, h = gauss() * 0.45;
      set(i, L * Math.cos(BAR) - w * Math.sin(BAR), L * Math.sin(BAR) + w * Math.cos(BAR), h, mixRgb(c.warm, c.white, 0.25 * rand()), unit * (0.8 + rand() * 1.2));
    } else if (u < 0.235) {                            // Orion spur through the Sun
      const r = 7.4 + rand() * 2.6;
      const th = Math.log(r / 8.2) / PITCH + gauss() * 0.045;
      const t = r / R;
      const q = rand();
      const cc: RGB = q < 0.06 ? c.rose : q < 0.3 ? mixRgb(c.blue, c.white, 0.2) : mixRgb(c.warm, c.blue, 0.5);
      set(i, r * Math.cos(th), r * Math.sin(th), gauss() * (0.2 + 0.25 * t * t), cc, unit * (0.7 + rand() * 1.2));
    } else {                                           // disc + arms
      let r = discR();
      const smooth = rand() < 0.34;
      let th: number;
      if (smooth) th = rand() * Math.PI * 2;
      else {
        const a = rand();
        const arm = a < 0.36 ? 0 : a < 0.72 ? 2 : a < 0.86 ? 1 : 3;
        th = armTheta(r, arm) + gauss() * (0.15 + 0.14 * (r / R));
        r *= 1 + gauss() * 0.04;
      }
      const t = r / R;
      const z = gauss() * (0.2 + 0.28 * t * t);
      if (smooth) set(i, r * Math.cos(th), r * Math.sin(th), z, mixRgb(c.warm, c.white, 0.3 + 0.4 * t), unit * (0.6 + rand() * 0.9));
      else {
        const q = rand();
        let cc: RGB, s: number;
        if (q < 0.05) { cc = c.rose; s = unit * (1.3 + rand() * 1.4); }
        else if (q < 0.22) { cc = mixRgb(c.blue, c.white, 0.15); s = unit * (1.4 + rand() * 1.8); }
        else { cc = mixRgb(c.warm, c.blue, 0.35 + 0.6 * t); s = unit * (0.6 + rand() * 1.0); }
        set(i, r * Math.cos(th), r * Math.sin(th), z, cc, s);
      }
    }
  }

  // dust lanes along the inner (trailing) edges of the arms – dark, normal-blended points drawn after the stars
  const ND = 9000;
  const dpos = new Float32Array(ND * 3), dcol = new Float32Array(ND * 3), dsize = new Float32Array(ND);
  for (let i = 0; i < ND; i++) {
    let r = 0; do { r = -SCALE_LEN * Math.log(Math.max(rand(), 1e-9)); } while (r < 3 || r > 13.5);
    const a = rand();
    const arm = a < 0.4 ? 0 : a < 0.8 ? 2 : a < 0.9 ? 1 : 3;
    const th = armTheta(r, arm) - 0.11 - 0.04 * rand() + gauss() * 0.035;
    dpos[i * 3] = r * Math.cos(th); dpos[i * 3 + 1] = r * Math.sin(th); dpos[i * 3 + 2] = gauss() * 0.12;
    const k = 0.4 + 0.6 * rand();
    dcol[i * 3] = 0.03 * k; dcol[i * 3 + 1] = 0.015 * k; dcol[i * 3 + 2] = 0.02 * k;
    dsize[i] = 0.28 + rand() * 0.3;
  }

  const stars = makePoints(pos, col, size, 0.95, 22, THREE.AdditiveBlending);
  const dust = makePoints(dpos, dcol, dsize, 0.6, 22, THREE.NormalBlending);
  stars.points.renderOrder = 0; dust.points.renderOrder = 1;

  // bulge glow: a sprite that keeps a soft core when the points collapse
  const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(c.warm[0], c.warm[1], c.warm[2]), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.set(7, 4.5, 1);
  glow.renderOrder = 2;

  const group = new THREE.Group();
  group.add(stars.points, dust.points, glow);
  return {
    group,
    setAlpha(k) { stars.uniforms.uAlpha.value = 0.95 * k; dust.uniforms.uAlpha.value = 0.6 * k; glowMat.opacity = 0.5 * k; },
    setProj(h, fov) { const p = h / 2 / Math.tan((fov * Math.PI) / 360); stars.uniforms.uProj.value = p; dust.uniforms.uProj.value = p; },
  };
}
