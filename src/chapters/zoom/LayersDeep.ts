import * as THREE from 'three';
import { t, pick, lang } from '../../core/i18n';
import { fmtNum, fmtYears, raDecToXYZ, LY_PER_PC, smoothstep } from '../../core/units';
import { loadGalaxyCatalog } from '../../data/galaxies';
import { makeLayer, type LayerBuild, type LabelSpec, type ObjectInfo } from './model';
import { createCmb } from './Cmb';
import { createCloud, sampleWeb, mixRgb, fmtLy, M_PER_MPC, type RGB } from './util';
import { landmarkName, type Landmark } from './LayersStars';
import type { BuildCtx } from './LayersNear';

const KIND_KEY: Record<Landmark['kind'], string> = { cluster: 'zoom.kind.galcluster', supercluster: 'zoom.kind.supercluster', galaxy: 'zoom.kind.galaxy', void: 'zoom.kind.void', wall: 'zoom.kind.wall' };

function landmarkInfo(lm: Landmark, src: string): ObjectInfo {
  const ld = Math.log10(lm.dist * M_PER_MPC);
  return {
    id: lm.id, title: () => landmarkName(lm), kind: KIND_KEY[lm.kind],
    rows: () => [[t('zoom.rowDist'), fmtLy(lm.dist * 1e6 * LY_PER_PC)], [t('zoom.rowLight'), fmtYears(lm.dist * 1e6 * LY_PER_PC)], ...lm.numbers.slice(0, 2).map((n) => [pick(n.label), typeof n.value === 'number' ? fmtNum(n.value, { digits: 0 }) : n.value] as [string, string])],
    blurb: () => `<p>${pick(lm.blurb)}</p>`, src, zoom: Math.max(22.2, ld + 0.35),
  };
}

