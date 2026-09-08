import * as THREE from 'three';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import './strings';
import './style.css';
import { BaseChapter } from '../../core/BaseChapter';
import { t, pick, lang } from '../../core/i18n';
import { el, button, panel, slider, chip, stat, kv, hud, showIntro, infoCard, toast, ICON_PLAY, ICON_PAUSE, ICON_CLOSE } from '../../core/ui';
import { OrbitRig } from '../../core/CameraRig';
import { FreeFlight, isTyping } from '../../core/FreeFlight';
import { tween, easeInOutSine, type TweenHandle } from '../../core/tween';
import { fmtNum, fmtDistanceLy, fmtYears, LY_PER_PC, H0, clamp, lerp } from '../../core/units';
import { loadJSON } from '../../core/Loader';
import { loadGalaxyCatalog, loadGalaxyNames, type GalaxyCatalog, type GalaxyName } from '../../data/galaxies';
import { createGalaxyPoints, galaxyUniforms, type GalaxyPointUniforms } from './GalaxyPoints';
import { createMilkyWay, type MilkyWayUniforms } from './MilkyWay';
import { createRings, createGalacticPlane, galacticBasis, landmarkPos, hexToRgb, mixRgb, cssVar, type Landmark, type RingUniforms, type RingSpec } from './Landmarks';
import { TOUR, STOP_DWELL_S, lightSentence, epochKey } from './Tour';

/**
 * Chapter «Das kosmische Netz»: 43 000 galaxies of the 2MASS Redshift Survey.
 *
 * Frame: the catalogue is equatorial J2000 in megaparsecs (z = north). Everything from the catalogue lives in the
 * `world` group, rotated −90° about X so that north is +Y (three.js up); the camera keeps up = (0,1,0).
 * Scene unit = 1 Mpc. The Milky Way (procedural) sits at the galactic centre, 0.0082 Mpc from the origin (the Sun).
 */
const MPC_TO_LY = 1e6 * LY_PER_PC;
const START_RADIUS = 350;
const MIN_R = 0.05, MAX_R = 800;
const LIMIT_MIN = 20, LIMIT_MAX = 430;
const AUTO_ROT = 0.022;               // rad/s
const MAX_NAME_LABELS = 40;
const LABEL_TICK = 0.25;              // s

interface LabelEntry {
  obj: CSS2DObject; el: HTMLElement;
  pos: THREE.Vector3;                 // world space (north-up)
  kind: 'mw' | 'lm' | 'name';
  lm?: Landmark; gi?: number;
  ring: number;                       // ring radius in Mpc (0 = point label)
  maxCam: number;                     // visible while the camera is closer than this (Mpc)
  w: number;                          // estimated width in px
}

interface DebugInfo { count: number; andromeda: { index: number; distMpc: number; name: string }; virgo: { galaxiesWithin3Mpc: number; meanDistMpc: number }; limitMpc: number; cameraMpc: number; visible: number }
declare global { interface Window { __galaxies?: DebugInfo } }

export default class GalaxiesChapter extends BaseChapter {
  readonly id = 'galaxies';

  private world = new THREE.Group();
  private cat!: GalaxyCatalog;
  private names = new Map<number, GalaxyName>();
  private landmarks: Landmark[] = [];
  private lmById = new Map<string, Landmark>();
  private gU!: GalaxyPointUniforms;
  private markerU!: GalaxyPointUniforms;
  private mwU!: MilkyWayUniforms;
  private ringU!: RingUniforms;
  private rings!: THREE.LineSegments;
  private planeU!: { uAlpha: { value: number } };
  private plane!: THREE.Mesh;

  private rig!: OrbitRig;
  private flight?: FreeFlight;
  private flyOn = false;
  private autoRotate = true;
  private limit = LIMIT_MAX;
  private visibleCount = 0;
  private marksOn = true;
  private czOn = false;
  private planeOn = false;
  private near = 0.01; private far = 1e7;
  private touch = matchMedia('(pointer: coarse)').matches;

  // labels & selection
  private labels: LabelEntry[] = [];
  private rects = new Float32Array(4 * 160);
  private labelClock = 0;
  private hudClock = 0;
  private selMarker?: CSS2DObject;
  private selIndex = -1;
  private card?: HTMLDivElement;

  // tour
  private tourIdx = -1;
  private tourPlaying = false;
  private tourFlight?: TweenHandle;
  private dwell = 0;
  private tourPanel!: HTMLDivElement;
  private tourBody!: HTMLElement;

  // UI slots
  private slots: Record<string, HTMLElement> = {};
  private note!: HTMLElement;
  private legend!: HTMLElement;
  private flyBtn!: HTMLButtonElement;
  private chips: Record<string, HTMLButtonElement> = {};
  private mix?: TweenHandle;
  private planeTween?: TweenHandle;

  // scratch (no per-frame allocations)
  private _v = new THREE.Vector3();
  private _v2 = new THREE.Vector3();
  private _up = new THREE.Vector3();
  private _m = new THREE.Matrix4();
  private press = { x: 0, y: 0, t: 0, id: -1 };

