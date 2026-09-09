import * as THREE from 'three';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import './strings';
import './style.css';
import { BaseChapter } from '../../core/BaseChapter';
import { t, locale } from '../../core/i18n';
import { el, button, chip, stat, showIntro, toast } from '../../core/ui';
import { OrbitRig } from '../../core/CameraRig';
import type { TweenHandle } from '../../core/tween';
import { fmtNum, EARTH_RADIUS_KM, KM_PER_AU, clamp } from '../../core/units';
import { createEarth, type Earth } from '../../core/Earth';
import { julianDate, dateFromJD, subsolarPoint, moonPhase, bodyPosition, type BodyId } from '../../data/solarsystem';
import { fetchISS, fetchISSPositions, type IssState } from '../../live/api';
import { crewPanel, launchesPanel, weatherPanel, sunPanel, neoPanel, apodPanel, videoPanel, settingsPanel, type Widget, type Host } from './panels';
import { moonPanel, deepPanel } from './panelsLocal';
import { showCard, fmtLatLon, fmtDate, timeAgo } from './panelKit';
import { llToUnit, unitToLL, lookAngles, gmstRad, rigAnglesFor, IssPropagator, type Fix, type TrackSample } from './geo';
import { buildSky, glowTexture, createIssMarker, createUserMarker, createTrack, type Marker, type Track } from './globe';
import { moonPhaseKey, nextMoonEvent } from './moon';

/**
 * "Right now": the ISS on a live Earth, plus a grid of independent live cards.
 *
 * Frame: world = equatorial, y-up (+X vernal equinox, +Y celestial north). The Earth group `terra`
 * is rotated by GMST, so mesh-frame lat/lon (llToUnit / latLonToVector3) land under the real sky
 * and the sub-solar point from `subsolarPoint()` lights the correct hemisphere.
 * The page scrolls (root = scroller); the camera view offset follows the scroll so the globe
 * behaves like part of the page while the WebGL canvas stays fixed.
 */
const D = Math.PI / 180;
const Y_UP = new THREE.Vector3(0, 1, 0);
const FOV = 50;
const ISS_EPOCH = Date.parse('1998-11-20T06:40:00Z');
const ORBITS_PER_DAY = 15.5;
const ISS_POLL_MS = 5000;
const TRACK_TTL_MS = 10 * 60e3;
const TRACK_STEP_S = 300;
const ISS_PERIOD_MIN = 92.9;
const PANEL_KEYS = ['crew', 'launches', 'weather', 'sun', 'neo', 'apod', 'video', 'moon', 'deep', 'settings'];

interface Sched { w: Widget; nextAt: number; busy: boolean }
interface StatEl { n: HTMLElement; s: HTMLElement }
type StatKey = 'alt' | 'speed' | 'pos' | 'dn' | 'orbits' | 'people';

export default class LiveChapter extends BaseChapter {
  readonly id = 'live';

  // scene
  private rig!: OrbitRig;
  private earth!: Earth;
  private terra = new THREE.Group();
  private iss!: Marker;
  private you!: Marker;
  private past!: Track;
  private future!: Track;
  private issLabel!: CSS2DObject;
  private youLabel!: CSS2DObject;
  private sunDir = new THREE.Vector3(1, 0, 0);
  private issDir = new THREE.Vector3(1, 0, 0);
  private youDir = new THREE.Vector3(0, 1, 0);
  private w = new THREE.Vector3();
  private c = new THREE.Vector3();
  private p = new THREE.Vector3();
  private issOnScreen = false;
  private youOnScreen = false;

  // ISS state
  private prop = new IssPropagator();
  private fix?: IssState;
  private fixAt = 0;
  private fixStale = false;
  private issFailed = false;
  private issNextAt = 0;
  private issBusy = false;
  private issAltR = 1.066;
  private seed?: Fix;
  private trackAt = -1e12;
  private trackBusy = false;

  // observer
  private user?: { lat: number; lon: number };

  // camera
  private autoRotate = false;
  private dragging = false;
  private idleUntil = 0;
  private flying = false;
  private flight?: TweenHandle;
  private homeRadius = 4.6;
  private xOff = 0;
  private yOff = 0;
  private scrollY = 0;
  private lastScroll = -1;

