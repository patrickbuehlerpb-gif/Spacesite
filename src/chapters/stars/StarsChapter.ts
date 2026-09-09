import * as THREE from 'three';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import './strings';
import './style.css';
import { BaseChapter } from '../../core/BaseChapter';
import { t, pick, lang } from '../../core/i18n';
import { el, button, panel, chip, stat, slider, infoCard, showIntro, toast } from '../../core/ui';
import { flyCamera } from '../../core/CameraRig';
import { FreeFlight, isTyping } from '../../core/FreeFlight';
import { easeInOutSine, type TweenHandle } from '../../core/tween';
import { fmtNum, fmtDistancePc, fmtLightTime, fmtYears, LY_PER_PC, lumFromAbsMag, apparentMag, clamp, smoothstep, raDecToXYZ } from '../../core/units';
import { createStarPoints, colorsFromBv, starUniforms, type StarPointsUniforms } from '../../core/StarPoints';
import { bvToRgb, spectralClassFromBv } from '../../core/color';
import {
  loadStarCatalog, loadStarNames, loadConstellations, searchStars, starDisplayName,
  type StarCatalog, type StarNamesIndex, type Constellation,
} from '../../data/stars';
import { AutopilotPanel } from './AutopilotPanel';
import { LANDMARKS, FAMOUS, ALIASES, localStarName, type Landmark } from './landmarks';
import { pickStar } from './picking';
import { cssColor, buildConstellationLines, constellationAnchor, buildRings, createLandmarkSprite } from './SceneObjects';

/**
 * Chapter «Sternenflug»: free flight through the 109 400 stars of the HYG catalogue.
 *
 * Frame: the catalogue is equatorial J2000 in parsecs with z = north. Everything from the catalogue lives in
 * `world`, a group rotated −90° about X so that the north celestial pole is +Y (three.js up); the camera keeps
 * up = (0, 1, 0). Scene unit = 1 parsec. The Sun sits at the origin; "home" is 0.0008 pc (≈ 165 AU) from it –
 * outside the near plane, but the sky is indistinguishable from Earth's.
 */
const SUN_ABS = 4.83, SUN_BV = 0.65, SUN_APP_MAG = -26.74, SUN_LIGHT_S = 499.0;
const HOME_DIST = 0.0008;                   // pc
const HOME_LOOK: [number, number] = [90, 2]; // RA/Dec (deg): Orion, with Sirius and Aldebaran at the edges
const PROXIMA_PC = 1.3012;
const MIN_SPEED = 0.01 / LY_PER_PC, MAX_SPEED = 5000 / LY_PER_PC, START_SPEED = 2 / LY_PER_PC; // pc/s
const CON_NEAR = 1.5, CON_FAR = 3.5;        // constellation names fade between these distances from the Sun (pc)
const NAME_POOL = 150, MAX_NAME_LABELS = 44, NAME_MAG_LIMIT = 4.8;
const LABEL_TICK = 0.2, HUD_TICK = 0.1;      // s
const RING_LY = [10, 100, 1000];
const CAT_RADIUS = 800;                     // pc – beyond this the auto-exposure opens up (long exposure of the whole catalogue)
const Y_UP = new THREE.Vector3(0, 1, 0);

type Sel = { kind: 'star'; i: number } | { kind: 'sun' } | { kind: 'lm'; lm: Landmark };

interface Lbl { obj: CSS2DObject; x: number; y: number; z: number; w: number }
interface NameLbl extends Lbl { i: number; absMag: number }
interface LmLbl extends Lbl { lm: Landmark }

interface DebugApi {
  count: number;
  distLy: (name: string) => number | null;
  camera: () => { distSunLy: number; speedLyS: number; pos: number[] };
  select: (name: string) => boolean;
  goto: (name: string) => boolean;
  home: () => void;
  labels: () => number;
  selection: () => string | null;
  autopilot: () => boolean;
  setSpeedLy: (v: number) => void;
  /** dev: screen-space pick at CSS pixels, returns the selected name */
  pick: (x: number, y: number) => string | null;
  /** dev: put the camera at catalogue coordinates (pc), looking at the Sun */
  place: (x: number, y: number, z: number) => void;
}
declare global { interface Window { __stars?: DebugApi } }

export default class StarsChapter extends BaseChapter {
  readonly id = 'stars';

  private world = new THREE.Group();
  private worldQ = new THREE.Quaternion();
  private worldQInv = new THREE.Quaternion();
  private cat!: StarCatalog;
  private names!: StarNamesIndex;
  private cons: Constellation[] = [];
  private byName = new Map<string, number>();
  private conByAbbr = new Map<string, Constellation>();
  private lmByStar = new Map<string, Landmark>();
  private maxDistPc = 0;
  private proximaIdx = -1;

  // scene
  private conLines!: THREE.LineSegments;
  private starU!: StarPointsUniforms;
  private sunU!: StarPointsUniforms;
  private expo = 0;
  private rings!: THREE.LineSegments;
  private labelsLayer!: HTMLElement;
  private sunLabel!: CSS2DObject;
  private marker!: CSS2DObject;
  private markerRing!: HTMLElement;
  private conLabels: Lbl[] = [];
  private nameLabels: NameLbl[] = [];
  private lmLabels: LmLbl[] = [];
  private ringLabels: Lbl[] = [];
  private consOn = true; private namesOn = true; private scaleOn = false;
  private conAlpha = -1;
  private visibleLabels = 0;

  // flight
  private flight!: FreeFlight;
  private autopilot?: TweenHandle;
  private introOpen = false;
  private touch = false;
  private vel = 0;                                  // measured speed, pc/s
  private lastPos = new THREE.Vector3();

