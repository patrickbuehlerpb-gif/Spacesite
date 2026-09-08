/**
 * Screen-space star picking. Projects every star once per click with the combined
 * projection × view × model matrix (no allocations) and returns the best candidate within
 * `radiusPx`: brighter stars (apparent magnitude from the camera position) win over faint ones,
 * closeness to the pointer breaks ties (12 px ≈ 4 magnitudes).
 */
export interface PickInput {
  pos: Float32Array;
  absMag: Float32Array;
  count: number;
  /** column-major 4×4 (THREE.Matrix4.elements) mapping catalogue coordinates → clip space */
  mvp: ArrayLike<number>;
  /** camera position in catalogue coordinates */
  cx: number; cy: number; cz: number;
  /** pointer position in CSS pixels */
  px: number; py: number;
  width: number; height: number;
  radiusPx: number;
}

export function pickStar(o: PickInput): number {
  const m = o.mvp;
  const m0 = m[0], m4 = m[4], m8 = m[8], m12 = m[12];
  const m1 = m[1], m5 = m[5], m9 = m[9], m13 = m[13];
  const m3 = m[3], m7 = m[7], m11 = m[11], m15 = m[15];
  const hw = o.width / 2, hh = o.height / 2;
  const r2 = o.radiusPx * o.radiusPx;
  const pos = o.pos, abs = o.absMag;
  let best = -1, bestScore = Infinity;
  for (let i = 0, n = o.count; i < n; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const w = m3 * x + m7 * y + m11 * z + m15;
    if (w <= 1e-9) continue;                         // behind the camera
    const sx = ((m0 * x + m4 * y + m8 * z + m12) / w) * hw + hw;
    const dx = sx - o.px;
    if (dx > o.radiusPx || dx < -o.radiusPx) continue;
    const sy = hh - ((m1 * x + m5 * y + m9 * z + m13) / w) * hh;
    const dy = sy - o.py;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;
    const ddx = x - o.cx, ddy = y - o.cy, ddz = z - o.cz;
    const dist = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
    const mag = abs[i] + 5 * (Math.log10(Math.max(dist, 1e-6)) - 1);
    const score = mag + Math.sqrt(d2) * 0.33;
    if (score < bestScore) { bestScore = score; best = i; }
  }
  return best;
}
