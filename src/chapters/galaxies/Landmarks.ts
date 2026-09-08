import * as THREE from 'three';
import { raDecToXYZ } from '../../core/units';

/**
 * Helpers for the galaxies chapter that live in the *catalogue frame* (equatorial J2000, z = north, unit Mpc):
 *  - galactic frame (J2000 constants) → orientation of the Milky Way and of the galactic-plane disc;
 *  - one LineSegments of camera-facing wire circles for clusters / superclusters / voids (single draw call);
 *  - the faint disc that marks the zone of avoidance.
 */

// J2000 galactic frame: north galactic pole and galactic centre (Sgr A* direction)
export const NGP_RA = 192.85948, NGP_DEC = 27.12825;
export const GC_RA = 266.40499, GC_DEC = -28.93617;
/** Distance Sun → galactic centre in Mpc (8.2 kpc) */
export const SUN_GC_MPC = 0.0082;

export interface LandmarkNumber { label: { de: string; en: string }; value: number | string }
export type LandmarkKind = 'cluster' | 'supercluster' | 'galaxy' | 'void' | 'wall';
export interface Landmark {
  id: string; name: string; en: string; ra: number; dec: number; dist: number; kind: LandmarkKind; radius: number;
  blurb: { de: string; en: string }; numbers: LandmarkNumber[];
}

/** Catalogue-frame position of a landmark. */
export function landmarkPos(l: Landmark): THREE.Vector3 {
  const [x, y, z] = raDecToXYZ(l.ra, l.dec, l.dist);
  return new THREE.Vector3(x, y, z);
}

/**
 * Orthonormal basis of the Milky Way in the catalogue frame:
 * X = from the galactic centre towards the Sun, Z = galactic north, Y = Z × X. Returned as a quaternion
 * (local → catalogue) plus the position of the galactic centre.
 */
export function galacticBasis(): { quaternion: THREE.Quaternion; centre: THREE.Vector3 } {
  const [nx, ny, nz] = raDecToXYZ(NGP_RA, NGP_DEC, 1);
  const [gx, gy, gz] = raDecToXYZ(GC_RA, GC_DEC, 1);
  const Z = new THREE.Vector3(nx, ny, nz).normalize();
  const toGC = new THREE.Vector3(gx, gy, gz).normalize();
  // the Sun seen from the centre lies opposite to the centre direction; make it exactly perpendicular to Z
  const X = toGC.clone().multiplyScalar(-1);
  X.sub(Z.clone().multiplyScalar(X.dot(Z))).normalize();
  const Y = new THREE.Vector3().crossVectors(Z, X).normalize();
  const m = new THREE.Matrix4().makeBasis(X, Y, Z);
  return { quaternion: new THREE.Quaternion().setFromRotationMatrix(m), centre: toGC.multiplyScalar(SUN_GC_MPC) };
}

// ------------------------------------------------------------------------------------------------
// Camera-facing wire circles (billboarded in the vertex shader; one draw call for all landmarks)
// ------------------------------------------------------------------------------------------------
export interface RingUniforms { uProjScale: { value: number }; uMinPx: { value: number }; uMaxPx: { value: number }; uAlpha: { value: number } }

const RING_VERT = /* glsl */ `
attribute vec3 center;
attribute vec2 aParam;
attribute float aRadius;
attribute vec3 aColor;
attribute float aAlpha;
uniform float uProjScale, uMinPx, uMaxPx, uAlpha;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 wc = modelMatrix * vec4(center, 1.0);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 wp = wc.xyz + (right * aParam.x + up * aParam.y) * aRadius;
  vec4 vc = viewMatrix * wc;
  float dist = max(-vc.z, 1e-6);
  float px = aRadius / dist * uProjScale;               // apparent radius in px
  float vis = smoothstep(uMinPx, uMinPx * 2.5, px) * (1.0 - smoothstep(uMaxPx, uMaxPx * 1.8, px));
  vAlpha = vis * aAlpha * uAlpha * step(0.0, -vc.z);
  vColor = aColor;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const RING_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() { gl_FragColor = vec4(vColor * vAlpha, vAlpha); }`;

