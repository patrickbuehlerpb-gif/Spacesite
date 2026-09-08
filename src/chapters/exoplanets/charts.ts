import { t } from '../../core/i18n';
import { el, button, panel, stat } from '../../core/ui';
import { fmtNum, fmtYears, LY_PER_PC } from '../../core/units';
import { METHODS, SIZES, type Catalog, type Stats, type HostSystem, type Method, type SizeClass, type PlanetView } from './systems';
import { METHOD_COLOR, SIZE_COLOR, markerPath, legendIcon, STROKE_SHAPE } from './palette';

/**
 * View B – the chart panel: stats row, period/mass scatter (hue × shape by method, click → system),
 * discoveries per year with milestones, method share and size-class share (stacked bars), each with a
 * hover tooltip and a table twin. All inline SVG built with the DOM API (names via textContent).
 */
const NS = 'http://www.w3.org/2000/svg';
function sv<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, text?: string): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  if (text != null) e.textContent = text;
  return e;
}
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
function decadeLabel(k: number): string {
  if (k >= -2 && k <= 3) return fmtNum(10 ** k, { maxDigits: Math.max(0, -k) });
  return `10${k < 0 ? '⁻' : ''}${String(Math.abs(k)).split('').map((d) => SUP[+d]).join('')}`;
}
function roundedTopBar(x: number, y: number, w: number, h: number, y0: number): string {
  const r = Math.min(3, w / 2, h);
  return `M${x},${y0}L${x},${y + r}Q${x},${y} ${x + r},${y}L${x + w - r},${y}Q${x + w},${y} ${x + w},${y + r}L${x + w},${y0}Z`;
}

const REFS: Array<{ key: string; period: number; massE: number; radiusE: number }> = [
  { key: 'refMercury', period: 87.97, massE: 0.0553, radiusE: 0.383 },
  { key: 'refEarth', period: 365.25, massE: 1, radiusE: 1 },
  { key: 'refNeptune', period: 60190, massE: 17.15, radiusE: 3.88 },
  { key: 'refJupiter', period: 4332.6, massE: 317.8, radiusE: 11.21 },
];
const MILESTONES = [1995, 2009, 2014, 2016, 2018, 2022];

export type StatKey = 'total' | 'hz' | 'nearest' | 'smallest' | 'largest' | 'earliest' | 'median' | 'hosts';

/** Stat tiles shared by the map view and the chart view. */
export function statTiles(s: Stats, keys: StatKey[]): HTMLElement[] {
  const T = (k: string, params?: Record<string, string | number>) => t(`exoplanets.${k}`, params);
  const out: HTMLElement[] = [];
  for (const k of keys) {
    switch (k) {
      case 'total': out.push(stat(fmtNum(s.total), T('stTotal'), `${fmtNum(s.hosts)} ${T('stHosts')}`)); break;
      case 'hz': out.push(stat(fmtNum(s.hz), T('stHz'), `${fmtNum((s.hz / Math.max(1, s.total)) * 100, { maxDigits: 1 })} %`)); break;
      case 'nearest': if (s.nearest) out.push(stat(`${fmtNum(s.nearest.p.dist! * LY_PER_PC, { maxDigits: 1 })}<small>${T('ly')}</small>`, T('stNearest'), s.nearest.p.name)); break;
      case 'smallest': if (s.smallest) out.push(stat(`${fmtNum(s.smallest.p.radiusE!, { maxDigits: 2 })}<small>R⊕</small>`, T('stSmallest'), s.smallest.p.name)); break;
      case 'largest': if (s.largest) out.push(stat(`${fmtNum(s.largest.p.radiusE!, { maxDigits: 0 })}<small>R⊕</small>`, T('stLargest'), s.largest.p.name)); break;
      case 'earliest': if (s.earliest) out.push(stat(String(s.earliest.p.year), T('stEarliest'), s.earliest.p.name)); break;
      case 'median': if (s.medianDistPc != null) out.push(stat(`${fmtNum(s.medianDistPc * LY_PER_PC, { digits: 0 })}<small>${T('ly')}</small>`, T('stMedian'), T('stMedianSub'))); break;
      case 'hosts': out.push(stat(fmtNum(s.hosts), T('stHosts'), `${fmtNum(s.multi)} ${T('stMulti')}`)); break;
    }
  }
  return out;
}

