import * as THREE from 'three';
import { starSpriteTexture } from '../../core/StarPoints';
import { bvToRgb, teffToBv } from '../../core/color';
import type { HostSystem } from './systems';

/**
 * One THREE.Points for all host stars (positions in parsec, catalogue frame – put it inside the
 * rotated group). Per-vertex: colour from Teff, pixel size from planet count, discovery time and a
 * visibility flag (filters). Uniforms drive the year playback: hosts whose first planet is not yet
 * discovered render dim; on discovery they pop with a brief white flash that decays over ~½ year.
 */
const VERT = /* glsl */ `
attribute float size;
attribute vec3 color;
attribute float year;
attribute float vis;
uniform float uPixelRatio, uYear, uDim;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = max(length(mv.xyz), 1e-4);
  float found = step(year, uYear);
  float age = max(uYear - year, 0.0);
  float flash = found * exp(-age * 5.0);
  float near = clamp(5.0 / d, 1.0, 3.0);           // grow a little when the camera is within 5 pc
  float px = size * near * (1.0 + 2.2 * flash);
  vAlpha = vis * mix(0.12, 1.0, found) * uDim;
  vColor = mix(color, vec3(1.0), 0.85 * flash);
  gl_PointSize = vis * px * uPixelRatio;
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

export interface HostPoints {
  points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  /** parsec positions, 3 per host (catalogue frame) – hosts without a position sit at the origin with vis = 0 */
  pos: Float32Array;
  vis: Float32Array;
  year: Float32Array;
  setYear(y: number): void;
  setDim(d: number): void;
  /** upload vis/year after editing the arrays */
  commit(): void;
}

export function pointSizeFor(nPlanets: number): number {
  return 3 + Math.min(nPlanets - 1, 4) * 1.0; // 3 … 7 px (soft sprite → perceived ≈ 2–6 px)
}

export function createHostPoints(hosts: HostSystem[]): HostPoints {
  const n = hosts.length;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const year = new Float32Array(n);
  const vis = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const h = hosts[i];
    if (h.xyz) { pos[i * 3] = h.xyz[0]; pos[i * 3 + 1] = h.xyz[1]; pos[i * 3 + 2] = h.xyz[2]; vis[i] = 1; }
    let r = 0.86, g = 0.89, b = 0.97; // white-ish when the temperature is unknown
    if (h.teff != null && h.teff > 1000) [r, g, b] = bvToRgb(teffToBv(h.teff));
    col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
    size[i] = pointSizeFor(h.planets.length);
    year[i] = Number.isFinite(h.firstT) ? h.firstT : 0;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const yearAttr = new THREE.BufferAttribute(year, 1);
  const visAttr = new THREE.BufferAttribute(vis, 1);
  yearAttr.setUsage(THREE.DynamicDrawUsage); visAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('year', yearAttr);
  geo.setAttribute('vis', visAttr);
  geo.computeBoundingSphere();
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uYear: { value: 1e6 },
      uDim: { value: 1 },
      uTex: { value: starSpriteTexture() },
    },
    vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 2;
  return {
    points, pos, vis, year,
    setYear(y) { mat.uniforms.uYear.value = y; },
    setDim(d) { mat.uniforms.uDim.value = d; },
    commit() { yearAttr.needsUpdate = true; visAttr.needsUpdate = true; },
  };
}
