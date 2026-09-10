import * as THREE from 'three';
import './strings';
import './style.css';
import { BaseChapter, disposeScene } from '../../core/BaseChapter';
import { t } from '../../core/i18n';
import { el, button, stat, infoCard, showIntro, toast, panel, ICON_PLAY, ICON_PAUSE } from '../../core/ui';
import { tween, easeInOutCubic, type TweenHandle } from '../../core/tween';
import { fmtSci, fmtLightTime, fmtKm, fmtNum, smoothstep, clamp, lerp, KM_PER_AU } from '../../core/units';
import { loadJSON } from '../../core/Loader';
import { julianDate, eclToEq } from '../../data/solarsystem';
import { buildEarthLayer, buildSolarLayer, helioEq, earthDistanceM, type BuildCtx } from './LayersNear';
import { buildStarLayer, buildMilkyWayLayer, galacticBasis, type Landmark } from './LayersStars';
import { buildGalaxyLayer, buildUniverseLayer } from './LayersDeep';
import type { Layer, LabelSpec, ObjectInfo } from './model';
import { tokenRgb, fmtMioKm, fmtAU, fmtLy, fmtPow, quatFromNormal, window01, M_PER_AU, M_PER_LY, C_M_S, DEG } from './util';

/**
 * Kosmischer Zoom – a continuous log-scale zoom from the Earth's surface to the edge of the observable universe.
 *
 * One scalar drives everything: logD = log10(camera distance from Earth in metres), 6.9 … 26.7. Six layers (own
 * THREE.Scene, own unit, own visibility window) are rendered far → near into the same frame with the depth buffer
 * cleared in between, so no single scene has to span 20 orders of magnitude. All layers share one view direction
 * (theta/phi in the equatorial J2000 frame, north = +Z); the camera always looks at the origin (Earth, or the Sun /
 * Milky Way for the outer layers where the offset is irrelevant).
 */
const LOG_MIN = 6.9, LOG_MAX = 26.7;
const SPEEDS = [0.175, 0.35, 0.7];
const CARD_PAUSE = 3;
const MAX_PLACED = 80;

interface Milestone { id: string; logD: number; num: () => string; src: string; card: boolean }
interface Tick { id: string; logD: number; el?: HTMLButtonElement }
interface Pose { l: number; th: number; ph: number }
interface RulerStep { m: number; label: () => string }

export default class ZoomChapter extends BaseChapter {
  readonly id = 'zoom';

  // state
  private logD = 7.1;
  private logTarget = 7.1;
  private theta = 0.6;
  private phi = 1.2;
  private dir = new THREE.Vector3();
  private layers: Layer[] = [];              // near → far
  private infos = new Map<string, ObjectInfo>();
  private labelList: Array<{ spec: LabelSpec; layer: Layer }> = [];
  private placed = new Float32Array(MAX_PLACED * 4);
  private milestones: Milestone[] = [];
  private ticks: Tick[] = [];
  private poses: Pose[] = [];
  private jd = julianDate(new Date());

  // journey
  private journeyOn = false;
  private speedIdx = 1;
  private pauseT = 0;
  private userIdle = 99;
  private flight?: TweenHandle;
  private exploreOnly = false;
  private introOpen = false;
  private ended = false;

  // ui
  private catchEl!: HTMLDivElement;
  private labelsEl!: HTMLDivElement;
  private readout!: { scale: HTMLElement; dist: HTMLElement; light: HTMLElement; src: HTMLElement };
  private ruler!: { bar: HTMLElement; txt: HTMLElement };
  private sliderEl!: HTMLDivElement;
  private slider!: { fill: HTMLElement; thumb: HTMLElement };
  private playBtn!: HTMLButtonElement;
  private speedChips: HTMLButtonElement[] = [];
  private card!: { root: HTMLDivElement; kick: HTMLElement; num: HTMLElement; title: HTMLElement; stat: HTMLElement; label: HTMLElement; txt: HTMLElement; src: HTMLElement; prog: HTMLElement };
  private cardId = '';
  private info?: HTMLDivElement;
  private uiClock = 0;
  private lastSrc = '';
  private rulerSteps: RulerStep[] = [];
  private w = 1; private h = 1;

  // scratch
  private v = new THREE.Vector3();

