/**
 * The data-driven cards of the live dashboard. Each returns a Widget: the panel, an optional
 * refresh() (network) with its polling interval, and an optional second() tick for countdowns.
 * Every panel fails independently (loading → data / stale → offline with retry).
 */
import { el, button, stat, kv, chip, ICON_PLAY } from '../../core/ui';
import { t, lang } from '../../core/i18n';
import { fmtNum, clamp } from '../../core/units';
import {
  fetchAstronautsInSpace, fetchUpcomingLaunches, fetchSpaceWeather, kpLevel, fetchNeoFeed, fetchAPOD,
  sdoUrl, SDO_IMAGES, SEN_EMBED_URL, SEN_URL, nasaKey, setNasaKey,
  type Astronaut, type Launch, type SpaceWeather, type Neo, type Apod,
} from '../../live/api';
import { livePanel, showCard, collapsible, tag, splitCountdown, fmtCountdownShort, fmtDateTime, fmtDate, escapeHtml, type LivePanel } from './panelKit';

export interface Host {
  root: HTMLElement;
  toast(html: string): void;
  onPeople(n: number): void;
  refreshAll(): void;
  setAutoRotate(on: boolean): void;
  autoRotate: boolean;
}
export interface Widget { panel: LivePanel; refresh?: () => Promise<void>; every?: number; second?: () => void }

const MIN = 60e3;
const CD_LABELS = ['cd.d', 'cd.h', 'cd.min', 'cd.s'];

// ---------------------------------------------------------------------------------------------
// 1 · People in space
// ---------------------------------------------------------------------------------------------
function agencyShort(name: string): string {
  const m = name.match(/\(([A-Z]{3,12})\)/);
  if (m) return m[1];
  if (/National Aeronautics/i.test(name)) return 'NASA';
  if (/European Space/i.test(name)) return 'ESA';
  if (/Japan Aerospace/i.test(name)) return 'JAXA';
  if (/China National Space/i.test(name)) return 'CNSA';
  if (/Canadian Space/i.test(name)) return 'CSA';
  if (/Indian Space/i.test(name)) return 'ISRO';
  if (/Roscosmos|Russian/i.test(name)) return 'Roskosmos';
  return name.length > 22 ? name.split(' ').map((w) => w[0]).join('').toUpperCase() : name;
}
const isTiangong = (a: Astronaut) => /CNSA|China/i.test(a.agency);

export function crewPanel(host: Host): Widget {
  const p = livePanel({ key: 'crew', title: t('live.crew.title'), source: t('live.crew.source'), sourceUrl: 'https://thespacedevs.com/llapi', onRetry: () => void refresh() });
  async function refresh(): Promise<void> {
    if (p.state !== 'data') p.loading();
    try {
      const r = await fetchAstronautsInSpace();
      render(r.data);
      p.ready(r.at, r.stale);
      host.onPeople(r.data.length);
    } catch { if (p.state !== 'data') p.offline(); }
  }
  function render(list: Astronaut[]): void {
    const body = el('div');
    const top = el('div', 'crew-top');
    top.appendChild(stat(String(list.length), t('live.crew.now'), t('live.aboard')));
    body.appendChild(top);
    if (!list.length) body.appendChild(el('p', 'lp-note', t('live.crew.none')));
    const groups: Array<{ key: string; name: string; list: Astronaut[] }> = [
      { key: 'iss', name: t('live.crew.iss'), list: list.filter((a) => !isTiangong(a)) },
      { key: 'tiangong', name: t('live.crew.tiangong'), list: list.filter(isTiangong) },
    ];
    for (const g of groups) {
      if (!g.list.length) continue;
      const h = el('div', 'crew-group');
      h.innerHTML = `<span>${g.name}</span><b>${g.list.length}</b>`;
      body.appendChild(h);
      for (const a of g.list) {
        const row = el('button', 'crew-row ia');
        row.type = 'button';
        row.innerHTML = `<span class="crew-name">${escapeHtml(a.name)}</span><span class="crew-meta">${escapeHtml(agencyShort(a.agency))} · ${escapeHtml(a.nationality)}</span><span class="crew-nums">${a.flights} ${t('live.crew.flights')} · ${a.spacewalks} ${t('live.crew.evas')}</span>`;
        row.addEventListener('click', () => {
          showCard(host.root, {
            title: escapeHtml(a.name), sub: `${escapeHtml(agencyShort(a.agency))} · ${escapeHtml(a.nationality)}`,
            rows: [[t('live.crew.station'), g.name], [t('live.crew.flights'), String(a.flights)], [t('live.crew.evas'), String(a.spacewalks)], [t('live.crew.firstFlight'), a.firstFlight ? fmtDate(a.firstFlight) : '–']],
            html: `${a.bio ? `<p>${escapeHtml(a.bio.length > 420 ? `${a.bio.slice(0, 420)}…` : a.bio)}</p>` : ''}${a.wiki ? `<p><a href="${a.wiki}" target="_blank" rel="noopener">${t('live.crew.wiki')} ↗</a></p>` : ''}`,
          });
        });
        body.appendChild(row);
      }
    }
    body.appendChild(el('p', 'lp-note', t('live.crew.heuristic')));
    p.body.replaceChildren(body);
  }
  return { panel: p, refresh, every: 60 * MIN };
}

