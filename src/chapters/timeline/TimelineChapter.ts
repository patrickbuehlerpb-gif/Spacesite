import './strings';
import './style.css';
import { BaseChapter } from '../../core/BaseChapter';
import { t, pick, lang, locale } from '../../core/i18n';
import { el, panel, stat, kv, showIntro, iconButton, ICON_PLAY, ICON_PAUSE, ICON_CLOSE } from '../../core/ui';
import { tween, type TweenHandle } from '../../core/tween';
import { clamp, lerp, fmtNum, SEC_PER_YEAR } from '../../core/units';
import { loadStarCatalog } from '../../data/stars';
import { loadGalaxyCatalog } from '../../data/galaxies';
import { EVENTS, T0, T0_YR, type TlEvent, type EraId } from './events';
import {
  PAST_SHARE, moment, eventU, eventWhen, uFromPast, uFromFuture, temperatureK, radiusLy, cosmicCalendar, fmtCalDate, fmtCalTime,
  fmtSince, fmtAgo, fmtIn, fmtYearsBig, fmtTemp, fmtRadius, pow10, type Moment,
} from './model';
import { Backdrop } from './Backdrop';

/**
 * Chapter «Zeitreise»: one scrubbable axis from the Planck time to 10¹⁰⁰ years, 36 events with standard values,
 * cosmic calendar / temperature / size readouts and an era-driven shader backdrop (see Backdrop.ts, model.ts).
 * Axis mapping: see model.ts. Route param `#/zeit/<event id>` deep-links to an event (intro skipped).
 */
const PLAY_RATE = 0.02;        // axis units per second while playing
const DWELL_S = 3.2;           // pause at every event while playing
const SVG_NS = 'http://www.w3.org/2000/svg';
const AXIS_H = 76, BASE_Y = 44, PAD = 14;
const TONE: Record<EraId, string> = {
  plasma: 'hot', dark: 'dim', dawn: 'cool', galaxies: 'violet', solar: 'gold', life: 'gold', human: 'green', present: 'green',
  near: 'cool', collision: 'violet', sunend: 'rose', stelliferous: 'rose', degenerate: 'dim', blackhole: 'dim', dead: 'dim',
};

interface Tile { n: HTMLElement; l: HTMLElement; s: HTMLElement }
interface AxisLabel { u: number; text: string; prio: number }
interface DebugApi { set(id: string): number; setU(u: number): void; state(): Record<string, unknown>; events: string[] }
declare global { interface Window { __timeline?: DebugApi } }

const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, cls = ''): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  if (cls) e.setAttribute('class', cls);
  return e;
};
const isTyping = (e: KeyboardEvent): boolean => { const n = (e.target as HTMLElement | null)?.tagName; return n === 'INPUT' || n === 'TEXTAREA' || n === 'SELECT'; };

export default class TimelineChapter extends BaseChapter {
  readonly id = 'timeline';

  private backdrop?: Backdrop;
  private u = 0;
  private m: Moment = moment(0);
  private evU: number[] = [];
  private cardIdx = -1;
  private playing = false;
  private dwell = 0;
  private jump?: TweenHandle;
  /** event the last jump targeted (−1 after free scrubbing) – keyboard steps are relative to it, not to the tween */
  private jumpIdx = -1;
  private dirty = true;
  private last = { time: '', cal: '', temp: '', size: '' };

  // UI
  private tiles!: Record<'time' | 'cal' | 'temp' | 'size', Tile>;
  private card!: HTMLDivElement;
  private drawer!: HTMLDivElement;
  private items: HTMLButtonElement[] = [];
  private playBtn!: HTMLButtonElement;
  private wrap!: HTMLDivElement;
  private svg!: SVGSVGElement;
  private gBase!: SVGGElement;
  private gTicks!: SVGGElement;
  private head!: SVGGElement;
  private tickEls: SVGGElement[] = [];
  private hover!: HTMLDivElement;
  private axisW = 600;
  private ro?: ResizeObserver;
  private drag = { on: false, x0: 0, u0: 0 };

