import * as THREE from 'three';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import './strings';
import './style.css';
import { BaseChapter } from '../../core/BaseChapter';
import { t } from '../../core/i18n';
import { navigate } from '../../core/Router';
import { el, button, panel, slider, chip, stat, showIntro, infoCard, toast, iconButton, ICON_PLAY, ICON_PAUSE, ICON_SEARCH, debounce } from '../../core/ui';
import { tween, linear, type TweenHandle } from '../../core/tween';
import { OrbitRig } from '../../core/CameraRig';
import { FreeFlight } from '../../core/FreeFlight';
import { fmtNum, fmtDistancePc, fmtKelvin, fmtYears, LY_PER_PC, clamp, lerp } from '../../core/units';
import { createStarPoints, colorsFromBv, starUniforms, starSpriteTexture } from '../../core/StarPoints';
import { loadJSON } from '../../core/Loader';
import { loadStarCatalog } from '../../data/stars';
import { loadExoplanets, type ExoplanetTable } from '../../data/exoplanets';
import { buildCatalog, computeStats, defaultFilters, passes, countUpTo, searchSystems, resolveParam, RAW_METHODS, SIZES, methodGroup, type Catalog, type Stats, type Filters, type HostSystem, type RawMethod, type SizeClass } from './systems';
import { createHostPoints, type HostPoints } from './HostPoints';
import { applyPalette, METHOD_COLOR, SIZE_COLOR } from './palette';
import { systemDiagram } from './SystemDiagram';
import { ChartsView, statTiles, fmtMass, fmtRadius, fmtPeriod } from './charts';

/**
 * Chapter 3 – exoplanets. View A: 3D map of host stars (parsec, equatorial frame rotated so north = +Y,
 * Sun at the origin) with filters, discovery-year playback, search, picking and an info card with a system
 * diagram. View B: charts (see charts.ts). The `world` group is rotated −90° about X: catalogue (x, y, z)
 * → three.js (x, z, −y); all catalogue positions live inside it.
 */
const RING_LY = [10, 100, 1000, 10000];
const DEFAULT_RADIUS = 60;         // pc
const SELECT_RADIUS = 2;           // pc
const PLAY_SECONDS = 25;
const YEAR_MIN = 1989;
const LABEL_HOSTS = ['Proxima Centauri', 'TRAPPIST-1', '51 Peg', 'Kepler-452', 'Kepler-186', 'HD 209458', 'Gliese 581', 'tau Ceti', 'HR 8799', 'Kepler-90', 'PSR 1257+12', 'beta Pic', 'TOI-700', 'Kepler-16 (Doppelstern)', '55 Cancri A', 'Kepler-22', 'HD 189733 A', 'Ross 128', 'Kepler-11'];

type SliderEl = HTMLDivElement & { set: (v: number) => void };

export default class ExoplanetsChapter extends BaseChapter {
  readonly id = 'exoplanets';

  private world = new THREE.Group();
  private cat!: Catalog;
  private stats!: Stats;
  private filters: Filters = defaultFilters();
  private hosts!: HostPoints;
  private bg?: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private sun!: THREE.Sprite;
  private rig!: OrbitRig;
  private flight!: FreeFlight;
  private mode: 'orbit' | 'fly' = 'orbit';
  private view: 'map' | 'charts' = 'map';
  private idleSpin = true;
  private selected: HostSystem | null = null;
  private marker!: CSS2DObject;
  private hostLabels: Array<{ sys: HostSystem; obj: CSS2DObject }> = [];
  private card?: HTMLDivElement;
  private charts?: ChartsView;

  // year playback
  private todayYear = new Date().getFullYear();
  private yearValue = 0;         // continuous; uniform uYear
  private playTween?: TweenHandle;
  private ts = new Float64Array(0); // sorted discovery times of planets passing the filters
  private lastCount = -1;
  private lastYearShown = -1;

  // UI refs
  private tabs!: HTMLDivElement;
  private tabMap!: HTMLButtonElement; private tabCharts!: HTMLButtonElement;
  private filtersPanel!: HTMLDivElement;
  private statsPanel!: HTMLDivElement;
  private hudPanel!: HTMLDivElement;
  private hudText!: HTMLElement;
  private flyChip!: HTMLButtonElement;
  private methodChips = new Map<RawMethod, HTMLButtonElement>();
  private sizeChips = new Map<SizeClass, HTMLButtonElement>();
  private hzChip!: HTMLButtonElement;
  private distSlider!: SliderEl;
  private yearSlider!: SliderEl;
  private playBtn!: HTMLButtonElement;
  private counterEl!: HTMLElement;
  private counterWrap!: HTMLElement;
  private yearBig!: HTMLElement;
  private shownEl!: HTMLElement;
  private searchInput!: HTMLInputElement;
  private results!: HTMLDivElement;

