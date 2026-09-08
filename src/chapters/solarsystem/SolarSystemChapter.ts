import * as THREE from 'three';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import './strings';
import './style.css';
import { BaseChapter } from '../../core/BaseChapter';
import { t, pick } from '../../core/i18n';
import { el, button, chip, stat, kv, infoCard, showIntro, toast, panel } from '../../core/ui';
import { OrbitRig } from '../../core/CameraRig';
import { tween, type TweenHandle } from '../../core/tween';
import { fmtNum, fmtKm, fmtLightTime, fmtKelvin, fmtSci, KM_PER_AU, C_KM_S, SEC_PER_YEAR, clamp, lerp } from '../../core/units';
import { createSun, type Sun } from '../../core/Sun';
import { createEarth, type Earth } from '../../core/Earth';
import {
  BODIES, BODY_BY_ID, bodyPosition, orbitPath, moonGeocentric, subsolarPoint, distanceAU, julianDate, eqToEcl,
  J2000, type Body, type BodyId,
} from '../../data/solarsystem';
import { createBodyMaterial, createRingMesh, createCometTail, glowTexture, diamondTexture, type CometTail } from './PlanetMaterials';
import { createBelt, createMarkers, type Markers } from './Belts';
import { buildSky } from './Sky';
import { TimePanel, SPEEDS } from './TimePanel';

/**
 * The solar system at the real (or scrubbed) date, computed from NASA/JPL Keplerian elements.
 *
 * Frame: heliocentric ecliptic J2000 from `bodyPosition()` (AU) mapped to the scene as
 *   scene.x = ecl.x · AU,  scene.y = ecl.z · AU (ecliptic north = up),  scene.z = −ecl.y · AU
 * with AU = 10 scene units. This is a proper rotation (−90° about X), so the planets orbit
 * counter-clockwise when seen from above (+Y), as they do in reality.
 *
 * Two size modes: "visible" exaggerates radii logarithmically (distances stay real); "true" uses real radii.
 */
const AU = 10;
const DEG = Math.PI / 180;
const Y_UP = new THREE.Vector3(0, 1, 0);
const ORIGIN = new THREE.Vector3();
const JD_MIN = julianDate(new Date(Date.UTC(1800, 0, 1)));
const JD_MAX = julianDate(new Date(Date.UTC(2050, 11, 31, 23, 59, 59)));
const OVERVIEW_R = 60;
const OVERVIEW_PHI = 1.1;
const EARTH_MASS = 5.972e24;
/** IAU rotation poles (RA, Dec in degrees, J2000) – gives real axial tilt directions (Saturn's rings, Uranus on its side). */
const POLES: Partial<Record<BodyId, [number, number]>> = {
  sun: [286.13, 63.87], mercury: [281.01, 61.45], venus: [272.76, 67.16], earth: [0, 90], moon: [269.99, 66.54],
  mars: [317.68, 52.89], jupiter: [268.06, 64.50], saturn: [40.59, 83.54], uranus: [257.31, -15.18], neptune: [299.36, 43.46], pluto: [132.99, -6.16],
};
/** Label priority for screen-space decluttering (lower index wins). */
const PRIO = ['sun', 'earth', 'jupiter', 'saturn', 'mars', 'venus', 'mercury', 'uranus', 'neptune', 'moon', 'pluto', 'ceres', 'eris', 'makemake', 'haumea', 'halley', 'voyager1', 'voyager2', 'newhorizons', 'asteroids', 'kuiper'];
const GROUPS: Array<{ key: string; ids: string[] }> = [
  { key: '', ids: ['sun'] },
  { key: 'grp.planets', ids: ['mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'] },
  { key: 'grp.dwarfs', ids: ['ceres', 'pluto', 'haumea', 'makemake', 'eris'] },
  { key: 'grp.small', ids: ['halley', 'voyager1', 'voyager2', 'newhorizons'] },
  { key: 'grp.belts', ids: ['asteroids', 'kuiper'] },
];
const BELT_ANCHOR: Record<string, THREE.Vector3> = {
  asteroids: new THREE.Vector3(27 * Math.cos(200 * DEG), 0.4, -27 * Math.sin(200 * DEG)),
  kuiper: new THREE.Vector3(410 * Math.cos(150 * DEG), 4, -410 * Math.sin(150 * DEG)),
};

type Mode = 'visible' | 'true';

interface Entry {
  id: string;
  body?: Body;
  group: THREE.Group;
  tilt?: THREE.Object3D;
  mesh?: THREE.Mesh;
  sprite?: THREE.Sprite;
  earth?: Earth;
  sun?: Sun;
  orbit?: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  probeLine?: THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial>;
  label: CSS2DObject;
  labelBtn: HTMLButtonElement;
  /** radius in scene units: visible mode, true mode, current */
  rVis: number; rTrue: number; r: number;
  /** world position (alias of group.position) */
  pos: THREE.Vector3;
  /** index into the marker Points, −1 = none */
  marker: number;
  prio: number;
}

function visibleRadius(b: Body): number {
  if (b.kind === 'star') return 1.2;
  if (b.kind === 'probe') return 0;
  return Math.max(0.07, 0.05 + 0.35 * Math.log10(b.radiusKm / 1000));
}
function spinAngle(jd: number, rotationH: number): number {
  if (!rotationH) return 0;
  const turns = ((jd - J2000) * 24) / rotationH;
  return (turns - Math.floor(turns)) * Math.PI * 2;
}
function nowJD(): number { return Date.now() / 86400000 + 2440587.5; }

