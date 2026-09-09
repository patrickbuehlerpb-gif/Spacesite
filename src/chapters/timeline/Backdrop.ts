import * as THREE from 'three';
import { createStarPoints, colorsFromBv, starUniforms, starSpriteTexture } from '../../core/StarPoints';
import { createSun, type Sun } from '../../core/Sun';
import { createEarth, type Earth } from '../../core/Earth';
import type { StarCatalog } from '../../data/stars';
import type { GalaxyCatalog } from '../../data/galaxies';
import { SEC_PER_YEAR, smoothstep, lerp } from '../../core/units';
import { T0 } from './events';
import { T_REC, temperatureK, type Moment } from './model';

/**
 * Era-driven backdrop behind the timeline UI, all in one scene rendered by the chapter's fixed camera (at the origin,
 * looking down −Z):
 *  - a full-screen shader quad (plasma fbm coloured by temperature, dark-age glow, violet nebulosity, the last light);
 *  - three point layers around the camera in a slowly rotating "sky" group: random blue-white Population-III stars
 *    (revealed via drawRange), the real 2MRS galaxies (custom point shader) and the real HYG stars (createStarPoints);
 *  - the Sun (createSun) and the Earth (createEarth) in front of the camera, scaled in softly.
 * Every visual parameter lives in a flat Float32Array; targets are derived from the current moment and the current
 * values are exponentially lerped towards them (≈ 1 s), so scrubbing and jumping always transition smoothly.
 */
const PLASMA = 0, BRIGHT = 1, NOISE = 2, HOT = 3, DARK = 6, GLOW = 9, GLOWC = 10, BASE = 13, NEBULA = 16, NEBC = 17,
  FIRST = 20, REVEAL = 21, GAL = 22, STARS = 23, SUN = 24, SUNSCALE = 25, SUNINT = 26, EARTH = 27, LAST = 28, VIG = 29, GALSIZE = 30, N = 31;

const YR = SEC_PER_YEAR;
const T_SUN = T0 - 4.6e9 * YR;
const T_EARTH = T0 - 4.54e9 * YR;
const SUN_SCALE_SMALL = 0.55;

/** Plasma look by log10(T): [logT, hot rgb, dark rgb, brightness] – linear RGB. */
const STOPS: Array<[number, [number, number, number], [number, number, number], number]> = [
  [3.35, [0.8, 0.18, 0.05], [0.2, 0.025, 0.01], 0.5],
  [3.75, [1.0, 0.52, 0.18], [0.5, 0.11, 0.03], 0.58],
  [5.0, [1.0, 0.9, 0.62], [0.75, 0.32, 0.08], 0.66],
  [8.0, [1.0, 0.98, 0.92], [0.7, 0.5, 0.25], 0.72],
  [12.0, [0.9, 0.96, 1.0], [0.15, 0.27, 0.85], 0.74],
  [30.0, [0.95, 0.98, 1.0], [0.12, 0.22, 0.78], 0.8],
];

function setC(o: Float32Array, i: number, r: number, g: number, b: number): void { o[i] = r; o[i + 1] = g; o[i + 2] = b; }
function mixC(o: Float32Array, i: number, r: number, g: number, b: number, k: number): void {
  o[i] = lerp(o[i], r, k); o[i + 1] = lerp(o[i + 1], g, k); o[i + 2] = lerp(o[i + 2], b, k);
}
function plasmaLook(logT: number, o: Float32Array): void {
  let a = STOPS[0], b = STOPS[STOPS.length - 1];
  for (let i = 0; i < STOPS.length - 1; i++) if (logT >= STOPS[i][0] && logT <= STOPS[i + 1][0]) { a = STOPS[i]; b = STOPS[i + 1]; break; }
  if (logT < STOPS[0][0]) b = a;
  if (logT > STOPS[STOPS.length - 1][0]) a = b;
  const k = a === b ? 0 : (logT - a[0]) / (b[0] - a[0]);
  setC(o, HOT, lerp(a[1][0], b[1][0], k), lerp(a[1][1], b[1][1], k), lerp(a[1][2], b[1][2], k));
  setC(o, DARK, lerp(a[2][0], b[2][0], k), lerp(a[2][1], b[2][1], k), lerp(a[2][2], b[2][2], k));
  o[BRIGHT] = lerp(a[3], b[3], k);
}

