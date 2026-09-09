import * as THREE from 'three';

/**
 * The cosmic microwave background as a huge sphere seen from inside: procedural anisotropy (3-D fbm value noise on
 * the sphere direction – seamless, no texture) tinted with a Planck-like colour map (deep blue → light blue → cream
 * → orange → dark red). The contrast is exaggerated by a factor of ~1e5, as in every published CMB map.
 */
export interface Cmb { mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>; setAlpha(k: number): void }

const VERT = /* glsl */ `
varying vec3 vP;
void main() { vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAG = /* glsl */ `
uniform float uAlpha;
varying vec3 vP;
float hash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.23)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 6; i++) { v += a * noise(p); p = p * 2.07 + vec3(3.1, 1.7, 5.3); a *= 0.55; } return v; }
void main() {
  vec3 p = vP;
  float v = fbm(p * 9.0) * 0.72 + fbm(p * 27.0 + 7.0) * 0.28;   // acoustic-peak-ish blotches (~1°) on top of larger patches
  float t = clamp((v - 0.5) * 3.4 + 0.5, 0.0, 1.0);
  vec3 c0 = vec3(0.03, 0.06, 0.32);
  vec3 c1 = vec3(0.22, 0.42, 0.78);
  vec3 c2 = vec3(0.86, 0.84, 0.72);
  vec3 c3 = vec3(0.93, 0.50, 0.12);
  vec3 c4 = vec3(0.45, 0.07, 0.03);
  vec3 col = t < 0.25 ? mix(c0, c1, t / 0.25) : t < 0.5 ? mix(c1, c2, (t - 0.25) / 0.25) : t < 0.75 ? mix(c2, c3, (t - 0.5) / 0.25) : mix(c3, c4, (t - 0.75) / 0.25);
  col *= 0.78;
  gl_FragColor = vec4(col * uAlpha, uAlpha);
}`;

export function createCmb(radius: number): Cmb {
  const uniforms = { uAlpha: { value: 1 } };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, blending: THREE.NormalBlending });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 48), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, setAlpha(k) { uniforms.uAlpha.value = k; } };
}
