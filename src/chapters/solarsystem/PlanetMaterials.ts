import * as THREE from 'three';
import type { Body } from '../../data/solarsystem';
import { textureUrl } from '../../core/Loader';

/**
 * Procedural planet surfaces. All bodies are lit by the Sun at the world origin: the fragment
 * shader derives the light direction from the world position (`normalize(-vW)`), so no light
 * uniforms need updating. Noise is evaluated in object space → the pattern rotates with the body.
 *
 *   createBodyMaterial(body)            → ShaderMaterial (or MeshStandardMaterial for the textured Moon)
 *   createRingMesh(body)                → Mesh in planet radii, child of the (scaled) planet mesh
 *   createCometTail(), glowTexture(), diamondTexture()
 */

const NOISE = /* glsl */ `
float hash(vec3 p){ p = fract(p*0.3183099+vec3(0.1,0.2,0.3)); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float v=0.0; float a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p=p*2.07+vec3(1.3,2.1,0.7); a*=0.5; } return v; }
float fbm3(vec3 p){ float v=0.0; float a=0.5; for(int i=0;i<3;i++){ v+=a*noise(p); p=p*2.11+vec3(0.9); a*=0.5; } return v; }
`;

const BODY_VERT = /* glsl */ `
varying vec3 vP; varying vec3 vN; varying vec3 vW; varying vec3 vC; varying vec3 vAxis; varying float vR;
void main(){
  vP = normalize(position);
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vC = modelMatrix[3].xyz;
  vAxis = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
  vR = length(vec3(modelMatrix[0]));
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const BODY_FRAG = /* glsl */ `
uniform vec3 uColor; uniform vec3 uAtmo; uniform float uTime; uniform vec2 uRing; uniform sampler2D uRingTex;
varying vec3 vP; varying vec3 vN; varying vec3 vW; varying vec3 vC; varying vec3 vAxis; varying float vR;
${NOISE}

