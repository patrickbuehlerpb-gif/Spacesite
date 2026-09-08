/**
 * Cards computed entirely in the browser: the Moon today and deep-space distances ticking live.
 */
import { el, stat, kv } from '../../core/ui';
import { t, lang } from '../../core/i18n';
import { fmtNum, fmtLightTime, fmtYears, KM_PER_AU, C_KM_S } from '../../core/units';
import { julianDate, dateFromJD, moonPhase, moonGeocentric, bodyPosition, BODY_BY_ID, type BodyId } from '../../data/solarsystem';
import { livePanel, fmtDate, fmtDateTime } from './panelKit';
import { moonPhaseKey, nextMoonEvent, moonDiscDataUrl, moonSvg } from './moon';
import type { Widget } from './panels';

// ---------------------------------------------------------------------------------------------
// 8 · The Moon today
// ---------------------------------------------------------------------------------------------
export function moonPanel(): Widget {
  const p = livePanel({ key: 'moon', title: t('live.moon.title'), source: t('live.moon.source') });
  let disc: string | null = null;
  const fig = el('div', 'moon-fig');
  const facts = el('div', 'moon-facts');
  const body = el('div', 'moon');
  body.append(fig, facts);
  p.body.replaceChildren(body);
  p.el.querySelector('.lp-status')?.remove();

  function render(): void {
    const now = new Date();
    const jd = julianDate(now);
    const mp = moonPhase(jd);
    const key = moonPhaseKey(mp.phase);
    const m = moonGeocentric(jd);
    const distKm = Math.hypot(m.x, m.y, m.z);
    const ageDays = mp.phase * 29.530589;
    const nextNew = dateFromJD(nextMoonEvent(jd, 'new'));
    const nextFull = dateFromJD(nextMoonEvent(jd, 'full'));
    const daysTo = (d: Date) => Math.max(0, (d.getTime() - now.getTime()) / 86400e3);
    fig.innerHTML = `${moonSvg(mp.phase, disc, 168)}<div class="moon-name">${t(`live.moon.phase.${key}`)}</div><div class="moon-illum">${fmtNum(mp.illuminated * 100, { digits: 0 })} % ${t('live.moon.illum')}</div>`;
    facts.replaceChildren(kv([
      [t('live.moon.age'), t('live.moon.days', { n: fmtNum(ageDays, { digits: 1 }) })],
      [t('live.moon.dist'), `${fmtNum(distKm, { digits: 0 })} km`],
      [t('live.moon.light'), fmtLightTime(distKm / C_KM_S)],
      [t('live.moon.nextNew'), `${fmtDate(nextNew)} <span class="dim">· ${t('live.moon.inDays', { n: fmtNum(daysTo(nextNew), { digits: 1 }) })}</span>`],
      [t('live.moon.nextFull'), `${fmtDate(nextFull)} <span class="dim">· ${t('live.moon.inDays', { n: fmtNum(daysTo(nextFull), { digits: 1 }) })}</span>`],
    ]));
    facts.appendChild(el('p', 'lp-note', `${t('live.moon.view')} · ${t('live.moon.asOf', { t: fmtDateTime(now) })}`));
    p.ready(Date.now());
  }
  render();
  void moonDiscDataUrl(256).then((u) => { disc = u; render(); }).catch(() => { /* flat disc fallback stays */ });
  return { panel: p, refresh: async () => render(), every: 30 * 60e3 };
}

// ---------------------------------------------------------------------------------------------
// 9 · Deep space now
// ---------------------------------------------------------------------------------------------
const PROBES: Array<{ id: BodyId; launched: string }> = [
  { id: 'voyager1', launched: '1977-09-05' },
  { id: 'voyager2', launched: '1977-08-20' },
  { id: 'newhorizons', launched: '2006-01-19' },
];
const EPOCHS: Array<{ key: string; date: string }> = [
  { key: 'jwst', date: '2021-12-25T12:20:00Z' },
  { key: 'apollo', date: '1969-07-20T20:17:00Z' },
  { key: 'sputnik', date: '1957-10-04T19:28:00Z' },
];
const PROXIMA_LY = 4.2465, ANDROMEDA_LY = 2_537_000, MOON_LIGHT_S = 1.282;

