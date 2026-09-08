import * as THREE from 'three';
import { loadStarCatalog } from '../../data/stars';
import { createStarPoints, colorsFromBv } from '../../core/StarPoints';
import { eqToEcl } from '../../data/solarsystem';

/**
 * Real night-sky backdrop: the HYG catalogue projected onto a sphere of radius SKY_R around the Sun,
 * converted from the equatorial catalogue frame to the chapter's heliocentric ecliptic frame
 * (ecliptic x → X, ecliptic z (north) → Y, ecliptic y → −Z). At 20 000 units the parallax from
 * anywhere inside the solar system is < 10 %, so one static Points object in the main scene is enough.
 *
 * Star positions use the *apparent* magnitude as "absMag" with unitPc = 10 / SKY_R (sphere ≙ 10 pc),
 * so the StarPoints shader reproduces the true apparent brightness of every star.
 */
export const SKY_R = 20_000;

export async function buildSky(): Promise<THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>> {
  const cat = await loadStarCatalog();
  const n = cat.count;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = cat.pos[i * 3], y = cat.pos[i * 3 + 1], z = cat.pos[i * 3 + 2];
    const d = Math.hypot(x, y, z) || 1;
    const e = eqToEcl({ x: x / d, y: y / d, z: z / d });
    pos[i * 3] = e.x * SKY_R; pos[i * 3 + 1] = e.z * SKY_R; pos[i * 3 + 2] = -e.y * SKY_R;
  }
  const points = createStarPoints(pos, cat.mag, colorsFromBv(cat.ci), { unitPc: 10 / SKY_R, size: 5, maxSize: 14, magOffset: 0.6, alpha: 0.8, depthTest: false });
  points.renderOrder = -10;
  points.name = 'sky';
  return points;
}
