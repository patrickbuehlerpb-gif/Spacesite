import { t, locale } from '../../core/i18n';
import { el, panel, iconButton, ICON_PLAY, ICON_PAUSE, button } from '../../core/ui';
import { dateFromJD } from '../../data/solarsystem';

/** Time speeds in simulated days per real second. */
export const SPEEDS: Array<{ key: string; dps: number }> = [
  { key: 's', dps: 1 / 86400 },
  { key: 'min', dps: 1 / 1440 },
  { key: 'h', dps: 1 / 24 },
  { key: 'd', dps: 1 },
  { key: 'w', dps: 7 },
  { key: 'mo', dps: 30.436875 },
  { key: 'y', dps: 365.25 },
];

export interface TimePanelCallbacks {
  step(dir: -1 | 1): void;
  togglePlay(): void;
  now(): void;
  setSpeed(index: number): void;
  /** date from the date input (local midnight → we use 12:00 local) */
  setDate(d: Date, birthday: boolean): void;
}

const ICON_PREV = '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M2 2h2v10H2zM12 2L5 7l7 5z"/></svg>';
const ICON_NEXT = '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M10 2h2v10h-2zM2 2l7 5-7 5z"/></svg>';

/** Bottom-centre time control: big clock, transport, speed chips, date + birthday inputs. */
export class TimePanel {
  readonly el: HTMLDivElement;
  private dateEl: HTMLElement; private todEl: HTMLElement; private tzEl: HTMLElement;
  private playBtn: HTMLButtonElement; private chips: HTMLButtonElement[] = [];
  private dateInput: HTMLInputElement; private bdayInput: HTMLInputElement;
  private summaryEl: HTMLElement;
  private fmtDate = new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  private fmtTime = new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  private lastSecond = NaN; private lastPlaying?: boolean; private lastSpeed = -1;

  constructor(cb: TimePanelCallbacks, minIso: string, maxIso: string) {
    this.el = panel({ cls: 'ss-time', pos: 'bc' });
    this.el.setAttribute('role', 'group');
    this.el.setAttribute('aria-label', t('solarsystem.time'));

    // row 1: clock + transport
    const row1 = el('div', 'row');
    const clock = el('div', 'clock');
    this.dateEl = el('div', 'date'); this.todEl = el('div', 'tod'); this.tzEl = el('div', 'tz');
    clock.append(this.dateEl, this.todEl, this.tzEl);
    const transport = el('div', 'transport');
    const prev = iconButton(ICON_PREV, () => cb.step(-1), t('solarsystem.stepBack'));
    this.playBtn = iconButton(ICON_PLAY, () => cb.togglePlay(), t('solarsystem.play'));
    this.playBtn.classList.add('play');
    const next = iconButton(ICON_NEXT, () => cb.step(1), t('solarsystem.stepFwd'));
    const nowBtn = button(t('solarsystem.now'), () => cb.now(), 'sm');
    transport.append(prev, this.playBtn, next, nowBtn);
    row1.append(clock, transport);

    // row 2: speed chips
    const speeds = el('div', 'speeds');
    speeds.setAttribute('role', 'radiogroup');
    SPEEDS.forEach((s, i) => {
      const c = el('button', 'chip ia');
      c.type = 'button';
      c.setAttribute('role', 'radio');
      c.innerHTML = `<span class="dot"></span>${t(`solarsystem.speed.${s.key}`)}`;
      c.addEventListener('click', () => cb.setSpeed(i));
      speeds.appendChild(c); this.chips.push(c);
    });

    // row 3: date + birthday
    const inputs = el('div', 'inputs');
    const mkField = (label: string, id: string): [HTMLDivElement, HTMLInputElement, HTMLDivElement] => {
      const f = el('div', 'field ia');
      const lab = el('label', '', label); lab.htmlFor = id;
      const inp = el('input'); inp.type = 'date'; inp.id = id; inp.min = minIso; inp.max = maxIso;
      const wrap = el('div', 'in'); wrap.appendChild(inp);
      f.append(lab, wrap);
      return [f, inp, wrap];
    };
    const [dateField, dateInput] = mkField(t('solarsystem.date'), 'ss-date');
    this.dateInput = dateInput;
    dateInput.addEventListener('change', () => { const d = parseIso(dateInput.value); if (d) cb.setDate(d, false); });
    const [bdayField, bdayInput, bdayWrap] = mkField(t('solarsystem.birthday'), 'ss-bday');
    this.bdayInput = bdayInput;
    try { const saved = localStorage.getItem('kosmos.birthday'); if (saved) bdayInput.value = saved; } catch { /* ignore */ }
    const go = () => {
      const d = parseIso(bdayInput.value);
      if (!d) { bdayInput.focus(); return; }
      try { localStorage.setItem('kosmos.birthday', bdayInput.value); } catch { /* ignore */ }
      cb.setDate(d, true);
    };
    bdayInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    bdayWrap.appendChild(button(t('solarsystem.show'), go, 'sm primary'));
    inputs.append(dateField, bdayField);

    this.summaryEl = el('div', 'ss-summary');
    this.el.append(row1, speeds, inputs, this.summaryEl);
  }

  /** Cheap: only touches the DOM when the displayed second / state changes. */
  render(jd: number, playing: boolean, speedIdx: number): void {
    const sec = Math.floor(jd * 86400);
    if (sec !== this.lastSecond) {
      this.lastSecond = sec;
      const d = dateFromJD(jd);
      this.dateEl.textContent = this.fmtDate.format(d);
      this.todEl.textContent = this.fmtTime.format(d);
      if (!this.tzEl.textContent) this.tzEl.textContent = tzName(d);
      if (document.activeElement !== this.dateInput) {
        const iso = toIso(d);
        if (this.dateInput.value !== iso) this.dateInput.value = iso;
      }
    }
    if (playing !== this.lastPlaying) {
      this.lastPlaying = playing;
      this.playBtn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
      this.playBtn.title = playing ? t('solarsystem.pause') : t('solarsystem.play');
      this.playBtn.setAttribute('aria-label', this.playBtn.title);
    }
    if (speedIdx !== this.lastSpeed) {
      this.lastSpeed = speedIdx;
      this.chips.forEach((c, i) => { c.classList.toggle('on', i === speedIdx); c.setAttribute('aria-checked', String(i === speedIdx)); });
    }
  }

  setSummary(html: string): void { if (this.summaryEl.innerHTML !== html) this.summaryEl.innerHTML = html; }
  get birthdayValue(): string { return this.bdayInput.value; }
}

function parseIso(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}
function toIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getFullYear()).padStart(4, '0')}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function tzName(d: Date): string {
  try { return new Intl.DateTimeFormat(locale(), { timeZoneName: 'short' }).formatToParts(d).find((p) => p.type === 'timeZoneName')?.value ?? ''; } catch { return ''; }
}