/** Visual targets for a moment on the timeline. */
export function eraTarget(m: Moment, o: Float32Array): void {
  o.fill(0);
  setC(o, BASE, 0.012, 0.018, 0.04);
  o[VIG] = 0.45; o[SUNSCALE] = 1; o[SUNINT] = 1.6; o[NOISE] = 3; o[GALSIZE] = 5.5;
  setC(o, NEBC, 0.22, 0.14, 0.42);
  if (m.kind !== 'future') {
    const t = m.kind === 'today' ? T0 : m.t;
    const lt = Math.log10(t);
    const lrec = Math.log10(T_REC);
    // hot plasma until shortly after recombination (the afterglow reddens and fades)
    const plasma = 1 - smoothstep(lrec + 0.02, lrec + 0.7, lt);
    if (plasma > 0) {
      const T = temperatureK(m) ?? 1e30;
      plasmaLook(Math.log10(T), o);
      o[PLASMA] = plasma;
      o[NOISE] = lerp(7.5, 2.0, smoothstep(-42, 13.5, lt));
      if (lt < -31) { const f = 1 - smoothstep(-36, -31, lt); o[BRIGHT] *= 1 + 0.25 * f; mixC(o, HOT, 1, 1, 1, 0.5 * f); }
      setC(o, BASE, 0.02, 0.008, 0.004);
      o[VIG] = 0.62;
    }
    // dark ages: warm black with a faint red glow, turning blue-violet at the cosmic dawn
    const dawn = smoothstep(15.2, 16.0, lt);
    const dark = smoothstep(lrec - 0.2, lrec + 0.6, lt) * (1 - smoothstep(16.2, 16.9, lt));
    o[GLOW] = dark * lerp(0.4, 0.3, dawn);
    setC(o, GLOWC, lerp(0.42, 0.1, dawn), lerp(0.06, 0.12, dawn), lerp(0.02, 0.32, dawn));
    const warmBlack = smoothstep(lrec, lrec + 0.7, lt) * (1 - dawn);
    mixC(o, BASE, 0.009, 0.004, 0.004, warmBlack);
    // first stars: revealed 100 → 250 Myr, fading 1.3 → 4 Gyr
    o[REVEAL] = smoothstep(15.05, 15.9, lt);
    o[FIRST] = o[REVEAL] * (1 - smoothstep(16.6, 17.1, lt));
    // galaxies from 300 Myr, full by 1.3 Gyr, stepping back once the Sun exists
    const late = smoothstep(17.4, 17.465, lt);
    o[GAL] = smoothstep(15.6, 16.6, lt) * (1 - 0.72 * late);
    o[NEBULA] = smoothstep(15.5, 16.6, lt) * (1 - 0.65 * late) * 0.5;
    // the real night sky from ~8 Gyr, complete at the Sun's birth
    o[STARS] = smoothstep(17.36, 17.462, lt);
    o[SUN] = smoothstep(T_SUN - 0.35e9 * YR, T_SUN, t);
    o[SUNSCALE] = lerp(1, SUN_SCALE_SMALL, smoothstep(T_EARTH, T_EARTH + 0.5e9 * YR, t));
    o[EARTH] = smoothstep(T_EARTH - 0.06e9 * YR, T_EARTH, t);
  } else {
    const y = Math.log10(m.yrs);
    o[STARS] = (1 - 0.5 * smoothstep(11, 13.5, y)) * (1 - smoothstep(13.8, 15.2, y));
    o[EARTH] = 1 - smoothstep(8.9, 9.5, y);
    o[SUN] = 1 - smoothstep(10.4, 11.2, y);
    const rg = smoothstep(9.66, 9.72, y) * (1 - smoothstep(9.8, 9.9, y)); // red giant (4.6 → 5 Gyr, gone by 8 Gyr)
    const wd = smoothstep(9.8, 9.9, y);                                    // white dwarf
    o[SUNSCALE] = lerp(lerp(SUN_SCALE_SMALL, 3.6, rg), 0.14, wd);
    o[SUNINT] = lerp(lerp(1.6, 1.15, rg), 3.4, wd);
    mixC(o, BASE, 0.16, 0.025, 0.01, rg * 0.8);
    o[GLOW] = rg * 0.55; setC(o, GLOWC, 0.55, 0.14, 0.03);
    o[VIG] = 0.45 + 0.35 * smoothstep(11, 15, y);
    // galaxies: the faint background of today, then Andromeda's approach, gone beyond ~100 Gyr
    const col = smoothstep(9.2, 9.55, y) * (1 - smoothstep(10.3, 11, y));
    const bg = 1 - smoothstep(10.3, 11, y);
    o[GAL] = Math.max(0.28 * bg, 0.85 * col);
    o[NEBULA] = Math.max(0.175 * bg, 0.45 * col);
    o[GALSIZE] = lerp(5.5, 10, col);        // Andromeda's stars grow in the sky as it approaches
    // the last red dwarfs glow warm, then everything goes black
    const dying = smoothstep(12.5, 13.8, y) * (1 - smoothstep(14, 15, y));
    if (dying * 0.25 > o[GLOW]) { o[GLOW] = dying * 0.25; setC(o, GLOWC, 0.4, 0.08, 0.03); }
    mixC(o, BASE, 0, 0, 0, smoothstep(12, 15.5, y));
    // a single last light through the black-hole era
    o[LAST] = smoothstep(14.2, 15.8, y) * (1 - smoothstep(38, 96, y));
  }
}