  // ---------------------------------------------------------------------------------------------
  protected async setup(): Promise<void> {
    this.root.classList.add('ch-zoom');
    this.w = this.ctx.width; this.h = this.ctx.height;
    this.catchEl = el('div', 'zm-catch ia');
    this.labelsEl = el('div', 'zm-labels');
    this.root.append(this.catchEl, this.labelsEl);

    const b = this.buildCtx();
    const landmarks = await loadJSON<Landmark[]>('galaxy-landmarks.json', 'Galaxien-Landmarken');
    const builds = await Promise.all([
      buildEarthLayer(b), buildSolarLayer(b), buildStarLayer(b), buildMilkyWayLayer(b, landmarks), buildGalaxyLayer(b, landmarks), buildUniverseLayer(b),
    ]);
    for (const { layer, infos } of builds) {
      this.layers.push(layer);
      for (const i of infos) this.infos.set(i.id, i);
      for (const s of layer.labels) this.labelList.push({ spec: s, layer });
    }
    this.labelList.sort((a, c) => a.spec.prio - c.spec.prio);
    this.buildLabels();
    this.buildMilestones(b);
    this.buildPoses(b);
    this.buildUI();
    this.bindInput();
    this.resize(this.ctx.width, this.ctx.height);

    // debug / verification hook (scripts/shot.mjs --eval)
    (window as unknown as { __zoom: unknown }).__zoom = {
      set: (l: number, pose = true) => { this.stopJourney(); this.flight?.cancel(); this.logD = this.logTarget = clamp(l, LOG_MIN, LOG_MAX); if (pose) this.snapPose(); this.userIdle = 99; },
      get: () => this.logD,
      pose: (th: number, ph: number) => { this.theta = th; this.phi = ph; },
      journey: (on: boolean) => (on ? this.startJourney() : this.stopJourney()),
      layers: () => this.layers.map((L) => ({ id: L.id, opacity: Number(L.opacity.toFixed(3)), dist: L.camera.position.length() })),
      labels: () => this.labelList.filter((x) => x.spec.el && !x.spec.el.classList.contains('off')).map((x) => x.spec.id),
      milestones: () => this.milestones.map((m) => ({ id: m.id, logD: Number(m.logD.toFixed(3)), num: m.num() })),
      card: () => this.cardId,
      open: (id: string) => this.openInfo(id),
      state: () => ({ logD: this.logD, theta: this.theta, phi: this.phi, journey: this.journeyOn, pause: this.pauseT }),
      raw: () => this.layers,
    };

    const onParam = (e: Event) => this.deepLink((e as CustomEvent<string | undefined>).detail);
    this.ctx.ui.addEventListener('kosmos:param', onParam);
    this.onDispose(() => this.ctx.ui.removeEventListener('kosmos:param', onParam));

    // initial pose + first frame
    this.logD = this.logTarget = 7.1;
    this.snapPose();
    this.updateLayers(0, 0);

    if (this.ctx.param && this.deepLink(this.ctx.param)) return;
    this.introOpen = true;
    const coarse = matchMedia('(pointer: coarse)').matches;
    const p = showIntro(this.root, {
      kicker: t('zoom.kicker'), title: t('chapter.zoom.title'), blurb: t('chapter.zoom.blurb'), cta: t('zoom.introCta'), hint: t(coarse ? 'zoom.hintTouch' : 'zoom.hint'),
      onStart: () => { this.introOpen = false; if (!this.exploreOnly) this.startJourney(); },
    });
    const primary = this.root.querySelector('.intro-card .btn.primary') as HTMLButtonElement | null;
    if (primary) primary.after(button(t('zoom.introExplore'), () => { this.exploreOnly = true; primary.click(); }, 'ghost'));
    void p;
  }

  protected teardown(): void {
    this.flight?.cancel();
    this.ctx.renderer.autoClear = true;
    for (const L of this.layers) disposeScene(L.scene);
    this.layers = [];
    delete (window as unknown as { __zoom?: unknown }).__zoom;
  }

  resize(width: number, height: number): void {
    super.resize(width, height);
    this.w = width; this.h = height;
    for (const L of this.layers) {
      L.camera.aspect = width / Math.max(1, height);
      L.camera.updateProjectionMatrix();
      for (const p of L.proj) p(height, L.camera.fov);
    }
  }

