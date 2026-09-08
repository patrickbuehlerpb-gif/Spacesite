import * as THREE from 'three';
import { colorsFromBv } from '../../core/StarPoints';
import type { StarCatalog } from '../../data/stars';

/**
 * Night-sky star renderer for the home hero (camera fixed at the origin of the HYG catalogue).
 *
 * Why not core/StarPoints? Its sprite is very soft and its alpha is applied twice, which is right for
 * flying *through* the catalogue but leaves an Earth-view backdrop almost black at 1× pixel ratio:
 * the thousands of 7–9 mag stars that form the Milky Way band fade out completely.
 * Here the apparent magnitude is a static attribute (the observer never moves), the sprite is a
 * procedural gaussian core + faint halo, and stars fainter than the minimum diameter keep that
 * diameter but carry their missing brightness in alpha – like a long-exposure photograph.
 *
 * One THREE.Points → one draw call for the whole catalogue. Attribute layout: position, mag, color.
 */
export interface SkyStarsOptions {
  /** magnitude that renders exactly `size` px wide with full alpha (default 5) */
  magRef?: number;
  /** diameter in px at `magRef` (default 2.6) */
  size?: number;
  /** smallest diameter; fainter stars fade via alpha instead (default = size) */
  minSize?: number;
  /** largest diameter for the brightest stars (default 34) */
  maxSize?: number;
  /** global alpha (default 1) */
  alpha?: number;
  /** halo strength around bright stars 0..1 (default 0.28) */
  halo?: number;
}

export interface SkyUniforms {
  uPixelRatio: { value: number };
  uSize: { value: number };
  uMinSize: { value: number };
  uMaxSize: { value: number };
  uMagRef: { value: number };
  uAlpha: { value: number };
  uHalo: { value: number };
}

const VERT = /* glsl */ `
attribute float mag;
attribute vec3 color;
uniform float uPixelRatio, uSize, uMinSize, uMaxSize, uMagRef, uAlpha;
varying vec3 vColor;
varying float vAlpha;
varying float vPx;
void main() {
  // k ∝ sqrt(flux) relative to the reference magnitude: diameter law, gentler than the area law
  float k = pow(10.0, -0.2 * (mag - uMagRef));
  float s = uSize * k;                                     // ideal diameter in CSS px
  float px = clamp(s, uMinSize, uMaxSize);
  // below the minimum diameter the missing brightness goes into alpha (density → Milky Way)
  vAlpha = uAlpha * clamp(s / uMinSize, 0.0, 1.0);
  // the very brightest stars bleed towards white, but keep their tint (Antares orange, Spica blue)
  float white = clamp((s - 10.0) / 60.0, 0.0, 0.35);
  vColor = mix(color, vec3(1.0), white);
  vPx = px;
  gl_PointSize = px * uPixelRatio;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform float uHalo;
varying vec3 vColor;
varying float vAlpha;
varying float vPx;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c);
  // small points: broad gaussian (robust against sub-pixel placement); big points: tight core
  float sig = mix(0.34, 0.15, clamp((vPx - 2.0) / 12.0, 0.0, 1.0));
  float core = exp(-r2 / (sig * sig));
  float halo = uHalo * exp(-sqrt(r2) / 0.19) * smoothstep(5.0, 12.0, vPx);
  float a = min(core + halo, 1.0);
  gl_FragColor = vec4(vColor, vAlpha * a);
}`;

/** Build the sky: one Points object with the true apparent magnitudes from Earth. */
export function createSkyStars(cat: StarCatalog, o: SkyStarsOptions = {}): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const size = o.size ?? 2.6;
  const uniforms: SkyUniforms = {
    uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
    uSize: { value: size },
    uMinSize: { value: o.minSize ?? size },
    uMaxSize: { value: o.maxSize ?? 34 },
    uMagRef: { value: o.magRef ?? 5 },
    uAlpha: { value: o.alpha ?? 1 },
    uHalo: { value: o.halo ?? 0.28 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(cat.pos, 3));
  geo.setAttribute('mag', new THREE.BufferAttribute(cat.mag, 1));
  geo.setAttribute('color', new THREE.BufferAttribute(colorsFromBv(cat.ci), 3));
  geo.computeBoundingSphere();
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

export function skyUniforms(m: THREE.ShaderMaterial): SkyUniforms {
  return m.uniforms as unknown as SkyUniforms;
}