export interface ChartsCallbacks { openSystem(sys: HostSystem): void }

export class ChartsView {
  readonly el: HTMLDivElement;
  private grid: HTMLDivElement;
  private tip: HTMLDivElement;
  private quantity: 'mass' | 'radius' = 'mass';
  private focus: Method | null = null;
  private figs: { scatter: HTMLDivElement; years: HTMLDivElement; share: HTMLDivElement; size: HTMLDivElement };
  private tables = { years: false, share: false, size: false };
  private ro?: ResizeObserver;
  private roTimer = 0;
  private lastW = 0;

  constructor(private cat: Catalog, private stats: Stats, private cb: ChartsCallbacks) {
    const T = (k: string, params?: Record<string, string | number>) => t(`exoplanets.${k}`, params);
    this.el = panel({ cls: 'xo-charts', strong: true });
    const head = el('div', 'head');
    const ht = el('div');
    ht.append(el('h2', '', T('chartsTitle')), el('p', '', T('chartsSub')));
    head.append(ht, el('div', 'src', T('source', { updated: cat.updated })));
    const statrow = el('div', 'statrow');
    statrow.append(...statTiles(stats, ['total', 'hz', 'nearest', 'smallest', 'largest', 'earliest', 'median']));
    this.grid = el('div', 'grid');
    this.figs = { scatter: el('div', 'fig wide'), years: el('div', 'fig wide'), share: el('div', 'fig'), size: el('div', 'fig') };
    this.grid.append(this.figs.scatter, this.figs.years, this.figs.share, this.figs.size);
    this.tip = el('div', 'panel strong xo-tip');
    this.tip.hidden = true;
    this.el.append(head, statrow, this.grid, this.tip);
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => {
        clearTimeout(this.roTimer);
        this.roTimer = window.setTimeout(() => { if (this.grid.clientWidth && Math.abs(this.grid.clientWidth - this.lastW) > 8) this.render(); }, 150);
      });
      this.ro.observe(this.el);
    }
  }

  dispose(): void { this.ro?.disconnect(); clearTimeout(this.roTimer); }

  /** (Re)build every figure at the current width. Call after the panel is visible. */
  render(): void {
    if (!this.grid.clientWidth) return;
    this.lastW = this.grid.clientWidth;
    this.renderScatter();
    this.renderYears();
    this.renderShare('share');
    this.renderShare('size');
  }

  private figWidth(fig: HTMLElement): number { return Math.max(240, fig.clientWidth - 32); }

  private head(fig: HTMLElement, title: string, sub: string, controls?: HTMLElement): void {
    fig.replaceChildren();
    const fh = el('div', 'fhead');
    const tt = el('div');
    tt.append(el('h4', '', title), el('div', 'sub', sub));
    fh.appendChild(tt);
    if (controls) fh.appendChild(controls);
    fig.appendChild(fh);
  }

  private seg(options: Array<[string, string]>, active: string, onPick: (v: string) => void): HTMLElement {
    const s = el('div', 'seg ia');
    for (const [v, label] of options) {
      const b = button(label, () => onPick(v), `sm ${v === active ? 'active' : ''}`);
      s.appendChild(b);
    }
    return s;
  }

  private showTip(x: number, y: number, build: (tip: HTMLElement) => void): void {
    const tip = this.tip;
    tip.replaceChildren();
    build(tip);
    tip.hidden = false;
    const r = this.el.getBoundingClientRect();
    let left = x - r.left + this.el.scrollLeft + 14, top = y - r.top + this.el.scrollTop + 14;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    if (left + w > this.el.scrollLeft + this.el.clientWidth - 8) left = x - r.left + this.el.scrollLeft - w - 14;
    if (top + h > this.el.scrollTop + this.el.clientHeight - 8) top = y - r.top + this.el.scrollTop - h - 14;
    tip.style.left = `${Math.max(4, left)}px`; tip.style.top = `${Math.max(4, top)}px`;
  }
  private hideTip(): void { this.tip.hidden = true; }
  private tipRow(tip: HTMLElement, k: string, v: string): void { const r = el('div', 'row'); r.append(el('span', '', k), el('span', '', v)); tip.appendChild(r); }

  // ------------------------------------------------------------------------------------ scatter
  private renderScatter(): void {
    const T = (k: string, params?: Record<string, string | number>) => t(`exoplanets.${k}`, params);
    const fig = this.figs.scatter;
    const byMass = this.quantity === 'mass';
    const ctrl = this.seg([['mass', T('toggleMass')], ['radius', T('toggleRadius')]], this.quantity, (v) => { this.quantity = v as 'mass' | 'radius'; this.renderScatter(); });
    this.head(fig, byMass ? T('scatterTitle') : T('scatterTitleR'), T('scatterSub'), ctrl);

    const data = this.cat.planets.filter((v) => v.p.period != null && v.p.period > 0 && (byMass ? v.p.massE != null && v.p.massE > 0 : v.p.radiusE != null && v.p.radiusE > 0));
    const W = this.figWidth(fig), H = W < 520 ? 330 : 430;
    const ml = 56, mr = 18, mt = 14, mb = 44;
    const pw = W - ml - mr, ph = H - mt - mb;
    const xs = data.map((v) => Math.log10(v.p.period!)), ys = data.map((v) => Math.log10(byMass ? v.p.massE! : v.p.radiusE!));
    const xlo = Math.floor(Math.min(...xs)), xhi = Math.ceil(Math.max(...xs));
    const ylo = Math.floor(Math.min(...ys)), yhi = Math.ceil(Math.max(...ys));
    const X = (lx: number) => ml + ((lx - xlo) / (xhi - xlo)) * pw;
    const Y = (ly: number) => mt + ph - ((ly - ylo) / (yhi - ylo)) * ph;

    const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H });
    // grid + ticks
    for (let k = xlo; k <= xhi; k++) {
      const x = X(k);
      svg.appendChild(sv('line', { class: 'grid', x1: x, y1: mt, x2: x, y2: mt + ph }));
      svg.appendChild(sv('text', { class: 'tick', x, y: mt + ph + 16, 'text-anchor': 'middle' }, decadeLabel(k)));
    }
    for (let k = ylo; k <= yhi; k++) {
      const y = Y(k);
      svg.appendChild(sv('line', { class: 'grid', x1: ml, y1: y, x2: ml + pw, y2: y }));
      svg.appendChild(sv('text', { class: 'tick', x: ml - 8, y: y + 4, 'text-anchor': 'end' }, decadeLabel(k)));
    }
    svg.appendChild(sv('line', { class: 'axis', x1: ml, y1: mt + ph, x2: ml + pw, y2: mt + ph }));
    svg.appendChild(sv('line', { class: 'axis', x1: ml, y1: mt, x2: ml, y2: mt + ph }));
    svg.appendChild(sv('text', { class: 'alab', x: ml + pw, y: H - 6, 'text-anchor': 'end' }, T('axisPeriod')));
    const yl = sv('text', { class: 'alab', x: 0, y: 0, 'text-anchor': 'end', transform: `translate(12 ${mt}) rotate(-90)` }, byMass ? T('axisMass') : T('axisRadius'));
    svg.appendChild(yl);

    // dots
    const g = sv('g');
    const px = new Float32Array(data.length), py = new Float32Array(data.length);
    const nodes: SVGElement[] = [];
    const r = 3.2;
    data.forEach((v, i) => {
      const x = X(xs[i]), y = Y(ys[i]);
      px[i] = x; py[i] = y;
      const m = v.group;
      const attrs: Record<string, string | number> = { class: `dot m-${m}${this.focus && this.focus !== m ? ' off' : ''}`, d: markerPath(m, x, y, r), opacity: 0.85 };
      if (STROKE_SHAPE[m]) { attrs.fill = 'none'; attrs.stroke = METHOD_COLOR[m]; attrs['stroke-width'] = 1.4; }
      else attrs.fill = METHOD_COLOR[m];
      const n = sv('path', attrs);
      nodes.push(n); g.appendChild(n);
    });
    svg.appendChild(g);
    // reference bodies
    for (const ref of REFS) {
      const x = X(Math.log10(ref.period)), y = Y(Math.log10(byMass ? ref.massE : ref.radiusE));
      svg.appendChild(sv('circle', { class: 'ref', cx: x, cy: y, r: 6.5 }));
      svg.appendChild(sv('line', { class: 'ref', x1: x - 10, y1: y, x2: x + 10, y2: y }));
      svg.appendChild(sv('line', { class: 'ref', x1: x, y1: y - 10, x2: x, y2: y + 10 }));
      svg.appendChild(sv('text', { class: 'reflab', x: x + 10, y: y - 8 }, T(ref.key)));
    }
    const wrap = el('div', 'wrap ia');
    wrap.appendChild(svg);
    fig.appendChild(wrap);

    // legend (hue × shape, click = emphasis)
    const legend = el('div', 'legend ia');
    const counts = new Map<Method, number>();
    for (const v of data) counts.set(v.group, (counts.get(v.group) ?? 0) + 1);
    const lgs: HTMLButtonElement[] = [];
    for (const m of METHODS) {
      const b = el('button', `lg${this.focus === m ? ' on' : this.focus ? ' dim' : ''}`);
      b.type = 'button';
      b.innerHTML = `${legendIcon(m)}<span>${T(`m.${m}`)}</span><b>${fmtNum(counts.get(m) ?? 0)}</b>`;
      b.addEventListener('click', () => {
        this.focus = this.focus === m ? null : m;
        lgs.forEach((x, k) => { x.classList.toggle('on', this.focus === METHODS[k]); x.classList.toggle('dim', !!this.focus && this.focus !== METHODS[k]); });
        data.forEach((v, i) => nodes[i].classList.toggle('off', !!this.focus && this.focus !== v.group));
      });
      lgs.push(b); legend.appendChild(b);
    }
    legend.appendChild(el('span', 'hint', T('legendHint')));
    fig.appendChild(legend);
    fig.appendChild(el('div', 'fsrc', `${T('scatterCount', { n: fmtNum(data.length), q: byMass ? T('qMass') : T('qRadius') })} · ${T('sourceShort')}`));

    // nearest-point hover / click
    let hot = -1;
    const nearest = (ev: PointerEvent): number => {
      const rect = svg.getBoundingClientRect();
      const sx = (ev.clientX - rect.left) * (W / rect.width), sy = (ev.clientY - rect.top) * (H / rect.height);
      let best = -1, bd = 18 * 18;
      for (let i = 0; i < data.length; i++) {
        if (this.focus && data[i].group !== this.focus) continue;
        const dx = px[i] - sx, dy = py[i] - sy, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    };
    const setHot = (i: number) => {
      if (hot >= 0) nodes[hot].classList.remove('hot');
      hot = i;
      if (i >= 0) { nodes[i].classList.add('hot'); svg.appendChild(g.removeChild(nodes[i]) && nodes[i]); g.appendChild(nodes[i]); }
    };
    const onMove = (ev: PointerEvent) => {
      const i = nearest(ev);
      if (i !== hot) setHot(i);
      if (i < 0) { this.hideTip(); svg.style.cursor = ''; return; }
      svg.style.cursor = 'pointer';
      const v: PlanetView = data[i];
      this.showTip(ev.clientX, ev.clientY, (tip) => {
        const b = el('b'); b.textContent = v.p.name; tip.appendChild(b);
        this.tipRow(tip, T('colPeriod'), fmtPeriod(v.p.period!));
        if (v.p.massE != null) this.tipRow(tip, T('colMass'), fmtMass(v.p.massE));
        if (v.p.radiusE != null) this.tipRow(tip, T('colRadius'), fmtRadius(v.p.radiusE));
        const mrow = el('div', 'row');
        const key = el('span'); key.innerHTML = `<i class="key" style="--c:${METHOD_COLOR[v.group]}"></i>${T(`m.${v.raw}`)}`;
        mrow.append(key, el('span', '', String(v.p.year ?? '–')));
        tip.appendChild(mrow);
        tip.appendChild(el('div', 'cta', T('clickForSystem')));
      });
    };
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerdown', onMove);
    svg.addEventListener('pointerleave', () => { setHot(-1); this.hideTip(); });
    svg.addEventListener('click', () => { if (hot >= 0) { this.hideTip(); this.cb.openSystem(data[hot].sys); } });
  }

  // ------------------------------------------------------------------------------------ per year
  private renderYears(): void {
    const T = (k: string, params?: Record<string, string | number>) => t(`exoplanets.${k}`, params);
    const fig = this.figs.years;
    const ctrl = this.seg([['chart', T('chartView')], ['table', T('tableView')]], this.tables.years ? 'table' : 'chart', (v) => { this.tables.years = v === 'table'; this.renderYears(); });
    this.head(fig, T('yearTitle'), T('yearSub'), ctrl);
    const y0 = 1989, y1 = this.cat.maxYear;
    const years: number[] = []; for (let y = y0; y <= y1; y++) years.push(y);
    const counts = years.map((y) => this.stats.perYear.get(y) ?? 0);
    const cum: number[] = []; let acc = 0; for (const c of counts) { acc += c; cum.push(acc); }

    if (this.tables.years) {
      const wrap = el('div', 'ftable');
      const sc = el('div', 'scroll');
      const tb = el('table', 'table');
      tb.innerHTML = `<thead><tr><th>${T('year')}</th><th class="num">${T('discoveries')}</th><th class="num">${T('cumulative')}</th></tr></thead>`;
      const body = el('tbody');
      years.forEach((y, i) => { const tr = el('tr'); tr.innerHTML = `<td>${y}${MILESTONES.includes(y) ? ` <span class="dim">· ${T(`msShort.${y}`)}</span>` : ''}</td><td class="num">${fmtNum(counts[i])}</td><td class="num">${fmtNum(cum[i])}</td>`; body.appendChild(tr); });
      tb.appendChild(body); sc.appendChild(tb); wrap.appendChild(sc); fig.appendChild(wrap);
      fig.appendChild(el('div', 'fsrc', T('source', { updated: this.cat.updated })));
      return;
    }

    const W = this.figWidth(fig), H = W < 520 ? 260 : 320;
    const ml = 46, mr = 12, mt = 64, mb = 30;
    const pw = W - ml - mr, ph = H - mt - mb;
    const max = Math.max(...counts);
    const step = max > 2000 ? 1000 : max > 800 ? 500 : max > 300 ? 200 : 100;
    const top = Math.ceil(max / step) * step;
    const slot = pw / years.length;
    const bw = Math.min(24, slot - 2);
    const X = (i: number) => ml + i * slot + (slot - bw) / 2;
    const Y = (v: number) => mt + ph - (v / top) * ph;
    const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H });
    for (let v = 0; v <= top; v += step) {
      svg.appendChild(sv('line', { class: v === 0 ? 'axis' : 'grid', x1: ml, y1: Y(v), x2: ml + pw, y2: Y(v) }));
      svg.appendChild(sv('text', { class: 'tick', x: ml - 8, y: Y(v) + 4, 'text-anchor': 'end' }, fmtNum(v)));
    }
    const bars: SVGElement[] = [];
    const labelEvery = slot < 22 ? 5 : slot < 34 ? 2 : 1;
    years.forEach((y, i) => {
      const h = (counts[i] / top) * ph;
      const p = sv('path', { class: 'bar', d: h > 0 ? roundedTopBar(X(i), Y(counts[i]), bw, h, Y(0)) : `M${X(i)},${Y(0)}h${bw}` });
      svg.appendChild(p); bars.push(p);
      if (y % labelEvery === 0 || i === years.length - 1) svg.appendChild(sv('text', { class: 'tick', x: X(i) + bw / 2, y: Y(0) + 16, 'text-anchor': 'middle' }, String(y)));
    });
    // selective direct labels: the two biggest years and the last one
    const order = counts.map((c, i) => i).sort((a, b) => counts[b] - counts[a]).slice(0, 2);
    for (const i of new Set([...order, years.length - 1])) if (counts[i] > 0) svg.appendChild(sv('text', { class: 'cap', x: X(i) + bw / 2, y: Y(counts[i]) - 5 }, fmtNum(counts[i])));
    // milestones, staggered in three rows above the plot
    MILESTONES.forEach((y, k) => {
      const i = years.indexOf(y); if (i < 0) return;
      const x = X(i) + bw / 2, row = k % 3, ly = 12 + row * 16;
      svg.appendChild(sv('line', { class: 'ms', x1: x, y1: ly + 4, x2: x, y2: Y(counts[i]) - (order.includes(i) || i === years.length - 1 ? 16 : 3) }));
      const nearRight = x > W - 110;
      svg.appendChild(sv('text', { class: 'mslab', x: nearRight ? x - 4 : x + 4, y: ly, 'text-anchor': nearRight ? 'end' : 'start' }, `${y} · ${T(`msShort.${y}`)}`));
    });
    // hit targets
    years.forEach((y, i) => {
      const hit = sv('rect', { class: 'hit', x: ml + i * slot, y: mt, width: slot, height: ph + mb });
      const show = (ev: PointerEvent) => {
        bars[i].classList.add('hot');
        this.showTip(ev.clientX, ev.clientY, (tip) => {
          tip.appendChild(el('b', '', String(y)));
          this.tipRow(tip, T('discoveries'), fmtNum(counts[i]));
          this.tipRow(tip, T('cumulative'), fmtNum(cum[i]));
          if (MILESTONES.includes(y)) tip.appendChild(el('div', 'cta', T(`ms.${y}`)));
        });
      };
      hit.addEventListener('pointerenter', show); hit.addEventListener('pointermove', show);
      hit.addEventListener('pointerleave', () => { bars[i].classList.remove('hot'); this.hideTip(); });
      svg.appendChild(hit);
    });
    const wrap = el('div', 'wrap ia'); wrap.appendChild(svg); fig.appendChild(wrap);
    fig.appendChild(el('div', 'fsrc', T('source', { updated: this.cat.updated })));
  }

  // ------------------------------------------------------------------------------------ shares
  private renderShare(kind: 'share' | 'size'): void {
    const T = (k: string, params?: Record<string, string | number>) => t(`exoplanets.${k}`, params);
    const fig = this.figs[kind];
    const isMethod = kind === 'share';
    const ctrl = this.seg([['chart', T('chartView')], ['table', T('tableView')]], this.tables[kind] ? 'table' : 'chart', (v) => { this.tables[kind] = v === 'table'; this.renderShare(kind); });
    this.head(fig, isMethod ? T('shareTitle') : T('sizeTitle'), isMethod ? T('shareSub') : T('sizeSub'), ctrl);
    const keys: string[] = isMethod ? METHODS : SIZES;
    const items = keys.map((k) => ({
      key: k,
      label: isMethod ? T(`m.${k}`) : T(`s.${k}`),
      extra: isMethod ? '' : T(`sRange.${k}`),
      color: isMethod ? METHOD_COLOR[k as Method] : SIZE_COLOR[k as SizeClass],
      n: isMethod ? (this.stats.perMethod.get(k as Method) ?? 0) : (this.stats.perSize.get(k as SizeClass) ?? 0),
    }));
    const total = items.reduce((a, b) => a + b.n, 0);
    const pct = (n: number) => `${fmtNum((n / Math.max(1, total)) * 100, { maxDigits: 1 })} %`;

    if (this.tables[kind]) {
      const wrap = el('div', 'ftable');
      const tb = el('table', 'table');
      tb.innerHTML = `<thead><tr><th>${isMethod ? T('method') : T('colClass')}</th><th class="num">${T('colCount')}</th><th class="num">${T('colShare')}</th></tr></thead>`;
      const body = el('tbody');
      for (const it of items) { const tr = el('tr'); tr.innerHTML = `<td><span class="sw" style="--c:${it.color}"></span>${it.label}${it.extra ? ` <span class="dim">${it.extra}</span>` : ''}</td><td class="num">${fmtNum(it.n)}</td><td class="num">${pct(it.n)}</td>`; body.appendChild(tr); }
      tb.appendChild(body); wrap.appendChild(tb); fig.appendChild(wrap);
      fig.appendChild(el('div', 'fsrc', T('source', { updated: this.cat.updated })));
      return;
    }

    const W = this.figWidth(fig), H = 44, bh = 22, gap = 2;
    const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H });
    let x = 0;
    const usable = W - gap * (items.filter((i) => i.n > 0).length - 1);
    for (const it of items) {
      if (!it.n) continue;
      const w = (it.n / total) * usable;
      const rect = sv('rect', { x, y: 8, width: Math.max(1, w), height: bh, rx: 2, fill: it.color });
      svg.appendChild(rect);
      const label = `${it.label} ${pct(it.n)}`;
      if (w > label.length * 6.6 + 14) svg.appendChild(sv('text', { class: 'inlab', x: x + 8, y: 8 + bh / 2 + 4, fill: isMethod && (it.key === 'transit' || it.key === 'microlensing') ? '#fff' : it.key === 'earth' || it.key === 'super' ? '#0b1020' : '#fff' }, label));
      const show = (ev: PointerEvent) => this.showTip(ev.clientX, ev.clientY, (tip) => {
        const b = el('b'); b.innerHTML = `<i class="key" style="--c:${it.color}"></i>`; b.append(document.createTextNode(it.label)); tip.appendChild(b);
        if (it.extra) tip.appendChild(el('div', 'row', `<span>${it.extra}</span>`));
        this.tipRow(tip, T('colCount'), fmtNum(it.n)); this.tipRow(tip, T('colShare'), pct(it.n));
      });
      rect.addEventListener('pointerenter', show); rect.addEventListener('pointermove', show);
      rect.addEventListener('pointerleave', () => this.hideTip());
      x += w + gap;
    }
    const wrap = el('div', 'wrap ia'); wrap.appendChild(svg); fig.appendChild(wrap);
    const legend = el('div', 'legend');
    for (const it of items) {
      const s = el('span', 'lg');
      s.innerHTML = `${isMethod ? legendIcon(it.key as Method) : `<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="1" y="1" width="10" height="10" rx="2" fill="${it.color}"/></svg>`}<span>${it.label}</span>${it.extra ? `<small>${it.extra}</small>` : ''}<b>${pct(it.n)}</b>`;
      legend.appendChild(s);
    }
    fig.appendChild(legend);
    fig.appendChild(el('div', 'fsrc', `${fmtNum(total)} ${T('stTotal').toLowerCase()} · ${T('sourceShort')}`));
  }
}

// ------------------------------------------------------------------------------------ formatters shared with the info card
export function fmtMass(massE: number): string {
  if (massE < 30) return `${fmtNum(massE, { maxDigits: massE < 10 ? 2 : 1 })} M⊕`;
  return `${fmtNum(massE / 317.8, { maxDigits: massE / 317.8 < 10 ? 2 : 1 })} M♃`;
}
export function fmtRadius(rE: number): string {
  if (rE < 6) return `${fmtNum(rE, { maxDigits: 2 })} R⊕`;
  return `${fmtNum(rE / 11.21, { maxDigits: 2 })} R♃`;
}
export function fmtPeriod(days: number): string {
  if (days < 1000) return `${fmtNum(days, { maxDigits: days < 10 ? 2 : 1 })} ${Math.abs(days - 1) < 1e-9 ? t('exoplanets.day1') : t('exoplanets.days')}`;
  return fmtYears(days / 365.25);
}