  // selection / UI
  private sel?: Sel;
  private card?: HTMLDivElement;
  private liveDd?: HTMLElement;
  private ap!: AutopilotPanel;
  private slots: Record<string, HTMLElement> = {};
  private speedSlider?: HTMLDivElement & { set: (v: number) => void };
  private sliderSpeed = -1;
  private uiRects: HTMLElement[] = [];
  private chromeH = 56;
  private hudClock = 0; private labelClock = 0;

  // scratch (no per-frame allocations)
  private camCat = new THREE.Vector3();
  private mvp = new THREE.Matrix4();
  private _v = new THREE.Vector3();
  private _v2 = new THREE.Vector3();
  private _q = new THREE.Quaternion();
  private px = 0; private py = 0;
  private rects = new Float32Array(4 * 240);
  private placed = 0;
  private press = { x: 0, y: 0, t: 0, id: -1 };

  // ---------------------------------------------------------------------------------------------
  protected async setup(): Promise<void> {
    this.root.classList.add('ch-stars');
    this.touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    if (this.touch) this.root.classList.add('touch');
    this.camera.up.copy(Y_UP);
    this.camera.near = 2e-4; this.camera.far = 3e4; this.camera.updateProjectionMatrix();
    this.world.rotation.x = -Math.PI / 2;
    this.scene.add(this.world);
    this.world.updateMatrixWorld(true);
    this.worldQ.copy(this.world.quaternion);
    this.worldQInv.copy(this.worldQ).invert();

    const [cat, names, cons] = await Promise.all([loadStarCatalog(), loadStarNames(), loadConstellations()]);
    if (!this.mounted) return;
    this.cat = cat; this.names = names; this.cons = cons;
    for (const n of names.list) if (n.name) this.byName.set(n.name.toLowerCase(), n.i);
    for (const c of cons) this.conByAbbr.set(c.abbr, c);
    for (const l of LANDMARKS) if (l.star) this.lmByStar.set(l.star.toLowerCase(), l);
    for (let i = 0; i < cat.count; i++) if (cat.dist[i] > this.maxDistPc) this.maxDistPc = cat.dist[i];
    this.proximaIdx = this.byName.get('proxima centauri') ?? -1;

    this.labelsLayer = this.enableLabels().domElement;
    this.labelsLayer.classList.add('labels');
    this.buildScene();
    this.buildLabels();
    this.buildUI();
    this.setHome();

    // controls
    const canvas = this.ctx.renderer.domElement;
    this.flight = new FreeFlight(this.camera, canvas);
    this.flight.minSpeed = MIN_SPEED; this.flight.maxSpeed = MAX_SPEED;
    this.flight.setSpeed(START_SPEED);
    this.flight.enabled = false;
    this.lastPos.copy(this.camera.position);

    const down = (e: PointerEvent) => { this.press = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }; };
    const move = (e: PointerEvent) => {
      if (this.autopilot && e.pointerId === this.press.id && e.buttons && Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) > 6) this.cancelAutopilot(true);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== this.press.id) return;
      if (Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) < 7 && performance.now() - this.press.t < 600) this.pickAt(e.clientX, e.clientY);
    };
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up);
    const key = (e: KeyboardEvent) => {
      if (isTyping(e) || this.introOpen) return;
      if (e.key === 'Escape') { if (this.autopilot) this.cancelAutopilot(true); else if (this.card) this.closeCard(); return; }
      if (e.code === 'KeyH') { this.goHome(); return; }
      if (this.autopilot && /^(Key[WASDRFC]|Arrow(Up|Down|Left|Right)|Space)$/.test(e.code)) this.cancelAutopilot(true);
    };
    window.addEventListener('keydown', key);
    this.onDispose(() => {
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', key);
    });
    const onParam = (e: Event) => { const p = (e as CustomEvent<string | undefined>).detail; if (p) this.openParam(p); };
    this.ctx.ui.addEventListener('kosmos:param', onParam);
    this.onDispose(() => this.ctx.ui.removeEventListener('kosmos:param', onParam));

    this.updateMvp();
    this.updateLabels();
    this.updateHud();
    this.exposeDebug();

    const param = this.ctx.param;
    if (param && this.resolve(param)) {
      this.flight.enabled = true;
      this.openParam(param);
    } else {
      this.introOpen = true;
      const p = showIntro(this.root, { kicker: t('stars.kicker'), title: t('chapter.stars.title'), blurb: t('chapter.stars.blurb'), hint: t('stars.introHint') });
      const card = this.root.querySelector<HTMLElement>('.intro-card');
      if (card) {
        const row = el('div', 'intro-stats');
        row.append(
          stat(fmtNum(cat.count), t('stars.statStars'), t('stars.statStarsSub')),
          stat(this.proximaIdx >= 0 ? fmtDistancePc(cat.dist[this.proximaIdx]) : '–', t('stars.statNearest'), t('stars.statNearestSub'), 'cyan'),
          stat(fmtDistancePc(this.maxDistPc), t('stars.statFarthest'), t('stars.statFarthestSub')),
        );
        card.insertBefore(row, card.querySelector('.btn'));
      }
      void p.then(() => { this.introOpen = false; this.flight.syncFromCamera(); this.flight.enabled = true; });
    }
  }

  protected teardown(): void {
    this.autopilot?.cancel();
    this.flight?.dispose();
    delete window.__stars;
  }

  // ---------------------------------------------------------------------------------------------
  // Scene
  // ---------------------------------------------------------------------------------------------
  private buildScene(): void {
    const cat = this.cat;
    // 1. the catalogue – one Points, magnitude-correct sizes from the camera's position
    const stars = createStarPoints(cat.pos, cat.absMag, colorsFromBv(cat.ci), { size: 7, maxSize: 90, depthTest: false });
    this.starU = starUniforms(stars.material);
    this.world.add(stars);
    // 2. the Sun – an extra 1-point catalogue at the origin
    const sun = createStarPoints(new Float32Array([0, 0, 0]), new Float32Array([SUN_ABS]), colorsFromBv(new Float32Array([SUN_BV])), { size: 7, maxSize: 90, depthTest: false });
    this.sunU = starUniforms(sun.material);
    this.world.add(sun);
    // 3. constellation figures
    this.conLines = buildConstellationLines(cat, this.cons, cssColor('--cyan', '#7fd3ff'));
    this.world.add(this.conLines);
    // 4. scale rings 10 / 100 / 1000 ly
    this.rings = buildRings(RING_LY.map((ly) => ly / LY_PER_PC), cssColor('--text-2', '#aab3c5'));
    this.rings.visible = this.scaleOn;
    this.world.add(this.rings);
    // 5. landmark glows (nebulae, clusters, the galactic core)
    for (const lm of LANDMARKS) if (lm.size > 0) this.world.add(createLandmarkSprite(lm, cssColor(lm.color, '#ffffff')));
  }

  private buildLabels(): void {
    const cat = this.cat;
    const add = (html: string, cls: string, x: number, y: number, z: number): CSS2DObject => {
      const o = this.label(html, cls, this.world, new THREE.Vector3(x, y, z));
      o.visible = false;
      return o;
    };
    // the Sun
    this.sunLabel = add(`<span class="ia">${t('stars.sun')}</span>`, 'sun-label', 0, 0, 0);
    this.sunLabel.element.querySelector('span')!.addEventListener('click', (e) => { e.stopPropagation(); this.select({ kind: 'sun' }); });
    // selection marker
    this.marker = add('<i></i>', 'marker', 0, 0, 0);
    this.markerRing = this.marker.element.querySelector('i')!;
    // constellation names at the figure centroids
    for (const c of this.cons) {
      const [x, y, z] = constellationAnchor(cat, c);
      const name = pick({ de: c.de, en: c.en });
      this.conLabels.push({ obj: add(name, 'con-label', x, y, z), x, y, z, w: name.length * 8.5 + 8 });
    }
    // star names: the brightest proper-named stars (as seen from Earth) + the famous faint ones
    const pool: number[] = [];
    const inPool = new Set<number>();
    const push = (i: number) => { if (i < cat.count && !inPool.has(i)) { inPool.add(i); pool.push(i); } };
    for (const f of FAMOUS) { const i = this.byName.get(f.name.toLowerCase()); if (i !== undefined) push(i); }
    const named = this.names.list.filter((n) => n.name && n.i < cat.count).sort((a, b) => cat.mag[a.i] - cat.mag[b.i]);
    for (const n of named) { if (pool.length >= NAME_POOL) break; push(n.i); }
    pool.sort((a, b) => cat.mag[a] - cat.mag[b]);
    for (const i of pool) {
      const n = this.names.byIndex.get(i);
      const text = localStarName(n?.name ?? '', lang());
      const x = cat.pos[i * 3], y = cat.pos[i * 3 + 1], z = cat.pos[i * 3 + 2];
      const o = add(`<span class="ia">${text}</span>`, 'star-name', x, y, z);
      o.element.querySelector('span')!.addEventListener('click', (e) => { e.stopPropagation(); this.select({ kind: 'star', i }); });
      this.nameLabels.push({ obj: o, i, absMag: cat.absMag[i], x, y, z, w: text.length * 8 + 14 });
    }
    // landmarks (those standing for a catalogue star are covered by the star's own label + card)
    for (const lm of LANDMARKS) {
      if (lm.star) continue;
      const [x, y, z] = raDecToXYZ(lm.ra, lm.dec, lm.distPc);
      const name = pick(lm.name);
      const o = add(`<span class="ia" style="--c: var(${lm.color})">${name}</span>`, 'lm-label', x, y, z);
      o.element.querySelector('span')!.addEventListener('click', (e) => { e.stopPropagation(); this.goTo({ kind: 'lm', lm }); });
      this.lmLabels.push({ obj: o, lm, x, y, z, w: name.length * 7.6 + 26 });
    }
    // ring labels
    for (const ly of RING_LY) {
      const r = ly / LY_PER_PC;
      const text = t('stars.ringLabel', { n: fmtNum(ly) });
      this.ringLabels.push({ obj: add(text, 'ring-label', r, 0, 0), x: r, y: 0, z: 0, w: text.length * 6.5 });
    }
  }

  // ---------------------------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------------------------
  private buildUI(): void {
    // top-left: autopilot (search + famous stars + back to the Sun)
    this.ap = new AutopilotPanel({
      cat: this.cat, names: this.names, byName: this.byName,
      onStar: (i) => this.goTo({ kind: 'star', i }),
      onSun: () => this.goTo({ kind: 'sun' }),
      onHome: () => this.goHome(),
    });
    this.addUI(this.ap.el);

    // top-right: display toggles
    const tg = panel({ pos: 'tr', cls: 'toggles', title: t('stars.display') });
    const row = el('div', 'row');
    row.append(
      chip(t('stars.constellations'), this.consOn, (on) => { this.consOn = on; this.conLines.visible = on; this.updateLabels(); }),
      chip(t('stars.names'), this.namesOn, (on) => { this.namesOn = on; this.updateLabels(); }),
      chip(t('stars.scale'), this.scaleOn, (on) => { this.scaleOn = on; this.rings.visible = on; this.updateLabels(); }),
    );
    tg.append(row, el('div', 'src', t('stars.togglesSrc')));
    this.addUI(tg);

    // bottom-centre: HUD
    const h = el('div', 'panel hud pos-bc');
    h.innerHTML =
      `<span><span class="dim">${t('stars.hudDistL')}</span> <b data-s="dist"></b></span><span class="sep"></span>` +
      `<span><span class="dim">${t('stars.hudSpeedL')}</span> <b data-s="speed"></b> <span class="dim">${t('stars.lyPerSec')}</span></span><span class="sep"></span>` +
      `<span><span class="dim">${t('stars.hudProxL')}</span> <b data-s="prox"></b></span>` +
      `<span class="sep stars-sep"></span><span class="stars-seg"><b>${fmtNum(this.cat.count)}</b> <span class="dim">${t('stars.hudStarsL')}</span></span>` +
      `<span class="sep ap-sep" hidden></span><span class="ap-badge" data-s="ap" hidden><i></i><span data-s="apName"></span></span>`;
    this.addUI(h);
    for (const s of h.querySelectorAll<HTMLElement>('[data-s]')) this.slots[s.dataset.s!] = s;
    this.slots.apSep = h.querySelector<HTMLElement>('.ap-sep')!;

    // bottom-right: controls hint (desktop)
    const hint = this.addUI(el('div', 'hint', `${t('ui.flyHint')}<br>${t('stars.clickHint')}`));

    // touch: throttle pad + speed slider
    const thr = el('div', 'throttle');
    const mk = (label: string, dir: number, title: string) => {
      const b = el('button', 'thr ia', label);
      b.type = 'button'; b.title = title; b.setAttribute('aria-label', title);
      const on = (e: Event) => { e.preventDefault(); if (this.autopilot) this.cancelAutopilot(false); b.classList.add('on'); this.flight.setThrottle(dir); };
      const off = () => { b.classList.remove('on'); this.flight.setThrottle(0); };
      b.addEventListener('pointerdown', on);
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, off);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      return b;
    };
    thr.append(mk('▲', 1, t('stars.forward')), mk('▼', -1, t('stars.backward')));
    this.addUI(thr);
    const sp = panel({ cls: 'speed' });
    this.speedSlider = slider({
      min: 0, max: 1, step: 0.001, value: sliderFromSpeed(START_SPEED), label: t('stars.speed'),
      format: (v) => `${fmtSpeed(speedFromSlider(v) * LY_PER_PC)} ${t('stars.lyPerSec')}`,
      onInput: (v) => { this.sliderSpeed = speedFromSlider(v); this.flight.setSpeed(this.sliderSpeed); },
    }) as HTMLDivElement & { set: (v: number) => void };
    sp.appendChild(this.speedSlider);
    this.addUI(sp);

    this.chromeH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--chrome-h')) || 56;
    this.uiRects = [this.ap.el, tg, h, hint, thr, sp];
  }

  // ---------------------------------------------------------------------------------------------
  // Per frame
  // ---------------------------------------------------------------------------------------------
  protected tick(dt: number): void {
    if (this.introOpen && !this.ctx.app.reducedMotion) {
      // idle: slowly pan along the horizon while the intro is up
      this._q.setFromAxisAngle(Y_UP, dt * 0.012);
      this.camera.quaternion.premultiply(this._q);
    }
    this.flight.update(dt);
    this.camera.updateMatrixWorld();
    this.camCat.copy(this.camera.position).applyQuaternion(this.worldQInv);

    // measured speed (autopilot flights included), smoothed
    const step = this.camera.position.distanceTo(this.lastPos);
    this.lastPos.copy(this.camera.position);
    if (dt > 0) this.vel += (step / dt - this.vel) * Math.min(1, dt * 8);

    // outside the catalogue every star is sub-pixel: open the exposure so the whole cloud (the Milky Way's local disc) shows
    const dOut = this.camCat.length() - CAT_RADIUS;
    const expo = dOut > 40 ? -clamp(5 * Math.log10(dOut / 40), 0, 10.5) : 0;
    if (Math.abs(expo - this.expo) > 0.01) {
      this.expo = expo;
      this.starU.uMagOffset.value = expo; this.sunU.uMagOffset.value = expo;
      (this.conLines.material as THREE.LineBasicMaterial).opacity = 0.25 * (1 - smoothstep(0, 5, -expo));
    }

    this.hudClock += dt;
    if (this.hudClock >= HUD_TICK) { this.hudClock = 0; this.updateHud(); }
    this.labelClock += dt;
    if (this.labelClock >= LABEL_TICK) { this.labelClock = 0; this.updateLabels(); }
  }

  private updateMvp(): void {
    this.camera.updateMatrixWorld();
    this.mvp.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse).multiply(this.world.matrixWorld);
  }

  /** Project a catalogue point to CSS pixels (this.px/py). False when behind the camera or clearly off-screen. */
  private project(x: number, y: number, z: number, margin = 0.04): boolean {
    const m = this.mvp.elements;
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (w <= 1e-9) return false;
    const cx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
    const cy = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
    if (cx < -1 - margin || cx > 1 + margin || cy < -1 - margin || cy > 1 + margin) return false;
    this.px = ((cx + 1) / 2) * this.ctx.app.width;
    this.py = ((1 - cy) / 2) * this.ctx.app.height;
    return true;
  }

  /** Greedy screen-space declutter: reserve a rectangle unless it overlaps one already placed. */
  private place(x0: number, y0: number, x1: number, y1: number): boolean {
    const r = this.rects;
    for (let k = 0; k < this.placed; k++) {
      const o = k * 4;
      if (x0 < r[o + 2] && x1 > r[o] && y0 < r[o + 3] && y1 > r[o + 1]) return false;
    }
    if (this.placed * 4 + 4 <= r.length) { const o = this.placed * 4; r[o] = x0; r[o + 1] = y0; r[o + 2] = x1; r[o + 3] = y1; this.placed++; }
    return true;
  }

  /** Keep labels out from under the chrome bar, the panels and the HUD (glass shows them through, blurred). */
  private reserveUi(): void {
    this.reserve(0, 0, this.ctx.app.width, this.chromeH);
    for (const e of this.uiRects) {
      if (!e.isConnected || e.hidden || !e.offsetParent) continue;
      const r = e.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) this.reserve(r.left - 4, r.top - 4, r.right + 4, r.bottom + 4);
    }
    if (this.card) { const r = this.card.getBoundingClientRect(); this.reserve(r.left - 4, r.top - 4, r.right + 4, r.bottom + 4); }
  }

  /** Unconditionally block a rectangle (UI elements may overlap each other). */
  private reserve(x0: number, y0: number, x1: number, y1: number): void {
    const r = this.rects;
    if (this.placed * 4 + 4 > r.length) return;
    const o = this.placed * 4; r[o] = x0; r[o + 1] = y0; r[o + 2] = x1; r[o + 3] = y1; this.placed++;
  }

  private updateLabels(): void {
    this.updateMvp();
    this.placed = 0;
    this.reserveUi();
    let visible = 0;
    const c = this.camCat;
    const dSun = c.length();

    // constellation names only make sense near the Sun → fade with distance
    const a = this.consOn ? 1 - smoothstep(CON_NEAR, CON_FAR, dSun) : 0;
    if (Math.abs(a - this.conAlpha) > 0.01) { this.conAlpha = a; this.labelsLayer.style.setProperty('--con-a', a.toFixed(2)); }

    // selection marker: ring grows with the star's rendered size
    if (this.marker.visible && this.sel) {
      let px = 30;
      if (this.sel.kind !== 'lm') {
        const abs = this.sel.kind === 'sun' ? SUN_ABS : this.cat.absMag[this.sel.i];
        this.catPosOf(this.sel, this._v);
        px = clamp(7 * Math.pow(10, -0.2 * apparentMag(abs, this._v.distanceTo(c))) * 0.9, 30, 90);
      }
      const s = `${Math.round(px)}px`;
      if (this.markerRing.style.width !== s) { this.markerRing.style.width = s; this.markerRing.style.height = s; this.markerRing.style.left = `-${px / 2}px`; this.markerRing.style.top = `-${px / 2}px`; }
    }

    // the Sun
    let ok = dSun > 3e-4 && this.project(0, 0, 0) && this.place(this.px + 10, this.py - 9, this.px + 80, this.py + 9);
    this.sunLabel.visible = ok; if (ok) visible++;

    // landmarks (hidden while inside them)
    for (const l of this.lmLabels) {
      const d = Math.hypot(l.x - c.x, l.y - c.y, l.z - c.z);
      ok = d > l.lm.size * 0.7 && this.project(l.x, l.y, l.z) && this.place(this.px + 12, this.py - 9, this.px + 12 + l.w, this.py + 9);
      l.obj.visible = ok; if (ok) visible++;
    }

    // star names: bright from where you are, brightest first, at most MAX_NAME_LABELS
    let n = 0;
    const selI = this.sel?.kind === 'star' ? this.sel.i : -1;
    for (const l of this.nameLabels) {
      ok = this.namesOn && n < MAX_NAME_LABELS;
      if (ok) {
        const d = Math.hypot(l.x - c.x, l.y - c.y, l.z - c.z);
        const m = l.absMag + 5 * (Math.log10(Math.max(d, 1e-6)) - 1);
        ok = (m < NAME_MAG_LIMIT || l.i === selI) && d > 1e-4;
      }
      if (ok) ok = this.project(l.x, l.y, l.z) && this.place(this.px + 9, this.py - 8, this.px + 9 + l.w, this.py + 8);
      if (ok) { n++; visible++; }
      l.obj.visible = ok;
    }

    // constellation names (centred on the figure)
    for (const l of this.conLabels) {
      ok = a > 0.02 && this.project(l.x, l.y, l.z) && this.place(this.px - l.w / 2, this.py - 10, this.px + l.w / 2, this.py + 10);
      l.obj.visible = ok; if (ok) visible++;
    }

    // ring labels
    for (const l of this.ringLabels) {
      ok = this.scaleOn && this.project(l.x, l.y, l.z) && this.place(this.px - l.w / 2, this.py - 8, this.px + l.w / 2, this.py + 8);
      l.obj.visible = ok; if (ok) visible++;
    }
    this.visibleLabels = visible + (this.marker.visible ? 1 : 0);
  }

  private updateHud(): void {
    const dSun = this.camCat.length();
    this.setSlot('dist', fmtDistancePc(dSun));
    const moving = !!this.autopilot || this.vel > 0.25 * this.flight.speed;
    const ly = (moving ? this.vel : this.flight.speed) * LY_PER_PC;
    this.setSlot('speed', fmtSpeed(ly));
    const secs = (PROXIMA_PC * LY_PER_PC) / Math.max(ly, 1e-9);
    this.setSlot('prox', secs < 1 ? `${fmtNum(secs, { maxDigits: 2 })} s` : fmtLightTime(secs));
    if (this.liveDd && this.sel) {
      this.posOf(this.sel, this._v);
      const s = fmtDistancePc(this.camera.position.distanceTo(this._v));
      if (this.liveDd.textContent !== s) this.liveDd.textContent = s;
    }
    if (this.speedSlider && !this.autopilot && Math.abs(this.flight.speed - this.sliderSpeed) > 1e-9) {
      this.sliderSpeed = this.flight.speed;
      this.speedSlider.set(sliderFromSpeed(this.flight.speed));
    }
  }

  private setSlot(k: string, s: string): void { const e = this.slots[k]; if (e && e.textContent !== s) e.textContent = s; }

  // ---------------------------------------------------------------------------------------------
  // Positions & navigation
  // ---------------------------------------------------------------------------------------------
  private catPosOf(sel: Sel, out: THREE.Vector3): THREE.Vector3 {
    if (sel.kind === 'sun') return out.set(0, 0, 0);
    if (sel.kind === 'star') return out.set(this.cat.pos[sel.i * 3], this.cat.pos[sel.i * 3 + 1], this.cat.pos[sel.i * 3 + 2]);
    const [x, y, z] = raDecToXYZ(sel.lm.ra, sel.lm.dec, sel.lm.distPc);
    return out.set(x, y, z);
  }
  private posOf(sel: Sel, out: THREE.Vector3): THREE.Vector3 { return this.catPosOf(sel, out).applyQuaternion(this.worldQ); }

  /** Distance from the Sun of a selection (pc). */
  private distSunOf(sel: Sel): number {
    return sel.kind === 'sun' ? 0 : sel.kind === 'star' ? this.cat.dist[sel.i] : sel.lm.distPc;
  }
  /** Where the autopilot parks: 0.3 % of the distance in front of the object (min 0.01 pc, landmarks: outside their glow). */
  private stopDistOf(sel: Sel): number {
    const d = Math.max(0.003 * this.distSunOf(sel), 0.01);
    return sel.kind === 'lm' ? Math.max(d, sel.lm.size * 3.5) : d;
  }

  private nameOf(sel: Sel): string {
    if (sel.kind === 'sun') return t('stars.sun');
    if (sel.kind === 'lm') return pick(sel.lm.name);
    const n = this.names.byIndex.get(sel.i);
    return n?.name ? localStarName(n.name, lang()) : starDisplayName(n, this.cat.hip[sel.i]);
  }
  private famousKey(sel: Sel): string | null {
    if (sel.kind === 'sun') return 'Sun';
    if (sel.kind === 'lm') return sel.lm.star ?? null;
    return this.names.byIndex.get(sel.i)?.name ?? null;
  }

  private homePose(pos: THREE.Vector3, look: THREE.Vector3): void {
    const d = raDecToXYZ(HOME_LOOK[0], HOME_LOOK[1], 1);
    // just outside the solar system on the Orion side, facing away from the Sun (which is behind you)
    pos.set(d[0] * HOME_DIST, d[1] * HOME_DIST, d[2] * HOME_DIST).applyQuaternion(this.worldQ);
    look.set(d[0] * 10, d[1] * 10, d[2] * 10).applyQuaternion(this.worldQ);
  }
  private setHome(): void {
    this.homePose(this._v, this._v2);
    this.camera.position.copy(this._v);
    this.camera.lookAt(this._v2);
    this.camera.updateMatrixWorld();
  }

  /** «Zurück zur Sonne»: fly back to the Earth's viewpoint, facing Orion. */
  private goHome(): void {
    this.closeCard();
    this.cancelAutopilot(false);
    const pos = new THREE.Vector3(), look = new THREE.Vector3();
    this.homePose(pos, look);
    const len = this.camera.position.distanceTo(pos);
    if (len < 1e-5) { this.camera.lookAt(look); this.flight.syncFromCamera(); return; }
    this.startAutopilot({ position: pos, lookAt: look }, len, t('stars.backToSun'), () => { /* home: no card */ });
  }

  /** Autopilot to a star / the Sun / a landmark; opens the info card on arrival. */
  private goTo(sel: Sel): void {
    if (sel.kind === 'lm' && sel.lm.star) {
      const i = this.byName.get(sel.lm.star.toLowerCase());
      if (i !== undefined) sel = { kind: 'star', i };
    }
    this.closeCard();
    this.cancelAutopilot(false);
    this.sel = sel;
    this.showMarker(sel);
    this.ap.setActive(this.famousKey(sel));
    const target = this.posOf(sel, new THREE.Vector3());
    const dir = new THREE.Vector3().subVectors(target, this.camera.position);
    const len = dir.length();
    const stop = this.stopDistOf(sel);
    if (len <= stop * 1.6) { this.openCard(sel); return; }
    dir.divideScalar(len);
    const pos = target.clone().addScaledVector(dir, -stop);
    this.startAutopilot({ position: pos, lookAt: target }, len, this.nameOf(sel), () => { if (this.sel === sel) this.openCard(sel); });
  }

  private startAutopilot(target: { position: THREE.Vector3; lookAt: THREE.Vector3 }, lenPc: number, name: string, onArrive: () => void): void {
    this.flight.enabled = false;
    this.flight.setThrottle(0);
    this.slots.apName.textContent = t('stars.apTo', { name });
    this.slots.ap.hidden = false; this.slots.apSep.hidden = false;
    const ms = this.ctx.app.reducedMotion ? 450 : clamp(3000 + lenPc * 6, 3200, 5000);
    const h = flyCamera(this.camera, target, ms, easeInOutSine);
    this.autopilot = h;
    void h.done.then(() => {
      if (this.autopilot !== h) return; // cancelled
      this.autopilot = undefined;
      this.endAutopilot();
      onArrive();
    });
  }

  private endAutopilot(): void {
    this.slots.ap.hidden = true; this.slots.apSep.hidden = true;
    this.flight.syncFromCamera();
    this.flight.enabled = !this.introOpen;
  }

  private cancelAutopilot(notify: boolean): void {
    const h = this.autopilot;
    if (!h) return;
    this.autopilot = undefined;
    h.cancel();
    this.endAutopilot();
    if (notify) toast(this.root, t('stars.apCancelled'), 2200);
  }

  // ---------------------------------------------------------------------------------------------
  // Picking, selection, info cards
  // ---------------------------------------------------------------------------------------------
  private pickAt(sx: number, sy: number): void {
    if (this.introOpen) return;
    this.updateMvp();
    const c = this.camCat;
    const W = this.ctx.app.width, H = this.ctx.app.height;
    const radius = this.touch ? 22 : 12;
    const i = pickStar({ pos: this.cat.pos, absMag: this.cat.absMag, count: this.cat.count, mvp: this.mvp.elements, cx: c.x, cy: c.y, cz: c.z, px: sx, py: sy, width: W, height: H, radiusPx: radius });
    let best: Sel | undefined = i >= 0 ? { kind: 'star', i } : undefined;
    let bestScore = Infinity;
    if (i >= 0) {
      this.project(this.cat.pos[i * 3], this.cat.pos[i * 3 + 1], this.cat.pos[i * 3 + 2], 1);
      const d = Math.hypot(this.cat.pos[i * 3] - c.x, this.cat.pos[i * 3 + 1] - c.y, this.cat.pos[i * 3 + 2] - c.z);
      bestScore = apparentMag(this.cat.absMag[i], d) + Math.hypot(this.px - sx, this.py - sy) * 0.33;
    }
    // the Sun competes on the same scale
    if (this.project(0, 0, 0, 1)) {
      const dpx = Math.hypot(this.px - sx, this.py - sy);
      if (dpx <= radius && apparentMag(SUN_ABS, c.length()) + dpx * 0.33 < bestScore) best = { kind: 'sun' };
    }
    if (best) this.select(best);
    else if (this.card) this.closeCard();
  }

  /** Select without flying (click / label): marker + card with a «Hinfliegen» button. */
  private select(sel: Sel): void {
    this.closeCard();
    this.sel = sel;
    this.showMarker(sel);
    this.ap.setActive(this.famousKey(sel));
    this.openCard(sel);
  }

  private showMarker(sel: Sel): void {
    this.catPosOf(sel, this.marker.position);
    this.marker.visible = true;
  }

  private closeCard(): void {
    this.card?.remove();
    this.card = undefined; this.liveDd = undefined;
    this.sel = undefined;
    this.marker.visible = false;
    this.ap.setActive(null);
  }

  private openCard(sel: Sel): void {
    this.card?.remove();
    const rows: Array<[string, string]> = [];
    let title: string, sub: string, html = '';
    const live = '<span data-live>–</span>';
    if (sel.kind === 'sun') {
      title = t('stars.sun'); sub = t('stars.sunSub');
      rows.push(
        [t('stars.spectral'), `${swatch(SUN_BV)}G2V`],
        [t('stars.distYou'), live],
        [t('stars.appMag'), `${fmtNum(SUN_APP_MAG, { digits: 2 })} mag`],
        [t('stars.absMag'), `${fmtNum(SUN_ABS, { digits: 2 })} mag`],
        [t('ui.luminosity'), `1 ${t('stars.suns')}`],
      );
      html = `<p class="light">${t('stars.lightLeftSun', { t: fmtLightTime(SUN_LIGHT_S) })}</p><div class="src">${t('stars.cardSrc')}</div>`;
    } else if (sel.kind === 'lm') {
      const lm = sel.lm;
      title = pick(lm.name); sub = `${t(`stars.kind${cap(lm.kind)}`)} · ${t('stars.landmark')}`;
      rows.push(
        [t('stars.distSun'), fmtDistancePc(lm.distPc) + (lm.distPc > this.maxDistPc ? ` · ${t('stars.outsideCatalog')}` : '')],
        [t('stars.distYou'), live],
        [t('stars.position'), `${fmtNum(lm.ra / 15, { digits: 1 })} h / ${fmtNum(lm.dec, { digits: 1 })}°`],
      );
      html = `<p class="light">${t('stars.lightLeft', { years: fmtYears(lm.distPc * LY_PER_PC) })}</p><p class="blurb">${pick(lm.blurb)}</p><div class="src">${t('stars.landmarkSrc')}</div>`;
    } else {
      const i = sel.i, cat = this.cat;
      const n = this.names.byIndex.get(i);
      const hip = cat.hip[i];
      const proper = n?.name;
      title = proper ? localStarName(proper, lang()) : starDisplayName(n, hip);
      const des = proper ? starDisplayName({ ...n!, name: undefined }, hip) : '';
      const con = n?.con ? this.conByAbbr.get(n.con) : undefined;
      sub = [des && des !== title ? des : '', hip && !des.startsWith('HIP') && !title.startsWith('HIP') ? `HIP ${hip}` : '', con ? pick({ de: con.de, en: con.en }) : ''].filter(Boolean).join(' · ') || t('stars.unnamed');
      const bv = Number.isFinite(cat.ci[i]) ? cat.ci[i] : 0.6;
      const spect = (n?.spect ?? '').replace(/\.{2,}$/, '').trim() || spectralClassFromBv(bv);
      const ly = cat.dist[i] * LY_PER_PC;
      rows.push(
        [t('ui.constellation'), con ? `${pick({ de: con.de, en: con.en })} (${con.lat})` : '–'],
        [t('stars.spectral'), `${swatch(bv)}${spect}`],
        [t('stars.distSun'), fmtDistancePc(cat.dist[i])],
        [t('stars.distYou'), live],
        [t('stars.appMag'), `${fmtNum(cat.mag[i], { digits: 2 })} mag`],
        [t('stars.absMag'), `${fmtNum(cat.absMag[i], { digits: 2 })} mag`],
        [t('ui.luminosity'), `${fmtLum(lumFromAbsMag(cat.absMag[i]))} ${t('stars.suns')}`],
      );
      const lm = proper ? this.lmByStar.get(proper.toLowerCase()) : undefined;
      html = `<p class="light">${t('stars.lightLeft', { years: fmtYears(ly) })}</p>${lm ? `<p class="blurb">${pick(lm.blurb)}</p>` : ''}<div class="src">${lm ? t('stars.landmarkSrc') + ' · ' : ''}${t('stars.cardSrc')}</div>`;
    }
    const target = this.posOf(sel, this._v);
    const here = this.camera.position.distanceTo(target) <= this.stopDistOf(sel) * 1.6;
    const actions = here ? [el('div', 'arrived', t('stars.arrived'))] : [button(t('stars.flyThere'), () => this.goTo(sel), 'primary sm')];
    this.card = infoCard(this.root, { title, sub, rows, html, pos: 'tr', actions, onClose: () => { this.card = undefined; this.closeCard(); } });
    const liveEl = this.card.querySelector<HTMLElement>('[data-live]');
    if (liveEl) { this.liveDd = liveEl; liveEl.parentElement?.classList.add('live'); }
    this.updateHud();
  }

  // ---------------------------------------------------------------------------------------------
  // Deep links & debug
  // ---------------------------------------------------------------------------------------------
  /** Resolve a route param / name: alias, proper name (DE/EN), HIP number, landmark id, fuzzy search. */
  private resolve(q: string): Sel | undefined {
    const s = q.trim().toLowerCase();
    if (!s) return undefined;
    const alias = ALIASES[s];
    if (alias === 'Sun') return { kind: 'sun' };
    let i = this.byName.get((alias ?? s).toLowerCase());
    if (i === undefined) for (const f of FAMOUS) {
      if (f.label && (f.label.de.toLowerCase() === s || f.label.en.toLowerCase() === s)) { if (f.sun) return { kind: 'sun' }; i = this.byName.get(f.name.toLowerCase()); break; }
    }
    if (i === undefined) {
      const m = s.match(/^(?:hip\s*)?(\d+)$/);
      if (m) { const h = Number(m[1]); for (let k = 0; k < this.cat.count; k++) if (this.cat.hip[k] === h) { i = k; break; } }
    }
    if (i === undefined) {
      const lm = LANDMARKS.find((l) => l.id === s || l.name.de.toLowerCase() === s || l.name.en.toLowerCase() === s);
      if (lm) return { kind: 'lm', lm };
      const r = searchStars(this.names, q, 1)[0];
      if (r) i = r.i;
    }
    return i !== undefined && i < this.cat.count ? { kind: 'star', i } : undefined;
  }

  private openParam(p: string): void {
    const sel = this.resolve(p);
    if (sel) this.goTo(sel);
  }

  private exposeDebug(): void {
    window.__stars = {
      count: this.cat.count,
      distLy: (name) => { const s = this.resolve(name); return s ? this.distSunOf(s) * LY_PER_PC : null; },
      camera: () => ({ distSunLy: this.camCat.length() * LY_PER_PC, speedLyS: this.flight.speed * LY_PER_PC, pos: this.camera.position.toArray() }),
      select: (name) => { const s = this.resolve(name); if (s) this.select(s); return !!s; },
      goto: (name) => { const s = this.resolve(name); if (s) this.goTo(s); return !!s; },
      home: () => this.goHome(),
      labels: () => this.visibleLabels,
      selection: () => (this.sel ? this.nameOf(this.sel) : null),
      autopilot: () => !!this.autopilot,
      setSpeedLy: (v) => this.flight.setSpeed(v / LY_PER_PC),
      pick: (x, y) => { this.pickAt(x, y); return this.sel ? this.nameOf(this.sel) : null; },
      place: (x, y, z) => {
        this.cancelAutopilot(false);
        this.camera.position.set(x, y, z).applyQuaternion(this.worldQ);
        this.camera.lookAt(0, 0, 0);
        this.flight.syncFromCamera();
        this.updateLabels();
      },
    };
  }
}