vec3 surface(vec3 p) {
  float lat = p.y;
  float lon = atan(p.z, p.x);
#if defined(LOOK_JUPITER)
  float warp = fbm(p*3.0) - 0.5;
  float band = lat*9.0 + warp*1.3 + 0.35*fbm(vec3(lon*2.0, lat*12.0, 1.7));
  float s = sin(band*3.14159);
  float s2 = sin(band*6.28318 + 1.3);
  vec3 cream = vec3(0.93,0.87,0.76), tan_ = vec3(0.80,0.62,0.45), brown = vec3(0.56,0.38,0.27), white = vec3(0.98,0.96,0.92);
  vec3 col = mix(tan_, cream, smoothstep(-0.4,0.6,s));
  col = mix(col, brown, smoothstep(0.35,0.9,s2) * (0.35 + 0.65*smoothstep(0.05,0.5,abs(lat))));
  col = mix(col, white, smoothstep(0.62,0.95,fbm(p*9.0 + vec3(band*0.3))) * 0.4);
  col *= 1.0 - 0.28*smoothstep(0.55,1.0,abs(lat));
  // Great Red Spot: ellipse at 22° S
  float dl = mod(lon - 0.9 + 3.14159, 6.28318) - 3.14159;
  float dlat = lat + 0.38;
  float ell = (dl*dl)/0.10 + (dlat*dlat)/0.013;
  float spot = 1.0 - smoothstep(0.55, 1.15, ell + 0.3*fbm(p*18.0));
  col = mix(col, vec3(0.80,0.36,0.24), spot*0.9);
  col = mix(col, vec3(0.92,0.62,0.50), spot*smoothstep(0.0,0.5,ell)*0.35);
  return col;
#elif defined(LOOK_SATURN)
  float warp = fbm(p*2.5) - 0.5;
  float band = lat*7.0 + warp*0.9;
  float s = sin(band*3.14159);
  vec3 a = vec3(0.90,0.82,0.64), b = vec3(0.78,0.68,0.50), c = vec3(0.96,0.90,0.76);
  vec3 col = mix(b, a, smoothstep(-0.6,0.6,s));
  col = mix(col, c, smoothstep(0.55,0.95,fbm(p*7.0)) * 0.3);
  col *= 1.0 - 0.18*smoothstep(0.5,1.0,abs(lat));
  col = mix(col, vec3(0.62,0.70,0.72), smoothstep(0.86,1.0,abs(lat))*0.5); // bluish polar hexagon region
  return col;
#elif defined(LOOK_URANUS)
  float band = lat*6.0 + 0.4*(fbm(p*2.0)-0.5);
  vec3 col = vec3(0.64,0.86,0.92) * (0.97 + 0.04*sin(band*3.14159));
  col += vec3(0.08,0.05,0.0) * smoothstep(0.7,1.0,abs(lat));
  return col;
#elif defined(LOOK_NEPTUNE)
  float band = lat*6.0 + 0.6*(fbm(p*2.5)-0.5);
  vec3 col = mix(vec3(0.15,0.30,0.85), vec3(0.22,0.42,0.95), 0.5+0.5*sin(band*3.14159));
  float dl = mod(lon + 1.2 + 3.14159, 6.28318) - 3.14159;
  float dlat = lat + 0.35;
  float ell = (dl*dl)/0.08 + (dlat*dlat)/0.012;
  col = mix(col, vec3(0.08,0.16,0.55), (1.0 - smoothstep(0.5,1.1,ell + 0.3*fbm(p*15.0)))*0.8);
  col = mix(col, vec3(0.92,0.95,1.0), smoothstep(0.66,0.9,fbm(vec3(lon*3.0, lat*14.0, 4.0)))*0.5);
  return col;
#elif defined(LOOK_MARS)
  vec3 col = vec3(0.74,0.43,0.26);
  float d = fbm(p*3.5 + 1.0);
  col = mix(col, vec3(0.40,0.24,0.17), smoothstep(0.50,0.68,d));
  col = mix(col, vec3(0.88,0.62,0.42), smoothstep(0.30,0.42,fbm(p*5.0 + 3.0))*0.5);
  col *= 0.9 + 0.2*fbm(p*14.0);
  float cap = smoothstep(0.84, 0.92, abs(lat) + 0.06*(fbm(p*10.0)-0.5) + (lat > 0.0 ? 0.0 : 0.03));
  col = mix(col, vec3(0.96,0.96,0.98), cap);
  return col;
#elif defined(LOOK_VENUS)
  float c = fbm(vec3(lon*1.5 + lat*3.0, lat*7.0, 2.0) + 0.7*fbm(p*4.0));
  float chevron = sin(lat*6.0 + abs(lon)*1.5 + 2.0*fbm(p*3.0));
  vec3 col = mix(vec3(0.80,0.68,0.46), vec3(0.97,0.92,0.78), smoothstep(0.32,0.72,c));
  col = mix(col, vec3(0.86,0.74,0.50), 0.25*smoothstep(0.2,0.9,chevron));
  return col;
#elif defined(LOOK_ICE)
  vec3 col = uColor * (0.78 + 0.32*fbm(p*4.0));
  col = mix(col, uColor*0.55, smoothstep(0.58,0.72,fbm(p*3.0 + 7.0)));
  col = mix(col, vec3(1.0), smoothstep(0.7,0.9,fbm(p*6.0 + 11.0))*0.35);
  return col;
#else
  // rocky grey (Mercury, Ceres): large albedo variations + crater-like ridged noise
  vec3 col = uColor * (0.82 + 0.3*fbm(p*2.5));
  col *= 0.8 + 0.35*fbm(p*9.0);
  float ridged = 1.0 - abs(2.0*noise(p*24.0) - 1.0);
  float ridged2 = 1.0 - abs(2.0*noise(p*55.0 + 3.0) - 1.0);
  col *= 1.0 - 0.32*smoothstep(0.72,0.96,ridged) - 0.18*smoothstep(0.8,0.98,ridged2);
  col = mix(col, col*1.25, smoothstep(0.9,1.0,ridged)); // bright rims
  return col;
#endif
}