  // ---------------------------------------------------------------------------------------------
  protected async setup(): Promise<void> {
    this.root.classList.add('ch-galaxies');
    this.camera.up.set(0, 1, 0);
    this.camera.near = 0.5; this.camera.far = 6000; this.camera.updateProjectionMatrix();
    this.world.rotation.x = -Math.PI / 2;
    this.scene.add(this.world);
    this.world.updateMatrixWorld(true);

    const [cat, names, landmarks] = await Promise.all([
      loadGalaxyCatalog(), loadGalaxyNames(), loadJSON<Landmark[]>('galaxy-landmarks.json', lang() === 'de' ? 'Landmarken' : 'landmarks'),
    ]);
    if (!this.mounted) return;
    this.cat = cat;
    for (const n of names) this.names.set(n.i, n);
    this.landmarks = landmarks;
    for (const l of landmarks) this.lmById.set(l.id, l);

    this.buildScene();
    this.buildUI();
    this.buildLabels();
    this.setLimit(LIMIT_MAX, true);

    // camera rig around the origin, starting far out with the whole survey in view
    const canvas = this.ctx.renderer.domElement;
    this.rig = new OrbitRig(this.camera, canvas);
    this.rig.minRadius = MIN_R; this.rig.maxRadius = MAX_R;
    this.rig.radius = START_RADIUS; this.rig.theta = 0.7; this.rig.phi = 1.15;
    this.rig.update();
    this.autoRotate = !this.ctx.app.reducedMotion;

    // picking (click / tap without drag)
    const down = (e: PointerEvent) => { this.press = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }; this.userTouched(); };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== this.press.id) return;
      const moved = Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y);
      if (moved < 7 && performance.now() - this.press.t < 600) this.pickAt(e.clientX, e.clientY);
    };
    const wheel = () => this.userTouched();
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('wheel', wheel, { passive: true });
    const key = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      if (e.key === 'Escape') { if (this.card) this.closeCard(); else if (this.tourIdx >= 0) this.endTour(); }
      if (this.tourIdx >= 0 && e.key === 'ArrowRight') this.tourStep(1);
      if (this.tourIdx >= 0 && e.key === 'ArrowLeft') this.tourStep(-1);
    };
    window.addEventListener('keydown', key);
    this.onDispose(() => {
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', key);
    });
    const onParam = (e: Event) => this.openParam((e as CustomEvent<string | undefined>).detail);
    this.ctx.ui.addEventListener('kosmos:param', onParam);
    this.onDispose(() => this.ctx.ui.removeEventListener('kosmos:param', onParam));

    this.updateLabels();
    this.updateHud();
    this.exposeDebug();

    if (this.ctx.param) this.openParam(this.ctx.param);
    else void showIntro(this.root, { kicker: t('galaxies.kicker'), title: t('chapter.galaxies.title'), blurb: t('chapter.galaxies.blurb'), hint: t('galaxies.introHint') });
  }

  // ---------------------------------------------------------------------------------------------
  // Scene
  // ---------------------------------------------------------------------------------------------
  private buildScene(): void {
    const gold = hexToRgb(cssVar('--gold') || '#f2c46d'), gold2 = hexToRgb(cssVar('--gold-2') || '#ffdd9a');
    const rose = hexToRgb(cssVar('--rose') || '#ff8aa6'), cyan = hexToRgb(cssVar('--cyan') || '#7fd3ff');
    const cyan2 = hexToRgb(cssVar('--cyan-2') || '#b8e8ff'), violet = hexToRgb(cssVar('--violet') || '#b89cff');
    const text = hexToRgb(cssVar('--text') || '#e9edf5'), text2 = hexToRgb(cssVar('--text-2') || '#aab3c5');
    const v3 = (c: [number, number, number]) => new THREE.Vector3(c[0], c[1], c[2]);
    const pal = {
      unknown: v3(mixRgb(text, text2, 0.5)), elliptical: v3(mixRgb(gold, rose, 0.4)), spiral: v3(mixRgb(cyan, violet, 0.22)), irregular: v3(violet),
      near: v3(mixRgb(cyan, violet, 0.35)), mid: v3(text), far: v3(rose),
    };

    // 1. the survey
    const pts = createGalaxyPoints(this.cat, pal);
    this.gU = galaxyUniforms(pts.material);
    this.world.add(pts);

    // 2. the Milky Way: procedural disc at the galactic centre + a catalogue-style marker for the far view
    const mw = createMilkyWay({ points: 30000, radius: 0.015, warm: gold2, blue: cyan2, white: text, rose });
    const gb = galacticBasis();
    mw.group.position.copy(gb.centre);
    mw.group.quaternion.copy(gb.quaternion);
    this.mwU = mw.uniforms;
    this.world.add(mw.group);
    const markerCat: GalaxyCatalog = { count: 1, pos: new Float32Array([0, 0, 0]), kmag: new Float32Array([2.5]), cz: new Float32Array([0]), type: new Uint8Array([3]), dist: new Float32Array([0]) };
    const marker = createGalaxyPoints(markerCat, pal);
    this.markerU = galaxyUniforms(marker.material);
    this.markerU.uSizeMax.value = 8;
    this.world.add(marker);
    // the Sun: a tiny gold sprite at the origin (only visible close up – sprites shrink with distance)
    const sunMat = new THREE.SpriteMaterial({ map: this.markerU.uTex.value, color: new THREE.Color(gold[0], gold[1], gold[2]), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    const sun = new THREE.Sprite(sunMat);
    sun.scale.setScalar(0.0012);
    this.world.add(sun);

    // 3. landmark rings (one draw call, camera-facing)
    const specs: RingSpec[] = [];
    for (const l of this.landmarks) {
      if (l.kind === 'cluster') specs.push({ center: landmarkPos(l), radius: l.radius, color: cyan, alpha: 0.55 });
      else if (l.kind === 'supercluster') specs.push({ center: landmarkPos(l), radius: l.radius, color: violet, alpha: 0.3 });
      else if (l.kind === 'void') specs.push({ center: landmarkPos(l), radius: l.radius, color: text2, alpha: 0.28, dashed: true });
    }
    const rings = createRings(specs);
    this.rings = rings.lines; this.ringU = rings.uniforms;
    this.world.add(this.rings);

    // 4. galactic plane (zone of avoidance) – hidden until toggled
    const plane = createGalacticPlane(LIMIT_MAX * 1.08, mixRgb(violet, rose, 0.35));
    this.plane = plane.mesh; this.planeU = plane.uniforms;
    this.plane.visible = false;
    this.world.add(this.plane);
  }

  // ---------------------------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------------------------
  private buildUI(): void {
    const de = lang() === 'de';
    // left column: stats + tour
    const col = el('div', 'col-left');
    const stats = panel({ cls: 'stats' });
    stats.append(
      stat(fmtNum(this.cat.count), t('galaxies.statGalaxies'), t('galaxies.statGalaxiesSub')),
      stat(`≈ ${fmtDistanceLy(LIMIT_MAX * MPC_TO_LY)}`, t('galaxies.statReach'), t('galaxies.statReachSub'), 'cyan'),
      stat(t('galaxies.statMw'), t('galaxies.statMwL'), t('galaxies.statMwSub')),
      el('div', 'src', t('galaxies.src')),
    );
    this.tourPanel = panel({ cls: 'tour' });
    this.tourBody = el('div', 'tour-body');
    this.tourPanel.appendChild(this.tourBody);
    this.renderTourIdle();
    col.append(stats, this.tourPanel);
    this.addUI(col);

    // right: map controls
    const ctl = panel({ cls: 'ctl', title: t('galaxies.ctlTitle') });
    const lim = slider({
      min: 0, max: 1, step: 0.001, value: 1, label: t('galaxies.limit'),
      format: (v) => fmtDistanceLy(this.limitFromSlider(v) * MPC_TO_LY),
      onInput: (v) => this.setLimit(this.limitFromSlider(v)),
    });
    const chipsRow = el('div', 'chips');
    this.chips.cz = chip(t('galaxies.chipCz'), false, (on) => this.setCz(on));
    this.chips.plane = chip(t('galaxies.chipPlane'), false, (on) => this.setPlane(on));
    this.chips.marks = chip(t('galaxies.chipMarks'), true, (on) => this.setMarks(on));
    this.chips.fly = chip(t('galaxies.chipFly'), false, (on) => this.setFly(on));
    chipsRow.append(this.chips.cz, this.chips.plane, this.chips.marks, this.chips.fly);
    this.legend = el('div', 'legend', t('galaxies.legendType'));
    this.note = el('div', 'note');
    this.note.hidden = true;
    const readout = el('div', 'readout');
    readout.innerHTML = `<span>${t('galaxies.hudDist')}</span> <b data-s="dist2"></b><span class="sep"></span><b data-s="n2"></b> <span>${t('galaxies.hudVisible')}</span>`;
    ctl.append(lim, chipsRow, this.legend, this.note, readout, el('div', 'src', t('galaxies.src')));
    this.addUI(ctl);

    // bottom-left HUD
    const h = hud([
      `${t('galaxies.hudDist')} <b data-s="dist"></b>`,
      `<b data-s="n"></b> ${t('galaxies.hudVisible')}`,
      `<span data-s="speedWrap" hidden>${t('galaxies.hudSpeed')} <b data-s="speed"></b><span class="sep"></span></span><span data-s="hint">${t('ui.dragHint')} · ${de ? 'Antippen für Details' : 'Tap for details'}</span>`,
    ]);
    h.classList.remove('pos-bc'); h.classList.add('pos-bl', 'gl-hud');
    this.addUI(h);
    for (const s of this.root.querySelectorAll<HTMLElement>('[data-s]')) this.slots[s.dataset.s!] = s;

    // touch throttle for free flight (hold to move forward)
    this.flyBtn = el('button', 'btn ia fly-btn', `▲ ${t('galaxies.flyForward')}`);
    this.flyBtn.type = 'button'; this.flyBtn.hidden = true;
    const thr = (v: number) => (e: Event) => { e.preventDefault(); this.flight?.setThrottle(v); };
    this.flyBtn.addEventListener('pointerdown', thr(1)); this.flyBtn.addEventListener('pointerup', thr(0));
    this.flyBtn.addEventListener('pointercancel', thr(0)); this.flyBtn.addEventListener('pointerleave', thr(0));
    this.addUI(this.flyBtn);
  }

  private limitFromSlider(v: number): number { return LIMIT_MIN * Math.pow(LIMIT_MAX / LIMIT_MIN, clamp(v, 0, 1)); }

  private setLimit(mpc: number, silent = false): void {
    this.limit = mpc;
    this.gU.uMaxDist.value = mpc;
    // catalogue is sorted by distance → binary search for the count within reach
    const d = this.cat.dist; let lo = 0, hi = d.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (d[mid] <= mpc) lo = mid + 1; else hi = mid; }
    this.visibleCount = lo;
    this.plane.scale.setScalar(mpc / LIMIT_MAX);
    if (!silent) { this.userTouched(); this.updateHud(); }
  }

  private setCz(on: boolean): void {
    this.czOn = on;
    this.mix?.cancel();
    const from = this.gU.uCzMix.value, to = on ? 1 : 0;
    this.mix = tween(this.ctx.app.reducedMotion ? 0 : 900, (k) => { this.gU.uCzMix.value = lerp(from, to, k); this.markerU.uCzMix.value = this.gU.uCzMix.value; }, easeInOutSine);
    this.legend.innerHTML = t(on ? 'galaxies.legendCz' : 'galaxies.legendType');
    this.showNote(on ? 'cz' : null);
  }

  private setPlane(on: boolean): void {
    this.planeOn = on;
    this.planeTween?.cancel();
    const from = this.planeU.uAlpha.value, to = on ? 0.16 : 0;
    this.plane.visible = true;
    this.planeTween = tween(this.ctx.app.reducedMotion ? 0 : 700, (k) => { this.planeU.uAlpha.value = lerp(from, to, k); }, easeInOutSine);
    void this.planeTween.done.then(() => { if (!on && !this.planeOn) this.plane.visible = false; });
    this.showNote(on ? 'plane' : null);
  }

  private setMarks(on: boolean): void {
    this.marksOn = on;
    this.rings.visible = on;
    this.updateLabels();
  }

  private setFly(on: boolean): void {
    if (on === this.flyOn) return;
    this.flyOn = on;
    const canvas = this.ctx.renderer.domElement;
    if (on) {
      this.endTour();
      this.flight ??= new FreeFlight(this.camera, canvas);
      this.flight.minSpeed = 0.0005; this.flight.maxSpeed = 400;
      this.flight.enabled = true; this.rig.enabled = false;
      this.flight.syncFromCamera();
      this.flight.setSpeed(clamp(this.rig.radius * 0.3, 0.01, 200));
      this.flyBtn.hidden = !this.touch;
      this.slots.speedWrap.hidden = false;
      this.slots.hint.innerHTML = t('ui.flyHint');
      this.showNote('fly');
    } else {
      if (this.flight) { this.flight.enabled = false; this.flight.setThrottle(0); }
      this.rig.enabled = true;
      this.syncRigFromCamera();
      this.flyBtn.hidden = true;
      this.slots.speedWrap.hidden = true;
      this.slots.hint.innerHTML = `${t('ui.dragHint')} · ${lang() === 'de' ? 'Antippen für Details' : 'Tap for details'}`;
      this.showNote(null);
    }
    this.autoRotate = false;
  }

  /** Continue orbiting from wherever free flight left the camera. */
  private syncRigFromCamera(): void {
    const r = clamp(this.rig.radius, MIN_R, MAX_R);
    this.camera.getWorldDirection(this._v);
    this.rig.target.copy(this.camera.position).addScaledVector(this._v, r);
    this._v2.copy(this.camera.position).sub(this.rig.target);
    this.rig.radius = r;
    this.rig.phi = clamp(Math.acos(clamp(this._v2.y / r, -1, 1)), this.rig.minPhi, this.rig.maxPhi);
    this.rig.theta = Math.atan2(this._v2.x, this._v2.z);
  }

  private showNote(which: 'cz' | 'plane' | 'fly' | null): void {
    if (!which) {
      which = this.flyOn ? 'fly' : this.planeOn ? 'plane' : this.czOn ? 'cz' : null;
    }
    this.note.hidden = !which;
    if (which) this.note.innerHTML = t(`galaxies.${which}Note`);
  }

  private userTouched(): void {
    this.autoRotate = false;
    if (this.tourIdx >= 0 && this.tourPlaying && !this.tourFlight) this.setTourPlaying(false);
  }

  // ---------------------------------------------------------------------------------------------
  // Labels
  // ---------------------------------------------------------------------------------------------
  private buildLabels(): void {
    const layer = this.enableLabels().domElement;
    layer.classList.add('labels');
    const add = (html: string, cls: string, posCat: THREE.Vector3, e: Omit<LabelEntry, 'obj' | 'el' | 'pos' | 'w'>, text: string, onClick?: () => void) => {
      const pos = this.toWorld(posCat.clone());
      const obj = this.label(`<span>${html}</span>`, `gl-label ${cls} ${onClick ? 'ia' : ''}`.trim(), this.scene, pos);
      obj.visible = false;
      const entry: LabelEntry = { obj, el: obj.element, pos, w: text.length * (cls.includes('big') ? 11 : 7.6) + 16, ...e };
      if (onClick) obj.element.addEventListener('click', (ev) => { ev.stopPropagation(); onClick(); });
      this.labels.push(entry);
    };
    // the Milky Way («you are here»)
    const mwLm = this.lmById.get('milkyway');
    add(t('galaxies.mwLabel'), 'right mw gold', new THREE.Vector3(0, 0, 0), { kind: 'mw', lm: mwLm, ring: 0, maxCam: Infinity }, t('galaxies.mwLabel'), () => this.openLandmark(mwLm));
    // landmarks
    for (const l of this.landmarks) {
      if (l.id === 'milkyway') continue;
      const name = pick({ de: l.name, en: l.en });
      const p = landmarkPos(l);
      const ring = l.kind === 'cluster' || l.kind === 'supercluster' || l.kind === 'void' ? l.radius : 0;
      const cls = l.kind === 'supercluster' ? 'above big sc' : l.kind === 'cluster' ? 'above cluster' : l.kind === 'void' ? 'above void' : l.kind === 'wall' ? 'right wall' : 'right galaxy';
      const maxCam = l.kind === 'galaxy' ? Math.max(3, 40 * l.dist) : l.kind === 'wall' ? 6 * l.radius : Infinity;
      add(name, cls, p, { kind: 'lm', lm: l, ring, maxCam }, name, () => this.openLandmark(l));
    }
    // named galaxies (brightest first)
    const named = [...this.names.values()].filter((n) => n.i < this.cat.count).sort((a, b) => this.cat.kmag[a.i] - this.cat.kmag[b.i]);
    for (const n of named) {
      const i = n.i;
      const label = n.messier ?? n.ngc ?? n.name;
      const name = pick({ de: n.name, en: n.en ?? n.name });
      const html = n.messier ? `${name} <i>${n.messier}</i>` : name;
      const p = new THREE.Vector3(this.cat.pos[i * 3], this.cat.pos[i * 3 + 1], this.cat.pos[i * 3 + 2]);
      add(html, 'right name', p, { kind: 'name', gi: i, ring: 0, maxCam: Math.max(4, 0.8 * this.cat.dist[i]) }, `${name} ${label ?? ''}`, () => this.selectGalaxy(i));
    }
  }

  /** Visibility pass: distance rules, frustum, then greedy overlap rejection in priority order. */
  private updateLabels(): void {
    const cam = this.camera.position;
    const W = this.ctx.app.width, H = this.ctx.app.height;
    const projScale = (H / 2) / Math.tan((this.camera.fov * Math.PI) / 360);
    this._up.setFromMatrixColumn(this.camera.matrixWorld, 1);
    let placed = 0, names = 0;
    const rects = this.rects;
    for (const e of this.labels) {
      let want = e.kind !== 'lm' || this.marksOn;
      if (want && e.kind === 'name' && (names >= MAX_NAME_LABELS || this.cat.dist[e.gi!] > this.limit || e.gi === this.selIndex)) want = false;
      let ax = 0, ay = 0;
      if (want) {
        if (e.ring > 0) {
          const d = e.pos.distanceTo(cam);
          const px = (e.ring / Math.max(d, 1e-6)) * projScale;
          want = px > 14 && px < H * 0.62;
          if (want) e.obj.position.copy(e.pos).addScaledVector(this._up, e.ring);
        } else want = e.pos.distanceTo(cam) < e.maxCam;
      }
      if (want) {
        this._v.copy(e.obj.position).project(this.camera);
        if (this._v.z > 1 || Math.abs(this._v.x) > 1.05 || Math.abs(this._v.y) > 1.05) want = false;
        else { ax = ((this._v.x + 1) / 2) * W; ay = ((1 - this._v.y) / 2) * H; }
      }
      if (want) {
        // label box: point labels extend to the right, ring labels sit centred above the anchor
        const x0 = e.ring > 0 ? ax - e.w / 2 : ax, x1 = e.ring > 0 ? ax + e.w / 2 : ax + e.w;
        const y0 = e.ring > 0 ? ay - 22 : ay - 10, y1 = e.ring > 0 ? ay : ay + 10;
        for (let k = 0; k < placed; k++) {
          const o = k * 4;
          if (x0 < rects[o + 2] && x1 > rects[o] && y0 < rects[o + 3] && y1 > rects[o + 1]) { want = false; break; }
        }
        if (want && placed < 160) { const o = placed * 4; rects[o] = x0; rects[o + 1] = y0; rects[o + 2] = x1; rects[o + 3] = y1; placed++; }
      }
      if (want && e.kind === 'name') names++;
      e.obj.visible = want;
    }
  }

  private toWorld(v: THREE.Vector3): THREE.Vector3 { return v.applyQuaternion(this.world.quaternion); }

  // ---------------------------------------------------------------------------------------------
  // Picking & cards
  // ---------------------------------------------------------------------------------------------
  private pickAt(sx: number, sy: number): void {
    if (this.card && !this.selMarker && this.tourIdx < 0) { /* landmark card open: fall through, a new pick replaces it */ }
    const W = this.ctx.app.width, H = this.ctx.app.height;
    this._m.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse).multiply(this.world.matrixWorld);
    const m = this._m.elements;
    const pos = this.cat.pos, dist = this.cat.dist, kmag = this.cat.kmag;
    const thr = this.touch ? 30 : 16;
    let best = -1, bestScore = thr * thr;
    for (let i = 0, n = this.cat.count; i < n; i++) {
      if (dist[i] > this.limit) break; // sorted by distance
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      const w = m[3] * x + m[7] * y + m[11] * z + m[15];
      if (w <= 0) continue;
      const cx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
      const cy = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
      if (cx < -1 || cx > 1 || cy < -1 || cy > 1) continue;
      const px = ((cx + 1) / 2) * W, py = ((1 - cy) / 2) * H;
      const dx = px - sx, dy = py - sy;
      const s = (dx * dx + dy * dy) * (0.6 + 0.4 * clamp((kmag[i] - 4) / 7.75, 0, 1)); // bright galaxies win ties
      if (s < bestScore) { bestScore = s; best = i; }
    }
    // the Milky Way itself (origin)
    this._v.set(0, 0, 0).project(this.camera);
    if (this._v.z < 1) {
      const dx = ((this._v.x + 1) / 2) * W - sx, dy = ((1 - this._v.y) / 2) * H - sy;
      if (dx * dx + dy * dy < bestScore) { this.openLandmark(this.lmById.get('milkyway')); return; }
    }
    if (best >= 0) this.selectGalaxy(best);
  }

  private displayName(i: number): { title: string; sub: string } {
    const n = this.names.get(i);
    const type = t(`galaxies.type.${this.cat.type[i]}`);
    if (n) {
      const ids = [n.messier, n.ngc].filter(Boolean).join(' · ');
      return { title: pick({ de: n.name, en: n.en ?? n.name }), sub: [ids, type].filter(Boolean).join(' · ') };
    }
    return { title: `${t('galaxies.generic')} #${i}`, sub: type };
  }

  private selectGalaxy(i: number): void {
    const c = this.cat;
    this.closeCard();
    this.selIndex = i;
    const p = this.toWorld(new THREE.Vector3(c.pos[i * 3], c.pos[i * 3 + 1], c.pos[i * 3 + 2]));
    const { title, sub } = this.displayName(i);
    this.selMarker = this.label(`<i></i><span>${title}</span>`, 'gl-sel', this.scene, p);
    const d = c.dist[i], cz = c.cz[i];
    const ly = d * MPC_TO_LY;
    const direct = d < 25 && Math.abs(cz / H0 - d) > 0.25 * d + 4;
    const czTxt = `${cz < 0 ? '−' : ''}${fmtNum(Math.abs(cz), { digits: 0 })} km/s${cz < 0 ? ` · ${t('galaxies.approaching')}` : ''}`;
    const rows: Array<[string, string]> = [
      [t('galaxies.rowDist'), fmtDistanceLy(ly)],
      [t('galaxies.rowCz'), czTxt],
      [t('galaxies.rowLight'), fmtYears(ly)],
      [t('galaxies.rowK'), `${fmtNum(c.kmag[i], { digits: 2 })} mag`],
    ];
    const go = button(t('galaxies.flyThere'), () => this.flyToGalaxy(i), 'primary sm');
    this.card = infoCard(this.root, {
      title, sub, rows, pos: 'br',
      html: `<p class="light">${lightSentence(d)}</p><p class="hint">${t(direct ? 'galaxies.directNote' : 'galaxies.hubbleNote')}</p><div class="src">${t('galaxies.cardSrc')}</div>`,
      actions: [go],
      onClose: () => { this.card = undefined; this.clearSelection(); },
    });
    this.root.classList.add('has-card');
    this.updateLabels();
  }

  private openLandmark(l?: Landmark): void {
    if (!l) return;
    this.closeCard();
    const name = pick({ de: l.name, en: l.en });
    const rows: Array<[string, string]> = l.numbers.map((n) => [pick(n.label), typeof n.value === 'number' ? fmtNum(n.value, { maxDigits: 2 }) : n.value]);
    const dist = l.dist > 0 ? fmtDistanceLy(l.dist * MPC_TO_LY) : (lang() === 'de' ? 'du bist hier' : 'you are here');
    const go = button(t('galaxies.flyThere'), () => this.flyToLandmark(l), 'primary sm');
    this.card = infoCard(this.root, {
      title: name, sub: `${t(`galaxies.kind.${l.kind}`)} · ${dist}`, rows, pos: 'br',
      html: `<p>${pick(l.blurb)}</p>${l.dist > 0.3 ? `<p class="light">${lightSentence(l.dist)}</p>` : ''}<div class="src">${t('galaxies.cardSrc')}</div>`,
      actions: [go],
      onClose: () => { this.card = undefined; this.root.classList.remove('has-card'); },
    });
    this.root.classList.add('has-card');
  }

  private clearSelection(): void {
    if (this.selMarker) { this.selMarker.element.remove(); this.selMarker.removeFromParent(); this.selMarker = undefined; }
    this.selIndex = -1;
    this.root.classList.remove('has-card');
  }

  private closeCard(): void {
    if (this.card) { this.card.remove(); this.card = undefined; }
    this.clearSelection();
  }

  private flyToGalaxy(i: number): void {
    const c = this.cat;
    const target = this.toWorld(new THREE.Vector3(c.pos[i * 3], c.pos[i * 3 + 1], c.pos[i * 3 + 2]));
    this.flyTo(target, clamp(c.dist[i] * 0.1, 0.3, 10));
  }

  private flyToLandmark(l: Landmark): void {
    const target = l.id === 'milkyway' ? this.toWorld(galacticBasis().centre) : this.toWorld(landmarkPos(l));
    const r = l.id === 'milkyway' ? 0.055 : l.kind === 'galaxy' ? Math.max(0.3, l.dist * 0.25) : clamp(l.radius * 3.2, 1.5, 300);
    this.flyTo(target, r, l.id === 'milkyway' ? 0.95 : undefined);
  }

  private flyTo(target: THREE.Vector3, radius: number, phi?: number, ms?: number): TweenHandle {
    if (this.flyOn) { this.chips.fly.classList.remove('on'); this.setFly(false); }
    this.autoRotate = false;
    const dur = this.ctx.app.reducedMotion ? 0 : ms ?? clamp(2200 + 600 * Math.abs(Math.log10(Math.max(radius, 1e-3) / Math.max(this.rig.radius, 1e-3))), 2200, 4500);
    return this.rig.flyTo({ target, radius, phi }, dur);
  }

  private openParam(q?: string): void {
    if (!q) return;
    const s = q.trim().toLowerCase();
    const norm = (x: string) => x.toLowerCase().replace(/\s+/g, '');
    const lm = this.landmarks.find((l) => l.id === s || norm(l.name) === norm(s) || norm(l.en) === norm(s));
    if (lm) { this.openLandmark(lm); this.flyToLandmark(lm); return; }
    let gi = -1;
    if (/^\d+$/.test(s)) gi = Number(s);
    else for (const n of this.names.values()) {
      if ([n.name, n.en, n.messier, n.ngc].some((v) => v && norm(v) === norm(s))) { gi = n.i; break; }
    }
    if (gi >= 0 && gi < this.cat.count) { this.selectGalaxy(gi); this.flyToGalaxy(gi); return; }
    toast(this.root, t('galaxies.notFound', { q }));
  }

  // ---------------------------------------------------------------------------------------------
  // Tour
  // ---------------------------------------------------------------------------------------------
  private renderTourIdle(): void {
    this.tourBody.replaceChildren(
      el('div', 'panel-title', lang() === 'de' ? 'Tour' : 'Tour'),
      el('h3', 'tour-title', t('galaxies.tourTitle')),
      el('p', 'tour-sub', t('galaxies.tourSub')),
    );
    const row = el('div', 'btn-row');
    row.appendChild(button(`${ICON_PLAY} ${t('galaxies.tourStart')}`, () => this.startTour(), 'primary'));
    const dots = el('div', 'stops');
    TOUR.forEach((s, i) => {
      const b = el('button', 'stop ia', String(i + 1));
      b.type = 'button'; b.title = t(`galaxies.${s.titleKey}`).replace(/<[^>]+>/g, '');
      b.addEventListener('click', () => { if (this.tourIdx < 0) { this.tourPlaying = false; } this.goToStop(i); });
      dots.appendChild(b);
    });
    row.appendChild(dots);
    this.tourBody.appendChild(row);
    this.tourPanel.classList.remove('active');
  }

  private startTour(): void {
    this.tourPlaying = !this.ctx.app.reducedMotion;
    this.goToStop(0);
  }

  private goToStop(i: number): void {
    const stop = TOUR[i];
    if (!stop) return;
    if (this.flyOn) { this.chips.fly.classList.remove('on'); this.setFly(false); }
    this.closeCard();
    this.tourFlight?.cancel();
    this.tourIdx = i; this.dwell = 0;
    this.autoRotate = false;
    this.tourPanel.classList.add('active');
    const lm = stop.landmark ? this.lmById.get(stop.landmark) : undefined;
    const name = t(`galaxies.${stop.titleKey}`);
    this.tourBody.replaceChildren(el('div', 'tour-kicker', `${t('galaxies.tourStation')} ${i + 1} / ${TOUR.length}`), el('h3', 'tour-title', name), el('p', 'tour-sub flying', t('galaxies.tourFlying', { name: name.replace(/<[^>]+>/g, '') })));
    let target: THREE.Vector3;
    if (!lm) target = new THREE.Vector3(0, 0, 0);
    else if (lm.id === 'milkyway') target = this.toWorld(galacticBasis().centre);
    else target = this.toWorld(landmarkPos(lm));
    const ms = this.ctx.app.reducedMotion ? 0 : i === 0 && this.rig.radius > 100 ? 5000 : 4000;
    const h = this.rig.flyTo({ target, radius: stop.radius, phi: stop.phi, theta: stop.theta }, ms);
    this.tourFlight = h;
    void h.done.then(() => {
      if (!this.mounted || this.tourFlight !== h || this.tourIdx !== i) return;
      this.tourFlight = undefined;
      this.renderStopCard(i);
      this.dwell = STOP_DWELL_S;
    });
  }

  private renderStopCard(i: number): void {
    const stop = TOUR[i];
    const lm = stop.landmark ? this.lmById.get(stop.landmark) : undefined;
    const dist = stop.distMpc ?? lm?.dist ?? 0;
    const distTxt = dist > 0 ? fmtDistanceLy(dist * MPC_TO_LY) : (lang() === 'de' ? 'du bist hier' : 'you are here');
    const light = stop.id === 'milkyway' ? t('galaxies.lightNow', { event: t(epochKey(0.026)) }) : lightSentence(dist);
    const text = stop.textKey ? t(`galaxies.${stop.textKey}`) : lm ? pick(lm.blurb) : '';
    let rows: Array<[string, string]>;
    if (stop.id === 'edge') rows = [[t('galaxies.edge.n1'), fmtNum(this.cat.count)], [t('galaxies.edge.n2'), fmtDistanceLy(LIMIT_MAX * MPC_TO_LY)], [t('galaxies.edge.n3'), fmtDistanceLy(46.5e9)]];
    else rows = (lm?.numbers ?? []).map((n) => [pick(n.label), typeof n.value === 'number' ? fmtNum(n.value, { maxDigits: 2 }) : n.value]);
    const ctl = el('div', 'tour-ctl');
    const prev = button('‹', () => this.tourStep(-1), 'sm ghost'); prev.title = t('galaxies.tourPrev'); prev.disabled = i === 0;
    const play = button(this.tourPlaying ? ICON_PAUSE : ICON_PLAY, () => this.setTourPlaying(!this.tourPlaying), 'sm');
    play.classList.add('play'); play.title = this.tourPlaying ? t('galaxies.tourPause') : t('galaxies.tourPlay');
    const next = button(i < TOUR.length - 1 ? `${t('galaxies.tourNext')} ›` : t('galaxies.tourEnd'), () => this.tourStep(1), i < TOUR.length - 1 ? 'sm primary' : 'sm');
    const end = button(ICON_CLOSE, () => this.endTour(), 'sm ghost'); end.title = t('galaxies.tourEnd');
    const prog = el('div', 'prog'); prog.innerHTML = `<i style="width:${((i + 1) / TOUR.length) * 100}%"></i>`;
    ctl.append(prev, play, next, end);
    this.tourBody.replaceChildren(
      el('div', 'tour-kicker', `${t('galaxies.tourStation')} ${i + 1} / ${TOUR.length} · <b>${distTxt}</b>`),
      el('h3', 'tour-title', t(`galaxies.${stop.titleKey}`)),
      el('p', 'light', light),
      el('p', 'tour-text', text),
      kv(rows),
      prog, ctl,
    );
  }

  private setTourPlaying(on: boolean): void {
    this.tourPlaying = on;
    const b = this.tourBody.querySelector<HTMLButtonElement>('.play');
    if (b) { b.innerHTML = on ? ICON_PAUSE : ICON_PLAY; b.title = on ? t('galaxies.tourPause') : t('galaxies.tourPlay'); }
    if (on && this.dwell <= 0 && !this.tourFlight) this.dwell = STOP_DWELL_S * 0.6;
  }

  private tourStep(dir: number): void {
    const n = this.tourIdx + dir;
    if (n >= TOUR.length) { this.endTour(true); return; }
    if (n < 0) return;
    this.goToStop(n);
  }

  private endTour(finished = false): void {
    if (this.tourIdx < 0) return;
    this.tourFlight?.cancel(); this.tourFlight = undefined;
    this.tourIdx = -1; this.tourPlaying = false; this.dwell = 0;
    this.renderTourIdle();
    if (finished) toast(this.root, t('galaxies.tourDone'));
  }

  // ---------------------------------------------------------------------------------------------
  // Frame loop
  // ---------------------------------------------------------------------------------------------
  protected tick(dt: number): void {
    if (!this.rig) return;
    if (this.flyOn && this.flight) this.flight.update(dt);
    else {
      if (this.autoRotate) this.rig.theta += AUTO_ROT * dt;
      this.rig.update();
    }
    // adaptive clipping planes (scene spans 0.001 … 800 Mpc)
    const d = this.flyOn ? Math.max(this.camera.position.length(), 0.002) : this.rig.radius;
    const near = clamp(d * 0.004, 0.0003, 2), far = clamp(d * 40, 3000, 40000);
    if (Math.abs(near - this.near) > this.near * 0.15 || Math.abs(far - this.far) > this.far * 0.15) {
      this.near = near; this.far = far;
      this.camera.near = near; this.camera.far = far; this.camera.updateProjectionMatrix();
    }
    // the far-view marker of the Milky Way fades in as the disc itself becomes sub-pixel
    const dc = this.camera.position.length();
    this.markerU.uAlpha.value = 0.9 * clamp((dc - 0.12) / 0.5, 0, 1);

    // tour auto-advance
    if (this.tourIdx >= 0 && this.tourPlaying && !this.tourFlight && this.dwell > 0) {
      this.dwell -= dt;
      if (this.dwell <= 0) this.tourStep(1);
    }

    this.labelClock += dt;
    if (this.labelClock >= LABEL_TICK) { this.labelClock = 0; this.updateLabels(); }
    this.hudClock += dt;
    if (this.hudClock >= 0.12) { this.hudClock = 0; this.updateHud(); }
  }

  private updateHud(): void {
    const dc = this.camera.position.length();
    const dist = fmtDistanceLy(dc * MPC_TO_LY);
    const n = fmtNum(this.visibleCount);
    this.slots.dist.textContent = dist; this.slots.dist2.textContent = dist;
    this.slots.n.textContent = n; this.slots.n2.textContent = n;
    if (this.flyOn && this.flight) this.slots.speed.textContent = `${fmtDistanceLy(this.flight.speed * MPC_TO_LY)}${t('galaxies.hudPerSec')}`;
    const dbg = window.__galaxies;
    if (dbg) { dbg.cameraMpc = dc; dbg.limitMpc = this.limit; dbg.visible = this.visibleCount; }
  }

  resize(width: number, height: number): void {
    const aspect = width / Math.max(1, height);
    this.camera.fov = aspect < 0.8 ? 70 : aspect < 1.3 ? 62 : 55;
    super.resize(width, height);
    if (this.mwU) this.mwU.uHalfH.value = height / 2;
    if (this.ringU) {
      this.ringU.uProjScale.value = (height / 2) / Math.tan((this.camera.fov * Math.PI) / 360);
      this.ringU.uMaxPx.value = height * 0.42;
    }
  }

  protected teardown(): void {
    this.rig?.dispose();
    this.flight?.dispose();
    this.tourFlight?.cancel(); this.mix?.cancel(); this.planeTween?.cancel();
    this.card?.remove();
    delete window.__galaxies;
  }

  /** Data checks for the smoke test (`--eval "window.__galaxies"`). */
  private exposeDebug(): void {
    const c = this.cat;
    const m31 = [...this.names.values()].find((n) => n.messier === 'M31');
    const virgo = this.lmById.get('virgo');
    let within = 0, sum = 0;
    if (virgo) {
      const vp = landmarkPos(virgo);
      for (let i = 0; i < c.count; i++) {
        const dx = c.pos[i * 3] - vp.x, dy = c.pos[i * 3 + 1] - vp.y, dz = c.pos[i * 3 + 2] - vp.z;
        if (dx * dx + dy * dy + dz * dz < 9) { within++; sum += c.dist[i]; }
      }
    }
    window.__galaxies = {
      count: c.count,
      andromeda: { index: m31?.i ?? -1, distMpc: m31 ? c.dist[m31.i] : NaN, name: m31?.name ?? '' },
      virgo: { galaxiesWithin3Mpc: within, meanDistMpc: within ? sum / within : NaN },
      limitMpc: this.limit, cameraMpc: this.camera.position.length(), visible: this.visibleCount,
    };
  }
}