  // scratch (no per-frame allocations)
  private v = new THREE.Vector3();
  private down = { x: 0, y: 0, t: 0 };

  protected async setup(): Promise<void> {
    this.root.classList.add('ch-exoplanets');
    applyPalette(this.root);
    const rm = this.ctx.app.reducedMotion;

    // ---- data ------------------------------------------------------------------------------------
    const [rows, table, starCat] = await Promise.all([loadExoplanets(), loadJSON<ExoplanetTable>('exoplanets.json', 'Exoplaneten'), loadStarCatalog()]);
    if (!this.mounted) return;
    this.cat = buildCatalog(rows, table.updated, table.source);
    this.stats = computeStats(this.cat);
    this.yearValue = this.todayYear + 1;

    // ---- scene -----------------------------------------------------------------------------------
    this.world.rotation.x = -Math.PI / 2;
    this.scene.add(this.world);
    this.world.updateMatrixWorld(true);
    this.camera.up.set(0, 1, 0);

    this.bg = createStarPoints(starCat.pos, starCat.absMag, colorsFromBv(starCat.ci), { size: 4, alpha: 0.35, depthTest: false });
    this.bg.renderOrder = 0;
    this.world.add(this.bg);

    this.hosts = createHostPoints(this.cat.hosts);
    this.world.add(this.hosts.points);
    this.hosts.setYear(this.yearValue);

    // Sun: additive gold sprite with a constant screen size + label
    const sunMat = new THREE.SpriteMaterial({ map: starSpriteTexture(), color: new THREE.Color('#ffd27a'), blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, sizeAttenuation: false, transparent: true });
    this.sun = new THREE.Sprite(sunMat);
    this.sun.renderOrder = 3;
    this.scene.add(this.sun);
    this.label(t('exoplanets.sun'), 'xo-sun', this.scene, new THREE.Vector3(0, 0, 0));

    // distance rings (celestial equator plane) + labels
    this.buildRings();

    // selection marker + a handful of orientation labels
    this.marker = this.label('', 'xo-marker', this.world, new THREE.Vector3());
    this.marker.visible = false;
    for (const name of LABEL_HOSTS) {
      const sys = this.cat.byHost.get(name);
      if (!sys?.xyz) continue;
      const obj = this.label(`<span>${sys.label}</span>`, 'xo-host ia', this.world, new THREE.Vector3(sys.xyz[0], sys.xyz[1], sys.xyz[2]));
      obj.element.addEventListener('click', (e) => { e.stopPropagation(); this.selectHost(sys, true); });
      this.hostLabels.push({ sys, obj });
    }

    // ---- camera ----------------------------------------------------------------------------------
    const dom = this.ctx.renderer.domElement;
    this.rig = new OrbitRig(this.camera, dom);
    this.rig.radius = DEFAULT_RADIUS; this.rig.minRadius = 0.25; this.rig.maxRadius = 12000; this.rig.theta = 0.55; this.rig.phi = 1.12;
    this.rig.update();
    this.flight = new FreeFlight(this.camera, dom);
    this.flight.enabled = false;
    this.flight.minSpeed = 0.05; this.flight.maxSpeed = 5000;
    this.idleSpin = !rm;

    // picking (click = pointer down/up without a drag), double-click = free flight
    const onDown = (e: PointerEvent) => { this.down = { x: e.clientX, y: e.clientY, t: performance.now() }; this.idleSpin = false; };
    const onUp = (e: PointerEvent) => {
      if (this.view !== 'map' || e.button !== 0) return;
      if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) < 6 && performance.now() - this.down.t < 600) this.pick(e.clientX, e.clientY);
    };
    const onDbl = (e: MouseEvent) => { if (this.view === 'map') { e.preventDefault(); this.setMode(this.mode === 'fly' ? 'orbit' : 'fly'); } };
    const onWheel = () => { this.idleSpin = false; };
    dom.addEventListener('pointerdown', onDown); dom.addEventListener('pointerup', onUp); dom.addEventListener('dblclick', onDbl); dom.addEventListener('wheel', onWheel, { passive: true });
    this.onDispose(() => { dom.removeEventListener('pointerdown', onDown); dom.removeEventListener('pointerup', onUp); dom.removeEventListener('dblclick', onDbl); dom.removeEventListener('wheel', onWheel); });
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA')) return;
      if (e.key === 'Escape') { if (this.mode === 'fly') this.setMode('orbit'); else this.closeCard(); }
    };
    window.addEventListener('keydown', onKey);
    this.onDispose(() => window.removeEventListener('keydown', onKey));

    // deep links while the chapter is open
    const onParam = (e: Event) => {
      const p = (e as CustomEvent<string | undefined>).detail;
      if (!p) return;
      const sys = resolveParam(this.cat, p);
      if (sys && sys !== this.selected) this.selectHost(sys, true);
    };
    this.ctx.ui.addEventListener('kosmos:param', onParam);
    this.onDispose(() => this.ctx.ui.removeEventListener('kosmos:param', onParam));

    // ---- UI --------------------------------------------------------------------------------------
    this.buildUI();
    this.applyFilters();
    this.resize(this.ctx.width, this.ctx.height);

    const param = this.ctx.param;
    const target = param ? resolveParam(this.cat, param) : undefined;
    if (target) { this.selectHost(target, true); }
    else {
      if (param) toast(this.root, t('exoplanets.notFound', { q: param }));
      const touch = matchMedia('(hover: none)').matches;
      void showIntro(this.root, { kicker: t('exoplanets.kicker'), title: t('chapter.exoplanets.title'), blurb: t('chapter.exoplanets.blurb'), hint: t(touch ? 'exoplanets.hintTouch' : 'exoplanets.hint') });
    }
  }

  // -----------------------------------------------------------------------------------------------
  // scene helpers
  // -----------------------------------------------------------------------------------------------
  private buildRings(): void {
    const seg = 180;
    const arr = new Float32Array(RING_LY.length * seg * 6);
    let o = 0;
    for (const ly of RING_LY) {
      const r = ly / LY_PER_PC;
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
        arr[o++] = r * Math.cos(a0); arr[o++] = r * Math.sin(a0); arr[o++] = 0;
        arr[o++] = r * Math.cos(a1); arr[o++] = r * Math.sin(a1); arr[o++] = 0;
      }
      this.label(`${fmtNum(ly)} ${t('exoplanets.ly')}`, 'xo-ring', this.world, new THREE.Vector3(r * Math.cos(0.35), r * Math.sin(0.35), 0));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.LineBasicMaterial({ color: new THREE.Color('#7fd3ff'), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    const lines = new THREE.LineSegments(geo, mat);
    lines.frustumCulled = false;
    lines.renderOrder = 1;
    this.world.add(lines);
  }

  resize(width: number, height: number): void {
    super.resize(width, height);
    if (this.sun) {
      // sizeAttenuation=false: on-screen height = scale · viewportHeight / (2·tan(fov/2)) → ~40 px
      const s = (40 * 2 * Math.tan((this.camera.fov * Math.PI) / 360)) / Math.max(1, height);
      this.sun.scale.set(s, s, 1);
    }
  }

  /** Screen-space nearest visible host within 22 px. */
  private pick(cx: number, cy: number): void {
    const { width, height } = this.ctx.app;
    const pos = this.hosts.pos, vis = this.hosts.vis, yr = this.hosts.year;
    let best = -1, bd = 22 * 22;
    for (let i = 0; i < this.cat.hosts.length; i++) {
      if (vis[i] === 0 || yr[i] > this.yearValue) continue;
      this.v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      this.world.localToWorld(this.v);
      this.v.project(this.camera);
      if (this.v.z > 1 || this.v.z < -1) continue;
      const sx = (this.v.x + 1) * 0.5 * width, sy = (1 - this.v.y) * 0.5 * height;
      const d = (sx - cx) ** 2 + (sy - cy) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0) this.selectHost(this.cat.hosts[best], true);
  }

  private worldPos(sys: HostSystem, out: THREE.Vector3): THREE.Vector3 {
    out.set(sys.xyz![0], sys.xyz![1], sys.xyz![2]);
    return this.world.localToWorld(out);
  }

  private setMode(m: 'orbit' | 'fly'): void {
    if (m === this.mode) return;
    this.mode = m;
    this.idleSpin = false;
    if (m === 'fly') {
      this.rig.enabled = false;
      this.flight.enabled = true;
      this.flight.syncFromCamera();
      this.flight.setSpeed(Math.max(0.3, this.rig.radius * 0.35));
      this.hudText.innerHTML = t('ui.flyHint');
    } else {
      this.flight.enabled = false;
      // rebuild the orbit rig around the current target from the camera pose (no jump)
      const tgt = this.rig.target;
      const dx = this.camera.position.x - tgt.x, dy = this.camera.position.y - tgt.y, dz = this.camera.position.z - tgt.z;
      const r = Math.max(this.rig.minRadius, Math.hypot(dx, dy, dz));
      this.rig.radius = r; this.rig.theta = Math.atan2(dx, dz); this.rig.phi = clamp(Math.acos(clamp(dy / r, -1, 1)), this.rig.minPhi, this.rig.maxPhi);
      this.rig.enabled = true;
      this.hudText.innerHTML = t(matchMedia('(hover: none)').matches ? 'exoplanets.hintTouch' : 'exoplanets.hint');
    }
    this.flyChip.classList.toggle('on', m === 'fly');
  }

  private flyHome(): void {
    this.setMode('orbit');
    this.rig.flyTo({ target: new THREE.Vector3(0, 0, 0), radius: DEFAULT_RADIUS, phi: 1.12 }, this.ctx.app.reducedMotion ? 0 : 2200);
  }

  // -----------------------------------------------------------------------------------------------
  // selection / info card
  // -----------------------------------------------------------------------------------------------
  private selectHost(sys: HostSystem, fly: boolean): void {
    if (this.view !== 'map') this.setView('map');
    this.selected = sys;
    for (const l of this.hostLabels) l.obj.element.classList.toggle('on', l.sys === sys);
    if (sys.xyz) {
      this.marker.position.set(sys.xyz[0], sys.xyz[1], sys.xyz[2]);
      this.marker.visible = true;
      if (fly) {
        this.setMode('orbit');
        this.idleSpin = false;
        const target = this.worldPos(sys, new THREE.Vector3());
        this.rig.flyTo({ target, radius: SELECT_RADIUS }, this.ctx.app.reducedMotion ? 0 : 2400);
      }
    } else {
      this.marker.visible = false;
      toast(this.root, t('exoplanets.noPosition', { host: sys.label }));
    }
    this.buildCard(sys);
    navigate('exoplaneten', sys.label);
  }

  private closeCard(): void {
    this.card?.remove(); this.card = undefined;
    this.selected = null;
    this.marker.visible = false;
    for (const l of this.hostLabels) l.obj.element.classList.remove('on');
  }

  private buildCard(sys: HostSystem): void {
    const T = (k: string, p?: Record<string, string | number>) => t(`exoplanets.${k}`, p);
    this.card?.remove();
    const rows: Array<[string, string]> = [];
    if (sys.dist != null) rows.push([T('distance'), fmtDistancePc(sys.dist)]);
    if (sys.teff != null) rows.push([T('teff'), fmtKelvin(sys.teff, false)]);
    if (sys.mass != null) rows.push([T('stMass'), `${fmtNum(sys.mass, { maxDigits: 2 })} ${T('suns')}`]);
    if (sys.radius != null) rows.push([T('stRadius'), `${fmtNum(sys.radius, { maxDigits: 2 })} ${T('suns')}`]);

    const parts: string[] = [];
    if (sys.dist != null) parts.push(`<p class="light">${T('lightSentenceNow', { t: `<b>${fmtYears(sys.dist * LY_PER_PC)}</b>` })}</p>`);
    if (sys.teff == null && sys.mass == null && sys.radius == null) parts.push(`<p class="light">${T('hostNoStar')}</p>`);

    const dia = systemDiagram(sys);
    if (dia) {
      parts.push(`<div class="sec"><div class="panel-title"><span>${T('diagram')}</span><span class="note">${T('diagramNote')}</span></div><div class="diagram">${dia.svg}</div></div>`);
    }
    // planet table
    const th = (s: string, num = false) => `<th${num ? ' class="num"' : ''}>${s}</th>`;
    const td = (s: string, num = false) => `<td${num ? ' class="num"' : ''}>${s}</td>`;
    let anyDerived = false;
    const trs = sys.planets.map((v) => {
      const p = v.p;
      if (v.smaDerived) anyDerived = true;
      const name = `${escapeHtml(p.name)}${p.hz ? ` <span class="hzchip">${T('inHz')}</span>` : ''}`;
      const mass = p.massE != null ? fmtMass(p.massE) : '<span class="dim">–</span>';
      const rad = p.radiusE != null ? fmtRadius(p.radiusE) : '<span class="dim">–</span>';
      const per = p.period != null ? fmtPeriod(p.period) : '<span class="dim">–</span>';
      const sma = v.sma != null ? `${fmtNum(v.sma, { maxDigits: v.sma < 1 ? 3 : 2 })} ${T('au')}${v.smaDerived ? '<span class="dim">*</span>' : ''}` : '<span class="dim">–</span>';
      const teq = p.teq != null ? fmtKelvin(p.teq, false) : '<span class="dim">–</span>';
      const disc = `${p.year ?? '–'} <span class="methodtag" style="--c:${METHOD_COLOR[methodGroup(p.method)]}"><i></i>${T(`mShort.${v.raw}`)}</span>`;
      return `<tr>${td(name)}${td(mass, true)}${td(rad, true)}${td(per, true)}${td(sma, true)}${td(teq, true)}${td(disc)}</tr>`;
    });
    parts.push(`<div class="sec"><div class="panel-title"><span>${sys.planets.length === 1 ? T('planet1') : T('planetsN', { n: sys.planets.length })}</span></div><div class="tbl-wrap"><table class="table"><thead><tr>${th(T('colPlanet'))}${th(T('colMass'), true)}${th(T('colRadius'), true)}${th(T('colPeriod'), true)}${th(T('colSma'), true)}${th(T('colTemp'), true)}${th(T('colYear'))}</tr></thead><tbody>${trs.join('')}</tbody></table></div></div>`);
    const foot: string[] = [];
    if (anyDerived || dia?.usedDerived) foot.push(T('smaDerived'));
    if (dia?.usedEstimate) foot.push(T('radiusEstimated'));
    foot.push(T('source', { updated: this.cat.updated }));
    parts.push(`<div class="foot">${foot.join('<br>')}</div>`);

    const actions: HTMLElement[] = [];
    if (sys.xyz) actions.push(button(t('exoplanets.flyTo'), () => { const target = this.worldPos(sys, new THREE.Vector3()); this.setMode('orbit'); this.rig.flyTo({ target, radius: SELECT_RADIUS }, this.ctx.app.reducedMotion ? 0 : 1800); }, 'sm'));
    actions.push(button(t('exoplanets.showChart'), () => this.setView('charts'), 'sm ghost'));

    this.card = infoCard(this.root, {
      title: escapeHtml(sys.label),
      sub: `${T('system')}${sys.binary ? ` · ${T('binary')}` : ''}`,
      rows, html: parts.join(''), pos: 'tr', actions,
      onClose: () => { this.card = undefined; this.closeCard(); },
    });
    this.card.classList.add('xo-card');
  }

  // -----------------------------------------------------------------------------------------------
  // UI
  // -----------------------------------------------------------------------------------------------
  private buildUI(): void {
    const T = (k: string, p?: Record<string, string | number>) => t(`exoplanets.${k}`, p);
    const rm = this.ctx.app.reducedMotion;
    const narrow = matchMedia('(max-width: 720px)').matches;

    // tabs
    this.tabs = panel({ cls: 'xo-tabs', pos: 'tc' });
    this.tabMap = button(T('tabMap'), () => this.setView('map'), 'sm active');
    this.tabCharts = button(T('tabCharts'), () => this.setView('charts'), 'sm');
    this.tabs.append(this.tabMap, this.tabCharts);
    this.addUI(this.tabs);

    // filters panel
    const fp = this.filtersPanel = panel({ cls: 'xo-filters', pos: 'tl' });
    const head = el('div', 'head');
    head.appendChild(el('div', 'panel-title', T('filters')));
    const fold = iconButton(ICON_FOLD, () => fp.classList.toggle('folded'), T('filters'));
    fold.classList.add('fold');
    head.appendChild(fold);
    fp.appendChild(head);
    if (narrow) fp.classList.add('folded');

    // search
    const search = el('div', 'xo-search');
    search.innerHTML = ICON_SEARCH;
    this.searchInput = el('input');
    this.searchInput.type = 'search'; this.searchInput.placeholder = T('search'); this.searchInput.setAttribute('aria-label', T('searchLabel'));
    this.searchInput.autocomplete = 'off';
    this.results = el('div', 'panel strong xo-results');
    this.results.hidden = true;
    search.append(this.searchInput, this.results);
    const runSearch = () => this.renderResults(this.searchInput.value);
    this.searchInput.addEventListener('input', debounce(runSearch, 120));
    this.searchInput.addEventListener('focus', runSearch);
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const hit = searchSystems(this.cat, this.searchInput.value, 1)[0]; if (hit) this.pickResult(hit.sys); else toast(this.root, T('notFound', { q: this.searchInput.value })); }
      if (e.key === 'Escape') { this.results.hidden = true; this.searchInput.blur(); }
    });
    this.searchInput.addEventListener('blur', () => setTimeout(() => { this.results.hidden = true; }, 180));
    fp.appendChild(search);

    // method chips
    const gm = el('div', 'group');
    gm.appendChild(el('div', 'glabel', `<span>${T('method')}</span>`));
    const cm = el('div', 'chips');
    for (const m of RAW_METHODS) {
      const c = chip(`${T(`m.${m}`)}<small>${fmtNum(this.stats.perRaw.get(m) ?? 0)}</small>`, true, (on) => { if (on) this.filters.methods.add(m); else this.filters.methods.delete(m); this.applyFilters(); });
      c.style.setProperty('--c', METHOD_COLOR[methodGroup(m)]);
      this.methodChips.set(m, c); cm.appendChild(c);
    }
    gm.appendChild(cm); fp.appendChild(gm);

    // size chips
    const gs = el('div', 'group');
    gs.appendChild(el('div', 'glabel', `<span>${T('sizeClass')}</span><span class="note">${T('sizeNote')}</span>`));
    const cs = el('div', 'chips');
    for (const s of SIZES) {
      const c = chip(`${T(`s.${s}`)}<small>${T(`sRange.${s}`)}</small>`, true, (on) => { if (on) this.filters.sizes.add(s); else this.filters.sizes.delete(s); this.applyFilters(); });
      c.style.setProperty('--c', SIZE_COLOR[s]);
      this.sizeChips.set(s, c); cs.appendChild(c);
    }
    gs.appendChild(cs); fp.appendChild(gs);

    // habitable zone toggle
    const gh = el('div', 'chips');
    this.hzChip = chip(`${T('hzOnly')}<small>${fmtNum(this.stats.hz)}</small>`, false, (on) => { this.filters.hzOnly = on; this.applyFilters(); });
    this.hzChip.style.setProperty('--c', 'var(--green)');
    gh.appendChild(this.hzChip); fp.appendChild(gh);

    // distance slider (log)
    const lyOf = (v: number) => 10 ** lerp(Math.log10(4), Math.log10(30000), v);
    this.distSlider = slider({
      min: 0, max: 1, step: 0.002, value: 1, label: T('maxDist'),
      format: (v) => (v >= 1 ? T('all') : `${fmtNum(lyOf(v), { digits: 0 })} ${T('ly')}`),
      onInput: (v) => { this.filters.maxDistPc = v >= 1 ? Infinity : lyOf(v) / LY_PER_PC; this.applyFilters(); },
    }) as SliderEl;
    fp.appendChild(this.distSlider);

    // year slider + playback
    const yr = el('div', 'xo-year');
    this.playBtn = iconButton(ICON_PLAY, () => this.togglePlay(), T('play'));
    this.yearSlider = slider({
      min: YEAR_MIN, max: this.todayYear, step: 1, value: this.todayYear, label: T('year'),
      format: (v) => (v >= this.todayYear ? T('all') : String(Math.floor(v))),
      onInput: (v) => { this.stopPlay(); this.setYear(v >= this.todayYear ? this.todayYear + 1 : v + 0.9999); },
    }) as SliderEl;
    yr.append(this.playBtn, this.yearSlider);
    fp.appendChild(yr);
    this.counterWrap = el('div', 'xo-counter');
    const st = stat('0', T('known'));
    this.counterEl = st.querySelector('.n') as HTMLElement;
    this.yearBig = el('div', 'yr');
    this.counterWrap.append(st, this.yearBig);
    fp.appendChild(this.counterWrap);

    // foot: shown count + reset
    this.shownEl = el('div', 'foot');
    fp.appendChild(this.shownEl);
    const row = el('div', 'btn-row');
    row.append(button(T('reset'), () => this.resetAll(), 'sm ghost'), el('span', 'foot', T('sourceStars')));
    fp.appendChild(row);
    this.addUI(fp);

    // stats (bottom left)
    this.statsPanel = panel({ cls: 'xo-stats', pos: 'bl' });
    this.statsPanel.append(...statTiles(this.stats, ['total', 'hz', 'nearest', 'median']));
    this.statsPanel.appendChild(el('div', 'src', T('source', { updated: this.cat.updated })));
    this.addUI(this.statsPanel);

    // hud (bottom centre): hint · free-flight chip · home
    this.hudPanel = el('div', 'panel hud xo-hud pos-bc ia');
    this.hudText = el('span', '', T(matchMedia('(hover: none)').matches ? 'hintTouch' : 'hint'));
    this.flyChip = chip(T('freeflight'), false, (on) => this.setMode(on ? 'fly' : 'orbit'));
    const home = button(T('toSun'), () => this.flyHome(), 'sm ghost');
    this.hudPanel.append(this.hudText, el('span', 'sep'), this.flyChip, home);
    this.addUI(this.hudPanel);

    if (rm) this.idleSpin = false;
  }

  private renderResults(q: string): void {
    const T = (k: string) => t(`exoplanets.${k}`);
    const hits = searchSystems(this.cat, q, 8);
    this.results.replaceChildren();
    if (!q.trim()) { this.results.hidden = true; return; }
    if (!hits.length) { this.results.appendChild(el('div', 'empty', T('noResults'))); this.results.hidden = false; return; }
    for (const h of hits) {
      const b = el('button');
      b.type = 'button';
      const name = el('span'); name.textContent = h.planet ? h.planet.p.name : h.sys.label;
      const meta = el('small'); meta.textContent = `${h.sys.planets.length === 1 ? T('planet1') : t('exoplanets.planetsN', { n: h.sys.planets.length })}${h.sys.dist != null ? ` · ${fmtDistancePc(h.sys.dist)}` : ''}`;
      b.append(name, meta);
      b.addEventListener('click', () => this.pickResult(h.sys));
      this.results.appendChild(b);
    }
    this.results.hidden = false;
  }
  private pickResult(sys: HostSystem): void {
    this.results.hidden = true;
    this.searchInput.value = sys.label;
    this.searchInput.blur();
    this.selectHost(sys, true);
  }

  private resetAll(): void {
    this.stopPlay();
    this.filters = defaultFilters();
    for (const c of this.methodChips.values()) c.classList.add('on');
    for (const c of this.sizeChips.values()) c.classList.add('on');
    this.hzChip.classList.remove('on');
    this.distSlider.set(1); this.yearSlider.set(this.todayYear);
    this.setYear(this.todayYear + 1);
    this.applyFilters();
    this.closeCard();
    this.flyHome();
  }

  // -----------------------------------------------------------------------------------------------
  // filters / year playback
  // -----------------------------------------------------------------------------------------------
  private applyFilters(): void {
    const hosts = this.cat.hosts, vis = this.hosts.vis, yr = this.hosts.year;
    const ts: number[] = [];
    let shownHosts = 0;
    for (let i = 0; i < hosts.length; i++) {
      const h = hosts[i];
      let first = Infinity;
      for (const v of h.planets) if (passes(v, this.filters)) { ts.push(v.t); if (v.t < first) first = v.t; }
      const on = first !== Infinity && h.xyz != null;
      vis[i] = on ? 1 : 0;
      yr[i] = first === Infinity ? 1e9 : first;
      if (on) shownHosts++;
    }
    this.hosts.commit();
    ts.sort((a, b) => a - b);
    this.ts = Float64Array.from(ts);
    this.lastCount = -1;
    this.updateCounter();
    this.updateHostLabels();
    this.shownEl.textContent = t('exoplanets.shown', { n: fmtNum(ts.length), total: fmtNum(this.stats.total), hosts: fmtNum(shownHosts) });
  }

  private setYear(v: number): void {
    this.yearValue = v;
    this.hosts.setYear(v);
    this.updateCounter();
    this.updateHostLabels();
  }

  private updateCounter(): void {
    const n = countUpTo(this.ts, this.yearValue);
    if (n !== this.lastCount) { this.lastCount = n; this.counterEl.textContent = fmtNum(n); }
    const shown = this.yearValue > this.todayYear ? this.todayYear : Math.floor(this.yearValue);
    if (shown !== this.lastYearShown) {
      this.lastYearShown = shown;
      this.yearBig.innerHTML = `${shown}<small>${t('exoplanets.year')}</small>`;
      if (this.playTween) this.yearSlider.set(Math.min(shown, this.todayYear));
    }
  }

  private updateHostLabels(): void {
    const vis = this.hosts.vis, yr = this.hosts.year;
    for (const l of this.hostLabels) l.obj.visible = vis[l.sys.i] === 1 && yr[l.sys.i] <= this.yearValue;
  }

  private togglePlay(): void {
    if (this.playTween) { this.stopPlay(); return; }
    const end = this.todayYear + 1;
    const start = this.yearValue >= end ? YEAR_MIN : this.yearValue;
    const total = this.ctx.app.reducedMotion ? 10 : PLAY_SECONDS;
    const ms = total * 1000 * ((end - start) / (end - YEAR_MIN));
    this.playBtn.innerHTML = ICON_PAUSE; this.playBtn.title = t('exoplanets.pause');
    this.counterWrap.classList.add('hot');
    this.setYear(start);
    const h = this.playTween = tween(ms, (k) => this.setYear(lerp(start, end, k)), linear);
    void h.done.then(() => { if (this.playTween === h) { this.playTween = undefined; this.playBtn.innerHTML = ICON_PLAY; this.playBtn.title = t('exoplanets.play'); this.counterWrap.classList.remove('hot'); this.yearSlider.set(this.todayYear); } });
  }
  private stopPlay(): void {
    if (!this.playTween) return;
    const h = this.playTween; this.playTween = undefined; h.cancel();
    this.playBtn.innerHTML = ICON_PLAY; this.playBtn.title = t('exoplanets.play');
    this.counterWrap.classList.remove('hot');
    this.yearSlider.set(Math.min(Math.floor(this.yearValue), this.todayYear));
  }

  // -----------------------------------------------------------------------------------------------
  // views
  // -----------------------------------------------------------------------------------------------
  private setView(v: 'map' | 'charts'): void {
    if (v === this.view) return;
    this.view = v;
    const charts = v === 'charts';
    this.tabMap.classList.toggle('active', !charts); this.tabCharts.classList.toggle('active', charts);
    this.filtersPanel.hidden = charts; this.statsPanel.hidden = charts; this.hudPanel.hidden = charts;
    if (this.card) this.card.hidden = charts;
    if (charts) {
      this.setMode('orbit');
      this.rig.enabled = false;
      if (!this.charts) this.charts = new ChartsView(this.cat, this.stats, { openSystem: (sys) => this.selectHost(sys, true) });
      this.addUI(this.charts.el);
      this.charts.render();
    } else {
      this.charts?.el.remove();
      this.rig.enabled = true;
    }
    const d0 = this.hosts.points.material.uniforms.uDim.value as number, d1 = charts ? 0.3 : 1;
    const bgU = this.bg ? starUniforms(this.bg.material) : null;
    const a0 = bgU ? bgU.uAlpha.value : 0, a1 = charts ? 0.1 : 0.35;
    tween(this.ctx.app.reducedMotion ? 0 : 700, (k) => { this.hosts.setDim(lerp(d0, d1, k)); if (bgU) bgU.uAlpha.value = lerp(a0, a1, k); });
  }

  // -----------------------------------------------------------------------------------------------
  protected tick(dt: number): void {
    if (this.mode === 'fly') this.flight.update(dt);
    else {
      if (this.view === 'charts') { if (!this.ctx.app.reducedMotion) this.rig.theta += dt * 0.04; }
      else if (this.idleSpin) this.rig.theta += dt * 0.025;
      this.rig.update();
    }
  }

  protected teardown(): void {
    this.stopPlay();
    this.rig?.dispose();
    this.flight?.dispose();
    this.charts?.dispose();
    this.card?.remove();
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const ICON_FOLD = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 4h10M4 7h6M6 10h2"/></svg>';