  // ---------------------------------------------------------------------------------------------
  protected async setup(): Promise<void> {
    this.root.classList.add('ch-timeline');
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(0, 0, -1);
    this.camera.near = 0.05; this.camera.far = 5000; this.camera.updateProjectionMatrix();

    this.backdrop = new Backdrop(this.scene);
    this.backdrop.resize(this.ctx.width, this.ctx.height);
    this.evU = EVENTS.map(eventU);
    for (let i = 1; i < this.evU.length; i++) if (this.evU[i] < this.evU[i - 1]) console.warn('timeline: events out of order at', EVENTS[i].id);

    this.buildUI();
    this.bindInput();
    this.exposeDebug();

    const start = this.ctx.param ? this.indexOf(this.ctx.param) : -1;
    this.setU(start >= 0 ? this.evU[start] : 0, true);

    // real catalogues: stars are needed from the Sun's birth onwards, galaxies from the cosmic dawn (fallback: stars only)
    const [stars, gal] = await Promise.all([loadStarCatalog(), loadGalaxyCatalog().catch(() => null)]);
    if (!this.mounted || !this.backdrop) return;
    this.backdrop.setStars(stars);
    if (gal) this.backdrop.setGalaxies(gal);
    this.backdrop.setMoment(this.m, true);

    if (start < 0) {
      void showIntro(this.root, { kicker: t('timeline.kicker'), title: t('chapter.timeline.title'), blurb: t('chapter.timeline.blurb'), hint: t('timeline.introHint') });
    }
  }

  protected tick(dt: number, elapsed: number): void {
    if (this.playing) this.advance(dt);
    this.backdrop?.update(dt, elapsed);
    if (this.dirty) { this.renderReadout(); this.dirty = false; }
  }

  resize(width: number, height: number): void {
    super.resize(width, height);
    this.backdrop?.resize(width, height);
  }

  protected teardown(): void {
    this.playing = false;
    this.jump?.cancel();
    this.ro?.disconnect();
    delete window.__timeline;
    this.ctx.renderer.domElement.style.cursor = '';
  }

  // ---------------------------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------------------------
  private indexOf(id: string): number { return EVENTS.findIndex((e) => e.id === id.toLowerCase()); }

  private setU(u: number, immediate = false): void {
    this.u = clamp(u, 0, 1);
    this.m = moment(this.u);
    this.backdrop?.setMoment(this.m, immediate);
    this.dirty = true;
    this.head.setAttribute('transform', `translate(${this.x(this.u).toFixed(1)} 0)`);
    const idx = this.nearest(this.u);
    if (idx !== this.cardIdx) this.showCard(idx);
  }

