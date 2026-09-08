import * as THREE from 'three';
import { bvToRgb } from './color';

/**
 * GPU star renderer. One THREE.Points with a custom shader:
 *  - apparent magnitude is computed per frame from absolute magnitude + camera distance,
 *    so the same catalogue works from Earth's viewpoint AND while flying through it;
 *  - size ∝ 10^(-0.2 m) (clamped), faint stars fade via alpha instead of shrinking below 1.6 px;
 *  - colour from B-V; bright stars bleed towards white; additive blending.
 *
 * Scene units are arbitrary: pass `unitPc` = parsecs per scene unit (1 if the scene is in parsecs).
 */
export interface StarPointsOptions {
  /** parsecs per scene unit (default 1) */
  unitPc?: number;
  /** pixel size of a magnitude-0 star (default 9) */
  size?: number;
  /** pixel clamp (default 56) */
  maxSize?: number;
  /** added to the computed apparent magnitude (positive = fainter). default 0 */
  magOffset?: number;
  /** global alpha (default 1) */
  alpha?: number;
  /** depth test against other geometry (default true) */
  depthTest?: boolean;
  /** static point size multiplier by colour temperature; default off */
}

export interface StarPointsUniforms {
  uPixelRatio: { value: number };
  uSize: { value: number };
  uMaxSize: { value: number };
  uUnitPc: { value: number };
  uMagOffset: { value: number };
  uAlpha: { value: number };
  uTex: { value: THREE.Texture };
}

let spriteTex: THREE.Texture | null = null;
/** Procedural soft-glow sprite (no asset needed). */
export function starSpriteTexture(): THREE.Texture {
  if (spriteTex) return spriteTex;
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.28)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.06)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  spriteTex = new THREE.CanvasTexture(c);
  spriteTex.colorSpace = THREE.SRGBColorSpace;
  return spriteTex;
}

const VERT = /* glsl */ `
attribute float absMag;
attribute vec3 color;
uniform float uPixelRatio, uSize, uMaxSize, uUnitPc, uMagOffset, uAlpha;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = max(length(mv.xyz) * uUnitPc, 1e-7);            // parsecs
  float m = absMag + 5.0 * (log(d) / 2.302585093 - 1.0) + uMagOffset; // apparent magnitude
  float s = uSize * pow(10.0, -0.2 * m);                     // px, m=0 → uSize
  float px = min(s, uMaxSize);
  float dim = clamp(px * px / 2.56, 0.0, 1.0);               // below 1.6 px: fade instead of shrink
  vAlpha = uAlpha * dim;
  float white = clamp((s - 6.0) / 30.0, 0.0, 0.55);
  vColor = mix(color, vec3(1.0), white);
  gl_PointSize = max(px, 1.6) * uPixelRatio;
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

export function createStarMaterial(o: StarPointsOptions = {}): THREE.ShaderMaterial {
  const uniforms: StarPointsUniforms = {
    uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
    uSize: { value: o.size ?? 9 },
    uMaxSize: { value: o.maxSize ?? 56 },
    uUnitPc: { value: o.unitPc ?? 1 },
    uMagOffset: { value: o.magOffset ?? 0 },
    uAlpha: { value: o.alpha ?? 1 },
    uTex: { value: starSpriteTexture() },
  };
  return new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: o.depthTest ?? true,
    blending: THREE.AdditiveBlending,
  });
}

/** Build a colour buffer (Float32, 3 per star) from B-V indices. */
export function colorsFromBv(ci: Float32Array): Float32Array {
  const out = new Float32Array(ci.length * 3);
  for (let i = 0; i < ci.length; i++) {
    const [r, g, b] = bvToRgb(Number.isFinite(ci[i]) ? ci[i] : 0.6);
    out[i * 3] = r; out[i * 3 + 1] = g; out[i * 3 + 2] = b;
  }
  return out;
}

/**
 * Create the Points object.
 * @param positions Float32Array xyz (scene units)
 * @param absMag    Float32Array absolute magnitudes (one per star)
 * @param colors    Float32Array rgb 0..1 (use colorsFromBv)
 */
export function createStarPoints(positions: Float32Array, absMag: Float32Array, colors: Float32Array, o: StarPointsOptions = {}): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('absMag', new THREE.BufferAttribute(absMag, 1));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeBoundingSphere();
  const pts = new THREE.Points(geo, createStarMaterial(o));
  pts.frustumCulled = false; // huge point clouds: always draw
  return pts;
}

/** Typed access to the uniforms of a star material. */
export function starUniforms(m: THREE.ShaderMaterial): StarPointsUniforms {
  return m.uniforms as unknown as StarPointsUniforms;
}
