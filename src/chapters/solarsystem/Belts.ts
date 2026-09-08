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

/** Small fixed-pixel markers (one per body) so bodies stay visible at true scale. */
export function createMarkers(colors: number[], px = 5): { points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>; positions: Float32Array } {
  const n = colors.length;
  const positions = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) { c.setHex(colors[i]); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uPx: { value: px }, uPR: { value: Math.min(window.devicePixelRatio || 1, 2) } },
    vertexShader: /* glsl */ `attribute vec3 color; varying vec3 vC; uniform float uPx, uPR;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = uPx * uPR; gl_Position = projectionMatrix * mv; vC = color; }`,
    fragmentShader: /* glsl */ `varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.45, d); gl_FragColor = vec4(mix(vC, vec3(1.0), 0.35) * a, a); }`,
    transparent: true, depthWrite: false, depthTest: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, positions };
}
