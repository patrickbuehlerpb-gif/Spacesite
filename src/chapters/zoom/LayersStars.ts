import * as THREE from 'three';
import { t, pick, lang } from '../../core/i18n';
import { fmtNum, raDecToXYZ, LY_PER_PC, SUN_RADIUS_KM, KM_PER_PC, smoothstep, clamp, lerp } from '../../core/units';
import { createStarPoints, colorsFromBv, starUniforms } from '../../core/StarPoints';
import { spectralClassFromBv } from '../../core/color';
import { loadStarCatalog, loadStarNames, loadConstellations, type StarCatalog, type Constellation } from '../../data/stars';
import { makeLayer, type LayerBuild, type LabelSpec, type ObjectInfo } from './model';
import { createMilkyWay } from './MilkyWay';
import { createCloud, createShell, galaxyTexture, rng, gaussian, mixRgb, window01, fmtLy, M_PER_PC, M_PER_KPC, M_PER_MPC, DEG, type RGB } from './util';
import type { BuildCtx } from './LayersNear';

/** Galaxy landmark record (public/data/galaxy-landmarks.json). */
export interface Landmark {
  id: string; name: string; en: string; ra: number; dec: number; dist: number;
  kind: 'cluster' | 'supercluster' | 'galaxy' | 'void' | 'wall'; radius: number;
  blurb: { de: string; en: string }; numbers: Array<{ label: { de: string; en: string }; value: number | string }>;
}
export const landmarkName = (l: Landmark): string => (lang() === 'en' ? l.en : l.name);

// J2000 galactic frame
export const NGP_RA = 192.85948, NGP_DEC = 27.12825, GC_RA = 266.40499, GC_DEC = -28.93617;
export const SUN_GC_KPC = 8.2;
/** Basis of the galactic frame in equatorial coordinates: X = centre → Sun, Z = galactic north, plus the centre position (kpc). */
export function galacticBasis(): { quaternion: THREE.Quaternion; centre: THREE.Vector3; toGC: THREE.Vector3; north: THREE.Vector3; east: THREE.Vector3 } {
  const north = new THREE.Vector3(...raDecToXYZ(NGP_RA, NGP_DEC, 1)).normalize();
  const toGC = new THREE.Vector3(...raDecToXYZ(GC_RA, GC_DEC, 1)).normalize();
  const X = toGC.clone().negate();
  X.sub(north.clone().multiplyScalar(X.dot(north))).normalize();
  const Y = new THREE.Vector3().crossVectors(north, X).normalize();
  const m = new THREE.Matrix4().makeBasis(X, Y, north);
  // direction of galactic longitude 90° (rotation direction) = north × toGC
  const east = new THREE.Vector3().crossVectors(north, toGC).normalize();
  return { quaternion: new THREE.Quaternion().setFromRotationMatrix(m), centre: toGC.clone().multiplyScalar(SUN_GC_KPC), toGC, north, east };
}
/** Unit vector for galactic (l, b) in degrees. */
export function galDir(l: number, b: number): THREE.Vector3 {
  const g = galacticBasis();
  const cl = Math.cos(l * DEG), sl = Math.sin(l * DEG), cb = Math.cos(b * DEG), sb = Math.sin(b * DEG);
  return g.toGC.clone().multiplyScalar(cl * cb).addScaledVector(g.east, sl * cb).addScaledVector(g.north, sb).normalize();
}

// =============================================================================================
// 3. Stars (unit 1 pc; window 6.9 – 20.5). Also the sky background for the Earth/solar layers.
// =============================================================================================
const NAMED: Array<{ id: string; name: string }> = [
  { id: 'proxima', name: 'Proxima Centauri' }, { id: 'alphacen', name: 'Rigil Kentaurus' }, { id: 'barnard', name: "Barnard's Star" },
  { id: 'wolf359', name: 'Wolf 359' }, { id: 'sirius', name: 'Sirius' }, { id: 'procyon', name: 'Procyon' }, { id: 'vega', name: 'Vega' },
  { id: 'altair', name: 'Altair' }, { id: 'arcturus', name: 'Arcturus' }, { id: 'aldebaran', name: 'Aldebaran' }, { id: 'betelgeuse', name: 'Betelgeuse' },
  { id: 'rigel', name: 'Rigel' }, { id: 'polaris', name: 'Polaris' }, { id: 'deneb', name: 'Deneb' },
];

