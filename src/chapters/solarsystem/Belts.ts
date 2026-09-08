import * as THREE from 'three';

/**
 * Schematic asteroid / Kuiper belts: one THREE.Points each with a fixed pixel size and a soft sprite.
 * Positions are statistical (seeded), in the chapter's scene frame (ecliptic z → three.js Y).
 */
export interface BeltOpts {
  count: number;
  /** radial range in scene units */
  rMin: number; rMax: number;
  /** inclination spread (1 σ) in degrees */
  incSigmaDeg: number;
  color: number;
  /** pixel size */
  px?: number;
  alpha?: number;
  seed?: number;
  /** radial gaps (scene units) that get cleared, with half-width */
  gaps?: Array<[number, number]>;
}

const VERT = /* glsl */ `
attribute float aB; varying float vB; uniform float uPx, uPR;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uPx * uPR;
  gl_Position = projectionMatrix * mv;
  vB = aB;
}`;
const FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uAlpha; varying float vB;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.25, d) * vB * uAlpha;
  gl_FragColor = vec4(uColor * a, a);
}`;

export function createBelt(o: BeltOpts): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
  let seed = o.seed ?? 1;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) * 1.1;
  const pos = new Float32Array(o.count * 3), aB = new Float32Array(o.count);
  const D = Math.PI / 180;
  for (let i = 0; i < o.count; i++) {
    let r = 0;
    for (let k = 0; k < 8; k++) {
      r = o.rMin + (o.rMax - o.rMin) * (rnd() + rnd()) / 2;   // triangular: denser in the middle
      if (!o.gaps?.some(([g, w]) => Math.abs(r - g) < w)) break;
    }
    const lon = rnd() * Math.PI * 2;
    const inc = gauss() * o.incSigmaDeg * D;
    const phase = rnd() * Math.PI * 2;
    const z = r * Math.tan(inc) * Math.sin(phase);
    const rp = r * Math.cos(inc * Math.sin(phase));
    // ecliptic (x, y, z) → scene (x, z, -y)
    pos[i * 3] = rp * Math.cos(lon); pos[i * 3 + 1] = z; pos[i * 3 + 2] = -rp * Math.sin(lon);
    aB[i] = 0.35 + 0.65 * rnd() * rnd();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aB', new THREE.BufferAttribute(aB, 1));
  geo.computeBoundingSphere();
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(o.color) }, uAlpha: { value: o.alpha ?? 0.5 }, uPx: { value: o.px ?? 1.8 }, uPR: { value: Math.min(window.devicePixelRatio || 1, 2) } },
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geo, mat);
}

// ---------------------------------------------------------------------------------------------
// Markers: one soft fixed-pixel dot per body so bodies stay visible when their sphere is < a few px
// (true scale, or dwarf planets seen from the overview). Each dot fades out as soon as the sphere
// itself is large enough on screen; it is pushed towards the camera by ~1.6 radii so it wins the
// depth test against its own sphere but stays hidden behind other bodies.
// ---------------------------------------------------------------------------------------------
export interface Markers {
  points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  /** xyz per marker – write, then commit() */
  positions: Float32Array;
  /** current sphere radius (scene units) per marker – write, then commit() */
  radii: Float32Array;
  setProjection(viewportHeightPx: number, fovDeg: number): void;
  commit(): void;
}

const MARK_VERT = /* glsl */ `
attribute vec3 color; attribute float aR; attribute float aPx;
varying vec3 vC; varying float vA;
uniform float uPR, uProj;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dist = max(-mv.z, 1e-7);
  float pr = aR * uProj / dist;                 // projected sphere radius in px
  vA = 1.0 - smoothstep(2.5, 7.0, pr);
  mv.xyz -= normalize(mv.xyz) * min(aR * 1.6, dist * 0.5);
  gl_PointSize = aPx * uPR;
  gl_Position = projectionMatrix * mv;
  vC = color;
}`;
const MARK_FRAG = /* glsl */ `
varying vec3 vC; varying float vA;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.3, d) * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(mix(vC, vec3(1.0), 0.3) * a, a);
}`;

export function createMarkers(colors: number[], pxSizes: number[]): Markers {
  const n = colors.length;
  const positions = new Float32Array(n * 3);
  const radii = new Float32Array(n);
  const col = new Float32Array(n * 3);
  const px = new Float32Array(n);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) { c.setHex(colors[i]); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; px[i] = pxSizes[i]; }
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3); posAttr.setUsage(THREE.DynamicDrawUsage);
  const rAttr = new THREE.BufferAttribute(radii, 1); rAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('aR', rAttr);
  geo.setAttribute('aPx', new THREE.BufferAttribute(px, 1));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uPR: { value: Math.min(window.devicePixelRatio || 1, 2) }, uProj: { value: 860 } },
    vertexShader: MARK_VERT, fragmentShader: MARK_FRAG,
    transparent: true, depthWrite: false, depthTest: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 5;
  return {
    points, positions, radii,
    setProjection(h, fovDeg) { mat.uniforms.uProj.value = (h / 2) / Math.tan((fovDeg * Math.PI) / 360); },
    commit() { posAttr.needsUpdate = true; rAttr.needsUpdate = true; },
  };
}
