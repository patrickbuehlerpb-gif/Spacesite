import { t, lang } from '../../core/i18n';
import { el, button, panel, debounce, ICON_SEARCH } from '../../core/ui';
import { fmtDistancePc } from '../../core/units';
import { bvToRgb } from '../../core/color';
import { searchStars, starDisplayName, type StarCatalog, type StarNamesIndex } from '../../data/stars';
import { FAMOUS, ALIASES, localStarName } from './landmarks';

export interface AutopilotPanelOpts {
  cat: StarCatalog;
  names: StarNamesIndex;
  /** lower-case HYG proper name → catalogue index */
  byName: Map<string, number>;
  onStar: (i: number) => void;
  onSun: () => void;
  onHome: () => void;
}

interface Result { label: string; sub: string; i: number | 'sun' }

const SUN_BV = 0.65;

/** Top-left "Autopilot" panel: search box with dropdown, famous-star list, back-to-Sun button. */
export class AutopilotPanel {
  readonly el: HTMLDivElement;
  private input: HTMLInputElement;
  private results: HTMLUListElement;
  private items: Result[] = [];
  private active = -1;
  private hideTimer = 0;
  private famousBtns = new Map<string, HTMLButtonElement>();

  constructor(private o: AutopilotPanelOpts) {
    const p = panel({ pos: 'tl', cls: 'ap' });
    this.el = p;

    const head = el('button', 'ap-head ia');
    head.type = 'button';
    head.setAttribute('aria-expanded', 'false');
    head.innerHTML = `<span class="panel-title">${t('stars.autopilot')}</span><span class="chev">${CHEV}</span>`;
    head.addEventListener('click', () => {
      const open = p.classList.toggle('open');
      head.setAttribute('aria-expanded', String(open));
    });

    const body = el('div', 'ap-body');

    // search ---------------------------------------------------------------------------------
    const search = el('div', 'search');
    this.input = el('input');
    this.input.type = 'search';
    this.input.placeholder = t('stars.searchPlaceholder');
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    this.input.setAttribute('aria-label', t('stars.searchPlaceholder'));
    this.results = el('ul', 'results');
    this.results.setAttribute('role', 'listbox');
    search.append(el('span', 'ico', ICON_SEARCH), this.input, this.results);

    const run = debounce(() => this.search(), 110);
    this.input.addEventListener('input', run);
    this.input.addEventListener('focus', () => { if (this.items.length) this.show(); });
    this.input.addEventListener('blur', () => { this.hideTimer = window.setTimeout(() => this.hide(), 160); });
    this.input.addEventListener('keydown', (e) => {
      // keep Esc/arrows local: the chapter's window handlers must not react to typing
      e.stopPropagation();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!this.items.length) return;
        const n = this.items.length;
        this.active = ((this.active + (e.key === 'ArrowDown' ? 1 : -1)) % n + n) % n;
        this.render();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const r = this.items[this.active >= 0 ? this.active : 0];
        if (r) this.choose(r);
      } else if (e.key === 'Escape') {
        if (this.input.value) { this.input.value = ''; this.items = []; this.hide(); }
        else this.input.blur();
      }
    });

    // famous stars -------------------------------------------------------------------------
    const famous = el('div', 'famous');
    for (const f of FAMOUS) {
      let i: number | undefined;
      let bv = SUN_BV;
      if (!f.sun) {
        i = o.byName.get(f.name.toLowerCase());
        if (i === undefined) continue; // e.g. UY Scuti: no parallax → not in HYG
        bv = o.cat.ci[i];
      }
      const idx = i;
      const b = button(`<span class="sw" style="color:${rgb(bv)}"></span>${f.label?.[lang()] ?? f.name}`, () => (f.sun ? o.onSun() : o.onStar(idx!)), 'sm fam');
      b.dataset.star = f.name;
      famous.appendChild(b);
      this.famousBtns.set(f.name, b);
    }

    const home = button(`${ICON_HOME}${t('stars.backToSun')}`, () => o.onHome(), 'sm home');
    home.dataset.action = 'home';

    body.append(search, el('div', 'ap-sub', t('stars.famous')), famous, home, el('div', 'src', t('stars.panelSrc')));
    p.append(head, body);
  }

  /** Highlight the famous-list entry of the selected object (HYG proper name, 'Sun' or null). */
  setActive(name: string | null): void {
    for (const [k, b] of this.famousBtns) b.classList.toggle('on', k === name);
  }

  /** Collapse (mobile). */
  collapse(): void { this.el.classList.remove('open'); }

  private search(): void {
    const q = this.input.value.trim();
    const s = q.toLowerCase();
    this.items = [];
    this.active = -1;
    if (!s) { this.hide(); return; }
    const { cat, names, byName } = this.o;
    const seen = new Set<number>();
    const push = (i: number) => {
      if (seen.has(i)) return;
      seen.add(i);
      const n = names.byIndex.get(i);
      const hip = cat.hip[i];
      const proper = n?.name;
      const label = proper ? localStarName(proper, lang()) : starDisplayName(n, hip);
      const des = proper ? starDisplayName({ ...n!, name: undefined }, hip) : '';
      const sub = `${des ? `${des} · ` : ''}${fmtDistancePc(cat.dist[i])}`;
      this.items.push({ label, sub, i });
    };
    const alias = ALIASES[s];
    if (alias === 'Sun') this.items.push({ label: t('stars.sun'), sub: t('stars.sunSub'), i: 'sun' });
    else if (alias) { const i = byName.get(alias.toLowerCase()); if (i !== undefined) push(i); }
    // localized famous names ("Beteigeuze") and HIP numbers
    for (const f of FAMOUS) if (!f.sun && f.label && f.label[lang()].toLowerCase().startsWith(s)) { const i = byName.get(f.name.toLowerCase()); if (i !== undefined) push(i); }
    const m = s.match(/^(?:hip\s*)?(\d{2,})$/);
    if (m) { const h = Number(m[1]); for (let i = 0; i < cat.count; i++) if (cat.hip[i] === h) { push(i); break; } }
    for (const n of searchStars(names, q, 10)) push(n.i);
    this.items = this.items.slice(0, 10);
    this.render();
    this.show();
  }

  private render(): void {
    this.results.replaceChildren();
    if (!this.items.length) {
      this.results.appendChild(el('li', 'none', t('stars.noResults')));
      return;
    }
    this.items.forEach((r, k) => {
      const li = el('li', k === this.active ? 'active' : '');
      li.setAttribute('role', 'option');
      li.innerHTML = `<span class="n">${r.label}</span><span class="d">${r.sub}</span>`;
      li.addEventListener('pointerdown', (e) => e.preventDefault()); // keep input focus → no blur before click
      li.addEventListener('click', () => this.choose(r));
      this.results.appendChild(li);
    });
  }

  private choose(r: Result): void {
    clearTimeout(this.hideTimer);
    this.hide();
    this.input.value = '';
    this.items = [];
    this.input.blur();
    this.collapse();
    if (r.i === 'sun') this.o.onSun(); else this.o.onStar(r.i);
  }

  private show(): void { clearTimeout(this.hideTimer); this.results.classList.add('on'); }
  private hide(): void { this.results.classList.remove('on'); }
}

function rgb(bv: number): string {
  const [r, g, b] = bvToRgb(Number.isFinite(bv) ? bv : 0.6);
  return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
}

const CHEV = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 5l4 4 4-4"/></svg>';
const ICON_HOME = '<svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="2.2"/><path d="M7 1v2M7 11v2M1 7h2M11 7h2M2.8 2.8l1.4 1.4M9.8 9.8l1.4 1.4M2.8 11.2l1.4-1.4M9.8 4.2l1.4-1.4"/></svg>';