// ---------------------------------------------------------------------------------------------
// 2 · Next launches
// ---------------------------------------------------------------------------------------------
function statusTag(s: Launch['status']): HTMLElement {
  const a = s.abbrev.toLowerCase();
  if (a === 'go') return tag(t('live.launches.status.go'), 'green');
  if (a === 'tbc') return tag(t('live.launches.status.tbc'), 'gold');
  if (a === 'tbd') return tag(t('live.launches.status.tbd'), 'muted');
  if (a === 'hold') return tag(t('live.launches.status.hold'), 'rose');
  if (a === 'success') return tag(t('live.launches.status.success'), 'cyan');
  if (/fail/.test(a)) return tag(t('live.launches.status.failure'), 'rose');
  if (/flight/.test(a)) return tag(t('live.launches.status.inflight'), 'cyan');
  return tag(escapeHtml(s.name), 'muted');
}

export function launchesPanel(host: Host): Widget {
  const p = livePanel({ key: 'launches', title: t('live.launches.title'), source: t('live.launches.source'), sourceUrl: 'https://thespacedevs.com/llapi', wide: true, onRetry: () => void refresh() });
  let feat: { net: number; boxes: HTMLElement[]; sign: HTMLElement } | null = null;
  let rows: Array<{ net: number; el: HTMLElement; last: string }> = [];

  async function refresh(): Promise<void> {
    if (p.state !== 'data') p.loading();
    try {
      const r = await fetchUpcomingLaunches(8);
      render(r.data);
      p.ready(r.at, r.stale);
      second();
    } catch { if (p.state !== 'data') p.offline(); }
  }
  function second(): void {
    const now = Date.now();
    if (feat) {
      const c = splitCountdown(feat.net - now);
      const vals = [c.d, c.h, c.m, c.s];
      for (let i = 0; i < 4; i++) { const s = String(vals[i]).padStart(i ? 2 : 1, '0'); if (feat.boxes[i].textContent !== s) feat.boxes[i].textContent = s; }
      const sign = c.neg ? 'T+' : 'T−';
      if (feat.sign.textContent !== sign) feat.sign.textContent = sign;
    }
    for (const r of rows) {
      const s = fmtCountdownShort(r.net - now);
      if (s !== r.last) { r.el.textContent = s; r.last = s; }
    }
  }
  function openCard(l: Launch): void {
    showCard(host.root, {
      title: escapeHtml(l.name.split('|')[1]?.trim() || l.name), sub: escapeHtml(l.name.split('|')[0].trim()),
      rows: [[t('live.launches.provider'), escapeHtml(l.provider || '–')], [t('live.launches.rocket'), escapeHtml(l.rocket || '–')], [t('live.launches.pad'), escapeHtml([l.pad, l.location].filter(Boolean).join(' · ') || '–')], [t('live.launches.net'), fmtDateTime(l.net)], [t('live.launches.status'), escapeHtml(l.status.name)], ...(l.mission?.orbit ? [[t('live.launches.orbit'), escapeHtml(l.mission.orbit)] as [string, string]] : [])],
      html: `${l.mission?.description ? `<p>${escapeHtml(l.mission.description)}</p>` : ''}${l.status.description ? `<p class="dim">${escapeHtml(l.status.description)}</p>` : ''}${l.vidUrl ? `<p><a href="${l.vidUrl}" target="_blank" rel="noopener">${t('live.launches.webcast')} ↗</a></p>` : ''}`,
    });
  }
  function render(list: Launch[]): void {
    feat = null; rows = [];
    const body = el('div', 'launch-wrap');
    if (!list.length) { body.appendChild(el('p', 'lp-note', t('live.launches.none'))); p.body.replaceChildren(body); return; }
    const [first, ...rest] = list;
    const f = el('div', 'launch-feat');
    const kicker = el('div', 'launch-kicker');
    kicker.append(el('span', '', t('live.launches.next')), statusTag(first.status));
    const name = el('h3', 'launch-name', escapeHtml(first.name));
    const cd = el('div', 'cd');
    const sign = el('span', 'cd-sign', 'T−');
    cd.appendChild(sign);
    const boxes: HTMLElement[] = [];
    CD_LABELS.forEach((k) => {
      const b = el('div', 'cd-box');
      const n = el('b', '', '0'); boxes.push(n);
      b.append(n, el('span', '', t(`live.${k}`)));
      cd.appendChild(b);
    });
    feat = { net: Date.parse(first.net), boxes, sign };
    const meta = el('div', 'launch-meta');
    meta.innerHTML = `<b>${escapeHtml(first.provider)}</b> · ${escapeHtml(first.rocket)}<br>${escapeHtml([first.pad, first.location].filter(Boolean).join(' · '))}<br><span class="dim">${fmtDateTime(first.net)} · ${t('live.localTime')}</span>`;
    f.append(kicker, name, cd, meta);
    if (first.mission?.description) f.appendChild(collapsible(escapeHtml(first.mission.description), 2));
    const acts = el('div', 'btn-row');
    if (first.vidUrl) { const a = el('a', 'btn sm ia', `${ICON_PLAY} ${t('live.launches.webcast')}`); a.href = first.vidUrl; a.target = '_blank'; a.rel = 'noopener'; acts.appendChild(a); }
    acts.appendChild(button(t('live.details'), () => openCard(first), 'ghost sm'));
    f.appendChild(acts);
    body.appendChild(f);

    const listEl = el('div', 'launch-list');
    for (const l of rest) {
      const row = el('button', 'launch-row ia');
      row.type = 'button';
      const left = el('div', 'launch-row-main');
      left.innerHTML = `<span class="launch-row-name">${escapeHtml(l.name)}</span><span class="launch-row-sub">${escapeHtml(l.provider)} · ${escapeHtml(l.location || l.pad)} · ${fmtDateTime(l.net)}</span>`;
      const cdEl = el('span', 'launch-row-cd', '');
      row.append(left, cdEl, statusTag(l.status));
      row.addEventListener('click', () => openCard(l));
      listEl.appendChild(row);
      rows.push({ net: Date.parse(l.net), el: cdEl, last: '' });
    }
    body.appendChild(listEl);
    p.body.replaceChildren(body);
  }
  return { panel: p, refresh, every: 30 * MIN, second };
}