export function deepPanel(): Widget {
  const p = livePanel({ key: 'deep', title: t('live.deep.title'), source: t('live.deep.source'), live: true });
  const body = el('div', 'deep');
  const probes = el('div', 'deep-probes');
  const slots: Array<{ id: BodyId; au: HTMLElement; km: HTMLElement; light: HTMLElement; sun: HTMLElement }> = [];
  for (const pr of PROBES) {
    const b = BODY_BY_ID[pr.id];
    const row = el('div', 'deep-probe');
    row.innerHTML = `<div class="deep-probe-head"><b>${lang() === 'de' ? b.name.de : b.name.en}</b><span class="dim">${t('live.deep.launched')} ${fmtDate(pr.launched)}</span></div>
      <div class="deep-probe-au"><span class="au"></span> <span class="unit">${t('live.unit.au')}</span> <span class="dim">${t('live.deep.fromEarth')}</span></div>
      <div class="deep-probe-sub"><span class="km"></span> km · <span class="light"></span> ${t('live.deep.light')} · <span class="sun"></span> ${t('live.unit.au')} ${t('live.deep.fromSun')}</div>`;
    slots.push({ id: pr.id, au: row.querySelector('.au')!, km: row.querySelector('.km')!, light: row.querySelector('.light')!, sun: row.querySelector('.sun')! });
    probes.appendChild(row);
  }
  body.appendChild(probes);

  const epochs = el('div', 'deep-epochs');
  const epochSlots: Array<{ date: number; n: HTMLElement }> = [];
  for (const e of EPOCHS) {
    const s = stat('0', `${t('live.deep.daysSince')} ${t(`live.deep.${e.key}`)}`, fmtDate(e.date));
    epochSlots.push({ date: Date.parse(e.date), n: s.querySelector('.n')! });
    epochs.appendChild(s);
  }
  body.appendChild(epochs);

  const light = el('div', 'deep-light');
  const sunLine = el('p');
  light.append(el('div', 'deep-light-title', t('live.deep.lightTitle')), sunLine,
    el('p', '', t('live.deep.lightMoon', { t: fmtLightTime(MOON_LIGHT_S) })),
    el('p', '', t('live.deep.lightProxima', { t: fmtYears(PROXIMA_LY) })),
    el('p', '', t('live.deep.lightAndromeda', { t: fmtYears(ANDROMEDA_LY) })));
  body.appendChild(light);
  p.body.replaceChildren(body);
  p.ready(Date.now());

  let lastSun = '';
  function second(): void {
    const now = Date.now();
    const jd = julianDate(new Date(now));
    const e = bodyPosition('earth', jd);
    for (const s of slots) {
      const q = bodyPosition(s.id, jd);
      const dE = Math.hypot(q.x - e.x, q.y - e.y, q.z - e.z);
      const dS = Math.hypot(q.x, q.y, q.z);
      s.au.textContent = fmtNum(dE, { digits: 3 });
      s.km.textContent = fmtNum(dE * KM_PER_AU, { digits: 0 });
      s.light.textContent = fmtLightTime(dE * KM_PER_AU / C_KM_S);
      s.sun.textContent = fmtNum(dS, { digits: 2 });
    }
    for (const s of epochSlots) s.n.textContent = fmtNum(Math.floor((now - s.date) / 86400e3), { digits: 0 });
    const sunS = Math.hypot(e.x, e.y, e.z) * KM_PER_AU / C_KM_S;
    const txt = t('live.deep.lightSun', { t: fmtLightTime(sunS) });
    if (txt !== lastSun) { sunLine.innerHTML = txt; lastSun = txt; }
  }
  second();
  return { panel: p, second };
}