  private nearest(u: number): number {
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.evU.length; i++) { const d = Math.abs(this.evU[i] - u); if (d < bd) { bd = d; best = i; } }
    return best;
  }

  /** Animate to an event; updates the route param. */
  private jumpTo(i: number, immediate = false): void {
    i = clamp(i, 0, EVENTS.length - 1);
    this.stop();
    this.jump?.cancel();
    const u0 = this.u, u1 = this.evU[i];
    const ms = immediate || this.ctx.app.reducedMotion ? 0 : clamp(500 + 2400 * Math.abs(u1 - u0), 500, 1600);
    this.jumpIdx = i;
    this.jump = tween(ms, (k) => this.setU(lerp(u0, u1, k)));
    history.replaceState(null, '', `#/zeit/${EVENTS[i].id}`);
  }

  private step(dir: 1 | -1): void {
    // next/previous event relative to the current position (not the card): tolerate being "on" an event
    const eps = 1e-6;
    const ref = this.jumpIdx >= 0 ? this.evU[this.jumpIdx] : this.u;
    let target = -1;
    if (dir > 0) { for (let i = 0; i < this.evU.length; i++) if (this.evU[i] > ref + eps) { target = i; break; } }
    else { for (let i = this.evU.length - 1; i >= 0; i--) if (this.evU[i] < ref - eps) { target = i; break; } }
    if (target >= 0) this.jumpTo(target);
  }

  /** Snap to "today" or to an event tick when the pointer is released close to one. */
  private snap(): void {
    const px = this.x(this.u);
    let best = -1, bd = 7;
    for (let i = 0; i < this.evU.length; i++) { const d = Math.abs(this.x(this.evU[i]) - px); if (d < bd) { bd = d; best = i; } }
    if (best >= 0) { this.setU(this.evU[best]); this.jumpIdx = best; history.replaceState(null, '', `#/zeit/${EVENTS[best].id}`); }
  }

  // ---------------------------------------------------------------------------------------------
  // Autoplay
  // ---------------------------------------------------------------------------------------------
  private play(): void {
    this.jump?.cancel(); this.jumpIdx = -1;
    if (this.u >= 0.999) this.setU(0, true);
    this.playing = true; this.dwell = 0;
    this.playBtn.innerHTML = ICON_PAUSE; this.playBtn.title = t('timeline.pause'); this.playBtn.classList.add('on');
  }
  private stop(): void {
    if (!this.playing) return;
    this.playing = false;
    this.playBtn.innerHTML = ICON_PLAY; this.playBtn.title = t('timeline.play'); this.playBtn.classList.remove('on');
  }
  private advance(dt: number): void {
    if (this.dwell > 0) { this.dwell -= dt; return; }
    const u0 = this.u, u1 = u0 + PLAY_RATE * dt;
    for (let i = 0; i < this.evU.length; i++) {
      if (this.evU[i] > u0 + 1e-9 && this.evU[i] <= u1) {
        this.setU(this.evU[i]);
        this.dwell = DWELL_S;
        history.replaceState(null, '', `#/zeit/${EVENTS[i].id}`);
        return;
      }
    }
    if (u1 >= 1) { this.setU(1); this.stop(); return; }
    this.setU(u1);
  }

  // ---------------------------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------------------------
  private buildUI(): void {
    // top: big numbers
    const stats = panel({ cls: 'tl-stats' });
    const mk = (label: string, sub: string, cls = ''): Tile => {
      const s = stat('&nbsp;', label, '&nbsp;', cls);
      stats.appendChild(s);
      return { n: s.querySelector('.n') as HTMLElement, l: s.querySelector('.l') as HTMLElement, s: s.querySelector('.s') as HTMLElement };
    };
    const time = mk(t('timeline.sinceBB'), '');
    time.n.parentElement!.classList.add('big');
    this.tiles = { time, cal: mk(t('timeline.calendar'), ''), temp: mk(t('timeline.temp'), ''), size: mk(t('timeline.size'), '') };
    stats.appendChild(el('div', 'tl-src', t('timeline.src')));
    this.addUI(stats);

    // middle: event card
    this.card = panel({ cls: 'tl-card scroll' });
    this.addUI(this.card);

    // bottom: transport + axis
    const axis = panel({ cls: 'tl-axis' });
    const row = el('div', 'tl-row');
    const transport = el('div', 'tl-transport');
    const prev = iconButton('<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M10 1L2 6l8 5z"/><rect x="1" y="1" width="1.6" height="10"/></svg>', () => this.step(-1), t('timeline.prev'));
    this.playBtn = iconButton(ICON_PLAY, () => (this.playing ? this.stop() : this.play()), t('timeline.play'));
    this.playBtn.classList.add('play');
    const next = iconButton('<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M2 1l8 5-8 5z"/><rect x="9.4" y="1" width="1.6" height="10"/></svg>', () => this.step(1), t('timeline.next'));
    transport.append(prev, this.playBtn, next);
    this.wrap = el('div', 'tl-axis-wrap');
    this.svg = svgEl('svg', { height: AXIS_H }, 'tl-svg');
    this.gBase = svgEl('g'); this.gTicks = svgEl('g'); this.head = svgEl('g', {}, 'head');
    this.head.append(svgEl('line', { x1: 0, x2: 0, y1: BASE_Y - 20, y2: BASE_Y + 20 }), svgEl('polygon', { points: `-5,${BASE_Y - 26} 5,${BASE_Y - 26} 0,${BASE_Y - 19}` }));
    this.svg.append(this.gBase, this.gTicks, this.head);
    this.hover = el('div', 'panel tl-hover');
    this.hover.hidden = true;
    this.wrap.append(this.svg, this.hover);
    const evBtn = el('button', 'btn sm ia tl-events', `${t('timeline.events')} <b>${EVENTS.length}</b>`);
    evBtn.type = 'button';
    evBtn.addEventListener('click', () => this.toggleDrawer());
    row.append(transport, this.wrap, evBtn);
    axis.append(row, el('div', 'tl-axis-src', t('timeline.axisSrc')));
    this.addUI(axis);
    this.buildTicks();
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.wrap);
    this.layout();

    // right: event drawer
    this.drawer = panel({ cls: 'tl-drawer', strong: true });
    const head = el('div', 'head');
    head.append(el('div', 'panel-title', t('timeline.events')), iconButton(ICON_CLOSE, () => this.toggleDrawer(false), t('timeline.close')));
    const list = el('div', 'tl-list scroll');
    let group = '';
    EVENTS.forEach((e, i) => {
      if (e.kind !== group) { group = e.kind; list.appendChild(el('div', 'tl-group', t(e.kind === 'past' ? 'timeline.past' : 'timeline.future'))); }
      const b = el('button', 'tl-item ia', `<span class="tm">${eventWhen(e, true)}</span><span class="nm">${pick(e.title)}${e.hypothesis ? `<span class="hy">${lang() === 'de' ? 'Modell' : 'model'}</span>` : ''}</span>`);
      b.type = 'button';
      b.addEventListener('click', () => { this.jumpTo(i); if (matchMedia('(max-width: 720px)').matches) this.toggleDrawer(false); });
      list.appendChild(b);
      this.items.push(b);
    });
    this.drawer.append(head, list);
    this.addUI(this.drawer);
  }

  private toggleDrawer(open?: boolean): void {
    const on = open ?? !this.drawer.classList.contains('open');
    this.drawer.classList.toggle('open', on);
    if (on && this.cardIdx >= 0) this.items[this.cardIdx]?.scrollIntoView({ block: 'center' });
  }

  private buildTicks(): void {
    EVENTS.forEach((e, i) => {
      const g = svgEl('g', {}, `tick ${e.kind === 'future' ? 'fut' : ''} ${e.hypothesis ? 'hyp' : ''}`.trim());
      const title = svgEl('title');
      title.textContent = `${pick(e.title).replace(/<[^>]+>/g, '')} · ${eventWhen(e)}`;
      g.append(svgEl('line', { x1: 0, x2: 0, y1: BASE_Y, y2: BASE_Y }, 'stem'), svgEl('rect', { x: -8, y: BASE_Y - 18, width: 16, height: 36 }), svgEl('circle', { cx: 0, cy: BASE_Y, r: 3.5 }), title);
      g.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); this.jumpTo(i); });
      g.addEventListener('pointerenter', () => this.showHover(i));
      g.addEventListener('pointerleave', () => { this.hover.hidden = true; });
      this.gTicks.appendChild(g);
      this.tickEls.push(g);
    });
  }

  private showHover(i: number): void {
    const e = EVENTS[i];
    this.hover.innerHTML = `<b>${eventWhen(e)}</b>${pick(e.title)}`;
    this.hover.style.left = `${this.x(this.evU[i]).toFixed(1)}px`;
    this.hover.hidden = false;
  }

  private x(u: number): number { return PAD + u * (this.axisW - 2 * PAD); }
  private uFromClientX(cx: number): number {
    const r = this.svg.getBoundingClientRect();
    return clamp((cx - r.left - PAD) / Math.max(1, r.width - 2 * PAD), 0, 1);
  }

  /** (Re)build the static axis for the current width. */
  private layout(): void {
    const w = this.wrap.clientWidth;
    if (w < 40) return;
    this.axisW = w;
    this.svg.setAttribute('width', String(w));
    this.svg.setAttribute('viewBox', `0 0 ${w} ${AXIS_H}`);
    const xT = this.x(PAST_SHARE);
    const g = this.gBase;
    g.replaceChildren();
    g.append(
      svgEl('line', { x1: this.x(0), x2: xT, y1: BASE_Y, y2: BASE_Y }, 'base-past'),
      svgEl('line', { x1: xT, x2: this.x(1), y1: BASE_Y, y2: BASE_Y }, 'base-fut'),
      svgEl('line', { x1: xT, x2: xT, y1: BASE_Y - 18, y2: BASE_Y + 18 }, 'today-line'),
    );
    const text = (x: number, y: number, s: string, cls: string, anchor = 'middle') => {
      const e = svgEl('text', { x: x.toFixed(1), y, 'text-anchor': anchor }, cls);
      e.textContent = s;
      g.appendChild(e);
      return e;
    };
    text(this.x(0), 14, t('timeline.past').toUpperCase(), 'seg', 'start');
    text(xT, 14, t('timeline.today').toUpperCase(), 'seg today');
    text(this.x(1), 14, t('timeline.future').toUpperCase(), 'seg', 'end');

    // unit labels: greedy placement by priority, keeping clear of the edges and the "today" marker
    const placed: number[] = [xT];
    const gap = w < 520 ? 54 : 66;
    for (const l of this.axisLabels().sort((a, b) => a.prio - b.prio)) {
      const x = this.x(l.u);
      if (x < 24 || x > w - 24 || placed.some((p) => Math.abs(p - x) < gap)) continue;
      placed.push(x);
      g.appendChild(svgEl('line', { x1: x.toFixed(1), x2: x.toFixed(1), y1: BASE_Y - 4, y2: BASE_Y + 4 }, 'minor'));
      text(x, 66, l.text, 'unit');
    }
    // ticks: events closer than 9 px are staggered into three lanes (on / above / below the baseline)
    let lastX = -1e9, lane = 0;
    this.tickEls.forEach((el2, i) => {
      const x = this.x(this.evU[i]);
      lane = x - lastX < 9 ? (lane + 1) % 3 : 0;
      lastX = x;
      const cy = BASE_Y + (lane === 1 ? -11 : lane === 2 ? 11 : 0);
      el2.setAttribute('transform', `translate(${x.toFixed(1)} 0)`);
      el2.querySelector('circle')?.setAttribute('cy', String(cy));
      el2.querySelector('line')?.setAttribute('y2', String(cy));
    });
    this.head.setAttribute('transform', `translate(${this.x(this.u).toFixed(1)} 0)`);
  }

  private axisLabels(): AxisLabel[] {
    const de = lang() === 'de';
    const yr = t('timeline.yr');
    const yrs = (y: number): string => {
      if (y < 1e6) return `${fmtNum(y, { digits: 0 })} ${yr}`;
      if (y < 1e9) return `${fmtNum(y / 1e6, { maxDigits: 0 })} ${de ? 'Mio.' : 'M'} ${yr}`;
      if (y < 1e12) return `${fmtNum(y / 1e9, { maxDigits: 0 })} ${de ? 'Mrd.' : 'bn'} ${yr}`;
      return `${pow10(y)} ${yr}`;
    };
    const out: AxisLabel[] = [];
    const since: Array<[number, string, number]> = [[1e-40, `10⁻⁴⁰ s`, 3], [1e-30, `10⁻³⁰ s`, 1], [1e-20, `10⁻²⁰ s`, 2], [1e-10, `10⁻¹⁰ s`, 1], [1, '1 s', 1], [SEC_PER_YEAR, de ? '1 Jahr' : '1 yr', 2], [1e6 * SEC_PER_YEAR, yrs(1e6), 1], [1e9 * SEC_PER_YEAR, yrs(1e9), 1]];
    for (const [s, txt, prio] of since) out.push({ u: uFromPast(s), text: txt, prio });
    const ago: Array<[number, number]> = [[1e9, 1], [1e8, 3], [1e6, 1], [1e4, 1], [1e2, 2]];
    for (const [y, prio] of ago) out.push({ u: uFromPast(T0 - y * SEC_PER_YEAR), text: t('timeline.agoShort', { v: yrs(y) }), prio });
    const fut: Array<[number, number]> = [[1e2, 1], [1e4, 2], [1e6, 1], [1e9, 1], [1e12, 2], [1e15, 1], [1e20, 1], [1e30, 3], [1e40, 1], [1e60, 1], [1e80, 3], [1e100, 1]];
    for (const [y, prio] of fut) out.push({ u: uFromFuture(y), text: t('timeline.inShort', { v: yrs(y) }), prio });
    return out;
  }

  // ---------------------------------------------------------------------------------------------
  // Readouts
  // ---------------------------------------------------------------------------------------------
  private setTile(tile: Tile, key: keyof typeof this.last, n: string, l: string, s: string): void {
    const sig = `${n}|${l}|${s}`;
    if (this.last[key] === sig) return;
    this.last[key] = sig;
    tile.n.innerHTML = n; tile.l.textContent = l; tile.s.innerHTML = s;
  }

  private renderReadout(): void {
    const m = this.m;
    const de = lang() === 'de';
    // 1. time
    if (m.kind === 'today') {
      this.setTile(this.tiles.time, 'time', t('timeline.todayBig'), t('timeline.todaySub'), new Date().toLocaleDateString(locale(), { year: 'numeric', month: 'long', day: 'numeric' }));
    } else if (m.kind === 'past') {
      if (m.t < T0 / 2) this.setTile(this.tiles.time, 'time', fmtSince(m.t), t('timeline.sinceBB'), fmtAgo(m.ago));
      else this.setTile(this.tiles.time, 'time', fmtYearsBig(m.ago), t('timeline.beforeToday'), `${fmtYearsBig(m.t / SEC_PER_YEAR)} ${t('timeline.sinceBB')}`);
    } else {
      this.setTile(this.tiles.time, 'time', fmtYearsBig(m.yrs), t('timeline.fromNow'), `${fmtIn(m.yrs)} · ${de ? 'Alter' : 'age'} ${fmtYearsBig(T0_YR + m.yrs)}`);
    }
    // 2. cosmic calendar
    const c = cosmicCalendar(m);
    if (!c) this.setTile(this.tiles.cal, 'cal', '–', t('timeline.calendar'), t('timeline.calendarNone'));
    else if (m.kind === 'today') this.setTile(this.tiles.cal, 'cal', `${fmtCalDate(c)} <span class="tm">24:00</span>`, t('timeline.calendar'), `${t('timeline.calendarMidnight')} · ${t('timeline.calendarSub')}`);
    else this.setTile(this.tiles.cal, 'cal', `${fmtCalDate(c)} <span class="tm">${fmtCalTime(c)}</span>`, t('timeline.calendar'), c.year === 2 ? t('timeline.calendarYear2') : t('timeline.calendarSub'));
    // 3. temperature
    const T = temperatureK(m);
    this.setTile(this.tiles.temp, 'temp', T == null ? '–' : fmtTemp(T), t('timeline.temp'), T == null ? (m.kind === 'future' ? t('timeline.tempCold') : t('timeline.tempNone')) : t('timeline.tempSub'));
    // 4. size
    const R = radiusLy(m);
    this.setTile(this.tiles.size, 'size', R == null ? '–' : fmtRadius(R), t('timeline.size'), R == null ? t('timeline.sizeNone') : t('timeline.sizeSub'));
  }

  private showCard(i: number): void {
    const prev = this.cardIdx;
    this.cardIdx = i;
    const e = EVENTS[i];
    this.card.innerHTML = `<div class="tl-kicker"><span class="chip on tl-era" data-tone="${TONE[e.era]}"><span class="dot"></span>${t(`timeline.era.${e.era}`)}</span><span class="tl-when">${eventWhen(e)}</span></div>` +
      `<h2 class="tl-title">${pick(e.title)}</h2><p class="tl-text">${pick(e.text)}</p>`;
    this.card.appendChild(kv(pick(e.rows)));
    if (e.hypothesis) this.card.appendChild(el('div', 'tl-hyp', `<span class="dot"></span>${t('timeline.hypothesis')}`));
    this.card.appendChild(el('div', 'tl-src', `${t('timeline.source')}: ${pick(e.source)}`));
    this.card.scrollTop = 0;
    this.card.classList.remove('in');
    void this.card.offsetWidth;
    this.card.classList.add('in');
    if (prev >= 0) { this.tickEls[prev].classList.remove('on'); this.tickEls[prev].querySelector('circle')?.setAttribute('r', '3.5'); this.items[prev].classList.remove('on'); }
    this.tickEls[i].classList.add('on'); this.tickEls[i].querySelector('circle')?.setAttribute('r', '5'); this.items[i].classList.add('on');
    if (this.drawer.classList.contains('open')) this.items[i].scrollIntoView({ block: 'nearest' });
  }

  // ---------------------------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------------------------
  private bindInput(): void {
    // scrub on the axis
    const down = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      this.stop(); this.jump?.cancel(); this.jumpIdx = -1;
      this.drag = { on: true, x0: e.clientX, u0: this.u };
      this.wrap.setPointerCapture(e.pointerId);
      this.setU(this.uFromClientX(e.clientX));
    };
    const move = (e: PointerEvent) => { if (this.drag.on) this.setU(this.uFromClientX(e.clientX)); };
    const up = () => { if (!this.drag.on) return; this.drag.on = false; this.snap(); };
    this.wrap.addEventListener('pointerdown', down);
    this.wrap.addEventListener('pointermove', move);
    this.wrap.addEventListener('pointerup', up);
    this.wrap.addEventListener('pointercancel', up);

    // drag anywhere on the canvas = scrub (touch: one finger)
    const canvas = this.ctx.renderer.domElement;
    canvas.style.cursor = 'ew-resize';
    const cdown = (e: PointerEvent) => { if (e.button !== 0 && e.pointerType === 'mouse') return; this.stop(); this.jump?.cancel(); this.jumpIdx = -1; this.drag = { on: true, x0: e.clientX, u0: this.u }; canvas.setPointerCapture(e.pointerId); };
    const cmove = (e: PointerEvent) => { if (!this.drag.on) return; this.setU(this.drag.u0 + (e.clientX - this.drag.x0) / Math.max(1, this.axisW - 2 * PAD)); };
    canvas.addEventListener('pointerdown', cdown);
    canvas.addEventListener('pointermove', cmove);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);

    // wheel = scrub (except over scrollable panels)
    const wheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('.tl-drawer, .tl-card')) return;
      const d = (e.deltaY + e.deltaX) * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
      if (!d) return;
      this.stop(); this.jump?.cancel(); this.jumpIdx = -1;
      this.setU(this.u + d * 0.00025);
    };
    const key = (e: KeyboardEvent) => {
      if (isTyping(e) || this.root.querySelector('.intro:not(.fade-out)')) return;
      switch (e.key) {
        case 'ArrowRight': this.step(1); break;
        case 'ArrowLeft': this.step(-1); break;
        case ' ': e.preventDefault(); if (this.playing) this.stop(); else this.play(); break;
        case 'Home': this.jumpTo(0); break;
        case 'End': this.jumpTo(EVENTS.length - 1); break;
        case 'Escape': this.toggleDrawer(false); break;
        default: return;
      }
    };
    const onParam = (e: Event) => { const id = (e as CustomEvent<string | undefined>).detail; if (id) { const i = this.indexOf(id); if (i >= 0) this.jumpTo(i); } };
    window.addEventListener('wheel', wheel, { passive: true });
    window.addEventListener('keydown', key);
    this.ctx.ui.addEventListener('kosmos:param', onParam);
    this.onDispose(() => {
      canvas.removeEventListener('pointerdown', cdown); canvas.removeEventListener('pointermove', cmove);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up);
      window.removeEventListener('wheel', wheel); window.removeEventListener('keydown', key);
      this.ctx.ui.removeEventListener('kosmos:param', onParam);
    });
  }

  private exposeDebug(): void {
    window.__timeline = {
      set: (id) => { const i = this.indexOf(id); if (i >= 0) this.jumpTo(i, true); return i; },
      setU: (u) => { this.stop(); this.jump?.cancel(); this.jumpIdx = -1; this.setU(u, true); },
      events: EVENTS.map((e) => e.id),
      state: () => {
        const m = this.m, c = cosmicCalendar(m), T = temperatureK(m), R = radiusLy(m);
        return {
          u: m.u, kind: m.kind, t: m.t, ago: m.ago, yrs: m.yrs, card: EVENTS[this.cardIdx]?.id,
          calendar: c ? `${fmtCalDate(c)} ${fmtCalTime(c)}${c.year === 2 ? ' (year 2)' : ''}` : null,
          tempK: T, temp: T == null ? null : fmtTemp(T), radiusLy: R, radius: R == null ? null : fmtRadius(R),
          time: this.tiles.time.n.textContent, playing: this.playing,
        };
      },
    };
  }
}

export type { TlEvent };