  render(): void {
    const r = this.ctx.renderer;
    r.autoClear = false;
    r.clear();
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const L = this.layers[i];
      if (L.opacity <= 0.003) continue;
      r.render(L.scene, L.camera);
      r.clearDepth();
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------------------------
  private buildCtx(): BuildCtx {
    const sunDir = helioEq('earth', this.jd, new THREE.Vector3()).negate().normalize();
    const en = eclToEq({ x: 0, y: 0, z: 1 });
    return {
      jd: this.jd, sunDir, eclQuat: quatFromNormal(new THREE.Vector3(en.x, en.y, en.z)),
      colors: {
        gold: tokenRgb('--gold', '#f2c46d'), gold2: tokenRgb('--gold-2', '#ffdd9a'), cyan: tokenRgb('--cyan', '#7fd3ff'), cyan2: tokenRgb('--cyan-2', '#b8e8ff'),
        violet: tokenRgb('--violet', '#b89cff'), rose: tokenRgb('--rose', '#ff8aa6'), text: tokenRgb('--text', '#e9edf5'), text2: tokenRgb('--text-2', '#aab3c5'),
        muted: tokenRgb('--muted', '#7d8799'), green: tokenRgb('--green', '#8be9a8'),
      },
    };
  }

  private buildLabels(): void {
    for (const { spec } of this.labelList) {
      const btn = el('button', `zm-lbl ia off ${spec.cls ?? ''}`.trim());
      btn.type = 'button';
      btn.innerHTML = spec.sub ? `${spec.text}<span class="sub">${spec.sub}</span>` : spec.text;
      btn.addEventListener('click', (e) => { e.stopPropagation(); this.openInfo(spec.id); });
      this.labelsEl.appendChild(btn);
      spec.el = btn;
      spec.w = btn.offsetWidth || 80; spec.h = btn.offsetHeight || 18;
    }
  }

  private buildMilestones(b: BuildCtx): void {
    const jd = b.jd;
    const dMoon = earthDistanceM('moon', jd), dSun = helioEq('earth', jd, this.v).length() * M_PER_AU;
    const dNep = earthDistanceM('neptune', jd), dV1 = earthDistanceM('voyager1', jd);
    const fixed = (id: string, logD: number, src: string): Milestone => ({ id, logD, num: () => t(`zoom.ms.${id}.num`), src, card: true });
    this.milestones = [
      { id: 'moon', logD: Math.log10(dMoon), num: () => fmtKm(dMoon / 1e3), src: 'zoom.srcEarth', card: true },
      { id: 'sun', logD: Math.log10(dSun), num: () => fmtMioKm(dSun / 1e9), src: 'zoom.srcSolar', card: true },
      { id: 'neptune', logD: Math.log10(dNep), num: () => fmtAU(dNep / M_PER_AU), src: 'zoom.srcSolar', card: true },
      fixed('heliopause', Math.log10(120 * M_PER_AU), 'zoom.srcSolar'),
      { id: 'voyager1', logD: Math.log10(dV1), num: () => fmtAU(dV1 / M_PER_AU), src: 'zoom.srcSolar', card: true },
      fixed('oort', 15.3, 'zoom.srcSolar'),
      fixed('proxima', Math.log10(4.0e16), 'zoom.srcStars'),
      fixed('radio', Math.log10(9.46e17), 'zoom.srcStars'),
      fixed('orion', 19.5, 'zoom.srcStars'),
      fixed('milkyway', 21.0, 'zoom.srcMw'),
      fixed('andromeda', Math.log10(2.4e22), 'zoom.srcGal'),
      fixed('localgroup', Math.log10(5e22), 'zoom.srcGal'),
      fixed('virgo', Math.log10(5e23), 'zoom.srcGal'),
      fixed('laniakea', Math.log10(5e24), 'zoom.srcGal'),
      fixed('edge2mrs', 25.0, 'zoom.srcGal'),
      fixed('universe', Math.log10(4.4e26), 'zoom.srcCmb'),
    ].sort((a, c) => a.logD - c.logD);
    this.ticks = [
      { id: 'earth', logD: 7.1 }, { id: 'moon', logD: Math.log10(dMoon * 2.3) }, { id: 'sun', logD: Math.log10(dSun * 1.7) },
      { id: 'neptune', logD: Math.log10(dNep * 1.6) }, { id: 'voyager', logD: Math.log10(dV1 * 1.6) }, { id: 'oort', logD: 15.7 },
      { id: 'proxima', logD: 16.8 }, { id: 'mw', logD: 21.2 }, { id: 'andromeda', logD: 22.5 }, { id: 'virgo', logD: 23.9 },
      { id: 'laniakea', logD: 24.8 }, { id: 'universe', logD: 26.55 },
    ];
    const au = (n: number) => () => fmtAU(n);
    const ly = (n: number) => () => fmtLy(n);
    this.rulerSteps = [
      { m: 1e6, label: () => `${fmtNum(1000)} km` }, { m: 1e7, label: () => `${fmtNum(10000)} km` }, { m: 1e8, label: () => `${fmtNum(100000)} km` },
      { m: 1e9, label: () => fmtMioKm(1, 0) }, { m: 1e10, label: () => fmtMioKm(10, 0) }, { m: 1e11, label: () => fmtMioKm(100, 0) },
      { m: M_PER_AU, label: au(1) }, { m: 10 * M_PER_AU, label: au(10) }, { m: 100 * M_PER_AU, label: au(100) }, { m: 1000 * M_PER_AU, label: au(1000) }, { m: 1e4 * M_PER_AU, label: au(10000) },
      { m: M_PER_LY, label: ly(1) }, { m: 10 * M_PER_LY, label: ly(10) }, { m: 100 * M_PER_LY, label: ly(100) }, { m: 1e3 * M_PER_LY, label: ly(1e3) }, { m: 1e4 * M_PER_LY, label: ly(1e4) },
      { m: 1e5 * M_PER_LY, label: ly(1e5) }, { m: 1e6 * M_PER_LY, label: ly(1e6) }, { m: 1e7 * M_PER_LY, label: ly(1e7) }, { m: 1e8 * M_PER_LY, label: ly(1e8) },
      { m: 1e9 * M_PER_LY, label: ly(1e9) }, { m: 1e10 * M_PER_LY, label: ly(1e10) },
    ];
  }

  /** Preferred view directions per scale (used by the journey and by jumps). */
  private buildPoses(b: BuildCtx): void {
    const s = b.sunDir;
    const thS = Math.atan2(s.y, s.x), phS = Math.acos(clamp(s.z, -1, 1));
    // Earth: mostly day side, terminator visible
    const earth: Pose = { l: 7.9, th: thS + 0.8, ph: clamp(phS - 0.3, 0.5, 2.6) };
    // Earth + Moon: camera ~115° away from the Moon's direction (so the Moon sits inside the field of view), as sunward as possible
    const moon = this.layers[0].labels.find((x) => x.id === 'moon');
    let moonPose: Pose = { ...earth, l: 8.6 };
    if (moon) {
      const md = moon.pos.clone().normalize();
      const p = s.clone().sub(md.clone().multiplyScalar(s.dot(md))).normalize();
      const d = md.clone().multiplyScalar(-Math.cos(65 * DEG)).addScaledVector(p, Math.sin(65 * DEG)).normalize();
      moonPose = { l: 8.6, th: Math.atan2(d.y, d.x), ph: Math.acos(clamp(d.z, -1, 1)) };
    }
    // solar system: from above the ecliptic (ecliptic pole is at RA 18h, Dec +66.6°)
    const solar: Pose = { l: 10.6, th: 270 * DEG + 0.35, ph: 0.62 };
    const stars: Pose = { l: 16, th: 270 * DEG + 1.3, ph: 1.0 };
    const g = galacticBasis();
    const n = g.north;
    const gal: Pose = { l: 20.5, th: Math.atan2(n.y, n.x) + 0.25, ph: Math.acos(clamp(n.z, -1, 1)) - 0.18 };
    const sg: Pose = { l: 23.6, th: 283.8 * DEG, ph: (90 - 15.7) * DEG - 0.25 };
    this.poses = [earth, moonPose, { ...moonPose, l: 9.4 }, solar, { ...solar, l: 14 }, stars, { ...stars, l: 19.3 }, gal, { ...gal, l: 22.6 }, sg, { ...sg, l: 27, th: sg.th + 0.4, ph: sg.ph + 0.1 }];
  }

  private preferredPose(l: number, out: { th: number; ph: number }): void {
    const P = this.poses;
    if (l <= P[0].l) { out.th = P[0].th; out.ph = P[0].ph; return; }
    for (let i = 0; i + 1 < P.length; i++) {
      const a = P[i], c = P[i + 1];
      if (l <= c.l) {
        const k = smoothstep(a.l, c.l, l);
        let d = c.th - a.th; d = Math.atan2(Math.sin(d), Math.cos(d));
        out.th = a.th + d * k; out.ph = lerp(a.ph, c.ph, k);
        return;
      }
    }
    out.th = P[P.length - 1].th; out.ph = P[P.length - 1].ph;
  }
  private poseTmp = { th: 0, ph: 0 };
  private snapPose(): void { this.preferredPose(this.logD, this.poseTmp); this.theta = this.poseTmp.th; this.phi = this.poseTmp.ph; }

  // ---------------------------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------------------------
  private buildUI(): void {
    // top-centre readout
    const ro = el('div', 'panel zm-readout pos-tc');
    const s1 = stat('', t('zoom.scale')), s2 = stat('', t('zoom.distance'), '', 'cyan'), s3 = stat('', t('zoom.lightTime'));
    ro.append(s1, el('div', 'div'), s2, el('div', 'div'), s3, el('div', 'src'));
    this.readout = { scale: s1.querySelector('.n')!, dist: s2.querySelector('.n')!, light: s3.querySelector('.n')!, src: ro.querySelector('.src')! };
    this.addUI(ro);

    // ruler
    const ru = el('div', 'zm-ruler');
    const bar = el('div', 'bar', '<i></i>'), txt = el('div', 'txt');
    ru.append(bar, txt);
    this.ruler = { bar, txt };
    this.addUI(ru);

    // vertical log slider
    this.buildSlider();

    // journey bar
    const jb = panel({ pos: 'bc', cls: 'zm-journey' });
    jb.style.padding = '';
    this.playBtn = button(`${ICON_PLAY}<span>${t('zoom.journey')}</span>`, () => (this.journeyOn ? this.stopJourney() : this.startJourney()), 'play');
    const lab = el('span', 'lab', t('zoom.speed'));
    const speeds = el('div', 'speeds');
    ['½×', '1×', '2×'].forEach((lbl, i) => {
      const c = el('button', `chip ia ${i === this.speedIdx ? 'on' : ''}`, `<span class="dot"></span>${lbl}`);
      c.type = 'button';
      c.addEventListener('click', () => { this.speedIdx = i; this.speedChips.forEach((x, k) => x.classList.toggle('on', k === i)); });
      speeds.appendChild(c); this.speedChips.push(c);
    });
    const home = button(t('zoom.toEarth'), () => { this.stopJourney(); this.flyTo(7.1); }, 'ghost sm');
    jb.append(this.playBtn, lab, speeds, el('span', 'sep'), home);
    this.addUI(jb);

    // milestone card
    const card = el('div', 'panel strong zm-card ia');
    card.innerHTML = `<div class="kick"><span>${t('zoom.milestone')}</span><span class="ms-n"></span></div><h3></h3><div class="stat"><div class="n"></div><div class="l"></div></div><p></p><div class="src"></div><div class="prog"><i></i></div>`;
    this.card = { root: card, kick: card.querySelector('.kick > span')!, num: card.querySelector('.ms-n')!, title: card.querySelector('h3')!, stat: card.querySelector('.stat .n')!, label: card.querySelector('.stat .l')!, txt: card.querySelector('p')!, src: card.querySelector('.src')!, prog: card.querySelector('.prog')! };
    this.addUI(card);
  }

  private buildSlider(): void {
    const sl = el('div', 'zm-slider ia');
    const track = el('div', 'track'), fill = el('div', 'fill'), thumb = el('div', 'thumb'), hit = el('div', 'hit');
    sl.append(track, fill);
    const pct = (l: number) => (1 - (l - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100;
    for (let k = 7; k <= 26; k++) {
      const d = el('div', 'dec', fmtPow(k, ''));
      d.style.top = `${pct(k)}%`;
      sl.appendChild(d);
    }
    for (const tk of this.ticks) {
      const b = el('button', 'tick', t(`zoom.tick.${tk.id}`));
      b.type = 'button';
      b.style.top = `${pct(tk.logD)}%`;
      b.addEventListener('click', () => { this.stopJourney(); this.flyTo(tk.logD, true); });
      sl.appendChild(b); tk.el = b;
    }
    sl.append(hit, thumb);
    this.slider = { fill, thumb };
    this.sliderEl = sl;
    const fromY = (y: number) => { const r = track.getBoundingClientRect(); const f = 1 - clamp((y - r.top) / Math.max(1, r.height), 0, 1); return LOG_MIN + f * (LOG_MAX - LOG_MIN); };
    let dragging = false;
    hit.addEventListener('pointerdown', (e) => { dragging = true; hit.setPointerCapture(e.pointerId); this.userZoom(fromY(e.clientY), true); });
    hit.addEventListener('pointermove', (e) => { if (dragging) this.userZoom(fromY(e.clientY), true); });
    const up = () => { dragging = false; };
    hit.addEventListener('pointerup', up); hit.addEventListener('pointercancel', up);
    this.addUI(sl);
  }

  private bindInput(): void {
    const c = this.catchEl;
    let px = 0, py = 0, t0 = 0, moved = false, type = 'mouse', pinch = 0;
    c.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      px = e.clientX; py = e.clientY; t0 = performance.now(); moved = false; type = e.pointerType;
      c.setPointerCapture(e.pointerId); c.classList.add('drag');
    });
    c.addEventListener('pointermove', (e) => {
      if (!c.hasPointerCapture(e.pointerId) || pinch > 0) return;
      const dx = e.clientX - px, dy = e.clientY - py;
      px = e.clientX; py = e.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 0) moved = true;
      this.theta -= dx * 0.0045;
      if (type === 'touch') this.userZoom(this.logTarget + dy * 0.008, false);
      else this.phi = clamp(this.phi - dy * 0.0045, 0.08, Math.PI - 0.08);
      this.userIdle = 0;
    });
    const up = (e: PointerEvent) => {
      c.classList.remove('drag');
      if (!moved && performance.now() - t0 < 400 && this.info) { this.info.remove(); this.info = undefined; }
      void e;
    };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    const dist = (e: TouchEvent) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    c.addEventListener('touchstart', (e) => { if (e.touches.length === 2) pinch = dist(e); else pinch = 0; }, { passive: true });
    c.addEventListener('touchmove', (e) => { if (e.touches.length === 2 && pinch > 0) { e.preventDefault(); const d = dist(e); this.userZoom(this.logTarget + Math.log10(pinch / d) * 1.4, false); pinch = d; } }, { passive: false });
    c.addEventListener('touchend', (e) => { if (e.touches.length < 2) pinch = 0; }, { passive: true });

    const wheel = (e: WheelEvent) => {
      if (this.introOpen) return;
      e.preventDefault();
      const k = e.deltaMode === 1 ? 0.05 : e.deltaMode === 2 ? 0.6 : 0.0016;
      this.userZoom(this.logTarget + e.deltaY * k, false);
    };
    this.root.addEventListener('wheel', wheel, { passive: false });

    const onKey = (e: KeyboardEvent) => {
      if (this.introOpen) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowUp') { e.preventDefault(); this.userZoom(this.logTarget + 0.5, false); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); this.userZoom(this.logTarget - 0.5, false); }
      else if (e.key === 'PageUp') { e.preventDefault(); this.userZoom(this.logTarget + 2, false); }
      else if (e.key === 'PageDown') { e.preventDefault(); this.userZoom(this.logTarget - 2, false); }
      else if (e.key === 'ArrowLeft') this.theta += 0.1;
      else if (e.key === 'ArrowRight') this.theta -= 0.1;
      else if (e.key === ' ') { e.preventDefault(); if (this.journeyOn) this.stopJourney(); else this.startJourney(); }
      else if (e.key === 'Home') { this.stopJourney(); this.flyTo(7.1); }
      else if (e.key === 'End') { this.stopJourney(); this.flyTo(LOG_MAX); }
      else if (e.key === 'Escape') { if (this.info) { this.info.remove(); this.info = undefined; } else this.stopJourney(); }
    };
    window.addEventListener('keydown', onKey);
    this.onDispose(() => window.removeEventListener('keydown', onKey));
  }