// ---------------------------------------------------------------------------------------------
// 3 · Space weather
// ---------------------------------------------------------------------------------------------
function kpColor(kp: number): string { return kpLevel(kp).color; }

function kpGauge(kp: number | null): string {
  const cx = 100, cy = 96, R = 76;
  const ang = (k: number) => ((135 + (k / 9) * 270) * Math.PI) / 180;
  const pt = (k: number, r = R) => [cx + r * Math.cos(ang(k)), cy + r * Math.sin(ang(k))] as const;
  const arc = (k0: number, k1: number, r = R) => {
    const [x0, y0] = pt(k0, r), [x1, y1] = pt(k1, r);
    return `M${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${k1 - k0 > 6 ? 1 : 0} 1 ${x1.toFixed(1)},${y1.toFixed(1)}`;
  };
  const v = kp === null ? 0 : clamp(kp, 0, 9);
  const col = kp === null ? 'var(--muted)' : kpColor(kp);
  let ticks = '';
  for (let k = 0; k <= 9; k++) {
    const [x0, y0] = pt(k, R - 10), [x1, y1] = pt(k, R - (k % 3 === 0 ? 18 : 14));
    ticks += `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="rgba(255,255,255,${k % 3 === 0 ? 0.35 : 0.16})" stroke-width="1"/>`;
    if (k % 3 === 0) { const [tx, ty] = pt(k, R - 28); ticks += `<text x="${tx.toFixed(1)}" y="${(ty + 3).toFixed(1)}" text-anchor="middle" font-size="9" fill="var(--muted)">${k}</text>`; }
  }
  const [nx, ny] = pt(v, R + 6);
  return `<svg class="kp-gauge" viewBox="0 0 200 165" role="img" aria-label="Kp ${kp ?? '–'}">
    <path d="${arc(0, 9)}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="10" stroke-linecap="round"/>
    <path d="${arc(0, 5)}" fill="none" stroke="rgba(139,233,168,0.18)" stroke-width="10" stroke-linecap="round"/>
    <path d="${arc(5, 9)}" fill="none" stroke="rgba(255,138,166,0.16)" stroke-width="10" stroke-linecap="round"/>
    ${kp !== null && v > 0.05 ? `<path d="${arc(0, v)}" fill="none" stroke="${col}" stroke-width="10" stroke-linecap="round"/>` : ''}
    ${ticks}
    ${kp !== null ? `<circle cx="${nx.toFixed(1)}" cy="${ny.toFixed(1)}" r="4.5" fill="${col}" stroke="var(--bg)" stroke-width="2"/>` : ''}
    <text x="100" y="92" text-anchor="middle" font-size="42" font-weight="700" fill="${col}" style="font-variant-numeric:tabular-nums;letter-spacing:-0.02em">${kp === null ? '–' : fmtNum(kp, { digits: 1 })}</text>
    <text x="100" y="112" text-anchor="middle" font-size="10" letter-spacing="2" fill="var(--muted)">KP</text>
    <text x="100" y="150" text-anchor="middle" font-size="12" fill="${col}">${kp === null ? '' : escapeHtml(lang() === 'de' ? kpLevel(kp).de : kpLevel(kp).en)}</text>
  </svg>`;
}