export default class SolarSystemChapter extends BaseChapter {
  readonly id = 'solarsystem';

  private rig!: OrbitRig;
  private entries: Entry[] = [];
  private byId = new Map<string, Entry>();
  private sphereGeo = new THREE.SphereGeometry(1, 56, 28);
  private markers!: Markers;
  private tail?: CometTail;
  private moonRing?: THREE.LineLoop;
  private orbitJD = -1e9;

  // time
  private simJD = nowJD();
  private wallOffset = 0;          // simJD − wall-clock JD (real-time mode tracks the wall clock exactly)
  private playing = true;
  private speedIdx = 0;

  // scale
  private mode: Mode = 'visible';
  private scaleK = 0;              // 0 = visible … 1 = true (tweened)
  private modeTween?: TweenHandle;

  // camera / focus
  private focusId = 'sun';
  private flyFrom = new THREE.Vector3();
  private flyK = 1;
  private flight?: TweenHandle;
  private lastNear = -1;

  // ui
  private cardId?: string;
  private card?: HTMLDivElement;
  private cardLive: Array<{ dd: HTMLElement; fn: () => string }> = [];
  private listItems = new Map<string, HTMLButtonElement>();
  private timePanel!: TimePanel;
  private liveEls!: { n: HTMLElement[]; s: HTMLElement[]; dd: HTMLElement[] };
  private segBtns: HTMLButtonElement[] = [];
  private namesOn = true;
  private introOpen = false;
  private uiClock = 0;
  private cardClock = 0;

  // scratch (no per-frame allocations)
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private kept = new Float32Array(64);

  // ---------------------------------------------------------------------------------------------
  protected async setup(): Promise<void> {
    this.root.classList.add('ch-solarsystem');
    const catchEl = el('div', 'ss-catch ia');
    this.root.appendChild(catchEl);
    this.enableLabels().domElement.classList.add('ss-labels');

    this.buildScene();
    this.buildUI();

    // camera rig: orbit around the focused body
    this.rig = new OrbitRig(this.camera, catchEl);
    this.rig.maxRadius = 6000;
    this.rig.radius = 130; this.rig.phi = 0.9; this.rig.theta = 0.55;
    this.rig.target.set(0, 0, 0);
    this.camera.far = 1e5;

    // click (not drag) → pick body
    let dx = 0, dy = 0, dt0 = 0;
    catchEl.addEventListener('pointerdown', (e) => { dx = e.clientX; dy = e.clientY; dt0 = performance.now(); catchEl.classList.add('drag'); });
    catchEl.addEventListener('pointerup', (e) => {
      catchEl.classList.remove('drag');
      if (Math.hypot(e.clientX - dx, e.clientY - dy) < 6 && performance.now() - dt0 < 500) this.pick(e.clientX, e.clientY);
    });
    catchEl.addEventListener('pointercancel', () => catchEl.classList.remove('drag'));

    const onKey = (e: KeyboardEvent) => {
      if (this.introOpen) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === ' ') { e.preventDefault(); this.togglePlay(); }
      else if (e.key === 'ArrowLeft') this.step(-1);
      else if (e.key === 'ArrowRight') this.step(1);
      else if (e.key === 'Escape') this.overview();
    };
    window.addEventListener('keydown', onKey);
    this.onDispose(() => window.removeEventListener('keydown', onKey));

    const onParam = (e: Event) => { const p = (e as CustomEvent<string | undefined>).detail; if (p) this.select(p.toLowerCase()); else this.overview(); };
    this.ctx.ui.addEventListener('kosmos:param', onParam);
    this.onDispose(() => this.ctx.ui.removeEventListener('kosmos:param', onParam));

    // real star background (async, non-blocking)
    void buildSky().then((sky) => { if (this.mounted) this.scene.add(sky); }).catch((err) => console.warn('sky unavailable', err));

    // first frame of positions before anything is shown
    this.updateBodies(0);

    // debug/verification hook (used by scripts/shot.mjs --eval)
    (window as unknown as { __ss: unknown }).__ss = {
      jd: () => this.simJD,
      setJD: (jd: number) => { this.simJD = jd; this.playing = false; this.updateBodies(0); },
      setDate: (iso: string) => { this.simJD = julianDate(new Date(iso)); this.playing = false; this.updateBodies(0); },
      lon: (id: BodyId) => { const p = bodyPosition(id, this.simJD); return ((Math.atan2(p.y, p.x) / DEG) + 360) % 360; },
      dist: (a: BodyId, b: BodyId) => distanceAU(a, b, this.simJD),
      select: (id: string) => this.select(id),
      mode: (m: Mode) => this.setMode(m),
      focus: () => this.focusId,
      rig: () => ({ radius: this.rig.radius, phi: this.rig.phi, theta: this.rig.theta }),
    };