  // ui
  private hero!: HTMLElement;
  private grid!: HTMLElement;
  private catchEl!: HTMLElement;
  private clock!: HTMLElement;
  private kicker!: HTMLElement;
  private heroSrc!: HTMLElement;
  private geoLine!: HTMLElement;
  private st!: Record<StatKey, StatEl>;
  private sched: Sched[] = [];
  private people = -1;
  private timer = 0;
  private introOpen = false;
  private lastClock = '';
  private lastSrc = '';
  private pendingScroll?: { el: HTMLElement; until: number };
  private geoGuard = 0;
  private timeFmt = new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // ---------------------------------------------------------------------------------------------
  protected async setup(): Promise<void> {
    this.root.classList.add('ch-live', 'scroll', 'ia');
    this.enableLabels().domElement.classList.add('lv-labels');
    this.autoRotate = !this.ctx.app.reducedMotion;
    this.camera.fov = FOV;
    this.camera.near = 0.05;
    this.camera.far = 1e4;

    this.buildScene();
    this.buildHero();
    this.buildGrid();

    this.rig = new OrbitRig(this.camera, this.catchEl);
    this.rig.minRadius = 1.8;
    this.rig.maxRadius = 6;
    this.rig.minPhi = 0.2;
    this.rig.maxPhi = Math.PI - 0.2;
    this.rig.theta = 0.9;
    this.rig.phi = 1.25;
    this.layout();
    this.rig.radius = 6;
    this.rig.update();

    // pointer bookkeeping for auto-rotation + tap-to-select
    let px = 0, py = 0, pt = 0;
    this.catchEl.addEventListener('pointerdown', (e) => { this.dragging = true; px = e.clientX; py = e.clientY; pt = performance.now(); this.catchEl.classList.add('drag'); });
    const up = (e: PointerEvent) => {
      this.dragging = false; this.catchEl.classList.remove('drag'); this.idleUntil = Date.now() + 6000;
      if (Math.hypot(e.clientX - px, e.clientY - py) < 6 && performance.now() - pt < 500) this.pickAt(e.clientX, e.clientY);
    };
    this.catchEl.addEventListener('pointerup', up);
    this.catchEl.addEventListener('pointercancel', () => { this.dragging = false; this.catchEl.classList.remove('drag'); });
    this.catchEl.addEventListener('wheel', () => { this.idleUntil = Date.now() + 6000; }, { passive: true });

    const onScroll = () => { this.scrollY = this.root.scrollTop; };
    this.root.addEventListener('scroll', onScroll, { passive: true });

    const onVis = () => { if (!document.hidden) this.everySecond(); };
    document.addEventListener('visibilitychange', onVis);
    this.onDispose(() => document.removeEventListener('visibilitychange', onVis));

    const onParam = (e: Event) => this.handleParam((e as CustomEvent<string | undefined>).detail);
    this.ctx.ui.addEventListener('kosmos:param', onParam);
    this.onDispose(() => this.ctx.ui.removeEventListener('kosmos:param', onParam));

    const onKey = (e: KeyboardEvent) => {
      if (this.introOpen) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'i' || e.key === 'I') this.centerIss();
      else if (e.key === 'r' || e.key === 'R') this.setAutoRotate(!this.autoRotate);
    };
    window.addEventListener('keydown', onKey);
    this.onDispose(() => window.removeEventListener('keydown', onKey));

    // sky (async, non-blocking) + Earth textures (local, awaited so the first frame is not black)
    void buildSky().then((sky) => { if (this.mounted) this.scene.add(sky); }).catch((err) => console.warn('sky unavailable', err));
    await this.earth.ready.catch(() => { /* textures missing → shader still renders */ });
    if (!this.mounted) return;

    this.updateSun();
    this.everySecond();
    this.timer = window.setInterval(() => this.everySecond(), 1000);
    this.installHooks();