void main(){
  vec3 n = normalize(vN);
  vec3 L = normalize(-vW);                 // towards the Sun (origin)
  vec3 v = normalize(cameraPosition - vW);
  float ndl = dot(n, L);
  float day = smoothstep(-0.08, 0.35, ndl);
  vec3 alb = surface(vP);
  float shadow = 1.0;
#ifdef HAS_RING
  float denom = dot(L, vAxis);
  if (abs(denom) > 1e-4) {
    float s = dot(vC - vW, vAxis) / denom;
    if (s > 0.0) {
      vec3 Q = vW + L * s;
      float rr = length(Q - vC) / vR;
      if (rr > uRing.x && rr < uRing.y) {
        float a = texture2D(uRingTex, vec2((rr - uRing.x) / (uRing.y - uRing.x), 0.5)).a;
        shadow = 1.0 - 0.9 * a;
      }
    }
  }
#endif
  vec3 col = alb * (0.035 + 1.08 * max(ndl, 0.0) * shadow);
  col += alb * 0.05 * (1.0 - day);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.5);
  col += uAtmo * rim * (0.25 + 0.85 * day);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const LOOK_DEFINE: Partial<Record<Body['look'], string>> = {
  jupiter: 'LOOK_JUPITER', saturn: 'LOOK_SATURN', uranus: 'LOOK_URANUS', neptune: 'LOOK_NEPTUNE',
  mars: 'LOOK_MARS', venus: 'LOOK_VENUS', ice: 'LOOK_ICE', 'rocky-grey': 'LOOK_ROCK', moon: 'LOOK_ROCK',
};
const ATMO: Partial<Record<Body['look'], [number, number, number]>> = {
  jupiter: [0.55, 0.45, 0.35], saturn: [0.6, 0.55, 0.4], uranus: [0.4, 0.75, 0.85], neptune: [0.3, 0.45, 1.0],
  mars: [0.6, 0.35, 0.2], venus: [0.9, 0.8, 0.55],
};

let whiteTex: THREE.Texture | null = null;
function white1x1(): THREE.Texture {
  if (whiteTex) return whiteTex;
  whiteTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  whiteTex.needsUpdate = true;
  return whiteTex;
}

export type BodyMaterial = THREE.ShaderMaterial | THREE.MeshStandardMaterial;

/** Material for a body's sphere (unit radius; the mesh is scaled). */
export function createBodyMaterial(body: Body): BodyMaterial {
  if (body.look === 'moon') {
    const tex = new THREE.TextureLoader().load(textureUrl('moon.jpg'));
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 });
  }
  const defines: Record<string, number> = { [LOOK_DEFINE[body.look] ?? 'LOOK_ROCK']: 1 };
  if (body.rings) defines.HAS_RING = 1;
  const atmo = ATMO[body.look] ?? [0, 0, 0];
  const ringTex = body.rings ? ringTexture(body) : white1x1();
  return new THREE.ShaderMaterial({
    defines,
    uniforms: {
      uColor: { value: new THREE.Color(body.color) },
      uAtmo: { value: new THREE.Color(atmo[0], atmo[1], atmo[2]) },
      uTime: { value: 0 },
      uRing: { value: new THREE.Vector2(body.rings?.inner ?? 0, body.rings?.outer ?? 0) },
      uRingTex: { value: ringTex },
    },
    vertexShader: BODY_VERT, fragmentShader: BODY_FRAG,
  });
}

// ---------------------------------------------------------------------------------------------
// Rings
// ---------------------------------------------------------------------------------------------
const ringTexCache = new Map<string, THREE.CanvasTexture>();

