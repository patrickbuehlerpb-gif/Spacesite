import { t } from './i18n';

/** Create an element with class list and optional innerHTML. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export function button(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', `btn ia ${cls}`.trim());
  b.type = 'button';
  b.innerHTML = label;
  b.addEventListener('click', onClick);
  return b;
}

export function iconButton(svg: string, onClick: () => void, title = ''): HTMLButtonElement {
  const b = el('button', 'ibtn ia');
  b.type = 'button';
  b.innerHTML = svg;
  if (title) b.title = title;
  b.addEventListener('click', onClick);
  return b;
}

export interface PanelOpts { title?: string; cls?: string; pos?: 'tl' | 'tr' | 'bl' | 'br' | 'bc' | 'tc'; strong?: boolean; width?: string }
/** Glass panel. Interactive by default (.ia). */
export function panel(opts: PanelOpts = {}): HTMLDivElement {
  const p = el('div', `panel ia ${opts.strong ? 'strong' : ''} ${opts.pos ? `pos-${opts.pos}` : ''} ${opts.cls ?? ''}`.trim());
  p.style.padding = '14px 16px';
  if (opts.width) p.style.width = opts.width;
  if (opts.title) p.appendChild(el('div', 'panel-title', opts.title));
  return p;
}

export interface SliderOpts { min: number; max: number; step?: number; value: number; label: string; format?: (v: number) => string; onInput: (v: number) => void }
export function slider(o: SliderOpts): HTMLDivElement {
  const wrap = el('div', 'field ia');
  const lab = el('label');
  const val = el('span', 'val');
  const fmt = o.format ?? ((v: number) => String(v));
  lab.innerHTML = `${o.label} <span class="val"></span>`;
  lab.replaceChildren(document.createTextNode(o.label + ' '), val);
  val.textContent = fmt(o.value);
  const input = el('input');
  input.type = 'range';
  input.min = String(o.min); input.max = String(o.max); input.step = String(o.step ?? 'any'); input.value = String(o.value);
  input.addEventListener('input', () => { const v = Number(input.value); val.textContent = fmt(v); o.onInput(v); });
  wrap.append(lab, input);
  (wrap as HTMLDivElement & { set: (v: number) => void }).set = (v: number) => { input.value = String(v); val.textContent = fmt(v); };
  return wrap;
}

export function chip(label: string, on: boolean, onToggle: (on: boolean) => void): HTMLButtonElement {
  const c = el('button', `chip ia ${on ? 'on' : ''}`);
  c.type = 'button';
  c.innerHTML = `<span class="dot"></span>${label}`;
  c.addEventListener('click', () => { const now = !c.classList.contains('on'); c.classList.toggle('on', now); onToggle(now); });
  return c;
}

/** Big stat tile: number + label (+ optional sub-line). */
export function stat(n: string, label: string, sub = '', cls = ''): HTMLDivElement {
  const s = el('div', 'stat');
  s.innerHTML = `<div class="n ${cls}">${n}</div><div class="l">${label}</div>${sub ? `<div class="s">${sub}</div>` : ''}`;
  return s;
}

/** Key/value definition list. */
export function kv(rows: Array<[string, string]>): HTMLDListElement {
  const d = el('dl', 'kv');
  for (const [k, v] of rows) { d.appendChild(el('dt', '', k)); d.appendChild(el('dd', '', v)); }
  return d;
}

/** HUD strip: pass HTML segments; separators are inserted automatically. */
export function hud(segments: string[], pos: 'bc' | 'tc' = 'bc'): HTMLDivElement {
  const h = el('div', `panel hud pos-${pos}`);
  h.innerHTML = segments.map((s) => `<span>${s}</span>`).join('<span class="sep"></span>');
  return h;
}

export interface IntroOpts { kicker?: string; title: string; blurb: string; cta?: string; hint?: string; onStart?: () => void }
/**
 * Full-screen chapter intro card. Resolves when dismissed. Use `<em>` inside title for the gold italic accent.
 */
export function showIntro(root: HTMLElement, o: IntroOpts): Promise<void> {
  return new Promise((resolve) => {
    const wrap = el('div', 'intro ia');
    const card = el('div', 'intro-card');
    card.innerHTML = `${o.kicker ? `<div class="intro-kicker">${o.kicker}</div>` : ''}<h1 class="intro-title">${o.title}</h1><p class="intro-blurb">${o.blurb}</p>`;
    const btn = button(o.cta ?? t('ui.start'), () => close(), 'primary');
    card.appendChild(btn);
    if (o.hint) card.appendChild(el('div', 'intro-hint', o.hint));
    wrap.appendChild(card);
    root.appendChild(wrap);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    function close() {
      window.removeEventListener('keydown', onKey);
      wrap.classList.add('fade-out');
      setTimeout(() => wrap.remove(), 320);
      o.onStart?.();
      resolve();
    }
    btn.focus();
  });
}

/** Info card for a selected object; returns the element (already appended). */
export interface InfoCardOpts { title: string; sub?: string; rows?: Array<[string, string]>; html?: string; pos?: 'tl' | 'tr' | 'bl' | 'br'; onClose?: () => void; actions?: HTMLElement[] }
export function infoCard(root: HTMLElement, o: InfoCardOpts): HTMLDivElement {
  const card = panel({ cls: `info-card pos-${o.pos ?? 'tr'}`, strong: true });
  card.style.position = 'absolute';
  const close = iconButton(ICON_CLOSE, () => { card.remove(); o.onClose?.(); }, t('ui.close'));
  close.classList.add('close');
  card.appendChild(close);
  card.appendChild(el('h3', '', o.title));
  if (o.sub) card.appendChild(el('div', 'sub', o.sub));
  if (o.rows?.length) card.appendChild(kv(o.rows));
  if (o.html) card.appendChild(el('div', '', o.html));
  if (o.actions?.length) { const row = el('div', 'btn-row'); row.style.marginTop = '12px'; row.append(...o.actions); card.appendChild(row); }
  root.appendChild(card);
  return card;
}

let toastTimer = 0;
export function toast(root: HTMLElement, html: string, ms = 2600): void {
  root.querySelector('.toast')?.remove();
  const tt = el('div', 'panel toast', html);
  root.appendChild(tt);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => tt.remove(), ms);
}

export const ICON_CLOSE = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 2l10 10M12 2L2 12"/></svg>';
export const ICON_MENU = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 4h12M2 8h12M2 12h12"/></svg>';
export const ICON_PLAY = '<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M2 1l9 5-9 5z"/></svg>';
export const ICON_PAUSE = '<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M2 1h3v10H2zM7 1h3v10H7z"/></svg>';
export const ICON_SEARCH = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="6" cy="6" r="4"/><path d="M9.5 9.5L13 13"/></svg>';

/** Debounce helper for inputs. */
export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): (...a: A) => void {
  let h = 0;
  return (...a: A) => { clearTimeout(h); h = window.setTimeout(() => fn(...a), ms); };
}