// Shaders ----------------------------------------------------------------------------------------------
const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`;

const QUAD_FRAG = /* glsl */ `
uniform float uTime; uniform vec2 uRes;
uniform float uPlasma, uBright, uNoise, uGlow, uNebula, uLast, uVig;
uniform vec3 uHot, uDark, uGlowC, uBase, uNebC;
varying vec2 vUv;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float r = length(p);
  vec3 col = uBase;
  if (uPlasma > 0.002) {
    vec2 q = p * uNoise;
    float t = uTime * 0.045;
    vec2 w = vec2(fbm(q + vec2(t * 0.6, -t * 0.35)), fbm(q + vec2(5.2, 1.3) - vec2(t * 0.4)));
    float v = fbm(q + 2.4 * w + vec2(t * 0.25, 0.0));
    float cloud = 0.25 + 0.75 * fbm(q * 0.35 + vec2(-t * 0.2, t * 0.1));
    float k = smoothstep(0.42, 0.86, v);
    vec3 pc = (uDark * (0.2 + 0.8 * cloud) * (0.35 + 0.65 * v) + uHot * k * k * 1.1) * uBright;
    pc += uHot * uBright * 0.5 * pow(smoothstep(0.62, 0.96, v), 2.0);
    col = mix(col, pc, uPlasma);
  }
  col += uGlowC * uGlow * exp(-r * r * 2.6);
  if (uNebula > 0.002) {
    float n = fbm(p * 1.7 + vec2(uTime * 0.008, 3.1));
    col += uNebC * uNebula * smoothstep(0.42, 0.85, n);
  }
  col += vec3(1.0, 0.96, 0.9) * uLast * (exp(-r * r * 2600.0) + 0.05 * exp(-r * r * 160.0));
  col *= 1.0 - uVig * smoothstep(0.35, 1.15, r);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const GAL_VERT = /* glsl */ `
attribute float kmag; attribute float gtype;
uniform float uPixelRatio, uAlpha, uSize;
uniform vec3 uColE, uColS, uColI, uColU;
varying vec3 vColor; varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = max(length(mv.xyz), 0.05);
  float b = clamp((11.75 - kmag) / 7.75, 0.0, 1.0);
  float s = uSize * (0.45 + 1.3 * b) * clamp(8.0 / d, 0.75, 2.6);
  vAlpha = uAlpha * (0.3 + 0.7 * b);
  vec3 c = uColU;
  if (gtype > 0.5 && gtype < 2.5) c = uColE; else if (gtype > 2.5 && gtype < 3.5) c = uColS; else if (gtype > 3.5) c = uColI;
  vColor = c;
  gl_PointSize = s * uPixelRatio;
  gl_Position = projectionMatrix * mv;
}`;
const GAL_FRAG = /* glsl */ `
uniform sampler2D uTex;
varying vec3 vColor; varying float vAlpha;
void main() { vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vColor * t.a, t.a * vAlpha); }`;