/** 1-D radial ring texture (u: inner → outer). Saturn: C / B / Cassini / A / Encke; Uranus: narrow dark rings. */
export function ringTexture(body: Body): THREE.CanvasTexture {
  const cached = ringTexCache.get(body.id);
  if (cached) return cached;
  const W = 1024, c = document.createElement('canvas'); c.width = W; c.height = 4;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, 4);
  const { inner, outer } = body.rings!;
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const stripes: number[] = []; for (let i = 0; i < 180; i++) stripes.push(rnd());
  for (let x = 0; x < W; x++) {
    const r = inner + (outer - inner) * (x / (W - 1));  // planet radii
    let a = 0, cr = 0.86, cg = 0.80, cb = 0.66;
    if (body.id === 'saturn') {
      // C ring 1.24–1.53 (dim), B 1.53–1.95 (bright), Cassini 1.95–1.99, A 1.99–2.27, Encke gap 2.21
      a = 0.32 * smooth(1.24, 1.30, r) * (1 - smooth(1.50, 1.53, r));
      a += 0.95 * smooth(1.52, 1.56, r) * (1 - smooth(1.93, 1.955, r));
      a += 0.12 * smooth(1.955, 1.96, r) * (1 - smooth(1.985, 1.99, r));
      a += 0.72 * smooth(1.985, 2.00, r) * (1 - smooth(2.24, 2.27, r));
      a *= 1 - 0.85 * smooth(2.205, 2.212, r) * (1 - smooth(2.218, 2.226, r));  // Encke
      a *= 1 - 0.5 * smooth(2.258, 2.261, r) * (1 - smooth(2.263, 2.266, r));   // Keeler
      const st = stripes[Math.floor((x / W) * 180)];
      a *= 0.78 + 0.32 * st;
      if (r < 1.53) { cr = 0.72; cg = 0.70; cb = 0.66; }
      else if (r < 1.95) { cr = 0.90; cg = 0.84; cb = 0.68; }
      else { cr = 0.84; cg = 0.79; cb = 0.68; }
    } else {
      // Uranus: narrow dark rings (ε at ~2.0, plus a few inner ones)
      const rings = [1.64, 1.68, 1.72, 1.78, 1.84, 1.90, 1.95, 2.0];
      for (const rr of rings) a += (rr === 2.0 ? 0.55 : 0.25) * smooth(rr - 0.006, rr - 0.002, r) * (1 - smooth(rr + 0.002, rr + 0.006, r));
      cr = 0.55; cg = 0.6; cb = 0.65;
    }
    a = Math.min(1, a);
    for (let y = 0; y < 4; y++) {
      const o = (y * W + x) * 4;
      img.data[o] = Math.round(cr * 255); img.data[o + 1] = Math.round(cg * 255); img.data[o + 2] = Math.round(cb * 255); img.data[o + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
  ringTexCache.set(body.id, t);
  return t;
}

const RING_VERT = /* glsl */ `
varying float vr; varying vec3 vW; varying vec3 vC; varying float vR; varying vec3 vN;
void main(){
  vr = length(position.xy);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vC = modelMatrix[3].xyz; vR = length(vec3(modelMatrix[0]));
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const RING_FRAG = /* glsl */ `
uniform sampler2D uTex; uniform float uInner, uOuter, uOpacity;
varying float vr; varying vec3 vW; varying vec3 vC; varying float vR; varying vec3 vN;
void main(){
  float u = clamp((vr - uInner) / (uOuter - uInner), 0.0, 1.0);
  vec4 tex = texture2D(uTex, vec2(u, 0.5));
  vec3 L = normalize(-vW);
  vec3 toC = vC - vW; float tc = dot(toC, L);
  float d2 = dot(toC, toC) - tc*tc;
  float shadow = tc > 0.0 ? smoothstep(vR*vR*0.94, vR*vR*1.02, d2) : 1.0;
  float lit = 0.22 + 0.78 * abs(dot(normalize(vN), L));
  vec3 col = tex.rgb * (0.08 + 0.92 * lit * shadow);
  gl_FragColor = vec4(col, tex.a * uOpacity);
  #include <colorspace_fragment>
}`;

/** Ring mesh in planet radii (add as child of the unit-sphere planet mesh, which is scaled). */
export function createRingMesh(body: Body): THREE.Mesh {
  const { inner, outer } = body.rings!;
  const geo = new THREE.RingGeometry(inner, outer, 192, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: ringTexture(body) }, uInner: { value: inner }, uOuter: { value: outer }, uOpacity: { value: body.id === 'saturn' ? 1 : 0.7 } },
    vertexShader: RING_VERT, fragmentShader: RING_FRAG, transparent: true, side: THREE.DoubleSide, depthWrite: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}

// ---------------------------------------------------------------------------------------------
// Sprites: glow (comet head, Sun marker) and diamond (probes)
// ---------------------------------------------------------------------------------------------
let glowTex: THREE.Texture | null = null;
export function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const s = 128, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.15, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.3)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.05)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, s, s);
  glowTex = new THREE.CanvasTexture(c); glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

let diamondTex: THREE.Texture | null = null;
export function diamondTexture(): THREE.Texture {
  if (diamondTex) return diamondTex;
  const s = 64, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d')!;
  g.translate(s / 2, s / 2);
  g.beginPath(); g.moveTo(0, -22); g.lineTo(14, 0); g.lineTo(0, 22); g.lineTo(-14, 0); g.closePath();
  g.fillStyle = 'rgba(184,232,255,0.55)'; g.fill();
  g.lineWidth = 2.5; g.strokeStyle = 'rgba(255,255,255,1)'; g.stroke();
  diamondTex = new THREE.CanvasTexture(c); diamondTex.colorSpace = THREE.SRGBColorSpace;
  return diamondTex;
}

// ---------------------------------------------------------------------------------------------
// Comet tail: additive particle plume in a local frame (head at origin, +Y away from the Sun)
// ---------------------------------------------------------------------------------------------
export interface CometTail { object: THREE.Points; setViewport(heightPx: number): void; update(pos: THREE.Vector3, awayFromSun: THREE.Vector3, lengthUnits: number, opacity: number): void }

const TAIL_VERT = /* glsl */ `
attribute float aT; attribute float aS; varying float vT;
uniform float uHpx, uPR, uSize;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float sz = uSize * (0.35 + 1.4 * aT) * aS;
  gl_PointSize = clamp(sz * uHpx / max(-mv.z, 1e-6) * uPR, 1.0, 160.0);
  gl_Position = projectionMatrix * mv;
  vT = aT;
}`;
const TAIL_FRAG = /* glsl */ `
uniform float uOpacity; varying float vT;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, d) * pow(1.0 - vT, 1.4) * uOpacity * 0.16;
  gl_FragColor = vec4(vec3(0.75, 0.9, 1.0) * a, a);
}`;

export function createCometTail(count = 320): CometTail {
  const pos = new Float32Array(count * 3), aT = new Float32Array(count), aS = new Float32Array(count);
  let seed = 42;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) * 1.2;
  for (let i = 0; i < count; i++) {
    const t = Math.pow(rnd(), 0.7);
    const spread = 0.04 + 0.16 * t;
    pos[i * 3] = gauss() * spread; pos[i * 3 + 1] = t; pos[i * 3 + 2] = gauss() * spread;
    aT[i] = t; aS[i] = 0.6 + 0.8 * rnd();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
  geo.setAttribute('aS', new THREE.BufferAttribute(aS, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uHpx: { value: 450 }, uPR: { value: Math.min(window.devicePixelRatio || 1, 2) }, uSize: { value: 0.12 }, uOpacity: { value: 1 } },
    vertexShader: TAIL_VERT, fragmentShader: TAIL_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const object = new THREE.Points(geo, mat);
  object.frustumCulled = false;
  const up = new THREE.Vector3(0, 1, 0);
  return {
    object,
    setViewport(h) { mat.uniforms.uHpx.value = h / 2; },
    update(p, away, len, opacity) {
      object.visible = len > 0.03 && opacity > 0.02;
      if (!object.visible) return;
      object.position.copy(p);
      object.quaternion.setFromUnitVectors(up, away);
      object.scale.set(len, len, len);
      mat.uniforms.uOpacity.value = opacity;
    },
  };
}