  /** Zoom request from the user (wheel, keys, slider, touch): pauses the journey, keeps the orientation. */
  private userZoom(l: number, immediate: boolean): void {
    if (this.journeyOn) this.stopJourney();
    this.flight?.cancel(); this.flight = undefined;
    this.logTarget = clamp(l, LOG_MIN, LOG_MAX);
    if (immediate || this.ctx.app.reducedMotion) this.logD = this.logTarget;
    this.userIdle = 0;
  }

  /** Cinematic flight to a scale (log-linear, eased), optionally turning to the preferred view direction. */
  private flyTo(l: number, pose = false): void {
    this.flight?.cancel();
    const l0 = this.logD, l1 = clamp(l, LOG_MIN, LOG_MAX);
    const th0 = this.theta, ph0 = this.phi;
    this.preferredPose(l1, this.poseTmp);
    let dth = this.poseTmp.th - th0; dth = Math.atan2(Math.sin(dth), Math.cos(dth));
    const dph = this.poseTmp.ph - ph0;
    const ms = this.ctx.app.reducedMotion ? 0 : clamp(600 + 240 * Math.abs(l1 - l0), 900, 4200);
    this.flight = tween(ms, (k) => {
      this.logD = this.logTarget = lerp(l0, l1, k);
      if (pose) { this.theta = th0 + dth * k; this.phi = ph0 + dph * k; }
    }, easeInOutCubic);
    this.userIdle = 0;
  }

