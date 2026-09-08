import * as THREE from 'three';
import { starSpriteTexture } from '../../core/StarPoints';
import type { GalaxyCatalog } from '../../data/galaxies';

/**
 * GPU renderer for the 2MRS catalogue: one THREE.Points with a custom shader.
 *  - point size from the K magnitude (bright = bigger, uSizeMin … uSizeMax px), plus a mild boost for galaxies
 *    close to the camera so fly-throughs feel three-dimensional;
 *  - colour by morphological type (elliptical/lenticular → warm gold-rose, spiral → cyan-blue, irregular → violet,
 *    unknown → soft white) or by recession velocity cz (blue → white → red, Hubble's law), blended by uCzMix;
 *  - galaxies beyond uMaxDist (Mpc from the origin) fade out;
 *  - additive blending, no twinkle.
 * Scene unit = megaparsec. The catalogue is in the equatorial frame; put the Points in a group rotated for north-up.
 */
export interface GalaxyPointUniforms {
  uPixelRatio: { value: number };
  uSizeMin: { value: number };
  uSizeMax: { value: number };
  uAlpha: { value: number };
  uMaxDist: { value: number };
  uCzMix: { value: number };
  uCzMax: { value: number };
  uColUnknown: { value: THREE.Vector3 };
  uColEll: { value: THREE.Vector3 };
  uColSpiral: { value: THREE.Vector3 };
  uColIrr: { value: THREE.Vector3 };
  uColNear: { value: THREE.Vector3 };
  uColMid: { value: THREE.Vector3 };
  uColFar: { value: THREE.Vector3 };
  uTex: { value: THREE.Texture };
}

export interface GalaxyPalette {
  unknown: THREE.Vector3; elliptical: THREE.Vector3; spiral: THREE.Vector3; irregular: THREE.Vector3;
  near: THREE.Vector3; mid: THREE.Vector3; far: THREE.Vector3;
}

const VERT = /* glsl */ `
attribute float kmag;
attribute float cz;
attribute float gtype;
uniform float uPixelRatio, uSizeMin, uSizeMax, uAlpha, uMaxDist, uCzMix, uCzMax;
uniform vec3 uColUnknown, uColEll, uColSpiral, uColIrr, uColNear, uColMid, uColFar;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dOrigin = length(position);                       // Mpc from the Milky Way
  float dCam = max(length(mv.xyz), 1e-4);                 // Mpc from the camera
  // brightness: K = 4 (very bright) → 1, K = 11.75 (survey limit) → 0
  float b = clamp((11.75 - kmag) / 7.75, 0.0, 1.0);
  float s = mix(uSizeMin, uSizeMax, b);
  s *= clamp(4.0 / dCam, 1.0, 2.2);                       // mild boost within ~4 Mpc of the camera
  // fade beyond the distance limit
  float reach = 1.0 - smoothstep(uMaxDist * 0.9, uMaxDist, dOrigin);
  vAlpha = uAlpha * reach * mix(0.42, 1.0, b);
  // colour by type
  vec3 ct = uColUnknown;
  if (gtype > 0.5 && gtype < 2.5) ct = uColEll;
  else if (gtype > 2.5 && gtype < 3.5) ct = uColSpiral;
  else if (gtype > 3.5) ct = uColIrr;
  // colour by recession velocity (Hubble's law): blue (near / approaching) → white → red (far)
  float k = clamp(cz / uCzMax, 0.0, 1.0);
  vec3 cz3 = k < 0.5 ? mix(uColNear, uColMid, k * 2.0) : mix(uColMid, uColFar, (k - 0.5) * 2.0);
  vColor = mix(ct, cz3, uCzMix);
  gl_PointSize = s * uPixelRatio;
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

export function createGalaxyPoints(cat: GalaxyCatalog, pal: GalaxyPalette): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(cat.pos, 3));
  geo.setAttribute('kmag', new THREE.BufferAttribute(cat.kmag, 1));
  geo.setAttribute('cz', new THREE.BufferAttribute(cat.cz, 1));
  geo.setAttribute('gtype', new THREE.BufferAttribute(cat.type, 1));
  geo.computeBoundingSphere();
  const uniforms: GalaxyPointUniforms = {
    uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
    uSizeMin: { value: 2 },
    uSizeMax: { value: 7 },
    uAlpha: { value: 0.85 },
    uMaxDist: { value: 430 },
    uCzMix: { value: 0 },
    uCzMax: { value: 30000 },
    uColUnknown: { value: pal.unknown },
    uColEll: { value: pal.elliptical },
    uColSpiral: { value: pal.spiral },
    uColIrr: { value: pal.irregular },
    uColNear: { value: pal.near },
    uColMid: { value: pal.mid },
    uColFar: { value: pal.far },
    uTex: { value: starSpriteTexture() },
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
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

export function galaxyUniforms(m: THREE.ShaderMaterial): GalaxyPointUniforms {
  return m.uniforms as unknown as GalaxyPointUniforms;
}
