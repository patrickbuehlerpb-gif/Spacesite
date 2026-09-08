/**
 * Shared building blocks for the live dashboard cards: a panel with independent
 * loading → data → stale / offline states and a "Stand: vor 3 min" line, plus small formatters.
 */
import { el, button, infoCard, type InfoCardOpts } from '../../core/ui';
import { t, locale } from '../../core/i18n';
import { fmtNum } from '../../core/units';

/** Info card fixed to the viewport (the chapter root scrolls). Replaces any open card. */
export function showCard(root: HTMLElement, o: InfoCardOpts): HTMLDivElement {
  root.querySelectorAll('.info-card').forEach((c) => c.remove());
  const card = infoCard(root, o);
  card.style.position = 'fixed';
  card.style.zIndex = '6';
  card.classList.add('scroll');
  card.style.maxHeight = 'calc(100vh - var(--chrome-h) - 40px)';
  return card;
}

export type PanelState = 'loading' | 'data' | 'offline';

export interface LivePanel {
  el: HTMLDivElement;
  body: HTMLDivElement;
  state: PanelState;
  /** timestamp of the data currently shown (0 = none) */
  at: number;
  stale: boolean;
  loading(): void;
  ready(at: number, stale?: boolean): void;
  offline(): void;
  /** refresh the "as of" line (call once per second) */
  tick(): void;
}

export interface PanelOpts { key: string; title: string; source: string; sourceUrl?: string; wide?: boolean; onRetry?: () => void; live?: boolean }

export function livePanel(o: PanelOpts): LivePanel {
  const root = el('div', `panel lp lp-${o.key} ${o.wide ? 'wide' : ''}`.trim());
  root.id = `live-${o.key}`;
  const head = el('div', 'lp-head');
  const title = el('div', 'panel-title', o.title);
  const status = el('div', 'lp-status');
  const dot = el('span', 'lp-dot');
  const stand = el('span', 'lp-stand');
  const flag = el('span', 'lp-flag');
  status.append(dot, stand, flag);
  head.append(title, status);
  const body = el('div', 'lp-body');
  const foot = el('div', 'lp-foot');
  const src = el('span', 'lp-source');
  src.innerHTML = o.sourceUrl ? `${t('live.source', { src: '' })}<a href="${o.sourceUrl}" target="_blank" rel="noopener">${o.source}</a>` : t('live.source', { src: o.source });
  foot.appendChild(src);
  root.append(head, body, foot);

  let lastStand = '';
  const p: LivePanel = {
    el: root, body, state: 'loading', at: 0, stale: false,
    loading() {
      p.state = 'loading';
      root.dataset.state = 'loading';
      body.replaceChildren(skeleton());
      flag.textContent = ''; flag.className = 'lp-flag';
      stand.textContent = t('live.loading'); lastStand = '';
    },
    ready(at, stale = false) {
      p.state = 'data'; p.at = at; p.stale = stale;
      root.dataset.state = stale ? 'stale' : 'data';
      flag.textContent = stale ? t('live.stale') : '';
      flag.className = `lp-flag ${stale ? 'stale' : ''}`.trim();
      lastStand = ''; p.tick();
    },
    offline() {
      p.state = 'offline';
      root.dataset.state = 'offline';
      flag.textContent = t('live.offline'); flag.className = 'lp-flag off';
      stand.textContent = ''; lastStand = '';
      const wrap = el('div', 'lp-offline');
      wrap.appendChild(el('p', '', t('ui.offline')));
      if (o.onRetry) wrap.appendChild(button(t('live.retry'), () => o.onRetry?.(), 'sm'));
      body.replaceChildren(wrap);
    },
    tick() {
      if (p.state !== 'data') return;
      const s = o.live && !p.stale ? t('live.live') : t('live.stand', { ago: timeAgo(p.at) });
      if (s !== lastStand) { stand.textContent = s; lastStand = s; }
    },
  };
  p.loading();
  return p;
}

function skeleton(): HTMLElement {
  const s = el('div', 'lp-skel');
  s.innerHTML = '<i style="width:62%"></i><i style="width:88%"></i><i style="width:74%"></i>';
  return s;
}

// ---------------------------------------------------------------------------------------------
// formatters
// ---------------------------------------------------------------------------------------------
export function timeAgo(at: number): string {
  const s = Math.max(0, (Date.now() - at) / 1000);
  if (s < 60) return t('live.justNow');
  if (s < 3600) return t('live.minAgo', { n: Math.floor(s / 60) });
  if (s < 86400) return t('live.hAgo', { n: Math.floor(s / 3600) });
  return t('live.dAgo', { n: Math.floor(s / 86400) });
}

let dtf: Intl.DateTimeFormat | null = null;
let df: Intl.DateTimeFormat | null = null;
let tf: Intl.DateTimeFormat | null = null;
/** "Mi., 9. Sep., 05:12" (local time). */
export function fmtDateTime(d: Date | string | number): string {
  dtf ??= new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return dtf.format(new Date(d));
}
/** "9. Sep. 2026" */
export function fmtDate(d: Date | string | number): string {
  df ??= new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
  return df.format(new Date(d));
}
/** "05:12" */
export function fmtTime(d: Date | string | number): string {
  tf ??= new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' });
  return tf.format(new Date(d));
}

export interface Countdown { neg: boolean; d: number; h: number; m: number; s: number }
export function splitCountdown(ms: number): Countdown {
  const neg = ms < 0;
  let s = Math.floor(Math.abs(ms) / 1000);
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  return { neg, d, h, m, s };
}
const two = (n: number) => String(n).padStart(2, '0');
/** Compact countdown: "6 d 19 h" · "14 h 03 min" · "12 min 05 s". */
export function fmtCountdownShort(ms: number): string {
  const c = splitCountdown(ms);
  const sign = c.neg ? 'T+ ' : '';
  if (c.d > 0) return `${sign}${c.d} d ${c.h} h`;
  if (c.h > 0) return `${sign}${c.h} h ${two(c.m)} min`;
  return `${sign}${c.m} min ${two(c.s)} s`;
}

/** Collapsible paragraph with a More/Less toggle. */
export function collapsible(html: string, lines = 3): HTMLElement {
  const wrap = el('div', 'lp-clamp');
  const p = el('p', '', html);
  p.style.setProperty('--lines', String(lines));
  const tog = button(t('live.more'), () => {
    const open = wrap.classList.toggle('open');
    tog.innerHTML = open ? t('live.less') : t('live.more');
  }, 'ghost sm');
  wrap.append(p, tog);
  return wrap;
}

/** Small coloured status chip (non-interactive). */
export function tag(label: string, tone: 'green' | 'gold' | 'rose' | 'cyan' | 'muted' = 'muted'): HTMLElement {
  return el('span', `lp-tag ${tone}`, label);
}

/** Lat/lon → "21,4° N · 45,1° W" */
export function fmtLatLon(lat: number, lon: number): string {
  const ns = lat >= 0 ? t('live.north') : t('live.south');
  const ew = lon >= 0 ? t('live.east') : t('live.west');
  return `${fmtNum(Math.abs(lat), { digits: 1 })}° ${ns} · ${fmtNum(Math.abs(lon), { digits: 1 })}° ${ew}`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