    const param = this.ctx.param?.toLowerCase();
    if (param && (param === 'iss' || PANEL_KEYS.includes(param))) {
      this.flyHome();
      this.handleParam(param);
    } else {
      this.introOpen = true;
      void showIntro(this.root, { kicker: t('live.kicker'), title: t('chapter.live.title'), blurb: t('chapter.live.blurb'), hint: t('live.hint') })
        .then(() => { this.introOpen = false; this.flyHome(); });
    }
  }

  protected teardown(): void {
    clearInterval(this.timer);
    clearTimeout(this.geoGuard);
    this.rig?.dispose();
    this.flight?.cancel();
    delete (window as unknown as { __live?: unknown }).__live;
  }

  resize(width: number, height: number): void {
    super.resize(width, height);
    if (this.hero) this.layout();
  }

  // ---------------------------------------------------------------------------------------------
  // Scene
  // ---------------------------------------------------------------------------------------------
  private buildScene(): void {
    this.scene.add(this.terra);
    this.earth = createEarth(1, { segments: 96 });
    this.terra.add(this.earth.group);
    const tex = glowTexture();
    this.iss = createIssMarker(tex);
    this.iss.pivot.visible = false;
    this.you = createUserMarker(tex);
    this.you.pivot.visible = false;
    this.past = createTrack(160, false, 0x7fd3ff, 0.95);
    this.future = createTrack(160, true, 0xb8e8ff, 0.8);
    this.terra.add(this.iss.pivot, this.you.pivot, this.past.line, this.future.line);

    this.issLabel = this.label('', 'iss-label ia', this.iss.anchor);
    this.issLabel.element.innerHTML = `<span>${t('live.waiting')}</span>`;
    this.issLabel.element.addEventListener('click', () => this.openIssCard());
    this.issLabel.visible = false;
    this.youLabel = this.label('', 'you-label ia', this.you.anchor);
    this.youLabel.element.addEventListener('click', () => this.openYouCard());
    this.youLabel.visible = false;
  }

  /** Sun direction + GMST rotation for the current instant (called once per second). */
  private updateSun(): void {
    const jd = julianDate(new Date());
    const g = gmstRad(jd);
    this.terra.rotation.y = g;
    const sub = subsolarPoint(jd);
    llToUnit(sub.lat, sub.lon + g / D, this.sunDir);
    this.earth.setSunDirection(this.sunDir);
  }

  /** Screen geometry: where the globe sits inside the hero, camera offsets, catch box. */
  private layout(): void {
    const w = this.ctx.width, h = this.ctx.height;
    const mobile = w < 720;
    const heroH = this.hero.offsetHeight || Math.max(0.6 * h, 540);
    const yc = heroH * (mobile ? 0.53 : 0.47);
    const xc = mobile ? w * 0.5 : w * 0.66;
    const diam = mobile ? Math.min(w * 0.72, heroH * 0.42) : Math.min(heroH * 0.62, w * 0.34);
    this.xOff = w / 2 - xc;
    this.yOff = h / 2 - yc;
    this.homeRadius = clamp(h / (diam * Math.tan((FOV * D) / 2)), 1.8, 6);
    const box = diam * 1.3;
    Object.assign(this.catchEl.style, { left: `${(xc - box / 2).toFixed(0)}px`, top: `${(yc - box / 2).toFixed(0)}px`, width: `${box.toFixed(0)}px`, height: `${box.toFixed(0)}px` });
    this.applyView();
  }

  private applyView(): void {
    const w = this.ctx.width, h = this.ctx.height;
    this.camera.setViewOffset(w, h, this.xOff, this.yOff + this.scrollY, w, h);
  }

  // ---------------------------------------------------------------------------------------------
  // Hero UI
  // ---------------------------------------------------------------------------------------------
  private buildHero(): void {
    this.hero = el('div', 'lv-hero');
    this.catchEl = el('div', 'lv-catch ia');
    this.catchEl.setAttribute('aria-label', t('ui.dragHint'));

    const head = el('div', 'lv-head');
    this.kicker = el('div', 'lv-kicker');
    this.clock = el('span', 'lv-clock');
    this.kicker.append(el('span', 'live-dot'), el('span', '', t('live.live')), this.clock);
    const title = el('h1', 'lv-title', t('chapter.live.title'));
    const sub = el('p', 'lv-sub', t('live.heroSub'));
    const acts = el('div', 'btn-row lv-actions');
    acts.append(
      button(t('live.whereAmI'), () => this.locate(), 'sm lv-cta'),
      button(t('live.centerIss'), () => this.centerIss(), 'sm'),
      chip(t('live.settings.autoRotate'), this.autoRotate, (on) => this.setAutoRotate(on)),
      button(`${t('live.scrollDown')} ↓`, () => this.grid.scrollIntoView({ behavior: this.ctx.app.reducedMotion ? 'auto' : 'smooth', block: 'start' }), 'ghost sm lv-cue'),
    );
    acts.querySelector('.chip')?.classList.add('lv-auto');
    this.geoLine = el('div', 'lv-geo');
    this.geoLine.hidden = true;
    head.append(this.kicker, title, sub, acts, this.geoLine);

    this.heroSrc = el('div', 'lv-hero-src');

    const stats = el('div', 'lv-stats');
    const mk = (key: StatKey, cls = ''): StatEl => {
      const s = stat('–', t(`live.stat.${key}`), '&nbsp;', cls);
      stats.appendChild(s);
      return { n: s.querySelector('.n')!, s: s.querySelector('.s')! };
    };
    this.st = { alt: mk('alt'), speed: mk('speed'), pos: mk('pos', 'small'), dn: mk('dn'), orbits: mk('orbits'), people: mk('people') };
    this.st.orbits.s.textContent = t('live.approx');
    this.st.people.s.textContent = t('live.aboard');

    this.hero.append(this.catchEl, head, this.heroSrc, stats);
    this.addUI(this.hero);
  }

  private buildGrid(): void {
    const self = this;
    const host: Host = {
      root: this.root,
      toast: (html) => toast(this.root, html),
      onPeople: (n) => this.setPeople(n),
      refreshAll: () => this.refreshAll(),
      setAutoRotate: (on) => this.setAutoRotate(on),
      get autoRotate() { return self.autoRotate; },
    };
    const widgets: Widget[] = [
      crewPanel(host), launchesPanel(host), weatherPanel(), sunPanel(), neoPanel(host),
      apodPanel(), videoPanel(), moonPanel(), deepPanel(), settingsPanel(host),
    ];
    this.grid = el('section', 'lv-grid');
    for (const w of widgets) this.grid.appendChild(w.panel.el);
    widgets[widgets.length - 1].panel.el.querySelector('.chip')?.classList.add('lv-auto');
    this.sched = widgets.map((w) => ({ w, nextAt: 0, busy: false }));
    this.addUI(this.grid);
  }

  // ---------------------------------------------------------------------------------------------
  // Per-second work: clock, scheduler, stats
  // ---------------------------------------------------------------------------------------------
  private everySecond(): void {
    if (!this.mounted) return;
    const now = Date.now();
    const clk = this.timeFmt.format(now);
    if (clk !== this.lastClock) { this.clock.textContent = clk; this.lastClock = clk; }
    this.updateSun();

    if (!document.hidden) {
      if (now >= this.issNextAt && !this.issBusy) { this.issNextAt = now + ISS_POLL_MS; void this.pollIss(); }
      if (now - this.trackAt >= TRACK_TTL_MS && !this.trackBusy) void this.loadTrack();
      for (const s of this.sched) {
        if (!s.w.refresh || s.busy || now < s.nextAt) continue;
        s.busy = true;
        s.nextAt = now + (s.w.every ?? 3600e3);
        s.w.refresh().catch(() => { /* panel handles its own offline state */ }).finally(() => { s.busy = false; });
      }
    }
    for (const s of this.sched) { s.w.second?.(); s.w.panel.tick(); }
    this.updateStats(now);
    this.updateGeo();
    this.updateIssStatus();
    this.keepScrollAnchor();
  }

  private refreshAll(): void {
    for (const s of this.sched) s.nextAt = 0;
    this.issNextAt = 0;
    this.trackAt = -1e12;
    this.everySecond();
  }

  private setPeople(n: number): void {
    this.people = n;
    this.st.people.n.textContent = String(n);
  }

  private updateStats(now: number): void {
    const f = this.fix;
    if (f) {
      this.st.alt.n.textContent = fmtNum(f.altitude, { digits: 0 });
      this.st.alt.s.textContent = `${fmtNum(f.altitude * 0.621371, { digits: 0 })} mi`;
      this.st.speed.n.textContent = fmtNum(f.velocity, { digits: 0 });
      this.st.speed.s.textContent = `${fmtNum(f.velocity / 3600, { digits: 2 })} km/s`;
      const ll = unitToLL(this.issDir);
      this.st.pos.n.textContent = fmtLatLon(ll.lat, ll.lon);
      this.st.pos.s.textContent = this.fixStale ? t('live.stale') : t('live.stand', { ago: timeAgo(this.fixAt) });
      const day = f.visibility === 'daylight';
      this.st.dn.n.textContent = day ? t('live.day') : t('live.night');
      this.st.dn.s.textContent = day ? t('live.sunlit') : t('live.eclipsed');
    }
    this.st.orbits.n.textContent = fmtNum(((now - ISS_EPOCH) / 86400e3) * ORBITS_PER_DAY, { digits: 0 });
    if (this.people < 0) this.st.people.n.textContent = '–';
  }

  private updateIssStatus(): void {
    let s: string;
    if (this.fix) s = `${t('live.source', { src: 'wheretheiss.at' })} · ${this.fixStale ? `${t('live.stale')} · ` : ''}${t('live.stand', { ago: timeAgo(this.fixAt) })}`;
    else if (this.issFailed) s = `${t('live.source', { src: 'wheretheiss.at' })} · ${t('live.offline')} · ${t('live.waiting')}`;
    else s = `${t('live.source', { src: 'wheretheiss.at' })} · ${t('live.waiting')}`;
    if (s !== this.lastSrc) { this.heroSrc.textContent = s; this.lastSrc = s; }
    this.kicker.classList.toggle('off', !this.fix && this.issFailed);
    this.kicker.classList.toggle('stale', !!this.fix && this.fixStale);
  }

  // ---------------------------------------------------------------------------------------------
  // ISS data
  // ---------------------------------------------------------------------------------------------
  private async pollIss(): Promise<void> {
    this.issBusy = true;
    try {
      const r = await fetchISS();
      if (this.mounted) this.onFix(r.data, r.at, r.stale);
    } catch {
      if (this.mounted) { this.issFailed = true; this.updateIssStatus(); }
    } finally { this.issBusy = false; }
  }

  private onFix(d: IssState, at: number, stale: boolean): void {
    const first = !this.fix;
    this.fix = d; this.fixAt = at; this.fixStale = stale; this.issFailed = false;
    this.prop.push({ t: at / 1000, lat: d.latitude, lon: d.longitude, alt: d.altitude });
    if (this.seed && !this.prop.hasDirection) this.prop.seedDirection(this.seed);
    this.issAltR = 1 + d.altitude / EARTH_RADIUS_KM;
    this.iss.setAltitude(d.altitude);
    this.iss.setFootprint(d.footprint > 0 ? d.footprint / 2 / EARTH_RADIUS_KM : Math.acos(1 / this.issAltR));
    this.issLabel.element.innerHTML = `<span>${t('live.issLabel', { v: fmtNum(d.velocity, { digits: 0 }) })}</span>`;
    if (first) {
      this.prop.predict(Date.now() / 1000, this.issDir);
      this.iss.pivot.quaternion.setFromUnitVectors(Y_UP, this.issDir);
      this.iss.pivot.visible = true;
      if (!this.introOpen && !this.flying) this.fly(this.issAngles(), this.ctx.app.reducedMotion ? 0 : 2000);
    }
    this.updateStats(Date.now());
    this.updateIssStatus();
  }

  /** Ground track: 45 min back and 45 min ahead in 5-min steps (two requests ≤ 10 stamps each). */
  private async loadTrack(): Promise<void> {
    this.trackBusy = true;
    this.trackAt = Date.now();
    const now = Math.floor(Date.now() / 1000);
    const pastTs: number[] = [], futTs: number[] = [];
    for (let i = 9; i >= 0; i--) pastTs.push(now - i * TRACK_STEP_S);
    for (let i = 1; i <= 9; i++) futTs.push(now + i * TRACK_STEP_S);
    const zip = (ts: number[], raw: IssState[] | IssState): TrackSample[] => (Array.isArray(raw) ? raw : [raw]).slice(0, ts.length).map((s, i) => ({ t: ts[i], lat: s.latitude, lon: s.longitude }));
    try {
      const [pa, fu] = await Promise.all([fetchISSPositions(pastTs), fetchISSPositions(futTs)]);
      if (!this.mounted) return;
      const past = zip(pastTs, pa), fut = zip(futTs, fu);
      if (past.length) fut.unshift(past[past.length - 1]);
      this.setTrack(past, fut);
      // direction seed: the first future sample that is not (numerically) the current position
      const ref = this.fix ? { lat: this.fix.latitude, lon: this.fix.longitude } : past[past.length - 1];
      const s = fut.find((q, i) => i > 0 && ref && Math.abs(q.lat - ref.lat) + Math.abs(q.lon - ref.lon) > 0.05);
      if (s) {
        this.seed = { t: s.t, lat: s.lat, lon: s.lon, alt: this.fix?.altitude ?? 420 };
        if (!this.prop.hasDirection) this.prop.seedDirection(this.seed);
      }
    } catch {
      this.trackAt = Date.now() - TRACK_TTL_MS + 60e3; // retry in a minute
    } finally { this.trackBusy = false; }
  }

  /** Draw the two track halves (keeps the previous track when fewer than two distinct points arrive). */
  private setTrack(past: TrackSample[], fut: TrackSample[]): void {
    const distinct = (a: TrackSample[]) => a.some((q) => Math.abs(q.lat - a[0].lat) + Math.abs(q.lon - a[0].lon) > 0.05);
    if (distinct(past)) this.past.set(past);
    if (distinct(fut)) this.future.set(fut);
  }

  // ---------------------------------------------------------------------------------------------
  // Camera
  // ---------------------------------------------------------------------------------------------
  private fly(o: { radius?: number; theta?: number; phi?: number }, ms: number): void {
    this.flight?.cancel();
    if (o.theta !== undefined) o.theta = this.nearestTheta(o.theta);
    this.flying = true;
    this.idleUntil = Date.now() + ms + 5000;
    this.flight = this.rig.flyTo(o, ms);
    void this.flight.done.then(() => { this.flying = false; });
  }

  private nearestTheta(target: number): number {
    const cur = this.rig.theta;
    let d = (target - cur) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return cur + d;
  }

  /** Rig angles that put a mesh-frame direction in the centre of the view. */
  private anglesFor(dir: THREE.Vector3): { theta: number; phi: number } {
    this.w.copy(dir).applyAxisAngle(Y_UP, this.terra.rotation.y);
    const a = rigAnglesFor(this.w);
    return { theta: a.theta, phi: clamp(a.phi, this.rig.minPhi, this.rig.maxPhi) };
  }
  private issAngles(): { theta: number; phi: number } { return this.anglesFor(this.issDir); }

  private flyHome(): void {
    const o: { radius: number; theta?: number; phi?: number } = { radius: this.homeRadius };
    if (this.fix) Object.assign(o, this.issAngles());
    this.fly(o, this.ctx.app.reducedMotion ? 0 : 2600);
  }

  private centerIss(): void {
    if (!this.fix) { toast(this.root, t('live.waiting')); return; }
    this.fly({ ...this.issAngles(), radius: Math.min(this.rig.radius, this.homeRadius) }, this.ctx.app.reducedMotion ? 0 : 1600);
  }

  private setAutoRotate(on: boolean): void {
    this.autoRotate = on;
    this.root.querySelectorAll('.chip.lv-auto').forEach((c) => c.classList.toggle('on', on));
  }

  protected tick(dt: number): void {
    this.earth.update(dt);
    if (this.scrollY !== this.lastScroll) { this.lastScroll = this.scrollY; this.applyView(); }
    const nowMs = Date.now();
    if (this.autoRotate && !this.dragging && !this.flying && nowMs > this.idleUntil && !this.ctx.app.reducedMotion) this.rig.theta -= dt * 0.03;
    this.rig.update();

    const dc = this.camera.position.length();
    this.c.copy(this.camera.position).multiplyScalar(1 / dc);
    const horizon = Math.acos(clamp(1 / dc, -1, 1));

    if (this.fix && this.prop.predict(nowMs / 1000, this.issDir)) {
      this.iss.pivot.quaternion.setFromUnitVectors(Y_UP, this.issDir);
      this.w.copy(this.issDir).applyAxisAngle(Y_UP, this.terra.rotation.y);
      const ang = Math.acos(clamp(this.w.dot(this.c), -1, 1));
      this.issOnScreen = ang < horizon + Math.acos(1 / this.issAltR);
      this.issLabel.visible = this.issOnScreen;
    }
    if (this.user) {
      this.w.copy(this.youDir).applyAxisAngle(Y_UP, this.terra.rotation.y);
      const ang = Math.acos(clamp(this.w.dot(this.c), -1, 1));
      this.youOnScreen = ang < horizon;
      this.youLabel.visible = this.youOnScreen;
    }
  }

  /** Tap on the globe: select the ISS or the observer marker when the tap lands on it. */
  private pickAt(x: number, y: number): void {
    const near = (obj: THREE.Object3D, px: number) => {
      obj.getWorldPosition(this.p).project(this.camera);
      if (this.p.z > 1) return false;
      const sx = (this.p.x * 0.5 + 0.5) * this.ctx.width, sy = (-this.p.y * 0.5 + 0.5) * this.ctx.height;
      return Math.hypot(sx - x, sy - y) < px;
    };
    if (this.fix && this.issOnScreen && near(this.iss.anchor, 36)) { this.openIssCard(); return; }
    if (this.user && this.youOnScreen && near(this.you.anchor, 30)) { this.openYouCard(); return; }
  }

  // ---------------------------------------------------------------------------------------------
  // Cards
  // ---------------------------------------------------------------------------------------------
  private openIssCard(): void {
    const f = this.fix;
    if (!f) return;
    const ll = unitToLL(this.issDir);
    const day = f.visibility === 'daylight';
    showCard(this.root, {
      title: 'ISS', sub: t('live.iss.sub'),
      rows: [
        [t('live.stat.alt'), `${fmtNum(f.altitude, { digits: 0 })} km`],
        [t('live.stat.speed'), `${fmtNum(f.velocity, { digits: 0 })} km/h`],
        [t('live.stat.pos'), fmtLatLon(ll.lat, ll.lon)],
        [t('live.iss.visibility'), day ? `${t('live.day')} · ${t('live.sunlit')}` : `${t('live.night')} · ${t('live.eclipsed')}`],
        [t('live.iss.period'), `${fmtNum(ISS_PERIOD_MIN, { digits: 1 })} min`],
        [t('live.iss.mass'), '≈ 420 t'],
        [t('live.iss.size'), '109 m × 73 m'],
        [t('live.iss.since'), fmtDate('1998-11-20T06:40:00Z')],
        [t('live.iss.crew'), this.people >= 0 ? String(this.people) : '–'],
      ],
      html: `<p>${t('live.iss.blurb')}</p><p class="dim">${t('live.source', { src: 'wheretheiss.at · Launch Library 2' })}</p>`,
    });
  }

  private openYouCard(): void {
    const u = this.user;
    if (!u) return;
    const rows: Array<[string, string]> = [[t('live.stat.pos'), fmtLatLon(u.lat, u.lon)]];
    if (this.fix) {
      const ll = unitToLL(this.issDir);
      const la = lookAngles(u.lat, u.lon, ll.lat, ll.lon, this.fix.altitude);
      rows.push([t('live.geo.distIss'), `${fmtNum(la.rangeKm, { digits: 0 })} km`], [t('live.geo.elev'), `${fmtNum(la.elevationDeg, { digits: 1 })}°`]);
    }
    showCard(this.root, { title: t('live.you'), sub: t('live.geo.sub'), rows, html: `<p>${t('live.geo.visible')}</p>` });
  }

  // ---------------------------------------------------------------------------------------------
  // Geolocation
  // ---------------------------------------------------------------------------------------------
  private locate(): void {
    if (!('geolocation' in navigator)) { toast(this.root, t('live.geo.unsupported')); return; }
    this.geoLine.hidden = false;
    this.geoLine.textContent = t('live.geo.locating');
    let done = false;
    const finish = (fn: () => void) => { if (done) return; done = true; clearTimeout(this.geoGuard); if (this.mounted) fn(); };
    const fail = (code: number) => {
      if (!this.user) this.geoLine.hidden = true;
      toast(this.root, code === 1 ? t('live.geo.denied') : code === 3 ? t('live.geo.timeout') : t('live.geo.unavailable'), 4000);
    };
    // the spec timeout does not cover a pending permission prompt → own guard so the line never hangs
    clearTimeout(this.geoGuard);
    this.geoGuard = window.setTimeout(() => finish(() => fail(3)), 15000);
    navigator.geolocation.getCurrentPosition(
      (pos) => finish(() => this.setUser(pos.coords.latitude, pos.coords.longitude)),
      (err) => finish(() => fail(err.code)),
      { timeout: 12000, maximumAge: 300e3 },
    );
  }

  private setUser(lat: number, lon: number): void {
    this.user = { lat, lon };
    llToUnit(lat, lon, this.youDir);
    this.you.pivot.quaternion.setFromUnitVectors(Y_UP, this.youDir);
    this.you.pivot.visible = true;
    this.youLabel.element.innerHTML = `<span>${t('live.you')} · ${fmtLatLon(lat, lon)}</span>`;
    this.youLabel.visible = true;
    this.geoLine.hidden = false;
    this.updateGeo();
    this.fly({ ...this.anglesFor(this.youDir), radius: Math.min(this.rig.radius, this.homeRadius) }, this.ctx.app.reducedMotion ? 0 : 1800);
  }

  private updateGeo(): void {
    const u = this.user;
    if (!u) return;
    if (!this.fix) { this.geoLine.innerHTML = `<b>${t('live.you')}</b> · ${fmtLatLon(u.lat, u.lon)} · ${t('live.waiting')}`; return; }
    const ll = unitToLL(this.issDir);
    const la = lookAngles(u.lat, u.lon, ll.lat, ll.lon, this.fix.altitude);
    const above = la.elevationDeg > 0;
    this.geoLine.innerHTML = `${t('live.geo.result', { deg: fmtNum(Math.abs(la.elevationDeg), { digits: 1 }), rel: above ? t('live.geo.above') : t('live.geo.below'), dist: fmtNum(la.rangeKm, { digits: 0 }) })}<br><span class="dim">${above ? t('live.geo.visible') : t('live.geo.nextPass')}</span>`;
  }

  // ---------------------------------------------------------------------------------------------
  // Deep links + verification hooks
  // ---------------------------------------------------------------------------------------------
  private handleParam(p?: string): void {
    if (!p) return;
    const k = p.toLowerCase();
    if (k === 'iss') { this.openIssCard(); return; }
    const target = this.root.querySelector<HTMLElement>(`#live-${k}`);
    if (!target) return;
    target.scrollIntoView({ behavior: this.ctx.app.reducedMotion ? 'auto' : 'smooth', block: 'start' });
    // panels are still skeletons right after mount: keep re-anchoring while the layout settles
    this.pendingScroll = { el: target, until: Date.now() + 4500 };
  }

  private keepScrollAnchor(): void {
    const ps = this.pendingScroll;
    if (!ps) return;
    if (Date.now() > ps.until) { this.pendingScroll = undefined; return; }
    const top = ps.el.getBoundingClientRect().top - this.root.getBoundingClientRect().top;
    if (Math.abs(top) > 24) this.root.scrollTo({ top: this.root.scrollTop + top, behavior: 'auto' });
  }

  private installHooks(): void {
    const probe = (id: BodyId, jd: number) => {
      const q = bodyPosition(id, jd), e = bodyPosition('earth', jd);
      const fromEarth = Math.hypot(q.x - e.x, q.y - e.y, q.z - e.z);
      return { fromSunAU: Math.hypot(q.x, q.y, q.z), fromEarthAU: fromEarth, fromEarthKm: fromEarth * KM_PER_AU };
    };
    (window as unknown as { __live: unknown }).__live = {
      iss: () => (this.fix ? { lat: this.fix.latitude, lon: this.fix.longitude, alt: this.fix.altitude, vel: this.fix.velocity, vis: this.fix.visibility, at: this.fixAt, stale: this.fixStale, hasDirection: this.prop.hasDirection, shown: unitToLL(this.issDir) } : null),
      moon: () => {
        const jd = julianDate(new Date());
        const mp = moonPhase(jd);
        return { phase: mp.phase, illuminated: mp.illuminated, key: moonPhaseKey(mp.phase), nextNew: dateFromJD(nextMoonEvent(jd, 'new')).toISOString(), nextFull: dateFromJD(nextMoonEvent(jd, 'full')).toISOString() };
      },
      probes: () => { const jd = julianDate(new Date()); return { voyager1: probe('voyager1', jd), voyager2: probe('voyager2', jd), newhorizons: probe('newhorizons', jd) }; },
      sun: () => ({ ...subsolarPoint(julianDate(new Date())), gmstDeg: gmstRad(julianDate(new Date())) / D }),
      orbits: () => ((Date.now() - ISS_EPOCH) / 86400e3) * ORBITS_PER_DAY,
      people: () => this.people,
      panels: () => Object.fromEntries(this.sched.map((s) => [s.w.panel.el.id, s.w.panel.state])),
      rig: () => ({ radius: this.rig.radius, theta: this.rig.theta, phi: this.rig.phi, home: this.homeRadius, flying: this.flying, introOpen: this.introOpen, autoRotate: this.autoRotate }),
      track: () => ({ past: this.past.line.geometry.drawRange.count, future: this.future.line.geometry.drawRange.count, at: this.trackAt, seed: this.seed ?? null }),
      setUser: (lat: number, lon: number) => this.setUser(lat, lon),
      setTrack: (past: TrackSample[], fut: TrackSample[]) => this.setTrack(past, fut),
      goto: (k: string) => this.handleParam(k),
      openIss: () => this.openIssCard(),
      centerIss: () => this.centerIss(),
    };
  }
}