    const param = this.ctx.param?.toLowerCase();
    if (param && this.byId.has(param)) {
      this.select(param, true);
    } else {
      this.introOpen = true;
      void showIntro(this.root, {
        kicker: t('solarsystem.kicker'), title: t('chapter.solarsystem.title'), blurb: t('chapter.solarsystem.blurb'), hint: t('solarsystem.hint'),
      }).then(() => { this.introOpen = false; this.overview(2600); });
    }
  }

  protected teardown(): void {
    this.rig.dispose();
    this.flight?.cancel();
    this.modeTween?.cancel();
    delete (window as unknown as { __ss?: unknown }).__ss;
  }

  resize(width: number, height: number): void {
    super.resize(width, height);
    this.markers?.setProjection(height, this.camera.fov);
    this.tail?.setViewport(height / Math.tan((this.camera.fov * DEG) / 2));
  }

  // ---------------------------------------------------------------------------------------------
  // Scene
  // ---------------------------------------------------------------------------------------------
  private buildScene(): void {
    this.scene.add(new THREE.PointLight(0xfff1dc, 2.4, 0, 0), new THREE.AmbientLight(0x2a3549, 0.5));

    const markerColors: number[] = [], markerPx: number[] = [];
    for (const b of BODIES) {
      const e = this.makeEntry(b);
      if (b.kind !== 'probe' && b.kind !== 'moon') { e.marker = markerColors.length; markerColors.push(b.color); markerPx.push(b.kind === 'star' ? 9 : b.kind === 'planet' ? 6.5 : 5); }
    }
    this.markers = createMarkers(markerColors, markerPx);
    this.markers.setProjection(this.ctx.height, this.camera.fov);
    this.scene.add(this.markers.points);

    // belts (schematic) + clickable labels
    this.scene.add(createBelt({ count: 4000, rMin: 2.1 * AU, rMax: 3.3 * AU, incSigmaDeg: 7, color: 0x9a9284, px: 1.7, alpha: 0.55, seed: 3, gaps: [[2.5 * AU, 0.16], [2.82 * AU, 0.12], [2.95 * AU, 0.1]] }));
    this.scene.add(createBelt({ count: 3000, rMin: 30 * AU, rMax: 50 * AU, incSigmaDeg: 6, color: 0x8fb4d8, px: 1.9, alpha: 0.5, seed: 11 }));
    for (const id of ['asteroids', 'kuiper']) {
      const group = new THREE.Group();
      group.position.copy(BELT_ANCHOR[id]);
      this.scene.add(group);
      const e: Entry = { id, group, label: undefined as unknown as CSS2DObject, labelBtn: undefined as unknown as HTMLButtonElement, rVis: 0, rTrue: 0, r: 0, pos: group.position, marker: -1, prio: PRIO.indexOf(id) };
      this.makeLabel(e, `${t(`solarsystem.${id}.name`)}<span class="sub">${t('solarsystem.schematic')}</span>`, 'belt');
      this.entries.push(e); this.byId.set(id, e);
    }
    this.entries.sort((a, b) => a.prio - b.prio);
    this.applyScale();
  }

  private makeEntry(b: Body): Entry {
    const group = new THREE.Group();
    group.name = b.id;
    this.scene.add(group);
    const rVis = visibleRadius(b), rTrue = (b.radiusKm / KM_PER_AU) * AU;
    const e: Entry = { id: b.id, body: b, group, label: undefined as unknown as CSS2DObject, labelBtn: undefined as unknown as HTMLButtonElement, rVis, rTrue, r: rVis, pos: group.position, marker: -1, prio: PRIO.indexOf(b.id) };

    if (b.kind === 'probe') {
      const mat = new THREE.SpriteMaterial({ map: diamondTexture(), sizeAttenuation: false, transparent: true, depthTest: false, depthWrite: false });
      e.sprite = new THREE.Sprite(mat);
      e.sprite.scale.set(0.026, 0.026, 1);
      e.sprite.renderOrder = 6;
      group.add(e.sprite);
      // faint dotted line from the Sun (straight-line track)
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      geo.setAttribute('lineDistance', new THREE.BufferAttribute(new Float32Array(2), 1));
      const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.28, dashSize: 4, gapSize: 3, depthWrite: false }));
      line.frustumCulled = false;
      this.scene.add(line);
      e.probeLine = line;
    } else if (b.kind === 'comet') {
      const mat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xdff4ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      e.sprite = new THREE.Sprite(mat);
      group.add(e.sprite);
      this.tail = createCometTail(320);
      this.tail.setViewport(this.ctx.height / Math.tan((this.camera.fov * DEG) / 2));
      this.scene.add(this.tail.object);
    } else {
      const tilt = new THREE.Object3D();
      tilt.quaternion.setFromUnitVectors(Y_UP, this.poleOf(b, this.v));
      group.add(tilt);
      e.tilt = tilt;
      if (b.kind === 'star') {
        e.sun = createSun(1, 4.2);
        tilt.add(e.sun.group);
      } else if (b.look === 'earth') {
        e.earth = createEarth(1, { segments: 72 });
        tilt.add(e.earth.group);
        // faint ring showing the Moon's orbit (scaled to the current Moon distance)
        const pts = new Float32Array(97 * 3);
        for (let i = 0; i < 97; i++) { const a = (i / 96) * Math.PI * 2; pts[i * 3] = Math.cos(a); pts[i * 3 + 2] = Math.sin(a); }
        const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(pts, 3));
        this.moonRing = new THREE.LineLoop(rg, new THREE.LineBasicMaterial({ color: 0xcfcfcf, transparent: true, opacity: 0.18, depthWrite: false }));
        group.add(this.moonRing);
      } else {
        const mesh = new THREE.Mesh(this.sphereGeo, createBodyMaterial(b));
        if (b.rings) mesh.add(createRingMesh(b));
        tilt.add(mesh);
        e.mesh = mesh;
      }
    }

    if (b.elements && b.elements.kind !== 'probe') {
      const pts = new Float32Array(257 * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: b.color, transparent: true, opacity: 0.35, depthWrite: false }));
      line.frustumCulled = false;
      this.scene.add(line);
      e.orbit = line;
    }

    const cls = b.kind === 'star' ? 'gold' : b.kind === 'planet' ? '' : b.kind === 'probe' ? 'probe' : 'dim';
    this.makeLabel(e, pick(b.name), cls);
    this.entries.push(e); this.byId.set(b.id, e);
    return e;
  }

  private makeLabel(e: Entry, html: string, cls: string): void {
    const obj = this.label('', 'ss-lblwrap', e.group);
    const btn = el('button', `ss-lbl ia ${cls}`.trim());
    btn.type = 'button';
    btn.innerHTML = html;
    btn.addEventListener('click', (ev) => { ev.stopPropagation(); this.select(e.id); });
    obj.element.appendChild(btn);
    e.label = obj; e.labelBtn = btn;
  }

  /** Rotation pole of a body in scene coordinates (unit vector). */
  private poleOf(b: Body, out: THREE.Vector3): THREE.Vector3 {
    const p = POLES[b.id];
    if (!p) { const a = b.axialTiltDeg * DEG; return out.set(0, Math.cos(a), Math.sin(a)); }
    const ra = p[0] * DEG, dec = p[1] * DEG;
    const ec = eqToEcl({ x: Math.cos(dec) * Math.cos(ra), y: Math.cos(dec) * Math.sin(ra), z: Math.sin(dec) });
    return out.set(ec.x, ec.z, -ec.y).normalize();
  }

  private rebuildOrbits(jd: number): void {
    this.orbitJD = jd;
    for (const e of this.entries) {
      if (!e.orbit || !e.body) continue;
      const path = orbitPath(e.body.id, jd, 256);
      const arr = e.orbit.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < path.length && i < 257; i++) { arr[i * 3] = path[i].x * AU; arr[i * 3 + 1] = path[i].z * AU; arr[i * 3 + 2] = -path[i].y * AU; }
      e.orbit.geometry.attributes.position.needsUpdate = true;
      e.orbit.geometry.computeBoundingSphere();
    }
  }

  /** Apply the current scale blend to every body. */
  private applyScale(): void {
    for (const e of this.entries) {
      if (!e.body) continue;
      e.r = e.rVis > 0 ? Math.exp(lerp(Math.log(e.rVis), Math.log(Math.max(e.rTrue, 1e-7)), this.scaleK)) : 0;
      if (e.mesh) e.mesh.scale.setScalar(e.r);
      if (e.earth) e.earth.group.scale.setScalar(e.r);
      if (e.sun) e.sun.group.scale.setScalar(e.r);
      if (e.sprite && e.body.kind === 'comet') e.sprite.scale.set(e.r * 7, e.r * 7, 1);
      if (e.marker >= 0) this.markers.radii[e.marker] = e.r;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Per frame
  // ---------------------------------------------------------------------------------------------
  protected tick(dt: number): void {
    if (this.playing) {
      const now = nowJD();
      if (this.speedIdx === 0) this.simJD = now + this.wallOffset;
      else { this.simJD += dt * SPEEDS[this.speedIdx].dps; this.wallOffset = this.simJD - now; }
      if (this.simJD < JD_MIN || this.simJD > JD_MAX) {
        this.simJD = clamp(this.simJD, JD_MIN, JD_MAX); this.playing = false; this.wallOffset = this.simJD - now;
        toast(this.root, t('solarsystem.rangeHint'), 3200);
      }
    }
    this.updateBodies(dt);

    // camera: follow the focused body (blend from the flight start point while flying)
    const f = this.byId.get(this.focusId);
    const target = f && f.body ? f.pos : ORIGIN;
    this.rig.target.lerpVectors(this.flyFrom, target, this.flyK);
    this.rig.minRadius = f && f.body ? Math.max(f.r * 1.7, f.body.kind === 'probe' ? 0.4 : 1e-4) : 1;
    this.rig.update();
    const near = clamp(this.rig.radius * 0.004, 1e-6, 4);
    if (Math.abs(near - this.lastNear) > this.lastNear * 0.15) { this.lastNear = near; this.camera.near = near; this.camera.updateProjectionMatrix(); }
    this.camera.updateMatrixWorld();

    this.layoutLabels();

    this.timePanel.render(this.simJD, this.playing, this.speedIdx);
    this.uiClock += dt;
    if (this.uiClock > 0.25) { this.uiClock = 0; this.updateLive(); }
    this.cardClock += dt;
    if (this.cardClock > 0.5) { this.cardClock = 0; for (const l of this.cardLive) { const s = l.fn(); if (l.dd.innerHTML !== s) l.dd.innerHTML = s; } }
  }

  private updateBodies(dt: number): void {
    const jd = this.simJD;
    if (Math.abs(jd - this.orbitJD) > 365.25) this.rebuildOrbits(jd);
    const v = this.v, v2 = this.v2;
    const earth = this.byId.get('earth')!;

    for (const e of this.entries) {
      const b = e.body;
      if (!b) continue;
      if (b.id === 'moon') {
        const m = moonGeocentric(jd);
        const km = Math.hypot(m.x, m.y, m.z) || 1;
        const dTrue = (km / KM_PER_AU) * AU;
        const d = Math.exp(lerp(Math.log(3 * earth.rVis), Math.log(dTrue), this.scaleK));
        e.pos.set(earth.pos.x + (m.x / km) * d, earth.pos.y + (m.z / km) * d, earth.pos.z - (m.y / km) * d);
        if (this.moonRing) this.moonRing.scale.setScalar(d);
        // tidal locking: the near side (lat 0, lon 0) faces Earth
        if (e.mesh && e.tilt) {
          v.copy(earth.pos).sub(e.pos).applyQuaternion(this.q.copy(e.tilt.quaternion).invert());
          e.mesh.rotation.y = Math.atan2(v.x, v.z) - Math.PI / 2;
        }
        continue;
      }
      const p = bodyPosition(b.id, jd);
      e.pos.set(p.x * AU, p.z * AU, -p.y * AU);
      if (e.mesh) e.mesh.rotation.y = spinAngle(jd, b.rotationH);
      if (e.sun) { e.sun.group.rotation.y = spinAngle(jd, b.rotationH); e.sun.update(dt); }
      if (e.earth && e.tilt) {
        v.copy(e.pos).negate().normalize();           // world direction towards the Sun
        e.earth.setSunDirection(v);
        // rotate the globe so the sub-solar point faces the Sun (real time of day)
        const ss = subsolarPoint(jd);
        v.applyQuaternion(this.q.copy(e.tilt.quaternion).invert());
        const phi = (90 - ss.lat) * DEG, th = (ss.lon + 180) * DEG;
        v2.set(-Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th));
        e.earth.setRotation(Math.atan2(v.x, v.z) - Math.atan2(v2.x, v2.z));
        e.earth.update(dt);
      }
      if (e.probeLine) {
        const arr = e.probeLine.geometry.attributes.position.array as Float32Array;
        arr[3] = e.pos.x; arr[4] = e.pos.y; arr[5] = e.pos.z;
        e.probeLine.geometry.attributes.position.needsUpdate = true;
        const ld = e.probeLine.geometry.attributes.lineDistance;
        (ld.array as Float32Array)[1] = e.pos.length();
        ld.needsUpdate = true;
      }
      if (b.kind === 'comet' && this.tail) {
        const rAU = Math.hypot(p.x, p.y, p.z);
        const len = Math.min(4, 2 / (rAU * rAU)) * (0.35 + 0.65 * (1 - this.scaleK));
        v.copy(e.pos).normalize();
        this.tail.update(e.pos, v, len, clamp(1.4 / rAU, 0, 1));
      }
      if (e.marker >= 0) { const i = e.marker * 3; this.markers.positions[i] = e.pos.x; this.markers.positions[i + 1] = e.pos.y; this.markers.positions[i + 2] = e.pos.z; }
    }
    this.markers.commit();
  }

  /** Decide which labels are visible: focus rules + greedy screen-space decluttering. */
  private layoutLabels(): void {
    const W = this.ctx.app.width, H = this.ctx.app.height;
    const v = this.v;
    let n = 0;
    const R = this.rig.radius;
    for (const e of this.entries) {
      let show = this.namesOn && e.id !== this.focusId && this.labelWanted(e, R);
      if (show) {
        v.copy(e.pos).project(this.camera);
        if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.02 || Math.abs(v.y) > 1.02) show = false;
        else {
          const sx = ((v.x + 1) / 2) * W, sy = ((1 - v.y) / 2) * H;
          for (let i = 0; i < n; i++) if (Math.abs(sx - this.kept[i * 2]) < 72 && Math.abs(sy - this.kept[i * 2 + 1]) < 17) { show = false; break; }
          if (show && n < 32) { this.kept[n * 2] = sx; this.kept[n * 2 + 1] = sy; n++; }
        }
      }
      if (e.label.visible !== show) e.label.visible = show;
    }
  }

  private labelWanted(e: Entry, R: number): boolean {
    const b = e.body;
    if (!b) return e.id === 'asteroids' ? R > 30 : R > 220;
    switch (b.kind) {
      case 'star': return R > e.r * 4;
      case 'planet': return true;
      case 'moon': { const f = this.focusId; return (f === 'earth' || f === 'moon') && R < e.pos.distanceTo(this.byId.get('earth')!.pos) * 14; }
      default: return R > 80 || this.camera.position.distanceTo(e.pos) < 40;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Focus / camera
  // ---------------------------------------------------------------------------------------------
  private focusRadius(e: Entry): number {
    const b = e.body!;
    if (b.kind === 'probe') return 30;
    if (b.kind === 'comet') return Math.max(e.r * 12, 0.02);
    if (b.kind === 'star') return e.r * 6.5;
    return e.r * (b.rings ? 8.5 : b.id === 'earth' ? 5.2 : 6);
  }

  private fly(target: Entry | null, radius: number, ms: number, phi?: number): void {
    this.flight?.cancel();
    this.flyFrom.copy(this.rig.target);
    this.flyK = 0;
    const r0 = this.rig.radius, ph0 = this.rig.phi, ph1 = phi ?? ph0;
    const dur = this.ctx.app.reducedMotion ? 0 : ms;
    void target;
    this.flight = tween(dur, (k) => {
      this.flyK = k;
      this.rig.radius = Math.exp(lerp(Math.log(r0), Math.log(radius), k));
      this.rig.phi = lerp(ph0, ph1, k);
    });
  }

  /** Focus a body (or belt) by id: camera flight + follow mode + info card. */
  private select(id: string, instant = false): void {
    const e = this.byId.get(id);
    if (!e) return;
    if (!e.body) {
      // belts: overview at a radius where the belt fills the view, plus the belt card
      this.focusId = 'sun';
      this.fly(null, id === 'asteroids' ? 95 : 1000, instant ? 0 : 2200, OVERVIEW_PHI);
      this.showCard(id);
      this.updateList();
      return;
    }
    this.focusId = id;
    this.fly(e, this.focusRadius(e), instant ? 0 : 2000);
    this.showCard(id);
    this.updateList();
    try { history.replaceState(null, '', `#/sonnensystem/${id}`); } catch { /* ignore */ }
  }

  private overview(ms = 2000): void {
    this.focusId = 'sun';
    this.closeCard();
    this.fly(null, OVERVIEW_R, ms, OVERVIEW_PHI);
    this.updateList();
    try { history.replaceState(null, '', '#/sonnensystem'); } catch { /* ignore */ }
  }

  /** Screen-space picking: nearest body within max(14 px, its projected radius). */
  private pick(x: number, y: number): void {
    const W = this.ctx.app.width, H = this.ctx.app.height;
    const proj = (H / 2) / Math.tan((this.camera.fov * DEG) / 2);
    let best: Entry | null = null, bestD = 1e9;
    for (const e of this.entries) {
      if (!e.body) continue;
      this.v.copy(e.pos).project(this.camera);
      if (this.v.z > 1 || this.v.z < -1) continue;
      const sx = ((this.v.x + 1) / 2) * W, sy = ((1 - this.v.y) / 2) * H;
      const dist = this.camera.position.distanceTo(e.pos);
      const rp = Math.max(14, (e.r * proj) / Math.max(dist, 1e-9));
      const d = Math.hypot(sx - x, sy - y);
      if (d < rp && d < bestD) { best = e; bestD = d; }
    }
    if (best) this.select(best.id);
  }

  private setMode(mode: Mode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.segBtns.forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    toast(this.root, t(mode === 'true' ? 'solarsystem.trueToast' : 'solarsystem.visibleToast'), 3800);
    const k0 = this.scaleK, k1 = mode === 'true' ? 1 : 0;
    const f = this.byId.get(this.focusId);
    const closeUp = !!(f && f.body && f.r > 0 && this.rig.radius < f.r * 16);
    const rigR0 = this.rig.radius, fR0 = f?.r ?? 1;
    this.modeTween?.cancel();
    this.modeTween = tween(this.ctx.app.reducedMotion ? 0 : 1500, (k) => {
      this.scaleK = lerp(k0, k1, k);
      this.applyScale();
      if (closeUp && f) this.rig.radius = (rigR0 * f.r) / fR0;
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Time
  // ---------------------------------------------------------------------------------------------
  private setJD(jd: number, pause = true): boolean {
    const c = clamp(jd, JD_MIN, JD_MAX);
    const clamped = c !== jd;
    this.simJD = c;
    this.wallOffset = c - nowJD();
    if (pause) this.playing = false;
    if (clamped) toast(this.root, t('solarsystem.rangeHint'), 3200);
    return clamped;
  }
  private step(dir: -1 | 1): void { this.setJD(this.simJD + dir * SPEEDS[this.speedIdx].dps); }
  private togglePlay(): void { this.playing = !this.playing; this.wallOffset = this.simJD - nowJD(); }
  private now(): void { this.simJD = nowJD(); this.wallOffset = 0; this.playing = true; this.speedIdx = 0; }
  private setSpeed(i: number): void { this.speedIdx = i; this.playing = true; this.wallOffset = this.simJD - nowJD(); }
  private setDate(d: Date, birthday: boolean): void {
    let jd = julianDate(d);
    if (birthday && jd > nowJD()) { toast(this.root, t('solarsystem.birthdayFuture'), 3200); jd = nowJD(); }
    const clamped = this.setJD(jd);
    if (birthday && !clamped) toast(this.root, t('solarsystem.birthdayToast'), 4200);
  }

  // ---------------------------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------------------------
  private buildUI(): void {
    // ---- body list (top left) ------------------------------------------------------------------
    const bodies = panel({ cls: 'ss-bodies', pos: 'tl' });
    const head = el('div', 'head');
    head.append(el('div', 'panel-title', t('solarsystem.bodies')), button(t('solarsystem.overview'), () => this.overview(), 'ghost sm'));
    const list = el('div', 'ss-list scroll');
    list.setAttribute('role', 'listbox');
    const ov = el('button', 'ss-item ov ia', `<span class="dot" style="color:var(--gold)"></span><span class="nm">${t('solarsystem.overview')}</span>`);
    ov.type = 'button'; ov.addEventListener('click', () => this.overview());
    list.appendChild(ov);
    for (const g of GROUPS) {
      if (g.key) list.appendChild(el('div', 'ss-group', t(`solarsystem.${g.key}`)));
      for (const id of g.ids) {
        const b = BODY_BY_ID[id];
        const name = b ? pick(b.name) : t(`solarsystem.${id}.name`);
        const color = b ? `#${b.color.toString(16).padStart(6, '0')}` : 'var(--muted)';
        const kind = b ? t(`solarsystem.kind.${b.kind}`) : t('solarsystem.schematic');
        const item = el('button', `ss-item ia ${id === 'moon' ? 'sub' : ''}`.trim(), `<span class="dot" style="color:${color};background:${color}"></span><span class="nm">${name}</span><span class="kd">${kind}</span>`);
        item.type = 'button';
        item.setAttribute('role', 'option');
        item.addEventListener('click', () => this.select(id));
        list.appendChild(item);
        this.listItems.set(id, item);
      }
    }
    const toggles = el('div', 'ss-toggles');
    const seg = el('div', 'seg');
    seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-label', t('solarsystem.scale'));
    for (const m of ['visible', 'true'] as Mode[]) {
      const b = el('button', m === this.mode ? 'on' : '', t(m === 'visible' ? 'solarsystem.scaleVisible' : 'solarsystem.scaleTrue'));
      b.type = 'button'; b.dataset.mode = m; b.setAttribute('role', 'radio');
      b.addEventListener('click', () => this.setMode(m));
      seg.appendChild(b); this.segBtns.push(b);
    }
    toggles.append(el('span', 'lab', t('solarsystem.scale')), seg,
      chip(t('solarsystem.orbits'), true, (on) => { for (const e of this.entries) if (e.orbit) e.orbit.visible = on; if (this.moonRing) this.moonRing.visible = on; }),
      chip(t('solarsystem.names'), true, (on) => { this.namesOn = on; }));
    bodies.append(head, list, toggles, el('div', 'src', t('solarsystem.source')));
    this.addUI(bodies);

    // ---- live readouts (bottom right) ------------------------------------------------------------
    const live = panel({ cls: 'ss-live', pos: 'br', title: t('solarsystem.live') });
    const stats = el('div', 'stats');
    const s1 = stat('–', t('solarsystem.earthSun'), '–');
    const s2 = stat('–', t('solarsystem.lightSunEarth'));
    const s3 = stat('–', t('solarsystem.v1dist'), '–', 'cyan');
    stats.append(s1, s2, s3);
    const dl = kv([[t('solarsystem.earthMars'), '–'], [t('solarsystem.earthJupiter'), '–'], [t('solarsystem.v1light'), '–']]);
    live.append(stats, dl, el('div', 'src', t('solarsystem.sourceLive')));
    this.liveEls = {
      n: [s1, s2, s3].map((s) => s.querySelector('.n') as HTMLElement),
      s: [s1, s3].map((s) => s.querySelector('.s') as HTMLElement),
      dd: Array.from(dl.querySelectorAll('dd')),
    };
    this.addUI(live);

    // ---- time control (bottom centre) ----------------------------------------------------------
    this.timePanel = new TimePanel({
      step: (d) => this.step(d), togglePlay: () => this.togglePlay(), now: () => this.now(), setSpeed: (i) => this.setSpeed(i), setDate: (d, b) => this.setDate(d, b),
    }, '1800-01-01', '2050-12-31');
    this.timePanel.el.appendChild(el('div', 'keys', t('solarsystem.keys')));
    this.addUI(this.timePanel.el);
    this.updateLive();
    this.updateList();
  }

  private updateList(): void {
    const hi = this.cardId && !BODY_BY_ID[this.cardId] ? this.cardId : this.focusId;
    for (const [id, item] of this.listItems) {
      const on = id === hi && !(id === 'sun' && !this.cardId);
      item.classList.toggle('on', on);
      item.setAttribute('aria-selected', String(on));
    }
    for (const e of this.entries) if (e.orbit) e.orbit.material.opacity = e.id === this.focusId ? 0.75 : 0.35;
  }

  private auKm(au: number): string {
    const km = au * KM_PER_AU;
    const mio = km / 1e6;
    return `${fmtNum(au, { maxDigits: au < 10 ? 3 : 2 })} ${t('solarsystem.au')} · ${fmtNum(mio, { maxDigits: mio < 100 ? 1 : 0 })} ${t('solarsystem.mioKm')}`;
  }

  private updateLive(): void {
    const jd = this.simJD;
    const es = distanceAU('earth', 'sun', jd);
    const em = distanceAU('earth', 'mars', jd);
    const ej = distanceAU('earth', 'jupiter', jd);
    const v1 = distanceAU('voyager1', 'earth', jd);
    const { n, s, dd } = this.liveEls;
    const set = (e: HTMLElement, html: string) => { if (e.innerHTML !== html) e.innerHTML = html; };
    set(n[0], `${fmtNum(es, { digits: 3 })} ${t('solarsystem.au')}`);
    set(s[0], `${fmtNum((es * KM_PER_AU) / 1e6, { maxDigits: 1 })} ${t('solarsystem.mioKm')}`);
    set(n[1], fmtLightTime((es * KM_PER_AU) / C_KM_S));
    set(n[2], `${fmtNum(v1, { maxDigits: 1 })} ${t('solarsystem.au')}`);
    set(s[1], `${fmtNum((v1 * KM_PER_AU) / 1e9, { maxDigits: 1 })} ${t('solarsystem.mioKm').replace('Mio.', 'Mrd.').replace('million', 'billion')}`);
    set(dd[0], this.auKm(em));
    set(dd[1], this.auKm(ej));
    set(dd[2], fmtLightTime((v1 * KM_PER_AU) / C_KM_S));
    this.timePanel.setSummary(`${t('solarsystem.earthSun')} <b>${fmtNum(es, { digits: 3 })} ${t('solarsystem.au')}</b> · ${t('solarsystem.light')} <b>${fmtLightTime((es * KM_PER_AU) / C_KM_S)}</b> · ${t('solarsystem.v1')} <b>${fmtNum(v1, { maxDigits: 1 })} ${t('solarsystem.au')}</b>`);
  }

  // ---------------------------------------------------------------------------------------------
  // Info card
  // ---------------------------------------------------------------------------------------------
  private closeCard(): void {
    this.card?.remove();
    this.card = undefined; this.cardId = undefined; this.cardLive = [];
  }

  private showCard(id: string): void {
    this.closeCard();
    this.cardId = id;
    const b = BODY_BY_ID[id];
    const onClose = () => { this.card = undefined; this.cardId = undefined; this.cardLive = []; this.updateList(); };
    if (!b) {
      const facts = t(`solarsystem.${id}.facts`).split('|').map((f) => `<li>${f}</li>`).join('');
      this.card = infoCard(this.root, {
        title: t(`solarsystem.${id}.name`), sub: t('solarsystem.kind.belt'),
        html: `<p class="blurb">${t(`solarsystem.${id}.blurb`)}</p><ul class="facts">${facts}</ul><div class="src">${t('solarsystem.sourceBelt')}</div>`,
        onClose,
      });
      return;
    }
    const rows: Array<[string, string]> = [];
    const de = t('solarsystem.days');
    if (b.radiusKm >= 1) rows.push([t('solarsystem.radius'), `${fmtNum(b.radiusKm, { digits: 0 })} km`]);
    const ratio = b.massKg / EARTH_MASS;
    rows.push([t('solarsystem.mass'), b.massKg < 1e6 ? `${fmtNum(b.massKg, { digits: 0 })} kg` : ratio >= 0.001 && ratio <= 5000 ? `${fmtNum(ratio, { maxDigits: ratio < 1 ? 3 : 1 })} ${t('solarsystem.xEarth')}` : `${fmtSci(b.massKg)} kg`]);
    if (b.rotationH) {
      const h = Math.abs(b.rotationH);
      rows.push([t('solarsystem.day'), `${h < 72 ? `${fmtNum(h, { maxDigits: 1 })} h` : `${fmtNum(h / 24, { maxDigits: 1 })} ${de}`}${b.rotationH < 0 ? ` · ${t('solarsystem.retrograde')}` : ''}`]);
    }
    if (b.periodDays) rows.push([t('solarsystem.year'), b.periodDays < 1000 ? `${fmtNum(b.periodDays, { maxDigits: 1 })} ${de}` : `${fmtNum(b.periodDays / 365.25, { maxDigits: b.periodDays < 36525 ? 1 : 0 })} ${t('solarsystem.earthYears')}`]);
    if (b.tempK) rows.push([t('solarsystem.temperature'), fmtKelvin(b.tempK)]);
    if (b.kind === 'planet' || b.kind === 'dwarf') rows.push([t('solarsystem.moons'), fmtNum(b.moons, { digits: 0 })]);
    if (b.gravity && b.kind !== 'probe' && b.kind !== 'comet') rows.push([t('solarsystem.gravity'), `${fmtNum(b.gravity / 9.81, { maxDigits: 2 })} ${t('solarsystem.xEarth')}`]);
    if (b.elements?.kind === 'probe') rows.push([t('solarsystem.speed'), `${fmtNum((b.elements.rate * KM_PER_AU) / SEC_PER_YEAR, { maxDigits: 1 })} ${t('solarsystem.kmS')}`]);

    const live: Array<[string, () => string]> = [];
    if (b.id !== 'sun' && b.id !== 'moon') live.push([t('solarsystem.distSun'), () => this.auKm(distanceAU(b.id, 'sun', this.simJD))]);
    if (b.id === 'moon') live.push([t('solarsystem.distEarth'), () => fmtKm(distanceAU('moon', 'earth', this.simJD) * KM_PER_AU)]);
    else if (b.id !== 'earth') live.push([t('solarsystem.distEarth'), () => this.auKm(distanceAU(b.id, 'earth', this.simJD))]);
    if (b.id !== 'earth') live.push([t('solarsystem.lightEarth'), () => fmtLightTime((distanceAU(b.id, 'earth', this.simJD) * KM_PER_AU) / C_KM_S)]);
    for (const [k, fn] of live) rows.push([k, fn()]);

    const facts = b.facts.map((f) => `<li>${pick(f)}</li>`).join('');
    this.card = infoCard(this.root, { title: pick(b.name), sub: t(`solarsystem.kind.${b.kind}`), html: `<p class="blurb">${pick(b.blurb)}</p>`, onClose });
    const dl = kv(rows);
    const dds = Array.from(dl.querySelectorAll('dd'));
    this.cardLive = live.map(([, fn], i) => { const dd = dds[dds.length - live.length + i]; dd.classList.add('live'); return { dd, fn }; });
    this.card.append(dl, el('ul', 'facts', facts), el('div', 'src', `${t('solarsystem.source')}${b.id === 'moon' && this.mode === 'visible' ? ` · ${t('solarsystem.moonNote')}` : ''}`));
  }
}