// -------------------------------------------------------------------------------------------------
function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

function swatch(bv: number): string {
  const [r, g, b] = bvToRgb(bv);
  const css = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
  return `<span class="swatch" style="color:${css};background:${css}"></span>`;
}

/** Luminosity in Suns with sensible precision: 126’000 · 25,4 · 0,0017. */
function fmtLum(L: number): string {
  if (L >= 100) return fmtNum(L, { digits: 0 });
  if (L >= 10) return fmtNum(L, { maxDigits: 1 });
  if (L >= 0.1) return fmtNum(L, { maxDigits: 2 });
  return fmtNum(L, { maxDigits: L >= 0.01 ? 3 : 4 });
}

/** Speed in ly/s for the HUD. */
function fmtSpeed(ly: number): string {
  if (ly < 0.1) return fmtNum(ly, { maxDigits: 3 });
  if (ly < 10) return fmtNum(ly, { maxDigits: 2 });
  if (ly < 100) return fmtNum(ly, { maxDigits: 1 });
  return fmtNum(ly, { digits: 0 });
}

/** Touch speed slider: log scale 0..1 ↔ MIN_SPEED..MAX_SPEED (pc/s). */
function speedFromSlider(v: number): number { return MIN_SPEED * Math.pow(MAX_SPEED / MIN_SPEED, clamp(v, 0, 1)); }
function sliderFromSpeed(s: number): number { return clamp(Math.log(s / MIN_SPEED) / Math.log(MAX_SPEED / MIN_SPEED), 0, 1); }
