import * as THREE from 'three';
import { t, pick } from '../../core/i18n';
import { fmtNum, fmtKm, fmtLightTime, fmtYears, fmtKelvin, KM_PER_AU, EARTH_RADIUS_KM, SUN_RADIUS_KM, C_KM_S, smoothstep } from '../../core/units';
import { createEarth } from '../../core/Earth';
import { createSun } from '../../core/Sun';
import { textureUrl } from '../../core/Loader';
import { BODY_BY_ID, bodyPosition, orbitPath, moonGeocentric, eclToEq, J2000, type Body, type BodyId, type Vec3 } from '../../data/solarsystem';
import { makeLayer, type LayerBuild, type LabelSpec, type ObjectInfo } from './model';
import { createCloud, createRings, createShell, orbitQuat, quatFromNormal, rng, gaussian, hexRgb, mixRgb, window01, fmtAU, DEG, M_PER_AU, type RGB } from './util';

/** Everything the layer builders need from the chapter. */
export interface BuildCtx {
  jd: number;
  colors: Record<'gold' | 'gold2' | 'cyan' | 'cyan2' | 'violet' | 'rose' | 'text' | 'text2' | 'muted' | 'green', RGB>;
  /** unit vector Earth → Sun, equatorial frame */
  sunDir: THREE.Vector3;
  /** local +Z → ecliptic north pole (equatorial frame) */
  eclQuat: THREE.Quaternion;
}

/** Greenwich mean sidereal time in radians. */
export function gmst(jd: number): number {
  const d = jd - J2000;
  return ((((280.46061837 + 360.98564736629 * d) % 360) + 360) % 360) * DEG;
}
export function nowJD(): number { return Date.now() / 86400000 + 2440587.5; }

/** Heliocentric equatorial position of a body in AU (Vector3). */
export function helioEq(id: BodyId, jd: number, out: THREE.Vector3): THREE.Vector3 {
  const e = eclToEq(bodyPosition(id, jd));
  return out.set(e.x, e.y, e.z);
}
function vec(v: Vec3, k: number, out: THREE.Vector3): THREE.Vector3 { const e = eclToEq(v); return out.set(e.x * k, e.y * k, e.z * k); }

const bodyRows = (b: Body, distM: () => number): Array<[string, string]> => {
  const rows: Array<[string, string]> = [];
  if (b.id !== 'earth') {
    const d = distM();
    rows.push([t('zoom.rowDist'), d < 5e10 ? fmtKm(d / 1e3) : fmtAU(d / M_PER_AU)]);
    rows.push([t('zoom.rowLight'), fmtLightTime(d / 1e3 / C_KM_S)]);
  }
  if (b.kind !== 'probe') rows.push([t('zoom.rowRadius'), `${fmtNum(b.radiusKm, { digits: 0 })} km`]);
  if (b.periodDays > 0) rows.push([t('zoom.rowPeriod'), b.periodDays > 400 ? fmtYears(b.periodDays / 365.25) : fmtLightTime(b.periodDays * 86400)]);
  if (b.tempK > 0 && b.kind !== 'star') rows.push([t('zoom.rowType'), fmtKelvin(b.tempK)]);
  return rows;
};
const bodyBlurb = (b: Body): string => `<p>${pick(b.blurb)}</p>${b.facts[0] ? `<p>${pick(b.facts[0])}</p>` : ''}`;