// =============================================================================================
// 5. Galaxies (unit 1 Mpc; window 22 – 25.5): 2MRS + landmarks + schematic web beyond the survey
// =============================================================================================
export async function buildGalaxyLayer(b: BuildCtx, landmarks: Landmark[]): Promise<LayerBuild> {
  const cat = await loadGalaxyCatalog();
  const L = makeLayer('galaxies', M_PER_MPC, 22, 25.5, 'zoom.srcGal', { minFar: 1500 });
  const S = L.scene;
  const c = b.colors;

  // catalogue: colour by morphological type, pixel size by K magnitude, fade beyond 430 Mpc
  const n = cat.count;
  const cols = new Float32Array(n * 3), px = new Float32Array(n), br = new Float32Array(n);
  const pal: RGB[] = [mixRgb(c.text, c.violet, 0.4), mixRgb(c.gold, c.rose, 0.35), mixRgb(c.gold, c.rose, 0.35), mixRgb(c.cyan, [1, 1, 1], 0.3), c.violet];
  for (let i = 0; i < n; i++) {
    const col = pal[Math.min(4, cat.type[i])];
    cols[i * 3] = col[0]; cols[i * 3 + 1] = col[1]; cols[i * 3 + 2] = col[2];
    const bright = Math.max(0, Math.min(1, (11.75 - cat.kmag[i]) / 7.75));
    px[i] = 2.5 + 4.6 * bright;
    br[i] = (0.78 + 0.22 * bright) * (1 - smoothstep(380, 460, cat.dist[i]));
  }
  const gal = createCloud({ positions: cat.pos, colors: cols, minPx: px, bright: br, px: 0, maxPx: 8.5, alpha: 1 });
  S.add(gal.points); L.fades.push(gal.setAlpha); L.proj.push(gal.setProj);

  // Milky Way marker at the origin
  const mwPt = createCloud({ positions: new Float32Array(3), colors: mixRgb(c.cyan2, [1, 1, 1], 0.5), minPx: 4.5, maxPx: 4.5, px: 4.5 });
  S.add(mwPt.points); L.fades.push(mwPt.setAlpha); L.proj.push(mwPt.setProj);

  // schematic cosmic web beyond the survey edge (330 – 1 400 Mpc)
  const web = sampleWeb({ count: 40000, rMin: 330, rMax: 1400, cell: 75, seed: 7, radial: 'shell' });
  const wn = web.b.length, wsz = new Float32Array(wn), wcol = new Float32Array(wn * 3);
  const wc0 = mixRgb(c.violet, c.text2, 0.5), wc1 = mixRgb(c.cyan2, c.violet, 0.5);
  for (let i = 0; i < wn; i++) { wsz[i] = 2.2 + 3 * web.b[i]; const k = (i * 7919) % 100 / 100; const cc = mixRgb(wc0, wc1, k); wcol[i * 3] = cc[0]; wcol[i * 3 + 1] = cc[1]; wcol[i * 3 + 2] = cc[2]; }
  const webPts = createCloud({ positions: web.pos, sizes: wsz, colors: wcol, bright: web.b, minPx: 1.6, maxPx: 4.2, alpha: 0.75 });
  S.add(webPts.points); L.proj.push(webPts.setProj);

  // labels: landmarks (clusters, superclusters, voids, walls) with distance-dependent windows
  const labels: LabelSpec[] = [{ id: 'mwHere2', pos: new THREE.Vector3(), text: t('zoom.lbl.mw'), sub: t('zoom.lbl.here'), cls: 'cyan', lo: 22.5, hi: 25.4, prio: 0 }];
  const infos: ObjectInfo[] = [];
  for (const lm of landmarks) {
    if (['milkyway', 'lmc', 'smc', 'm31', 'm33'].includes(lm.id)) continue;
    const p = new THREE.Vector3(...raDecToXYZ(lm.ra, lm.dec, lm.dist));
    const ld = Math.log10(lm.dist * M_PER_MPC);
    const lo = Math.max(22.2, ld - 0.5, Math.log10(lm.radius * M_PER_MPC * 1.6));
    const hi = Math.min(25.5, ld + 1.35 + (lm.kind === 'supercluster' ? 0.4 : 0));
    const cls = lm.kind === 'supercluster' ? 'violet big' : lm.kind === 'cluster' ? 'violet' : lm.kind === 'galaxy' ? '' : 'dim';
    const prio = lm.kind === 'supercluster' ? 1 : lm.id === 'virgo' || lm.id === 'coma' || lm.id === 'norma' ? 2 : lm.kind === 'cluster' ? 4 : 6;
    labels.push({ id: lm.id, pos: p, text: landmarkName(lm), sub: lm.kind === 'supercluster' || lm.kind === 'void' || lm.kind === 'wall' ? t(KIND_KEY[lm.kind]) : undefined, cls, lo, hi, prio });
    infos.push(landmarkInfo(lm, 'zoom.srcGal'));
  }
  // one label marks the schematic web
  let wi = 0; for (let i = 0; i < wn; i++) { const r = Math.hypot(web.pos[i * 3], web.pos[i * 3 + 1], web.pos[i * 3 + 2]); if (r > 560 && r < 640 && web.b[i] > 0.8) { wi = i; break; } }
  labels.push({ id: 'web', pos: new THREE.Vector3(web.pos[wi * 3], web.pos[wi * 3 + 1], web.pos[wi * 3 + 2]), text: t('zoom.lbl.web'), sub: t('zoom.schematic'), cls: 'dim', lo: 24.75, hi: 25.5, prio: 3 });
  L.labels = labels;
  infos.push(
    { id: 'mwHere2', title: () => t('zoom.lbl.mw'), kind: 'zoom.kind.galaxy', rows: () => [[t('zoom.rowDiameter'), fmtLy(100000)], [t('zoom.rowStars'), `100 – 400 ${lang() === 'en' ? 'billion' : 'Mrd.'}`]], blurb: () => `<p>${t('zoom.obj.mwHere')}</p>`, src: 'zoom.srcGal', zoom: 21 },
    { id: 'web', title: () => t('zoom.lbl.web'), kind: 'zoom.kind.web', rows: () => [[t('zoom.rowDist'), `> ${fmtLy(1.1e9)}`]], blurb: () => `<p>${t('zoom.obj.web')}</p>`, src: 'zoom.srcGal', zoom: 25.3 },
  );

  L.update = (_dt, logD) => {
    const k = L.opacity;
    webPts.setAlpha(k * smoothstep(24.25, 24.95, logD));
  };
  return { layer: L, infos };
}

