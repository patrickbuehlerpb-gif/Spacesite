import * as THREE from 'three';
import { loadStarCatalog } from '../../data/stars';
import { createStarPoints, colorsFromBv } from '../../core/StarPoints';
import { eqToEcl } from '../../data/solarsystem';

/**
 * Real night-sky backdrop: the HYG catalogue projected onto a sphere of radius 100 around the
 * camera (rotation only), converted from equatorial to the chapter's ecliptic frame (z → Y).
 * The sky is rendered in its own scene with a rotation-only camera before the main scene.
 * Star positions use the *apparent* magnitude as "absMag" with unitPc = 0.1 (100 units ≙ 10 pc),
 * so the StarPoints shader reproduces the true apparent brightness.
 */
export interface Sky { scene: THREE.Scene; camera: THREE.PerspectiveCamera }

export async function buildSky(aspect: number): Promise<Sky> {
  const cat = await loadStarCatalog();
  const R = 100;
  const n = cat.count;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = cat.pos[i * 3], y = cat.pos[i * 3 + 1], z = cat.pos[i * 3 + 2];
    const d = Math.hypot(x, y, z) || 1;
    const e = eqToEcl({ x: x / d, y: y / d, z: z / d });
    pos[i * 3] = e.x * R; pos[i * 3 + 1] = e.z * R; pos[i * 3 + 2] = -e.y * R;
  }
  const points = createStarPoints(pos, cat.mag, colorsFromBv(cat.ci), { unitPc: 10 / R, size: 5.5, maxSize: 16, magOffset: 0.9, alpha: 0.85, depthTest: false });
  const scene = new THREE.Scene();
  scene.add(points);
  const camera = new THREE.PerspectiveCamera(55, aspect, 1, 1000);
  return { scene, camera };
}