// =============================================================================================
// 1. Earth (unit 1e6 m = 1000 km; window 6.9 – 9.5)
// =============================================================================================
const MOON_VERT = /* glsl */ `
varying vec2 vUv; varying vec3 vN;
void main() { vUv = uv; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const CLOUD_FRAG = /* glsl */ `
uniform sampler2D uClouds; uniform vec3 uSunDir; uniform float uFade;
varying vec2 vUv; varying vec3 vNormalW; varying vec3 vPosW;
void main() {
  vec3 n = normalize(vNormalW);
  float ndl = dot(n, uSunDir);
  float a = texture2D(uClouds, vUv).r;
  float light = 0.08 + 0.95 * max(ndl, 0.0);
  gl_FragColor = vec4(vec3(light), a * 0.85 * uFade);
  #include <colorspace_fragment>
}`;
const MOON_FRAG = /* glsl */ `
uniform sampler2D uMap; uniform vec3 uSun;
varying vec2 vUv; varying vec3 vN;
void main() {
  float l = max(dot(normalize(vN), uSun), 0.0);
  vec3 c = texture2D(uMap, vUv).rgb * (0.015 + 1.1 * l);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

export function buildEarthLayer(b: BuildCtx): LayerBuild {
  const L = makeLayer('earth', 1e6, 6.9, 9.5, 'zoom.srcEarth', { hardLo: true });
  const S = L.scene;
  const RE = EARTH_RADIUS_KM / 1e3;
  const c = b.colors;

  const earth = createEarth(RE, { segments: 96 });
  earth.group.rotation.x = Math.PI / 2;                       // mesh +Y (north pole) → world +Z (celestial north)
  earth.setSunDirection(b.sunDir);
  S.add(earth.group);
  // own cloud material: the 1024 px cloud map looks blocky when the globe fills the view → fade the clouds in from logD 7.35
  let cloudFade: { value: number } | undefined;
  if (earth.clouds) {
    const old = earth.clouds.material as THREE.ShaderMaterial;
    const cm = new THREE.ShaderMaterial({
      uniforms: { uClouds: { value: old.uniforms.uClouds.value }, uSunDir: { value: b.sunDir.clone() }, uFade: { value: 0 } },
      vertexShader: old.vertexShader, fragmentShader: CLOUD_FRAG, transparent: true, depthWrite: false,
    });
    earth.clouds.material = cm;                               // createEarth() assigns the texture to `clouds.material` once loaded
    old.dispose();
    cloudFade = cm.uniforms.uFade;
  }

  // Moon: real geocentric position (km → units), real size, near side facing Earth
  const mp = vec(moonGeocentric(b.jd), 1e-3, new THREE.Vector3());
  const moonMat = new THREE.ShaderMaterial({ uniforms: { uMap: { value: null }, uSun: { value: b.sunDir.clone() } }, vertexShader: MOON_VERT, fragmentShader: MOON_FRAG });
  new THREE.TextureLoader().load(textureUrl('moon.jpg'), (tex) => { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; moonMat.uniforms.uMap.value = tex; });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(BODY_BY_ID.moon.radiusKm / 1e3, 48, 24), moonMat);
  moon.position.copy(mp);
  const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  moon.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(-mp.y, -mp.x)).multiply(qx);
  S.add(moon);

  // orbits / shells (thin wire rings)
  const iss = createRings([{ radius: RE + 0.418, quaternion: orbitQuat(51.6 * DEG, 0.7) }], c.cyan, 0.55);
  const gps = createRings(Array.from({ length: 6 }, (_, k) => ({ radius: RE + 20.2, quaternion: orbitQuat(55 * DEG, k * 60 * DEG) })), c.text2, 0.2, 96);
  const geo = createRings([{ radius: RE + 35.786, dashed: true }], c.gold, 0.4, 160);
  // the Moon's orbit ring: the plane through the Moon whose normal is as close as possible to the ecliptic pole (i ≈ 5°)
  const eclN = new THREE.Vector3(0, 0, 1).applyQuaternion(b.eclQuat);
  const mpn = mp.clone().normalize();
  const moonNormal = eclN.clone().sub(mpn.multiplyScalar(eclN.dot(mpn))).normalize();
  const moonOrbit = createRings([{ radius: mp.length(), quaternion: quatFromNormal(moonNormal), dashed: true }], c.text2, 0.16, 180);
  S.add(iss, gps, geo, moonOrbit);
  for (const m of [iss, gps, geo, moonOrbit]) { const base = m.material.opacity; L.fades.push((k) => { m.material.opacity = base * k; }); }
  // pixel-floor markers so Earth and Moon stay visible once the globes shrink to a pixel
  const dots = createCloud({
    positions: new Float32Array([0, 0, 0, mp.x, mp.y, mp.z]), sizes: new Float32Array([RE * 2, BODY_BY_ID.moon.radiusKm / 500]),
    colors: new Float32Array([...mixRgb(c.cyan, [1, 1, 1], 0.55), ...mixRgb(c.text2, [1, 1, 1], 0.5)]), minPx: new Float32Array([5, 3.5]), maxPx: 60, alpha: 0.9,
  });
  S.add(dots.points); L.proj.push(dots.setProj);

  const ringPoint = (r: number, q: THREE.Quaternion | undefined, a: number) => { const v = new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0); if (q) v.applyQuaternion(q); return v; };
  const labels: LabelSpec[] = [
    { id: 'iss', pos: ringPoint(RE + 0.418, orbitQuat(51.6 * DEG, 0.7), 2.2), text: t('zoom.lbl.iss'), sub: t('zoom.lbl.issSub'), cls: 'cyan', lo: 6.9, hi: 8.4, prio: 3 },
    { id: 'gps', pos: ringPoint(RE + 20.2, orbitQuat(55 * DEG, 120 * DEG), 1.1), text: t('zoom.lbl.gps'), sub: t('zoom.lbl.gpsSub'), cls: 'dim', lo: 7.4, hi: 8.9, prio: 5 },
    { id: 'geo', pos: ringPoint(RE + 35.786, undefined, 0.4), text: t('zoom.lbl.geo'), sub: t('zoom.lbl.geoSub'), cls: 'gold', lo: 7.5, hi: 9.1, prio: 4 },
    { id: 'moon', pos: mp.clone(), text: t('zoom.lbl.moon'), lo: 8.2, hi: 9.5, prio: 1 },
    { id: 'earth', pos: new THREE.Vector3(0, 0, RE), text: t('zoom.lbl.earth'), cls: 'cyan', lo: 8.35, hi: 9.5, prio: 0 },
  ];
  L.labels = labels;

  let spin = 0;
  L.update = (dt, logD) => {
    spin += dt;
    if (spin > 0.5) { spin = 0; earth.setRotation(gmst(nowJD())); }
    earth.update(dt);
    if (cloudFade) cloudFade.value = smoothstep(7.35, 7.85, logD);
    dots.setAlpha(L.opacity * smoothstep(8.0, 8.5, logD));
  };
  earth.setRotation(gmst(nowJD()));

  const moonKm = mp.length() * 1e3;
  const infos: ObjectInfo[] = [
    { id: 'earth', title: () => pick(BODY_BY_ID.earth.name), kind: 'zoom.kind.planet', rows: () => [[t('zoom.rowRadius'), `${fmtNum(EARTH_RADIUS_KM, { digits: 0 })} km`], [t('zoom.rowPeriod'), fmtYears(1)]], blurb: () => bodyBlurb(BODY_BY_ID.earth), src: 'zoom.srcEarth', zoom: 7.1 },
    { id: 'moon', title: () => pick(BODY_BY_ID.moon.name), kind: 'zoom.kind.moon', rows: () => bodyRows(BODY_BY_ID.moon, () => moonKm * 1e3), blurb: () => bodyBlurb(BODY_BY_ID.moon), src: 'zoom.srcEarth', zoom: Math.log10(moonKm * 1e3 * 2.4) },
    { id: 'iss', title: () => t('zoom.lbl.iss'), kind: 'zoom.kind.station', rows: () => [[t('zoom.rowAlt'), '418 km'], [t('zoom.rowSpeed'), `${fmtNum(7.66, { digits: 2 })} km/s`], [t('zoom.rowPeriod'), '93 min']], blurb: () => `<p>${t('zoom.obj.iss')}</p>`, src: 'zoom.srcEarth', zoom: 7.15 },
    { id: 'gps', title: () => t('zoom.lbl.gps'), kind: 'zoom.kind.satellites', rows: () => [[t('zoom.rowAlt'), t('zoom.lbl.gpsSub')], [t('zoom.rowPeriod'), '11 h 58 min']], blurb: () => `<p>${t('zoom.obj.gps')}</p>`, src: 'zoom.srcEarth', zoom: 7.9 },
    { id: 'geo', title: () => t('zoom.lbl.geo'), kind: 'zoom.kind.orbit', rows: () => [[t('zoom.rowAlt'), t('zoom.lbl.geoSub')], [t('zoom.rowPeriod'), '23 h 56 min']], blurb: () => `<p>${t('zoom.obj.geo')}</p>`, src: 'zoom.srcEarth', zoom: 8.1 },
  ];
  return { layer: L, infos };
}