// =============================================================================================
// 6. Universe (unit 1e24 m; window 24.5 – 26.7): large-scale structure + the CMB sphere
// =============================================================================================
const side = new THREE.Vector3(), up = new THREE.Vector3();
export function buildUniverseLayer(b: BuildCtx): LayerBuild {
  const L = makeLayer('universe', 1e24, 24.5, 26.7, 'zoom.srcCmb', { hardHi: true });
  const S = L.scene;
  const c = b.colors;
  const R = 440;                                   // 4.4e26 m
  const MPC = M_PER_MPC / 1e24;                    // units per Mpc (0.0309)

  const cmb = createCmb(R);
  S.add(cmb.mesh);

  // large-scale structure: an inner web matching the galaxy layer's cells + a coarse schematic web across the volume
  const inner = sampleWeb({ count: 18000, rMin: 5 * MPC, rMax: 2200 * MPC, cell: 75 * MPC, seed: 7, radial: 'shell' });
  const outer = sampleWeb({ count: 34000, rMin: 400 * MPC, rMax: R * 0.985, cell: 620 * MPC, seed: 11, radial: 'shell' });
  const n1 = inner.b.length, n2 = outer.b.length, N = n1 + n2;
  const pos = new Float32Array(N * 3), br = new Float32Array(N), sz = new Float32Array(N), col = new Float32Array(N * 3);
  pos.set(inner.pos, 0); pos.set(outer.pos, n1 * 3); br.set(inner.b, 0); br.set(outer.b, n1);
  const c0 = mixRgb(c.violet, c.text2, 0.45), c1 = mixRgb(c.cyan2, c.violet, 0.4);
  for (let i = 0; i < N; i++) {
    sz[i] = (i < n1 ? 2.2 + 3 * br[i] : 12 + 22 * br[i]) * MPC;
    const k = (i * 7919) % 100 / 100; const cc = mixRgb(c0, c1, k); col[i * 3] = cc[0]; col[i * 3 + 1] = cc[1]; col[i * 3 + 2] = cc[2];
  }
  const lss = createCloud({ positions: pos, sizes: sz, colors: col, bright: br, minPx: 1.1, maxPx: 3.2, alpha: 0.5 });
  S.add(lss.points); L.fades.push(lss.setAlpha); L.proj.push(lss.setProj);

  const mwPt = createCloud({ positions: new Float32Array(3), colors: mixRgb(c.cyan2, [1, 1, 1], 0.5), minPx: 4.5, maxPx: 4.5, px: 4.5 });
  S.add(mwPt.points); L.fades.push(mwPt.setAlpha); L.proj.push(mwPt.setProj);

  const labels: LabelSpec[] = [
    { id: 'mwHere3', pos: new THREE.Vector3(), text: t('zoom.lbl.mw'), sub: t('zoom.lbl.here'), cls: 'cyan', lo: 25.4, hi: 26.7, prio: 0 },
    { id: 'lss', pos: new THREE.Vector3(outer.pos[30], outer.pos[31], outer.pos[32]), text: t('zoom.lbl.lss'), sub: t('zoom.schematic'), cls: 'dim', lo: 25.6, hi: 26.7, prio: 4 },
    { id: 'cmb', pos: new THREE.Vector3(0, 0, -R), text: t('zoom.lbl.cmb'), sub: t('zoom.lbl.cmbSub'), cls: 'big gold centre', lo: 25.7, hi: 26.7, prio: 1, dyn: (out, dir) => {
      // straight ahead on the sphere, lifted ~12° so it never collides with the Milky Way marker at the centre
      side.set(0, 0, 1).cross(dir).normalize(); up.crossVectors(dir, side).normalize();
      out.copy(dir).multiplyScalar(-0.978).addScaledVector(up, 0.208).multiplyScalar(R * 0.985);
    } },
  ];
  L.labels = labels;
  const infos: ObjectInfo[] = [
    { id: 'mwHere3', title: () => t('zoom.lbl.mw'), kind: 'zoom.kind.galaxy', rows: () => [[t('zoom.rowDiameter'), fmtLy(100000)]], blurb: () => `<p>${t('zoom.obj.mwHere')}</p>`, src: 'zoom.srcCmb', zoom: 21 },
    { id: 'lss', title: () => t('zoom.lbl.lss'), kind: 'zoom.kind.web', rows: () => [[t('zoom.rowDist'), `> ${fmtLy(1.3e9)}`]], blurb: () => `<p>${t('zoom.obj.lss')}</p>`, src: 'zoom.srcCmb', zoom: 26.2 },
    { id: 'cmb', title: () => t('zoom.lbl.cmb'), kind: 'zoom.kind.cmb', rows: () => [[t('zoom.rowDist'), fmtLy(46.5e9)], [t('zoom.rowAge'), fmtYears(13.8e9)], [t('zoom.rowTemp'), `${fmtNum(2.725, { digits: 3 })} K`], [t('zoom.rowRedshift'), 'z ≈ 1100']], blurb: () => `<p>${t('zoom.obj.cmb')}</p>`, src: 'zoom.srcCmb', zoom: 26.55 },
  ];

  L.update = (_dt, logD) => {
    const k = L.opacity;
    cmb.setAlpha(k * (0.18 + 0.72 * smoothstep(25.2, 26.4, logD)));
  };
  return { layer: L, infos };
}