function kpSpark(hist: SpaceWeather['history']): string {
  const W = 300, H = 64, n = hist.length;
  if (n < 2) return '';
  const y = (k: number) => H - 4 - (clamp(k, 0, 9) / 9) * (H - 10);
  const x = (i: number) => (i / (n - 1)) * W;
  const pts = hist.map((h, i) => `${x(i).toFixed(1)},${y(h.kp).toFixed(1)}`).join(' ');
  const maxKp = Math.max(...hist.map((h) => h.kp));
  const col = kpColor(maxKp);
  return `<svg class="kp-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Kp 24h">
    <line x1="0" x2="${W}" y1="${y(5).toFixed(1)}" y2="${y(5).toFixed(1)}" stroke="rgba(255,138,166,0.35)" stroke-dasharray="3 4"/>
    <polygon points="0,${H} ${pts} ${W},${H}" fill="${col}" opacity="0.12"/>
    <polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

export function weatherPanel(): Widget {
  const p = livePanel({ key: 'weather', title: t('live.weather.title'), source: t('live.weather.source'), sourceUrl: 'https://www.swpc.noaa.gov', onRetry: () => void refresh() });
  async function refresh(): Promise<void> {
    if (p.state !== 'data') p.loading();
    try {
      const r = await fetchSpaceWeather();
      render(r.data);
      p.ready(r.at, r.stale);
    } catch { if (p.state !== 'data') p.offline(); }
  }
  function render(w: SpaceWeather): void {
    const body = el('div', 'wx');
    const top = el('div', 'wx-top');
    top.innerHTML = kpGauge(w.kp);
    const vals = el('div', 'wx-vals');
    const n = (v: number | null, unit: string, d = 0) => (v === null ? t('live.weather.na') : `${fmtNum(v, { digits: d })} ${unit}`);
    vals.appendChild(kv([
      [t('live.weather.wind'), n(w.windSpeed, 'km/s')],
      [t('live.weather.density'), n(w.windDensity, 'p/cm³', 1)],
      [`${t('live.weather.bz')}`, `<span style="color:${w.bz !== null && w.bz < -5 ? 'var(--rose)' : 'inherit'}">${n(w.bz, 'nT', 1)}</span>`],
      [t('live.weather.bt'), n(w.bt, 'nT', 1)],
      [t('live.weather.f107'), n(w.flux107, 'sfu')],
    ]));
    vals.appendChild(el('p', 'lp-note', `${t('live.weather.bz')}: ${t('live.weather.bzNote')} · ${t('live.weather.f107')}: ${t('live.weather.f107Note')}`));
    top.appendChild(vals);
    body.appendChild(top);
    if (w.history.length > 1) {
      const sp = el('div', 'wx-spark');
      sp.innerHTML = `<div class="wx-spark-title">${t('live.weather.last24')}</div>${kpSpark(w.history.slice(-48))}<div class="wx-spark-axis"><span>−24 h</span><span>Kp 5 = ${t('live.weather.storm')}</span><span>${t('ui.now')}</span></div>`;
      body.appendChild(sp);
    }
    body.appendChild(el('p', 'lp-explain', t('live.weather.kpExplain')));
    p.body.replaceChildren(body);
  }
  return { panel: p, refresh, every: 10 * MIN };
}

// ---------------------------------------------------------------------------------------------
// 4 · The Sun now (SDO)
// ---------------------------------------------------------------------------------------------
export function sunPanel(): Widget {
  const p = livePanel({ key: 'sun', title: t('live.sun.title'), source: t('live.sun.source'), sourceUrl: 'https://sdo.gsfc.nasa.gov/data/', live: true });
  const keys = Object.keys(SDO_IMAGES) as Array<keyof typeof SDO_IMAGES>;
  const labels: Record<keyof typeof SDO_IMAGES, string> = { aia171: 'AIA 171', aia304: 'AIA 304', aia193: 'AIA 193', hmi: 'HMI' };
  let active: keyof typeof SDO_IMAGES = 'aia171';
  const body = el('div', 'sun');
  const tabs = el('div', 'sun-tabs');
  const frame = el('div', 'sun-frame');
  const img = el('img', 'sun-img');
  img.alt = 'SDO';
  img.loading = 'lazy';
  img.decoding = 'async';
  const missing = el('div', 'sun-missing', t('live.sun.noimg'));
  missing.hidden = true;
  frame.append(img, missing);
  const cap = el('p', 'sun-cap');
  const btns = new Map<string, HTMLButtonElement>();
  const load = () => { missing.hidden = true; img.src = sdoUrl(active); img.dataset.k = active; };
  img.addEventListener('error', () => { missing.hidden = false; });
  img.addEventListener('load', () => { missing.hidden = true; p.ready(Date.now()); });
  for (const k of keys) {
    const b = button(labels[k], () => {
      active = k; btns.forEach((x, kk) => x.classList.toggle('active', kk === k));
      cap.innerHTML = t(`live.sun.${k}`); load();
    }, 'sm');
    btns.set(k, b); tabs.appendChild(b);
  }
  btns.get(active)!.classList.add('active');
  cap.innerHTML = t(`live.sun.${active}`);
  body.append(tabs, frame, cap, el('p', 'lp-note', t('live.sun.refresh')));
  p.body.replaceChildren(body);
  p.ready(Date.now());
  load();
  return { panel: p, refresh: async () => { load(); }, every: 15 * MIN };
}

// ---------------------------------------------------------------------------------------------
// 5 · Asteroids this week
// ---------------------------------------------------------------------------------------------
export function neoPanel(host: Host): Widget {
  const p = livePanel({ key: 'neo', title: t('live.neo.title'), source: t('live.neo.source'), sourceUrl: 'https://cneos.jpl.nasa.gov/ca/', wide: true, onRetry: () => void refresh() });
  async function refresh(): Promise<void> {
    if (p.state !== 'data') p.loading();
    try {
      const r = await fetchNeoFeed();
      render(r.data);
      p.ready(r.at, r.stale);
    } catch { if (p.state !== 'data') p.offline(); }
  }
  function render(list: Neo[]): void {
    const body = el('div');
    if (!list.length) { body.appendChild(el('p', 'lp-note', t('live.neo.none'))); p.body.replaceChildren(body); return; }
    const closest = list.reduce((a, b) => (b.missKm < a.missKm ? b : a));
    const head = el('div', 'neo-head');
    head.innerHTML = `<b>${t('live.neo.count', { n: list.length })}</b><span class="dim">${t('live.neo.ldNote')}</span>`;
    body.appendChild(head);
    const wrap = el('div', 'neo-scroll');
    const table = el('table', 'table neo-table');
    table.innerHTML = `<thead><tr><th>${t('live.neo.name')}</th><th>${t('live.neo.when')}</th><th>${t('live.neo.size')}</th><th>${t('live.neo.miss')}</th><th>${t('live.neo.speed')}</th><th></th></tr></thead>`;
    const tb = el('tbody');
    for (const n of list) {
      const tr = el('tr', `ia ${n === closest ? 'closest' : ''}`.trim());
      tr.tabIndex = 0;
      const sizeTxt = `${fmtNum(n.diameterMinM, { digits: 0 })}–${fmtNum(n.diameterMaxM, { digits: 0 })} m`;
      tr.innerHTML = `<td><a href="${n.url}" target="_blank" rel="noopener" class="neo-name">${escapeHtml(n.name)}</a></td>
        <td>${fmtDateTime(n.approachTime)}</td>
        <td>${sizeTxt}</td>
        <td><b>${fmtNum(n.missLunar, { digits: 1 })} ${t('live.neo.ld')}</b><span class="dim"> · ${fmtNum(n.missKm, { digits: 0, compact: true })} km</span></td>
        <td>${fmtNum(n.velocityKmS, { digits: 1 })} km/s</td>
        <td class="neo-tags"></td>`;
      const tags = tr.querySelector('.neo-tags') as HTMLElement;
      if (n === closest) tags.appendChild(tag(t('live.neo.closest'), 'gold'));
      if (n.hazardous) tags.appendChild(tag(t('live.neo.hazard'), 'rose'));
      const open = () => showCard(host.root, {
        title: escapeHtml(n.name), sub: n.hazardous ? t('live.neo.hazard') : t('live.neo.asteroid'),
        rows: [[t('live.neo.when'), fmtDateTime(n.approachTime)], [t('live.neo.diameter'), sizeTxt], [t('live.neo.miss'), `${fmtNum(n.missLunar, { digits: 2 })} ${t('live.neo.ld')}`], [t('live.neo.missKm'), `${fmtNum(n.missKm, { digits: 0 })} km`], [t('live.neo.speed'), `${fmtNum(n.velocityKmS, { digits: 2 })} km/s`], [t('live.neo.absMag'), `H = ${fmtNum(n.absMag, { digits: 1 })}`]],
        html: `<p>${n.hazardous ? t('live.neo.phaNote') : t('live.neo.safeNote')}</p><p><a href="${n.url}" target="_blank" rel="noopener">${t('live.neo.jpl')} ↗</a></p>`,
      });
      tr.addEventListener('click', (e) => { if ((e.target as HTMLElement).tagName !== 'A') open(); });
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
      tb.appendChild(tr);
    }
    table.appendChild(tb);
    wrap.appendChild(table);
    body.appendChild(wrap);
    body.appendChild(el('p', 'lp-note', nasaKey() === 'DEMO_KEY' ? t('live.neo.demo') : t('live.neo.ownKey')));
    p.body.replaceChildren(body);
  }
  return { panel: p, refresh, every: 6 * 60 * MIN };
}

// ---------------------------------------------------------------------------------------------
// 6 · Picture of the day
// ---------------------------------------------------------------------------------------------
export function apodPanel(): Widget {
  const p = livePanel({ key: 'apod', title: t('live.apod.title'), source: t('live.apod.source'), sourceUrl: 'https://apod.nasa.gov/apod/', onRetry: () => void refresh() });
  async function refresh(): Promise<void> {
    if (p.state !== 'data') p.loading();
    try {
      const r = await fetchAPOD();
      render(r.data);
      p.ready(r.at, r.stale);
    } catch { if (p.state !== 'data') p.offline(); }
  }
  function render(a: Apod): void {
    const body = el('div', 'apod');
    const link = el('a', 'apod-img ia');
    link.href = a.hdurl ?? a.url; link.target = '_blank'; link.rel = 'noopener';
    link.title = t('live.apod.openHd');
    const img = el('img');
    img.src = a.url; img.alt = escapeHtml(a.title); img.loading = 'lazy'; img.decoding = 'async';
    img.addEventListener('error', () => { link.classList.add('broken'); });
    link.appendChild(img);
    body.appendChild(link);
    body.appendChild(el('h3', 'apod-title', escapeHtml(a.title)));
    body.appendChild(el('div', 'apod-meta', `${fmtDate(a.date)}${a.copyright ? ` · ${t('live.apod.credit', { c: escapeHtml(a.copyright) })}` : ' · NASA'}`));
    if (a.mediaType === 'video') body.appendChild(el('p', 'lp-note', `${t('live.apod.video')} <a href="https://apod.nasa.gov/apod/" target="_blank" rel="noopener">apod.nasa.gov ↗</a>`));
    body.appendChild(collapsible(escapeHtml(a.explanation), 3));
    body.appendChild(el('p', 'lp-note', t('live.apod.enNote')));
    p.body.replaceChildren(body);
  }
  return { panel: p, refresh, every: 12 * 60 * MIN };
}

// ---------------------------------------------------------------------------------------------
// 7 · Live video of Earth (Sen)
// ---------------------------------------------------------------------------------------------
export function videoPanel(): Widget {
  const p = livePanel({ key: 'video', title: t('live.video.title'), source: t('live.video.credit'), sourceUrl: SEN_URL, live: true });
  const body = el('div', 'video');
  const frame = el('div', 'video-frame');
  const play = el('button', 'video-play ia');
  play.type = 'button';
  play.innerHTML = `<span class="video-play-icon">${ICON_PLAY}</span><span>${t('live.video.play')}</span>`;
  play.addEventListener('click', () => {
    const f = el('iframe');
    f.src = SEN_EMBED_URL;
    f.allow = 'autoplay; encrypted-media; picture-in-picture';
    f.loading = 'lazy';
    f.title = 'Sen – live Earth';
    f.setAttribute('allowfullscreen', '');
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.replaceChildren(f);
    frame.classList.add('on');
  });
  frame.appendChild(play);
  body.appendChild(frame);
  const note = el('p', 'lp-note');
  note.innerHTML = `${t('live.video.note')} <a href="${SEN_URL}" target="_blank" rel="noopener">${t('live.video.open')} ↗</a>`;
  body.appendChild(note);
  p.body.replaceChildren(body);
  p.ready(Date.now());
  return { panel: p };
}

// ---------------------------------------------------------------------------------------------
// 10 · Settings
// ---------------------------------------------------------------------------------------------
export function settingsPanel(host: Host): Widget {
  const p = livePanel({ key: 'settings', title: t('live.settings.title'), source: t('live.settings.source') });
  const body = el('div', 'settings');
  const field = el('div', 'field');
  const lab = el('label', '', t('live.settings.key'));
  lab.htmlFor = 'live-nasa-key';
  const row = el('div', 'settings-row');
  const input = el('input');
  input.type = 'text'; input.id = 'live-nasa-key'; input.placeholder = 'DEMO_KEY'; input.autocomplete = 'off'; input.spellcheck = false;
  input.className = 'ia';
  const cur = nasaKey();
  if (cur !== 'DEMO_KEY') input.value = cur;
  const save = button(t('live.settings.save'), () => {
    const v = input.value.trim();
    setNasaKey(v);
    host.toast(v ? t('live.settings.saved') : t('live.settings.removed'));
    host.refreshAll();
  }, 'primary sm');
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save.click(); });
  row.append(input, save);
  field.append(lab, row);
  body.appendChild(field);
  const note = el('p', 'lp-note');
  note.innerHTML = `${t('live.settings.keyNote')} <a href="https://api.nasa.gov" target="_blank" rel="noopener">${t('live.settings.getKey')} ↗</a>`;
  body.appendChild(note);
  const acts = el('div', 'btn-row settings-acts');
  acts.appendChild(button(t('live.settings.refreshAll'), () => { host.refreshAll(); host.toast(t('live.settings.refreshing')); }, 'sm'));
  acts.appendChild(chip(t('live.settings.autoRotate'), host.autoRotate, (on) => host.setAutoRotate(on)));
  body.appendChild(acts);
  body.appendChild(el('p', 'lp-note', t('live.settings.pollNote')));
  p.body.replaceChildren(body);
  p.ready(Date.now());
  p.el.querySelector('.lp-status')?.remove();
  return { panel: p };
}