function constellationLines(cat: StarCatalog, cons: Constellation[], color: RGB): THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> {
  const arr: number[] = [];
  const p = cat.pos;
  for (const c of cons) for (const l of c.lines) for (let k = 0; k + 1 < l.length; k++) {
    const a = l[k], b = l[k + 1];
    if (a >= cat.count || b >= cat.count) continue;
    arr.push(p[a * 3], p[a * 3 + 1], p[a * 3 + 2], p[b * 3], p[b * 3 + 1], p[b * 3 + 2]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr), 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(color[0], color[1], color[2]), transparent: true, opacity: 0.22, depthWrite: false, depthTest: false }));
  lines.frustumCulled = false;
  return lines;
}

export async function buildStarLayer(b: BuildCtx): Promise<LayerBuild> {
  const [cat, names, cons] = await Promise.all([loadStarCatalog(), loadStarNames(), loadConstellations()]);
  const L = makeLayer('stars', M_PER_PC, 6.9, 20.5, 'zoom.srcStars', { hardLo: true, minFar: 4000 });
  const S = L.scene;
  const c = b.colors;

  const stars = createStarPoints(cat.pos, cat.absMag, colorsFromBv(cat.ci), { size: 8, maxSize: 48, depthTest: false });
  S.add(stars);
  const su = starUniforms(stars.material);
  L.fades.push((k) => { su.uAlpha.value = k; });

  // the Sun (not in the catalogue): a marker that appears once we are well outside the solar system
  const sunPt = createCloud({ positions: new Float32Array(3), sizes: SUN_RADIUS_KM * 2 / KM_PER_PC, colors: mixRgb(c.gold2, [1, 1, 1], 0.4), minPx: 7, maxPx: 60 });
  S.add(sunPt.points); L.proj.push(sunPt.setProj);

  // constellation figures (fade out beyond a few parsecs)
  const lines = constellationLines(cat, cons, c.cyan);
  S.add(lines);

  // Oort cloud: 2 000 – 100 000 AU, log-uniform radius (denser inside), very faint
  const NO = 7000, opos = new Float32Array(NO * 3), ob = new Float32Array(NO);
  const rand = rng(1950), gauss = gaussian(rand);
  const rMin = 2000 / 206265, rMax = 100000 / 206265;
  for (let i = 0; i < NO; i++) {
    const r = rMin * (rMax / rMin) ** rand();
    const z = 2 * rand() - 1, ph = rand() * Math.PI * 2, s = Math.sqrt(1 - z * z);
    opos[i * 3] = r * s * Math.cos(ph); opos[i * 3 + 1] = r * s * Math.sin(ph); opos[i * 3 + 2] = r * z;
    ob[i] = 0.3 + 0.7 * rand() * rand();
  }
  const oort = createCloud({ positions: opos, bright: ob, px: 1.5, minPx: 1, maxPx: 2, colors: mixRgb(c.text2, c.cyan2, 0.4), alpha: 0.4 });
  S.add(oort.points); L.proj.push(oort.setProj);

  // radio bubble: 100 light-years
  const RADIO = 100 / LY_PER_PC;
  const radio = createShell(RADIO, c.cyan, 0.32, 3);
  S.add(radio.mesh);

  // Orion arm hint: elongated cloud along galactic longitude ~75° / 255° through the Sun
  const NA = 3000, apos = new Float32Array(NA * 3), ab = new Float32Array(NA), asz = new Float32Array(NA);
  const g = galacticBasis();
  const axis = galDir(75, 0), across = new THREE.Vector3().crossVectors(g.north, axis).normalize();
  const tmp = new THREE.Vector3();
  for (let i = 0; i < NA; i++) {
    const s = gauss() * 1000, w = gauss() * 220, h = gauss() * 70;
    tmp.copy(axis).multiplyScalar(s).addScaledVector(across, w).addScaledVector(g.north, h);
    apos[i * 3] = tmp.x; apos[i * 3 + 1] = tmp.y; apos[i * 3 + 2] = tmp.z;
    ab[i] = 0.25 + 0.75 * rand() * Math.exp(-(s * s) / 2e6);
    asz[i] = 30 + rand() * 60;
  }
  const arm = createCloud({ positions: apos, bright: ab, sizes: asz, minPx: 1.2, maxPx: 14, colors: mixRgb(c.cyan2, [1, 1, 1], 0.4), alpha: 0.5 });
  S.add(arm.points); L.proj.push(arm.setProj);

  // Pleiades + Orion Nebula as soft glows
  const plePos = new THREE.Vector3(...raDecToXYZ(56.75, 24.12, 136));
  const m42Pos = new THREE.Vector3(...raDecToXYZ(83.82, -5.39, 412));
  const neb = createCloud({
    positions: new Float32Array([plePos.x, plePos.y, plePos.z, m42Pos.x, m42Pos.y, m42Pos.z]),
    sizes: new Float32Array([9, 12]), colors: new Float32Array([...mixRgb(c.cyan2, [1, 1, 1], 0.5), ...mixRgb(c.rose, [1, 1, 1], 0.35)]), minPx: 6, maxPx: 120, alpha: 0.85,
  });
  S.add(neb.points); L.proj.push(neb.setProj);

  // labels
  const labels: LabelSpec[] = [
    { id: 'sunStar', pos: new THREE.Vector3(), text: t('zoom.lbl.sun'), cls: 'gold', lo: 13.65, hi: 19.9, prio: 0 },
    { id: 'oort', pos: new THREE.Vector3(0.25, 0.15, 0.3).normalize().multiplyScalar(0.32), text: t('zoom.lbl.oort'), sub: t('zoom.lbl.oortSub'), cls: 'dim', lo: 15.0, hi: 17.4, prio: 5 },
    { id: 'radio', pos: new THREE.Vector3(0.6, -0.5, 0.35).normalize().multiplyScalar(RADIO), text: t('zoom.lbl.radio'), sub: t('zoom.lbl.radioSub'), cls: 'cyan', lo: 17.2, hi: 19.7, prio: 2 },
    { id: 'orion', pos: axis.clone().multiplyScalar(750), text: t('zoom.lbl.orion'), cls: 'cyan', lo: 19.0, hi: 20.5, prio: 3 },
    { id: 'pleiades', pos: plePos, text: t('zoom.lbl.pleiades'), cls: 'dim', lo: 17.9, hi: 20.2, prio: 6 },
    { id: 'm42', pos: m42Pos, text: t('zoom.lbl.m42'), cls: 'rose', lo: 18.4, hi: 20.3, prio: 6 },
  ];
  const infos: ObjectInfo[] = [];
  const starInfo = (id: string, i: number, lbl: string) => {
    const d = cat.dist[i];
    infos.push({
      id, title: () => t(`zoom.lbl.${lbl}`), kind: 'zoom.kind.star',
      rows: () => [[t('zoom.rowDist'), fmtLy(d * LY_PER_PC)], [t('zoom.rowSpect'), `${spectralClassFromBv(cat.ci[i])} (B−V ${fmtNum(cat.ci[i], { digits: 2 })})`], [t('zoom.rowMag'), fmtNum(cat.mag[i], { digits: 1 })]],
      blurb: () => `<p>${t(`zoom.obj.${lbl}`)}</p>`, src: 'zoom.srcStars', zoom: Math.log10(d * M_PER_PC * 2.4),
    });
  };
  for (const n of NAMED) {
    const rec = names.list.find((x) => x.name === n.name);
    if (!rec) continue;
    const i = rec.i, d = cat.dist[i];
    const p = new THREE.Vector3(cat.pos[i * 3], cat.pos[i * 3 + 1], cat.pos[i * 3 + 2]);
    const ld = Math.log10(d * M_PER_PC);
    labels.push({ id: n.id, pos: p, text: t(`zoom.lbl.${n.id}`), cls: d < 3 ? 'cyan' : d < 20 ? '' : 'dim', lo: ld - 1.05, hi: Math.min(20.4, ld + 1.7), prio: d < 3 ? 1 : d < 12 ? 3 : 5 });
    starInfo(n.id, i, n.id);
  }
  L.labels = labels;
  const simple = (id: string, kind: string, rows: Array<[string, string]>, zoom: number): ObjectInfo => ({ id, title: () => t(`zoom.lbl.${id === 'sunStar' ? 'sun' : id}`), kind, rows: () => rows, blurb: () => `<p>${t(`zoom.obj.${id}`)}</p>`, src: 'zoom.srcStars', zoom });
  infos.push(
    simple('sunStar', 'zoom.kind.star', [[t('zoom.rowRadius'), `${fmtNum(SUN_RADIUS_KM, { digits: 0 })} km`], [t('zoom.rowSpect'), 'G2 V']], 11.5),
    simple('oort', 'zoom.kind.region', [[t('zoom.rowDist'), t('zoom.lbl.oortSub')], [t('zoom.rowLight'), `${fmtNum(11.5, { maxDigits: 1 })} – 580 ${lang() === 'en' ? 'days' : 'Tage'}`]], 15.6),
    simple('radio', 'zoom.kind.marker', [[t('zoom.rowRadius'), fmtLy(100)], [t('zoom.rowStars'), fmtNum(4059, { digits: 0 })]], 18.3),
    simple('orion', 'zoom.kind.region', [[t('zoom.rowDiameter'), fmtLy(10000)]], 19.9),
    simple('pleiades', 'zoom.kind.cluster', [[t('zoom.rowDist'), fmtLy(444)]], Math.log10(136 * M_PER_PC * 2.4)),
    simple('m42', 'zoom.kind.nebula', [[t('zoom.rowDist'), fmtLy(1344)]], Math.log10(412 * M_PER_PC * 2.4)),
  );

  L.update = (_dt, logD) => {
    const k = L.opacity;
    // brighten the catalogue as we leave it behind, but cap the big blobs
    su.uMagOffset.value = clamp(-(logD - 17.0) * 3.2, -12, 0);
    su.uMaxSize.value = lerp(48, 7, smoothstep(16, 19.5, logD));
    sunPt.setAlpha(k * smoothstep(13.3, 13.9, logD));
    lines.material.opacity = 0.22 * k * (1 - smoothstep(16.2, 17.4, logD));
    oort.setAlpha(k * window01(logD, 14.3, 18.2, 0.7));
    radio.setAlpha(k * window01(logD, 16.9, 20.0, 0.6));
    arm.setAlpha(k * smoothstep(18.7, 19.5, logD));
    neb.setAlpha(k * window01(logD, 17.7, 20.5, 0.4));
  };
  return { layer: L, infos };
}