  private startJourney(): void {
    if (this.journeyOn) return;
    this.flight?.cancel(); this.flight = undefined;
    if (this.logD >= LOG_MAX - 0.02) { this.logD = this.logTarget = 7.1; this.snapPose(); }
    this.journeyOn = true; this.pauseT = 0; this.ended = false;
    this.logTarget = this.logD;
    this.playBtn.innerHTML = `${ICON_PAUSE}<span>${t('zoom.pause')}</span>`;
    this.playBtn.classList.add('active');
    this.userIdle = 99;
  }
  private stopJourney(): void {
    if (!this.journeyOn) return;
    this.journeyOn = false; this.pauseT = 0;
    this.playBtn.innerHTML = `${ICON_PLAY}<span>${t('zoom.journey')}</span>`;
    this.playBtn.classList.remove('active');
    this.card.prog.classList.remove('run');
  }

  /** `#/zoom/21` or `#/zoom/proxima` → jump there (no intro). Returns true when handled. */
  private deepLink(param?: string): boolean {
    if (!param) return false;
    const p = param.toLowerCase();
    const n = Number(p.replace(',', '.'));
    let l = Number.isFinite(n) && p !== '' ? n : NaN;
    if (!Number.isFinite(l)) {
      const tk = this.ticks.find((x) => x.id === p) ?? this.ticks.find((x) => t(`zoom.tick.${x.id}`).toLowerCase() === p);
      const ms = this.milestones.find((x) => x.id === p);
      l = tk ? tk.logD : ms ? ms.logD + 0.15 : NaN;
    }
    if (!Number.isFinite(l)) return false;
    this.stopJourney();
    if (this.introOpen) { this.logD = this.logTarget = clamp(l, LOG_MIN, LOG_MAX); this.snapPose(); }
    else this.flyTo(l, true);
    return true;
  }