export interface RingSpec { center: THREE.Vector3; radius: number; color: [number, number, number]; alpha: number; dashed?: boolean }

export function createRings(specs: RingSpec[], segments = 72): { lines: THREE.LineSegments<THREE.BufferGeometry, THREE.ShaderMaterial>; uniforms: RingUniforms } {
  const centers: number[] = [], params: number[] = [], radii: number[] = [], colors: number[] = [], alphas: number[] = [];
  for (const s of specs) {
    for (let k = 0; k < segments; k++) {
      if (s.dashed && k % 2 === 1) continue;
      const a0 = (k / segments) * Math.PI * 2, a1 = ((k + 1) / segments) * Math.PI * 2;
      for (const a of [a0, a1]) {
        centers.push(s.center.x, s.center.y, s.center.z);
        params.push(Math.cos(a), Math.sin(a));
        radii.push(s.radius);
        colors.push(s.color[0], s.color[1], s.color[2]);
        alphas.push(s.alpha);
      }
    }
  }
  const n = radii.length;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); // unused, required by three
  geo.setAttribute('center', new THREE.BufferAttribute(new Float32Array(centers), 3));
  geo.setAttribute('aParam', new THREE.BufferAttribute(new Float32Array(params), 2));
  geo.setAttribute('aRadius', new THREE.BufferAttribute(new Float32Array(radii), 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(colors), 3));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(alphas), 1));
  const uniforms: RingUniforms = { uProjScale: { value: 860 }, uMinPx: { value: 7 }, uMaxPx: { value: 380 }, uAlpha: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    vertexShader: RING_VERT, fragmentShader: RING_FRAG,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  return { lines, uniforms };
}

// ------------------------------------------------------------------------------------------------
// Galactic plane: a faint disc through the origin, perpendicular to the galactic pole (zone of avoidance)
// ------------------------------------------------------------------------------------------------
const PLANE_VERT = /* glsl */ `
varying float vR;
uniform float uRadius;
void main() { vR = length(position.xy) / uRadius; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const PLANE_FRAG = /* glsl */ `
varying float vR;
uniform vec3 uColor;
uniform float uAlpha;
void main() {
  float a = uAlpha * (1.0 - smoothstep(0.45, 1.0, vR)) * smoothstep(0.0, 0.02, vR);
  gl_FragColor = vec4(uColor * a, a);
}`;

export function createGalacticPlane(radius: number, color: [number, number, number]): { mesh: THREE.Mesh<THREE.CircleGeometry, THREE.ShaderMaterial>; uniforms: { uAlpha: { value: number } } } {
  const geo = new THREE.CircleGeometry(radius, 128);
  const uniforms = { uRadius: { value: radius }, uColor: { value: new THREE.Vector3(...color) }, uAlpha: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: PLANE_VERT, fragmentShader: PLANE_FRAG,
    transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  const { quaternion } = galacticBasis();
  mesh.quaternion.copy(quaternion);       // local +Z → galactic north
  return { mesh, uniforms };
}

/** Parse a CSS hex colour (#rgb / #rrggbb) to sRGB floats 0..1 (used for shader uniforms – no colour management). */
export function hexToRgb(hex: string, fallback: [number, number, number] = [1, 1, 1]): [number, number, number] {
  const h = hex.trim().replace('#', '');
  if (h.length === 3) return [parseInt(h[0] + h[0], 16) / 255, parseInt(h[1] + h[1], 16) / 255, parseInt(h[2] + h[2], 16) / 255];
  if (h.length === 6) return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
  return fallback;
}

export function mixRgb(a: [number, number, number], b: [number, number, number], k: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** Read a design token from :root (e.g. '--gold'). */
export function cssVar(name: string): string {
  try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); } catch { return ''; }
}