interface QuadUniforms {
  uTime: { value: number }; uRes: { value: THREE.Vector2 };
  uPlasma: { value: number }; uBright: { value: number }; uNoise: { value: number }; uGlow: { value: number };
  uNebula: { value: number }; uLast: { value: number }; uVig: { value: number };
  uHot: { value: THREE.Vector3 }; uDark: { value: THREE.Vector3 }; uGlowC: { value: THREE.Vector3 }; uBase: { value: THREE.Vector3 }; uNebC: { value: THREE.Vector3 };
}

export class Backdrop {
  private cur = new Float32Array(N);
  private tgt = new Float32Array(N);
  private qU: QuadUniforms;
  private sky = new THREE.Group();
  private first: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private firstN: number;
  private stars?: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private gal?: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private galU?: { uAlpha: { value: number }; uSize: { value: number } };
  private sun: Sun;
  private earth: Earth;
  private earthReady = false;
  private sunPos = new THREE.Vector3(2.7, 0.15, -8.5);
  private earthPos = new THREE.Vector3(1.0, -0.9, -5.2);

  constructor(scene: THREE.Scene) {
    // 1. full-screen quad
    this.qU = {
      uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
      uPlasma: { value: 0 }, uBright: { value: 1 }, uNoise: { value: 3 }, uGlow: { value: 0 }, uNebula: { value: 0 }, uLast: { value: 0 }, uVig: { value: 0.45 },
      uHot: { value: new THREE.Vector3(1, 1, 1) }, uDark: { value: new THREE.Vector3() }, uGlowC: { value: new THREE.Vector3() },
      uBase: { value: new THREE.Vector3(0.012, 0.018, 0.04) }, uNebC: { value: new THREE.Vector3() },
    };
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: this.qU as unknown as Record<string, THREE.IUniform>, vertexShader: QUAD_VERT, fragmentShader: QUAD_FRAG, depthTest: false, depthWrite: false,
    }));
    quad.frustumCulled = false;
    quad.renderOrder = -10;
    scene.add(quad);

    // 2. sky group (catalogues are z-up → rotate −90° about X so north points up)
    this.sky.rotation.x = -Math.PI / 2;
    scene.add(this.sky);

    // 3. Population III stars: random positions, blue-white, revealed via drawRange
    const n = 2600;
    const pos = new Float32Array(n * 3), mag = new Float32Array(n), ci = new Float32Array(n);
    let seed = 12345;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < n; i++) {
      const z = rnd() * 2 - 1, ph = rnd() * Math.PI * 2, r = 35 + 55 * rnd(), s = Math.sqrt(1 - z * z);
      pos[i * 3] = r * s * Math.cos(ph); pos[i * 3 + 1] = r * s * Math.sin(ph); pos[i * 3 + 2] = r * z;
      mag[i] = -4.5 + 6 * Math.pow(rnd(), 1.5);
      ci[i] = -0.32 + 0.2 * rnd();
    }
    this.first = createStarPoints(pos, mag, colorsFromBv(ci), { size: 14, maxSize: 30 });
    this.firstN = n;
    this.first.geometry.setDrawRange(0, 0);
    this.first.visible = false;
    this.sky.add(this.first);

    // 4. Sun and Earth, fixed in front of the camera
    this.sun = createSun(1, 5);
    this.sun.group.position.copy(this.sunPos);
    this.sun.group.visible = false;
    scene.add(this.sun.group);
    this.earth = createEarth(0.5, { segments: 48 });
    this.earth.group.position.copy(this.earthPos);
    this.earth.group.visible = false;
    this.earth.setSunDirection(new THREE.Vector3(0.6, 0.35, 0.72).normalize());
    scene.add(this.earth.group);
    void this.earth.ready.then(() => { this.earthReady = true; }).catch(() => {});
  }

  /** Attach the real HYG catalogue (camera at the Sun → the real night sky). */
  setStars(cat: StarCatalog): void {
    if (this.stars) return;
    this.stars = createStarPoints(cat.pos, cat.absMag, colorsFromBv(cat.ci), { size: 13, magOffset: -1.3, maxSize: 24 });
    this.stars.visible = false;
    this.sky.add(this.stars);
  }

  /** Attach the real 2MRS catalogue as a second, coarser point layer. */
  setGalaxies(cat: GalaxyCatalog): void {
    if (this.gal) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(cat.pos, 3));
    geo.setAttribute('kmag', new THREE.BufferAttribute(cat.kmag, 1));
    geo.setAttribute('gtype', new THREE.BufferAttribute(new Float32Array(cat.type), 1));
    const uniforms = {
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) }, uAlpha: { value: 0 }, uSize: { value: 5.5 },
      uColE: { value: new THREE.Vector3(0.95, 0.72, 0.5) }, uColS: { value: new THREE.Vector3(0.55, 0.78, 1.0) },
      uColI: { value: new THREE.Vector3(0.72, 0.6, 1.0) }, uColU: { value: new THREE.Vector3(0.8, 0.82, 0.9) },
      uTex: { value: starSpriteTexture() },
    };
    const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: GAL_VERT, fragmentShader: GAL_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.gal = new THREE.Points(geo, mat);
    this.gal.frustumCulled = false;
    this.gal.visible = false;
    this.gal.rotation.z = 0.7;
    this.galU = uniforms;
    this.sky.add(this.gal);
  }

  setMoment(m: Moment, immediate = false): void {
    eraTarget(m, this.tgt);
    if (immediate) this.cur.set(this.tgt);
  }

  resize(w: number, h: number): void { this.qU.uRes.value.set(w, h); }

  update(dt: number, elapsed: number): void {
    const c = this.cur, g = this.tgt;
    const k = 1 - Math.exp(-dt * 3.6);
    for (let i = 0; i < N; i++) c[i] += (g[i] - c[i]) * k;
    const u = this.qU;
    u.uTime.value = elapsed;
    u.uPlasma.value = c[PLASMA]; u.uBright.value = c[BRIGHT]; u.uNoise.value = c[NOISE]; u.uGlow.value = c[GLOW];
    u.uNebula.value = c[NEBULA]; u.uLast.value = c[LAST]; u.uVig.value = c[VIG];
    u.uHot.value.set(c[HOT], c[HOT + 1], c[HOT + 2]); u.uDark.value.set(c[DARK], c[DARK + 1], c[DARK + 2]);
    u.uGlowC.value.set(c[GLOWC], c[GLOWC + 1], c[GLOWC + 2]); u.uBase.value.set(c[BASE], c[BASE + 1], c[BASE + 2]);
    u.uNebC.value.set(c[NEBC], c[NEBC + 1], c[NEBC + 2]);

    this.sky.rotation.y = elapsed * 0.009;
    const fa = c[FIRST];
    this.first.visible = fa > 0.003;
    if (this.first.visible) { starUniforms(this.first.material).uAlpha.value = fa; this.first.geometry.setDrawRange(0, Math.round(c[REVEAL] * this.firstN)); }
    if (this.stars) { const a = c[STARS]; this.stars.visible = a > 0.003; if (this.stars.visible) starUniforms(this.stars.material).uAlpha.value = a; }
    if (this.gal && this.galU) { const a = c[GAL]; this.gal.visible = a > 0.003; if (this.gal.visible) { this.galU.uAlpha.value = a; this.galU.uSize.value = c[GALSIZE]; } }

    const sv = c[SUN];
    this.sun.group.visible = sv > 0.004;
    if (this.sun.group.visible) {
      this.sun.group.scale.setScalar(Math.max(1e-3, c[SUNSCALE] * sv));
      this.sun.setIntensity(c[SUNINT] * (0.35 + 0.65 * sv));
      this.sun.update(dt);
    }
    const ev = c[EARTH];
    this.earth.group.visible = this.earthReady && ev > 0.004;
    if (this.earth.group.visible) {
      this.earth.group.scale.setScalar(Math.max(1e-3, ev));
      this.earth.setRotation(elapsed * 0.05);
      this.earth.update(dt);
    }
  }
}
