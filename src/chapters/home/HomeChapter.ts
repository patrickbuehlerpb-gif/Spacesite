import * as THREE from 'three';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import './strings';
import './style.css';
import { BaseChapter } from '../../core/BaseChapter';
import { t, lang, locale, pick } from '../../core/i18n';
import { navigate } from '../../core/Router';
import { el, button, stat, infoCard } from '../../core/ui';
import { showCredits } from '../../core/chrome';
import { tween, easeOutCubic, type TweenHandle } from '../../core/tween';
import { fmtNum, fmtDistancePc, fmtDistanceLy, fmtLightTime, raDecToXYZ, clamp, lerp, KM_PER_AU, KM_PER_PC, C_KM_S } from '../../core/units';
import { spectralClassFromBv } from '../../core/color';
import { createStarPoints, colorsFromBv } from '../../core/StarPoints';
import { loadStarCatalog, loadStarNames, loadConstellations, starDisplayName, type StarCatalog, type StarName } from '../../data/stars';
import { chapters } from '../registry';
import { fetchISS, fetchAstronautsInSpace, fetchUpcomingLaunches, type IssState, type Launch } from '../../live/api';

/**
 * Landing page: the real night sky seen from Earth (camera at the origin of the HYG catalogue),
 * slowly drifting along the galactic plane, with a cinematic hero, live ticker, chapter menu and facts.
 *
 * Frame: the catalogue is equatorial J2000 (z = north celestial pole). The `sky` group is rotated
 * −90° about X so north points up (three.js +y); camera.up stays (0,1,0) → roll-free, north up.
 */
const DEG = Math.PI / 180;
const SKY_R = 400;                   // pc – radius for constellation lines / labels (only direction matters from the origin)
const DRIFT_RAD_S = 0.2 * DEG;       // camera drift along the Milky Way
const PARALLAX_RAD = 1.5 * DEG;      // mouse parallax amplitude
const EARTH_KM_S = 29.78;            // Earth's mean orbital speed around the Sun
const MAX_LABELS = 12;
const LABEL_POOL = 60;
// J2000 galactic centre (Sgr A*) and north galactic pole
const GC_RA = 266.405, GC_DEC = -28.936;
const NGP_RA = 192.8595, NGP_DEC = 27.1283;

interface PoolEntry { obj: CSS2DObject; el: HTMLElement; name: StarName; i: number }
type Slots = Record<string, HTMLElement>;

export default class HomeChapter extends BaseChapter {
  readonly id = 'home';

  private sky = new THREE.Group();
  private cat?: StarCatalog;
  private lines?: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private pool: PoolEntry[] = [];
  private conNames = new Map<string, { de: string; en: string }>();
  private card?: HTMLDivElement;

  // camera state (no per-frame allocations: reuse these)
  private centreDir = new THREE.Vector3();
  private poleAxis = new THREE.Vector3();
  private v = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private drift0 = 14 * DEG;         // start a little "east" of the galactic centre (Scutum / Sagittarius)
  private time = 0;
  private par = { yaw: 0, pitch: 0 };
  private parTarget = { yaw: 0, pitch: 0 };
  private labelClock = 0;

  // scroll-linked UI
  private scrollY = 0;
  private lastScrollY = -1;
  private heroInner!: HTMLElement;
  private cue!: HTMLElement;

