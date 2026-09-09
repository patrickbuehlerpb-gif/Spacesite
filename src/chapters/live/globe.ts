/**
 * Scene objects of the live hero: star backdrop, ISS / observer markers and ground-track lines.
 * All markers are "pivots": a Group whose +Y axis is rotated onto the geographic direction, so moving
 * a marker costs one quaternion per frame and never touches a vertex buffer.
 */
import * as THREE from 'three';
import { loadStarCatalog } from '../../data/stars';
import { createStarPoints, colorsFromBv } from '../../core/StarPoints';
import { EARTH_RADIUS_KM } from '../../core/units';
import { fillTrack, fillCircle, type TrackSample } from './geo';

/** Radius of the star sphere (scene units = Earth radii). */
export const SKY_R = 3000;
const Y = new THREE.Vector3(0, 1, 0);

/** Soft radial glow for sprites (own texture: disposed with the chapter scene). */
export function glowTexture(): THREE.CanvasTexture {
  const s = 128, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.14, 'rgba(255,255,255,0.92)');
  grad.addColorStop(0.36, 'rgba(255,255,255,0.3)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.05)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Real night sky around the Earth in the chapter's world frame (equatorial, y-up):
 * catalogue (x, y, z) → world (x, z, −y), i.e. +X = vernal equinox, +Y = celestial north.
 * The Earth group is rotated by GMST, so the stars sit where they really are relative to the surface.
 */
export async function buildSky(): Promise<THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>> {
  const cat = await loadStarCatalog();
  const n = cat.count;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = cat.pos[i * 3], y = cat.pos[i * 3 + 1], z = cat.pos[i * 3 + 2];
    const d = Math.hypot(x, y, z) || 1;
    pos[i * 3] = (x / d) * SKY_R; pos[i * 3 + 1] = (z / d) * SKY_R; pos[i * 3 + 2] = (-y / d) * SKY_R;
  }
  const pts = createStarPoints(pos, cat.mag, colorsFromBv(cat.ci), { unitPc: 10 / SKY_R, size: 4.5, maxSize: 11, magOffset: 1.1, alpha: 0.7, depthTest: false });
  pts.renderOrder = -10;
  pts.name = 'sky';
  return pts;
}

export interface Marker {
  pivot: THREE.Group;
  /** attach CSS2D labels here (sits at the marker's altitude) */
  anchor: THREE.Object3D;
  setAltitude(altKm: number): void;
  /** angular radius (rad) of the visibility footprint circle */
  setFootprint(angRad: number): void;
}

function sprite(tex: THREE.Texture, color: number, scale: number, additive: boolean, opacity = 1): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
  s.scale.setScalar(scale);
  s.frustumCulled = false;
  return s;
}

/** ISS: glow + core at altitude, a thin stalk down to the ground, sub-satellite dot and footprint circle. */
export function createIssMarker(tex: THREE.Texture): Marker {
  const pivot = new THREE.Group();
  const glow = sprite(tex, 0x7fd3ff, 0.19, true, 0.9);
  const core = sprite(tex, 0xffffff, 0.055, false);
  const ground = sprite(tex, 0x7fd3ff, 0.035, true, 0.9);
  ground.position.y = 1.004;
  const anchor = new THREE.Object3D();

  const stalkBuf = new Float32Array([0, 1, 0, 0, 1.066, 0]);
  const stalkGeo = new THREE.BufferGeometry();
  stalkGeo.setAttribute('position', new THREE.BufferAttribute(stalkBuf, 3));
  const stalk = new THREE.Line(stalkGeo, new THREE.LineBasicMaterial({ color: 0x7fd3ff, transparent: true, opacity: 0.5 }));
  stalk.frustumCulled = false;

  const N = 96;
  const fpBuf = new Float32Array(N * 3);
  const fpGeo = new THREE.BufferGeometry();
  fpGeo.setAttribute('position', new THREE.BufferAttribute(fpBuf, 3));
  const foot = new THREE.LineLoop(fpGeo, new THREE.LineBasicMaterial({ color: 0x7fd3ff, transparent: true, opacity: 0.38 }));
  foot.frustumCulled = false;

  pivot.add(glow, core, ground, anchor, stalk, foot);
  const m: Marker = {
    pivot, anchor,
    setAltitude(altKm) {
      const r = 1 + altKm / EARTH_RADIUS_KM;
      glow.position.y = core.position.y = anchor.position.y = r;
      stalkBuf[4] = r;
      (stalkGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    },
    setFootprint(ang) {
      fillCircle(Y, ang, 1.006, N, fpBuf);
      (fpGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    },
  };
  m.setAltitude(420);
  m.setFootprint(0.355);
  return m;
}

/** Observer ("you"): warm dot on the surface with a small ring. */
export function createUserMarker(tex: THREE.Texture): Marker {
  const pivot = new THREE.Group();
  const glow = sprite(tex, 0xf2c46d, 0.11, true, 0.85);
  const core = sprite(tex, 0xfff3d6, 0.035, false);
  glow.position.y = core.position.y = 1.004;
  const anchor = new THREE.Object3D();
  anchor.position.y = 1.004;
  const N = 48;
  const buf = new Float32Array(N * 3);
  fillCircle(Y, 0.035, 1.005, N, buf);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(buf, 3));
  const ring = new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color: 0xf2c46d, transparent: true, opacity: 0.7 }));
  ring.frustumCulled = false;
  pivot.add(glow, core, anchor, ring);
  return { pivot, anchor, setAltitude() {}, setFootprint() {} };
}

export interface Track {
  line: THREE.Line;
  set(samples: TrackSample[]): void;
  clear(): void;
}

/** Great-circle polyline on the surface through the given samples (solid or dashed). Fixed-size buffer. */
export function createTrack(maxVerts: number, dashed: boolean, color: number, opacity: number): Track {
  const buf = new Float32Array(maxVerts * 3);
  const geo = new THREE.BufferGeometry();
  const attr = new THREE.BufferAttribute(buf, 3);
  geo.setAttribute('position', attr);
  geo.setDrawRange(0, 0);
  const mat = dashed
    ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.035, gapSize: 0.02 })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  return {
    line,
    set(samples) {
      const n = fillTrack(samples, 1.004, 14, buf);
      attr.needsUpdate = true;
      geo.setDrawRange(0, n);
      if (dashed) line.computeLineDistances();
    },
    clear() { geo.setDrawRange(0, 0); },
  };
}