// =============================================================================================
// 2. Solar system (unit 1e9 m = 1 million km; window 9 – 14), centred on Earth
// =============================================================================================
export function buildSolarLayer(b: BuildCtx): LayerBuild {
  const L = makeLayer('solar', 1e9, 9, 14, 'zoom.srcSolar');
  const S = L.scene;
  const c = b.colors;
  const AUU = KM_PER_AU * 1e3 / 1e9;                 // units per AU (149.6)
  const jd = b.jd;
  const tmp = new THREE.Vector3();
  const earthH = helioEq('earth', jd, new THREE.Vector3()).multiplyScalar(AUU);
  const G = new THREE.Group();                         // heliocentric content, shifted so Earth sits at the origin
  G.position.copy(earthH).negate();
  S.add(G);
  const helioU = (id: BodyId) => helioEq(id, jd, new THREE.Vector3()).multiplyScalar(AUU);
  const worldOf = (id: BodyId) => helioU(id).sub(earthH);

  // Sun
  const sun = createSun(SUN_RADIUS_KM / 1e6, 5);
  G.add(sun.group);
  L.fades.push((k) => sun.setIntensity(1.6 * k));

  // bodies as sprites: size = max(real, 2.5 px)
  const ids: BodyId[] = ['mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'voyager1', 'voyager2', 'newhorizons'];
  const n = ids.length + 1;
  const pos = new Float32Array(n * 3), sizes = new Float32Array(n), cols = new Float32Array(n * 3), mins = new Float32Array(n);
  const labels: LabelSpec[] = [];
  const setPt = (i: number, p: THREE.Vector3, dia: number, col: RGB, min: number) => { pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; sizes[i] = dia; cols[i * 3] = col[0]; cols[i * 3 + 1] = col[1]; cols[i * 3 + 2] = col[2]; mins[i] = min; };
  setPt(0, new THREE.Vector3(), SUN_RADIUS_KM * 2 / 1e6, mixRgb(c.gold, [1, 1, 1], 0.3), 10);
  const infos: ObjectInfo[] = [];
  const distNow = (id: BodyId) => () => worldOf(id).length() * 1e9;
  ids.forEach((id, k) => {
    const body = BODY_BY_ID[id];
    const p = id === 'moon' ? helioU('earth').add(vec(moonGeocentric(jd), 1e-6, tmp)) : helioU(id);
    const col = body.kind === 'probe' ? [1, 1, 1] as RGB : mixRgb(hexRgb(body.color), [1, 1, 1], 0.25);
    setPt(k + 1, p, body.radiusKm * 2 / 1e6, col, body.kind === 'probe' ? 4 : body.kind === 'moon' ? 2.5 : body.kind === 'dwarf' ? 2.6 : 4);
    const d = p.clone().sub(earthH);
    const dist = d.length();
    const lo = id === 'earth' ? 9.55 : id === 'moon' ? 9 : Math.max(9, Math.log10(dist * 1e9) - 1.1);
    const hi = id === 'moon' ? 10.7 : 14;
    labels.push({ id, pos: d, text: pick(body.name), cls: body.kind === 'probe' ? 'dim' : body.kind === 'moon' || body.kind === 'dwarf' ? 'dim' : id === 'earth' ? 'cyan' : '', lo, hi, prio: id === 'earth' ? 0 : body.kind === 'planet' ? 2 : 6 });
    infos.push({ id, title: () => pick(body.name), kind: `zoom.kind.${body.kind}`, rows: () => bodyRows(body, distNow(id)), blurb: () => bodyBlurb(body), src: 'zoom.srcSolar', zoom: id === 'earth' ? 7.1 : Math.log10(dist * 1e9 * 2.4) });
  });
  const markers = createCloud({ positions: pos, sizes, colors: cols, minPx: mins, maxPx: 400, alpha: 1 });
  G.add(markers.points);
  L.fades.push(markers.setAlpha); L.proj.push(markers.setProj);
  labels.push({ id: 'sun', pos: earthH.clone().negate(), text: t('zoom.lbl.sun'), cls: 'gold', lo: 9.9, hi: 14, prio: 0 });
  const sunBody = BODY_BY_ID.sun;
  infos.push({ id: 'sun', title: () => pick(sunBody.name), kind: 'zoom.kind.star', rows: () => bodyRows(sunBody, () => earthH.length() * 1e9), blurb: () => bodyBlurb(sunBody), src: 'zoom.srcSolar', zoom: Math.log10(earthH.length() * 1e9 * 2.2) });

  // orbits: one LineSegments, vertex-coloured (body colour, dimmed)
  const orbIds: BodyId[] = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
  const opos: number[] = [], ocol: number[] = [];
  for (const id of orbIds) {
    const path = orbitPath(id, jd, 192);
    const col = mixRgb(hexRgb(BODY_BY_ID[id].color), [1, 1, 1], 0.2);
    for (let i = 0; i + 1 < path.length; i++) {
      for (const q of [path[i], path[i + 1]]) { vec(q, AUU, tmp); opos.push(tmp.x, tmp.y, tmp.z); ocol.push(col[0], col[1], col[2]); }
    }
  }
  const og = new THREE.BufferGeometry();
  og.setAttribute('position', new THREE.BufferAttribute(new Float32Array(opos), 3));
  og.setAttribute('color', new THREE.BufferAttribute(new Float32Array(ocol), 3));
  const orbits = new THREE.LineSegments(og, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.32, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  orbits.frustumCulled = false;
  G.add(orbits);
  L.fades.push((k) => { orbits.material.opacity = 0.32 * k; });

  // Kuiper belt (schematic, 30–50 AU, ecliptic)
  const NK = 3500, kpos = new Float32Array(NK * 3), kb = new Float32Array(NK);
  const rand = rng(42), gauss = gaussian(rand);
  for (let i = 0; i < NK; i++) {
    const r = (30 + 20 * (rand() + rand()) / 2) * AUU, lon = rand() * Math.PI * 2, inc = gauss() * 6 * DEG, ph = rand() * Math.PI * 2;
    tmp.set(r * Math.cos(lon), r * Math.sin(lon), r * Math.tan(inc) * Math.sin(ph)).applyQuaternion(b.eclQuat);
    kpos[i * 3] = tmp.x; kpos[i * 3 + 1] = tmp.y; kpos[i * 3 + 2] = tmp.z;
    kb[i] = 0.35 + 0.65 * rand() * rand();
  }
  const kuiper = createCloud({ positions: kpos, bright: kb, px: 1.7, minPx: 1, maxPx: 2, colors: mixRgb(c.cyan2, c.text2, 0.5), alpha: 0.6 });
  G.add(kuiper.points);
  L.proj.push(kuiper.setProj);

  // heliopause (~120 AU) – fresnel shell
  const helio = createShell(120 * AUU, mixRgb(c.cyan, c.violet, 0.3), 0.32, 3);
  G.add(helio.mesh);

  // light-hour / light-day rings around Earth in the ecliptic plane
  const LH = C_KM_S * 3600 / 1e6, LD = LH * 24;
  const lightHour = createRings([{ radius: LH, quaternion: b.eclQuat, dashed: true }], c.gold2, 0.35, 200);
  const lightDay = createRings([{ radius: LD, quaternion: b.eclQuat, dashed: true }], c.gold2, 0.35, 200);
  S.add(lightHour, lightDay);

  const ringPt = (r: number, a: number) => new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0).applyQuaternion(b.eclQuat);
  labels.push(
    { id: 'lightHour', pos: ringPt(LH, 0.9), text: t('zoom.lbl.lightHour'), cls: 'gold', lo: 11.05, hi: 12.6, prio: 4 },
    { id: 'lightDay', pos: ringPt(LD, 2.4), text: t('zoom.lbl.lightDay'), cls: 'gold', lo: 12.45, hi: 14, prio: 4 },
    { id: 'kuiper', pos: ringPt(42 * AUU, 3.9).sub(earthH), text: t('zoom.lbl.kuiper'), sub: t('zoom.schematic'), cls: 'dim', lo: 12.55, hi: 14, prio: 7 },
    { id: 'heliopause', pos: ringPt(120 * AUU, 5.3).sub(earthH), text: t('zoom.lbl.heliopause'), sub: t('zoom.lbl.heliopauseSub'), cls: 'cyan', lo: 12.95, hi: 14, prio: 3 },
  );
  L.labels = labels;

  const simple = (id: string, lbl: string, kind: string, rows: Array<[string, string]>, zoom: number): ObjectInfo => ({ id, title: () => t(`zoom.lbl.${lbl}`), kind, rows: () => rows, blurb: () => `<p>${t(`zoom.obj.${lbl}`)}</p>`, src: 'zoom.srcSolar', zoom });
  infos.push(
    simple('lightHour', 'lightHour', 'zoom.kind.marker', [[t('zoom.rowDist'), fmtKm(C_KM_S * 3600)], [t('zoom.rowLight'), '1 h 0 min']], Math.log10(LH * 1e9 * 2.2)),
    simple('lightDay', 'lightDay', 'zoom.kind.marker', [[t('zoom.rowDist'), fmtAU(C_KM_S * 86400 / KM_PER_AU)], [t('zoom.rowLight'), '24 h 0 min']], Math.log10(LD * 1e9 * 2.2)),
    simple('kuiper', 'kuiper', 'zoom.kind.region', [[t('zoom.rowDist'), `${fmtNum(30)} – ${fmtAU(50)}`]], 13.1),
    simple('heliopause', 'heliopause', 'zoom.kind.region', [[t('zoom.rowDist'), fmtAU(120)], [t('zoom.rowLight'), fmtLightTime(120 * KM_PER_AU / C_KM_S)]], 13.55),
  );

  // per-frame: granulation + object-specific fades inside the layer window
  L.update = (dt, logD) => {
    sun.update(dt);
    const k = L.opacity;
    kuiper.setAlpha(k * smoothstep(12.2, 12.9, logD));
    helio.setAlpha(k * smoothstep(12.5, 13.1, logD));
    lightHour.material.opacity = 0.35 * k * window01(logD, 10.7, 12.9, 0.35);
    lightDay.material.opacity = 0.35 * k * smoothstep(12.1, 12.6, logD);
  };
  return { layer: L, infos };
}

/** Distance Earth → body now, in metres (for milestone cards). */
export function earthDistanceM(id: BodyId, jd: number): number {
  const e = bodyPosition('earth', jd);
  if (id === 'moon') { const m = moonGeocentric(jd); return Math.hypot(m.x, m.y, m.z) * 1e3; }
  const p = bodyPosition(id, jd);
  return Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z) * M_PER_AU;
}