  // ticker
  private t0 = Date.now();
  private lastEarth = 0;
  private lastCount = 0;
  private nextIss = 0;
  private issBusy = false;
  private issEl!: HTMLElement;
  private issDot!: HTMLElement;
  private issSlots: Slots = {};
  private issVal = { v: 0, alt: 0, lat: 0, lon: 0 };
  private issTween?: TweenHandle;
  private astroEl!: HTMLElement;
  private astroSlots: Slots = {};
  private launchEl!: HTMLElement;
  private launchSlots: Slots = {};
  private launches: Launch[] = [];
  private nextLaunchFetch = 0;
  private earthEl!: HTMLElement;
  private earthSlots: Slots = {};
  private nf0 = new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 });
  private nf1 = new Intl.NumberFormat(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  protected async setup(): Promise<void> {
    this.root.classList.add('ch-home', 'scroll', 'ia');
    this.buildUI();

    // ---- scene ---------------------------------------------------------------------------------
    this.sky.rotation.x = -Math.PI / 2;
    this.scene.add(this.sky);
    this.sky.updateMatrixWorld(true);
    const [gx, gy, gz] = raDecToXYZ(GC_RA, GC_DEC, 1);
    this.centreDir.set(gx, gy, gz);
    const [px, py, pz] = raDecToXYZ(NGP_RA, NGP_DEC, 1);
    this.poleAxis.set(px, py, pz).normalize();
    this.camera.position.set(0, 0, 0);
    this.camera.up.set(0, 1, 0);
    this.aimCamera();

    const [cat, names, cons] = await Promise.all([loadStarCatalog(), loadStarNames(), loadConstellations()]);
    if (!this.mounted) return;
    this.cat = cat;

    // stars: one Points for the whole catalogue, true apparent magnitudes from the origin
    const stars = createStarPoints(cat.pos, cat.absMag, colorsFromBv(cat.ci), { size: 9, magOffset: -0.35 });
    this.sky.add(stars);

    // constellation lines projected onto a sphere of radius SKY_R (straight lines from the origin's view)
    const segs: number[] = [];
    for (const c of cons) {
      this.conNames.set(c.abbr, { de: c.de, en: c.en });
      for (const poly of c.lines) for (let k = 0; k + 1 < poly.length; k++) {
        const a = poly[k], b = poly[k + 1];
        if (a >= cat.count || b >= cat.count) continue;
        segs.push(...this.dirOf(a, cat), ...this.dirOf(b, cat));
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segs), 3));
    const cyan = new THREE.Color(cssVar('--cyan') || '#7fd3ff');
    const mat = new THREE.LineBasicMaterial({ color: cyan, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    this.lines = new THREE.LineSegments(geo, mat);
    this.lines.frustumCulled = false;
    this.sky.add(this.lines);

    // label pool: the brightest named stars; ≤ MAX_LABELS are shown at a time (frustum-checked every 0.4 s)
    const layer = this.enableLabels().domElement;
    layer.classList.add('labels');
    const named = names.list.filter((n) => n.name && n.i < cat.count).sort((a, b) => cat.mag[a.i] - cat.mag[b.i]).slice(0, LABEL_POOL);
    for (const n of named) {
      const [x, y, z] = this.dirOf(n.i, cat);
      const obj = this.label(`<span>${n.name}</span>`, 'star-label ia', this.sky, new THREE.Vector3(x, y, z));
      obj.visible = false;
      const entry: PoolEntry = { obj, el: obj.element, name: n, i: n.i };
      obj.element.addEventListener('click', (e) => { e.stopPropagation(); this.selectStar(entry); });
      this.pool.push(entry);
    }
    this.updateLabels();

    // ---- interaction ---------------------------------------------------------------------------
    if (matchMedia('(hover: hover) and (pointer: fine)').matches && !this.ctx.app.reducedMotion) {
      const onMove = (e: PointerEvent) => {
        const nx = (e.clientX / Math.max(1, this.ctx.app.width)) * 2 - 1;
        const ny = (e.clientY / Math.max(1, this.ctx.app.height)) * 2 - 1;
        this.parTarget.yaw = -clamp(nx, -1, 1) * PARALLAX_RAD;
        this.parTarget.pitch = -clamp(ny, -1, 1) * PARALLAX_RAD;
      };
      window.addEventListener('pointermove', onMove, { passive: true });
      this.onDispose(() => window.removeEventListener('pointermove', onMove));
    }
    const onScroll = () => { this.scrollY = this.root.scrollTop; };
    this.root.addEventListener('scroll', onScroll, { passive: true });

    // ---- live data (each item fails independently) ---------------------------------------------
    void this.loadAstronauts();
    void this.loadLaunches();
  }

  // ---------------------------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------------------------
  private buildUI(): void {
    const reduced = this.ctx.app.reducedMotion;

    // Hero
    const hero = el('section', 'hero');
    this.heroInner = el('div', 'hero-inner');
    this.heroInner.append(
      el('div', 'kicker', t('home.kicker')),
      el('h1', 'title', t('chapter.home.title')),
      el('p', 'claim', t('home.claim')),
    );
    const cta = el('div', 'btn-row cta');
    cta.append(
      button(t('home.ctaStart'), () => navigate('zoom'), 'primary'),
      button(`<span class="live-dot"></span>${t('home.ctaLive')}`, () => navigate('live'), 'ghost'),
    );
    this.heroInner.appendChild(cta);
    const note = el('div', 'sky-note', `<b>${t('home.skyNote')}</b><br>${t('home.skyHint')}`);
    this.cue = el('button', 'scroll-cue ia', `<span>${t('home.scroll')}</span><i></i>`);
    (this.cue as HTMLButtonElement).type = 'button';
    hero.append(this.heroInner, note, this.cue);

    // Below the fold
    const below = el('div', 'below');
    this.cue.addEventListener('click', () => below.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }));

    // Chapter menu
    const menu = el('section', 'section');
    menu.appendChild(sectionHead(t('home.menuKicker'), t('home.menuTitle'), t('home.menuSub')));
    const grid = el('div', 'cards');
    let n = 0;
    for (const c of chapters) {
      if (c.id === 'home') continue;
      n++;
      const a = el('a', `panel card ia ${c.id === 'live' ? 'wide' : ''}`.trim());
      a.href = `#/${c.path}`;
      a.style.setProperty('--accent', c.accent);
      a.innerHTML = `
        <div class="no"><span>${t('home.chapterN')} <i>${String(n).padStart(2, '0')}</i></span><span class="arrow">${ICON_ARROW}</span></div>
        <h3>${t(`chapter.${c.id}.title`)}</h3>
        <div class="sub">${t(`chapter.${c.id}.subtitle`)}</div>
        <div class="big">${c.id === 'live' ? '<span class="live-dot"></span>' : ''}${t(`home.num.${c.id}`)}</div>`;
      a.addEventListener('click', (e) => { e.preventDefault(); navigate(c.path); });
      grid.appendChild(a);
    }
    menu.appendChild(grid);

    // Facts
    const facts = el('section', 'section');
    facts.appendChild(sectionHead(t('home.factsKicker'), t('home.factsTitle')));
    const fp = el('div', 'panel facts');
    const fg = el('div', 'facts-grid');
    fg.append(
      stat(fmtLightTime(KM_PER_AU / C_KM_S), t('home.fact.sun.l'), t('home.fact.sun.s')),
      stat(t('home.fact.mw.n'), t('home.fact.mw.l'), t('home.fact.mw.s')),
      stat(fmtDistanceLy(2.5e6), t('home.fact.m31.l'), t('home.fact.m31.s')),
      stat(fmtDistanceLy(93e9), t('home.fact.uni.l'), t('home.fact.uni.s')),
    );
    fp.append(fg, el('div', 'src-line', t('home.factsSrc')));
    facts.appendChild(fp);

    // Footer
    const foot = el('footer', 'foot');
    const data = el('span', 'data', `${t('home.footData')} · `);
    const link = el('button', 'link', t('home.footCredits'));
    link.type = 'button';
    link.addEventListener('click', () => showCredits());
    data.appendChild(link);
    foot.append(el('span', 'brand-sm', 'KOSMOS'), el('span', '', t('home.footMade')), data);

    below.append(menu, facts, foot);

    // Live ticker (fixed to the viewport)
    const ticker = el('div', 'ticker ia');
    this.issEl = this.tickerItem(ticker, t('home.tickIss'), this.issSlots, ['v', 'alt', 'lat', 'lon']);
    this.issDot = this.issEl.querySelector('.live-dot') as HTMLElement;
    this.astroEl = this.tickerItem(ticker, t('home.tickAstro'), this.astroSlots, ['n']);
    this.launchEl = this.tickerItem(ticker, t('home.tickLaunch'), this.launchSlots, ['name', 't']);
    this.earthEl = this.tickerItem(ticker, t('home.tickEarth'), this.earthSlots, ['km']);
    this.earthEl.hidden = false;
    ticker.appendChild(el('span', 'src', t('home.tickSrc')));

    this.root.append(hero, below, ticker);
  }

  /** One ticker segment: live dot + template text with named `<b>` slots. Hidden until data arrives. */
  private tickerItem(host: HTMLElement, tpl: string, slots: Slots, keys: string[]): HTMLElement {
    const item = el('span', 'item');
    item.hidden = true;
    item.appendChild(el('span', 'live-dot'));
    const txt = el('span');
    for (const k of keys) slots[k] = el(k === 'name' ? 'span' : 'b', k === 'name' ? 'name' : '');
    const parts = tpl.split(/\{(\w+)\}/g);
    parts.forEach((p, i) => {
      if (i % 2 === 0) { if (p) txt.appendChild(document.createTextNode(p)); }
      else txt.appendChild(slots[p] ?? document.createTextNode(`{${p}}`));
    });
    item.appendChild(txt);
    host.appendChild(item);
    return item;
  }

  // ---------------------------------------------------------------------------------------------
  // Live data
  // ---------------------------------------------------------------------------------------------
  private async pollIss(): Promise<void> {
    this.issBusy = true;
    try {
      const r = await fetchISS();
      if (!this.mounted) return;
      this.showIss(r.data, r.stale);
      this.nextIss = Date.now() + 5000;
    } catch {
      if (!this.mounted) return;
      this.issEl.hidden = true;
      this.nextIss = Date.now() + 30000;
    } finally { this.issBusy = false; }
  }

  private showIss(d: IssState, stale: boolean): void {
    const to = { v: d.velocity, alt: d.altitude, lat: d.latitude, lon: d.longitude };
    const first = this.issEl.hidden;
    const from = first ? { ...to } : { ...this.issVal };
    if (to.lon - from.lon > 180) from.lon += 360; else if (from.lon - to.lon > 180) from.lon -= 360;
    this.issEl.hidden = false;
    this.issDot.classList.toggle('stale', stale);
    this.issDot.title = stale ? t('home.stale') : '';
    this.issTween?.cancel();
    this.issTween = tween(first || this.ctx.app.reducedMotion ? 0 : 1400, (k) => {
      this.issVal.v = lerp(from.v, to.v, k);
      this.issVal.alt = lerp(from.alt, to.alt, k);
      this.issVal.lat = lerp(from.lat, to.lat, k);
      this.issVal.lon = lerp(from.lon, to.lon, k);
      this.renderIss();
    }, easeOutCubic);
  }

  private renderIss(): void {
    const { v, alt, lat, lon } = this.issVal;
    const L = ((lon + 540) % 360) - 180;
    this.issSlots.v.textContent = this.nf0.format(v);
    this.issSlots.alt.textContent = this.nf0.format(alt);
    this.issSlots.lat.textContent = `${this.nf1.format(Math.abs(lat))}° ${lat >= 0 ? 'N' : 'S'}`;
    this.issSlots.lon.textContent = `${this.nf1.format(Math.abs(L))}° ${L >= 0 ? (lang() === 'de' ? 'O' : 'E') : 'W'}`;
  }

  private async loadAstronauts(): Promise<void> {
    try {
      const r = await fetchAstronautsInSpace();
      if (!this.mounted) return;
      const n = r.data.length;
      if (n > 0) {
        this.astroSlots.n.textContent = String(n);
        this.astroEl.hidden = false;
        const dot = this.astroEl.querySelector('.live-dot') as HTMLElement;
        dot.classList.toggle('stale', r.stale);
        dot.title = r.stale ? t('home.stale') : '';
      }
    } catch { /* offline → item stays hidden */ }
  }

  private async loadLaunches(): Promise<void> {
    try {
      const r = await fetchUpcomingLaunches(3);
      if (!this.mounted) return;
      const now = Date.now();
      this.launches = r.data.filter((l) => Number.isFinite(Date.parse(l.net)) && Date.parse(l.net) > now).sort((a, b) => Date.parse(a.net) - Date.parse(b.net));
      const dot = this.launchEl.querySelector('.live-dot') as HTMLElement;
      dot.classList.toggle('stale', r.stale);
      dot.title = r.stale ? t('home.stale') : '';
      this.nextLaunchFetch = now + 10 * 60e3;
      this.updateCountdown(now);
    } catch {
      if (!this.mounted) return;
      this.launchEl.hidden = true;
      this.nextLaunchFetch = Date.now() + 5 * 60e3;
    }
  }

  private updateCountdown(now: number): void {
    while (this.launches.length && Date.parse(this.launches[0].net) <= now) this.launches.shift();
    const l = this.launches[0];
    if (!l) {
      this.launchEl.hidden = true;
      if (now >= this.nextLaunchFetch) { this.nextLaunchFetch = now + 60e3; void this.loadLaunches(); }
      return;
    }
    this.launchEl.hidden = false;
    this.launchSlots.name.textContent = l.name.replace(/\s*\|\s*/g, ' · ');
    this.launchSlots.t.textContent = fmtCountdown(Date.parse(l.net) - now);
  }

  // ---------------------------------------------------------------------------------------------
  // Sky helpers
  // ---------------------------------------------------------------------------------------------
  /** Unit direction of catalogue star `i`, scaled to SKY_R (catalogue frame, i.e. inside `sky`). */
  private dirOf(i: number, cat: StarCatalog): [number, number, number] {
    const x = cat.pos[i * 3], y = cat.pos[i * 3 + 1], z = cat.pos[i * 3 + 2];
    const d = Math.hypot(x, y, z) || 1;
    return [(x / d) * SKY_R, (y / d) * SKY_R, (z / d) * SKY_R];
  }

  /** Point the camera along the galactic plane (rotation of the galactic-centre direction about the galactic pole). */
  private aimCamera(): void {
    const ang = this.drift0 + (this.ctx.app.reducedMotion ? 0 : this.time * DRIFT_RAD_S);
    this.q.setFromAxisAngle(this.poleAxis, ang);
    this.v.copy(this.centreDir).applyQuaternion(this.q).applyQuaternion(this.sky.quaternion);
    this.camera.lookAt(this.v);
    this.camera.rotateY(this.par.yaw);
    this.camera.rotateX(this.par.pitch);
  }

  private updateLabels(): void {
    let shown = 0;
    for (const e of this.pool) {
      let vis = false;
      if (shown < MAX_LABELS) {
        this.v.copy(e.obj.position).applyMatrix4(this.sky.matrixWorld).project(this.camera);
        vis = this.v.z < 1 && Math.abs(this.v.x) < 0.94 && Math.abs(this.v.y) < 0.9;
      }
      if (vis) shown++;
      e.obj.visible = vis;
    }
  }

  private selectStar(e: PoolEntry): void {
    const cat = this.cat;
    if (!cat) return;
    this.card?.remove();
    for (const p of this.pool) p.el.classList.toggle('on', p === e);
    const i = e.i;
    const dist = cat.dist[i];
    const known = dist > 0 && dist < 9e4; // HYG uses 100 000 pc for unknown parallaxes
    const con = this.conNames.get(e.name.con ?? '');
    const rows: Array<[string, string]> = [
      [t('ui.constellation'), con ? `${pick(con)} (${e.name.con})` : e.name.con ?? '–'],
      [t('ui.distance'), known ? fmtDistancePc(dist) : t('home.unknown')],
      [t('ui.lighttime'), known ? fmtLightTime((dist * KM_PER_PC) / C_KM_S) : '–'],
      [t('ui.magnitude'), `${fmtNum(cat.mag[i], { digits: 2 })} mag`],
      [t('ui.type'), `${e.name.spect ?? ''} · ${spectralClassFromBv(cat.ci[i])}`.replace(/^ · /, '')],
      [t('home.bv'), fmtNum(cat.ci[i], { digits: 2 })],
    ];
    const go = button(`${t('home.visit')} ${ICON_ARROW}`, () => navigate('sterne', e.name.name!), 'primary sm');
    this.card = infoCard(this.root, {
      title: e.name.name!,
      sub: starDisplayName({ ...e.name, name: undefined }, cat.hip[i]),
      rows,
      html: `<div class="src">${t('home.starSrc')}</div>`,
      actions: [go],
      onClose: () => { this.card = undefined; e.el.classList.remove('on'); },
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Frame loop
  // ---------------------------------------------------------------------------------------------
  protected tick(dt: number): void {
    this.time += dt;
    // parallax easing
    const k = 1 - Math.exp(-dt * 3);
    this.par.yaw += (this.parTarget.yaw - this.par.yaw) * k;
    this.par.pitch += (this.parTarget.pitch - this.par.pitch) * k;
    this.aimCamera();

    // constellation lines breathe over ~20 s
    if (this.lines) this.lines.material.opacity = 0.14 + 0.07 * Math.sin((this.time * 2 * Math.PI) / 20);

    // star labels: re-check the frustum a few times per second
    this.labelClock += dt;
    if (this.labelClock >= 0.4) { this.labelClock = 0; this.updateLabels(); }

    // scroll-linked fades (hero parallax, labels, scroll cue)
    if (this.scrollY !== this.lastScrollY) {
      this.lastScrollY = this.scrollY;
      const h = Math.max(1, this.ctx.app.height);
      const f = clamp(this.scrollY / (0.55 * h), 0, 1);
      this.heroInner.style.transform = `translateY(${(this.scrollY * 0.28).toFixed(1)}px)`;
      this.heroInner.style.opacity = String(1 - f);
      this.cue.style.opacity = String(1 - clamp(this.scrollY / (0.2 * h), 0, 1));
      if (this.labelRenderer) this.labelRenderer.domElement.style.opacity = String(1 - f);
    }

    // ticker clocks
    const now = Date.now();
    if (now - this.lastEarth >= 100) {
      this.lastEarth = now;
      this.earthSlots.km.textContent = this.nf0.format(((now - this.t0) / 1000) * EARTH_KM_S);
    }
    if (now - this.lastCount >= 1000) { this.lastCount = now; this.updateCountdown(now); }
    if (now >= this.nextIss && !this.issBusy) void this.pollIss();
  }

  resize(width: number, height: number): void {
    const aspect = width / Math.max(1, height);
    this.camera.fov = aspect < 1 ? 82 : aspect < 1.4 ? 68 : 60;
    super.resize(width, height);
  }

  protected teardown(): void {
    this.issTween?.cancel();
    this.card?.remove();
  }
}

// -----------------------------------------------------------------------------------------------
function sectionHead(kicker: string, title: string, sub?: string): HTMLElement {
  const h = el('div', 'section-head');
  h.innerHTML = `<div><div class="kicker">${kicker}</div><h2>${title}</h2></div>${sub ? `<p>${sub}</p>` : ''}`;
  return h;
}

function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  if (d > 0) return `${d} d ${p(h)} h ${p(m)} min`;
  if (h > 0) return `${h} h ${p(m)} min ${p(sec)} s`;
  return `${m} min ${p(sec)} s`;
}

function cssVar(name: string): string {
  try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); } catch { return ''; }
}

const ICON_ARROW = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7h10M8 3l4 4-4 4"/></svg>';