// =============================================================================================
// 4. Milky Way (unit 1 kpc; window 19.5 – 23)
// =============================================================================================
const DISC_VERT = /* glsl */ `varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const DISC_FRAG = /* glsl */ `
uniform vec3 uWarm, uBlue; uniform float uAlpha, uR;
varying vec2 vP;
void main() {
  float r = length(vP) / uR;
  float a = uAlpha * (exp(-r * 3.2) * 0.9 + 0.15 * (1.0 - smoothstep(0.55, 1.0, r)));
  vec3 col = mix(uWarm, uBlue, smoothstep(0.1, 0.8, r));
  gl_FragColor = vec4(col * a, a);
}`;

export function buildMilkyWayLayer(b: BuildCtx, landmarks: Landmark[]): LayerBuild {
  const L = makeLayer('mw', M_PER_KPC, 19.5, 23, 'zoom.srcMw');
  const S = L.scene;
  const c = b.colors;
  const g = galacticBasis();

  const mw = createMilkyWay({ warm: mixRgb(c.gold, [1, 1, 1], 0.35), blue: mixRgb(c.cyan, [1, 1, 1], 0.3), white: [1, 1, 1], rose: mixRgb(c.rose, [1, 1, 1], 0.2) }, 40000);
  mw.group.position.copy(g.centre);
  mw.group.quaternion.copy(g.quaternion);
  S.add(mw.group);
  L.fades.push(mw.setAlpha); L.proj.push(mw.setProj);

  // smooth disc glow that takes over when the points collapse to sub-pixel size
  const R = 15;
  const discU = { uWarm: { value: new THREE.Vector3(...mixRgb(c.gold, [1, 1, 1], 0.4)) }, uBlue: { value: new THREE.Vector3(...mixRgb(c.cyan, c.violet, 0.4)) }, uAlpha: { value: 0 }, uR: { value: R } };
  const disc = new THREE.Mesh(new THREE.CircleGeometry(R, 96), new THREE.ShaderMaterial({ uniforms: discU, vertexShader: DISC_VERT, fragmentShader: DISC_FRAG, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  disc.position.copy(g.centre); disc.quaternion.copy(g.quaternion); disc.frustumCulled = false; disc.renderOrder = -1;
  S.add(disc);

  // the Sun's position + galactic centre
  const sunPt = createCloud({ positions: new Float32Array(3), colors: c.cyan2, minPx: 5, maxPx: 5, px: 5, alpha: 1 });
  S.add(sunPt.points); L.fades.push(sunPt.setAlpha); L.proj.push(sunPt.setProj);

  // satellite galaxies + Andromeda/M33 as elliptical glow sprites (kpc)
  const sats: Array<{ id: string; lm: Landmark | undefined; tint: RGB; rot: number }> = [
    { id: 'lmc', lm: landmarks.find((l) => l.id === 'lmc'), tint: mixRgb(c.text, c.cyan2, 0.3), rot: 0.6 },
    { id: 'smc', lm: landmarks.find((l) => l.id === 'smc'), tint: mixRgb(c.text, c.cyan2, 0.3), rot: 1.9 },
    { id: 'm31', lm: landmarks.find((l) => l.id === 'm31'), tint: mixRgb(c.violet, [1, 1, 1], 0.5), rot: 0.9 },
    { id: 'm33', lm: landmarks.find((l) => l.id === 'm33'), tint: mixRgb(c.violet, c.cyan2, 0.5), rot: 2.4 },
  ];
  const sprites: Array<{ s: THREE.Sprite; size: number }> = [];
  const labels: LabelSpec[] = [
    { id: 'mwHere', pos: new THREE.Vector3(), text: t('zoom.lbl.sun'), sub: t('zoom.lbl.here'), cls: 'cyan', lo: 19.5, hi: 22.9, prio: 0 },
    { id: 'sgra', pos: g.centre.clone(), text: t('zoom.lbl.sgra'), sub: t('zoom.lbl.sgraSub'), cls: 'gold', lo: 19.8, hi: 22.6, prio: 1 },
  ];
  const infos: ObjectInfo[] = [];
  for (const s of sats) {
    if (!s.lm) continue;
    const p = new THREE.Vector3(...raDecToXYZ(s.lm.ra, s.lm.dec, s.lm.dist * 1000));
    const mat = new THREE.SpriteMaterial({ map: galaxyTexture(), color: new THREE.Color(s.tint[0], s.tint[1], s.tint[2]), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, rotation: s.rot });
    const sp = new THREE.Sprite(mat);
    sp.position.copy(p);
    const size = s.lm.radius * 1000 * 2.4;
    sp.scale.set(size, size, 1);
    S.add(sp);
    sprites.push({ s: sp, size });
    L.fades.push((k) => { mat.opacity = 0.9 * k; });
    const ld = Math.log10(s.lm.dist * M_PER_MPC);
    labels.push({ id: s.id, pos: p, text: t(`zoom.lbl.${s.id}`), cls: 'violet', lo: ld - 1.1, hi: 23, prio: 2 });
    const lm = s.lm;
    infos.push({
      id: s.id, title: () => landmarkName(lm), kind: 'zoom.kind.galaxy',
      rows: () => [[t('zoom.rowDist'), fmtLy(lm.dist * 1e6 * LY_PER_PC)], ...lm.numbers.slice(0, 2).map((n) => [pick(n.label), typeof n.value === 'number' ? fmtNum(n.value, { digits: 0 }) : n.value] as [string, string])],
      blurb: () => `<p>${pick(lm.blurb)}</p>`, src: 'zoom.srcGal', zoom: ld + 0.4,
    });
  }
  L.labels = labels;
  infos.push(
    { id: 'mwHere', title: () => t('zoom.lbl.sun'), kind: 'zoom.kind.star', rows: () => [[t('zoom.rowDist'), `${fmtLy(26000)} (Sgr A*)`], [t('zoom.rowPeriod'), `230 ${lang() === 'en' ? 'million years' : 'Mio. Jahre'}`]], blurb: () => `<p>${t('zoom.obj.sunStar')}</p>`, src: 'zoom.srcMw', zoom: 20.9 },
    { id: 'sgra', title: () => t('zoom.lbl.sgra'), kind: 'zoom.kind.blackhole', rows: () => [[t('zoom.rowDist'), fmtLy(26000)], [t('zoom.rowMass'), `4 ${lang() === 'en' ? 'million' : 'Mio.'} M☉`]], blurb: () => `<p>${t('zoom.obj.sgra')}</p>`, src: 'zoom.srcMw', zoom: 20.8 },
  );

  let projPx = 860;                                      // px per unit at unit distance (h/2/tan(fov/2))
  L.proj.push((h, fov) => { projPx = h / 2 / Math.tan((fov * DEG) / 2); });
  L.update = (_dt, logD, _el, dist) => {
    const k = L.opacity;
    discU.uAlpha.value = k * smoothstep(21.6, 22.5, logD) * 0.9;
    const minWorld = (6 / projPx) * dist;                // keep the satellite galaxies at least ~6 px wide
    for (const sp of sprites) { const s = Math.max(sp.size, minWorld); sp.s.scale.set(s, s, 1); }
  };
  return { layer: L, infos };
}