  // ---------------------------------------------------------------------------------------------
  // Info cards
  // ---------------------------------------------------------------------------------------------
  private openInfo(id: string): void {
    const info = this.infos.get(id);
    if (!info) return;
    this.info?.remove();
    const go = button(t('zoom.flyTo'), () => { this.stopJourney(); if (info.zoom !== undefined) this.flyTo(info.zoom, true); }, 'primary sm');
    this.info = infoCard(this.root, {
      title: info.title(), sub: t(info.kind), rows: info.rows(), html: `${info.blurb()}<div class="src">${t(info.src)}</div>`, pos: 'tl',
      actions: info.zoom !== undefined ? [go] : [], onClose: () => { this.info = undefined; },
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Per frame
  // ---------------------------------------------------------------------------------------------
  protected tick(dt: number, elapsed: number): void {
    this.userIdle += dt;
    // journey: zoom out at a constant number of decades per second, pausing at milestone cards
    if (this.journeyOn) {
      if (this.pauseT > 0) this.pauseT -= dt;
      else {
        const prev = this.logD;
        this.logD = this.logTarget = Math.min(LOG_MAX, this.logD + SPEEDS[this.speedIdx] * dt);
        for (const m of this.milestones) if (prev < m.logD && this.logD >= m.logD) { this.logD = this.logTarget = m.logD + 0.001; this.pauseT = CARD_PAUSE; break; }
        if (this.logD >= LOG_MAX - 1e-6 && !this.ended) { this.ended = true; this.stopJourney(); toast(this.root, t('zoom.end'), 4000); }
      }
      // gentle drift of the view direction towards the scale's preferred pose
      if (this.userIdle > 2.5) {
        this.preferredPose(this.logD, this.poseTmp);
        let d = this.poseTmp.th - this.theta; d = Math.atan2(Math.sin(d), Math.cos(d));
        const k = 1 - Math.exp(-dt * 0.5);
        this.theta += d * k; this.phi += (this.poseTmp.ph - this.phi) * k;
      }
    } else if (!this.flight) {
      const d = this.logTarget - this.logD;
      if (Math.abs(d) > 1e-4) this.logD += d * (1 - Math.exp(-dt * 7)); else this.logD = this.logTarget;
    }
    this.updateLayers(dt, elapsed);
    this.layoutLabels();
    this.updateCard();
    this.uiClock += dt;
    if (this.uiClock > 0.08) { this.uiClock = 0; this.updateHud(); }
  }

  private updateLayers(dt: number, elapsed: number): void {
    const D = 10 ** this.logD;
    const sp = Math.sin(this.phi);
    this.dir.set(sp * Math.cos(this.theta), sp * Math.sin(this.theta), Math.cos(this.phi));
    for (const L of this.layers) {
      const fi = L.hardLo ? 1 : smoothstep(L.lo, L.lo + L.fade, this.logD);
      const fo = L.hardHi ? 1 : 1 - smoothstep(L.hi - L.fade, L.hi, this.logD);
      const k = this.logD < L.lo || this.logD > L.hi ? 0 : fi * fo;
      if (k !== L.opacity) { L.opacity = k; for (const f of L.fades) f(k); }
      if (k <= 0.003) continue;
      const dist = D / L.unit;
      const cam = L.camera;
      cam.position.copy(this.dir).multiplyScalar(dist);
      cam.near = Math.max(dist * 1e-3, 1e-7);
      cam.far = Math.max(dist * 1e3, L.minFar ?? 0);
      cam.updateProjectionMatrix();
      cam.lookAt(0, 0, 0);
      cam.updateMatrixWorld();
      L.update?.(dt, this.logD, elapsed, dist);
    }
  }

  private layoutLabels(): void {
    const W = this.w, H = this.h;
    const cardOn = this.cardId !== '';
    let n = 0;
    const placed = this.placed;
    for (const { spec, layer } of this.labelList) {
      const btn = spec.el!;
      const lo = spec.lo ?? layer.lo, hi = spec.hi ?? layer.hi;
      let a = layer.opacity;
      if (a > 0.05 && this.logD >= lo && this.logD <= hi) a *= window01(this.logD, lo, hi, 0.25);
      else a = 0;
      if (a < 0.03) { if (!btn.classList.contains('off')) btn.classList.add('off'); continue; }
      const v = this.v;
      if (spec.dyn) spec.dyn(v, this.dir); else v.copy(spec.pos);
      v.applyMatrix4(layer.camera.matrixWorldInverse);
      if (v.z > -layer.camera.near) { btn.classList.add('off'); continue; }
      v.applyMatrix4(layer.camera.projectionMatrix);
      const x = (v.x + 1) * 0.5 * W, y = (1 - v.y) * 0.5 * H;
      if (x < -10 || x > W + 10 || y < 64 || y > H - 70) { btn.classList.add('off'); continue; }
      // keep clear of the readout (top centre), the slider (right), the journey bar (bottom centre) and the milestone card (bottom right)
      if ((y < 170 && Math.abs(x - W * 0.5) < 330) || x > W - (W > 900 ? 240 : 60) || (y > H - 110 && Math.abs(x - W * 0.5) < 220) || (cardOn && x > W - 400 && y > H - 260)) { btn.classList.add('off'); continue; }
      // declutter: reject if the box overlaps an already placed label (list is sorted by priority)
      const w = spec.w ?? 80, h = spec.h ?? 18;
      const x0 = x, y0 = y - h / 2;
      let hit = false;
      for (let i = 0; i < n; i++) {
        const px = placed[i * 4], py = placed[i * 4 + 1], pw = placed[i * 4 + 2], ph = placed[i * 4 + 3];
        if (x0 < px + pw + 4 && x0 + w + 4 > px && y0 < py + ph + 2 && y0 + h + 2 > py) { hit = true; break; }
      }
      if (hit || n >= MAX_PLACED) { btn.classList.add('off'); continue; }
      placed[n * 4] = x0; placed[n * 4 + 1] = y0; placed[n * 4 + 2] = w; placed[n * 4 + 3] = h; n++;
      btn.style.transform = `translate(${x.toFixed(1)}px, ${y0.toFixed(1)}px)`;
      btn.style.opacity = a.toFixed(2);
      if (btn.classList.contains('off')) btn.classList.remove('off');
    }
  }

  private updateCard(): void {
    let cur: Milestone | undefined;
    for (const m of this.milestones) if (this.logD >= m.logD - 0.04 && this.logD <= m.logD + 0.85) cur = m;
    const id = cur?.id ?? '';
    if (id !== this.cardId) {
      this.cardId = id;
      const c = this.card;
      if (!cur) c.root.classList.remove('on');
      else {
        c.num.innerHTML = fmtSci(10 ** cur.logD, 1) + ' m';
        c.title.innerHTML = t(`zoom.ms.${cur.id}.title`);
        c.stat.innerHTML = cur.num();
        c.label.textContent = t(`zoom.ms.${cur.id}.label`);
        c.txt.innerHTML = t(`zoom.ms.${cur.id}.txt`);
        c.src.textContent = t(cur.src);
        c.root.classList.add('on');
      }
    }
    const running = this.journeyOn && this.pauseT > 0;
    if (running !== this.card.prog.classList.contains('run')) this.card.prog.classList.toggle('run', running);
  }

  private updateHud(): void {
    const D = 10 ** this.logD;
    const r = this.readout;
    r.scale.innerHTML = `${fmtSci(D, 1)} m`;
    const ly = D / M_PER_LY;
    r.dist.textContent = ly >= 0.05 ? fmtLy(ly) : D / 1e3 < 5e7 ? fmtKm(D / 1e3) : fmtAU(D / 1e3 / KM_PER_AU);
    r.light.textContent = fmtLightTime(D / C_M_S);
    // dominant (nearest visible) layer → source line
    let src = '';
    for (const L of this.layers) if (L.opacity > 0.5) { src = t(L.source); break; }
    if (!src) for (const L of this.layers) if (L.opacity > 0) { src = t(L.source); break; }
    if (src !== this.lastSrc) { this.lastSrc = src; r.src.textContent = src; }

    // ruler: a bar whose length is a round number of metres at the origin plane
    const cam = this.layers[0].camera;
    const widthM = 2 * D * Math.tan((cam.fov * DEG) / 2) * cam.aspect;
    const pxPerM = this.w / widthM;
    const maxPx = Math.min(320, this.w * 0.24);
    let step = this.rulerSteps[0];
    for (const s of this.rulerSteps) if (s.m * pxPerM <= maxPx) step = s;
    this.ruler.bar.style.width = `${Math.max(8, step.m * pxPerM).toFixed(0)}px`;
    this.ruler.txt.innerHTML = `${step.label()}<small>${t('zoom.scale')}</small>`;

    // slider
    const f = (this.logD - LOG_MIN) / (LOG_MAX - LOG_MIN);
    this.slider.fill.style.height = `${(f * 100).toFixed(2)}%`;
    this.slider.thumb.style.top = `${((1 - f) * 100).toFixed(2)}%`;
    for (const tk of this.ticks) tk.el?.classList.toggle('on', Math.abs(tk.logD - this.logD) < 0.3);
    void this.sliderEl;
  }
}
