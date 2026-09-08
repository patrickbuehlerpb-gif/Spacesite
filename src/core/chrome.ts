import type { App } from './App';
import { chapters } from '../chapters/registry';
import { t, lang, setLang, onLang } from './i18n';
import { navigate } from './Router';
import { el, ICON_MENU, ICON_CLOSE, iconButton } from './ui';

/** Global top bar: brand, chapter nav, language toggle, credits. */
export function buildChrome(_app: App): void {
  const host = document.getElementById('chrome') as HTMLElement;
  const bar = el('div', 'topbar');
  const brand = el('div', 'brand ia', 'KOSMOS');
  brand.addEventListener('click', () => navigate(''));
  const nav = el('nav', 'nav ia');
  const toggle = iconButton(ICON_MENU, () => nav.classList.toggle('open'), t('ui.menu'));
  toggle.classList.add('nav-toggle');
  bar.append(brand, el('div', 'nav-wrap', ''), nav, toggle);
  host.appendChild(bar);

  function renderNav(): void {
    nav.replaceChildren();
    for (const c of chapters) {
      if (!c.nav) continue;
      const a = el('a', '', t(`chapter.${c.id}.nav`));
      a.href = `#/${c.path}`;
      a.dataset.id = c.id;
      a.addEventListener('click', () => nav.classList.remove('open'));
      nav.appendChild(a);
    }
    const langBtn = el('a', 'lang', lang() === 'de' ? 'EN' : 'DE');
    langBtn.href = '#';
    langBtn.title = lang() === 'de' ? 'Switch to English' : 'Auf Deutsch wechseln';
    langBtn.addEventListener('click', (e) => { e.preventDefault(); setLang(lang() === 'de' ? 'en' : 'de'); location.reload(); });
    nav.appendChild(langBtn);
    const credits = el('a', '', t('ui.sources'));
    credits.href = '#';
    credits.addEventListener('click', (e) => { e.preventDefault(); nav.classList.remove('open'); showCredits(); });
    nav.appendChild(credits);
    markActive(document.body.dataset.chapter ?? 'home');
  }

  function markActive(id: string): void {
    nav.querySelectorAll('a[data-id]').forEach((a) => a.classList.toggle('active', (a as HTMLElement).dataset.id === id));
  }

  renderNav();
  onLang(renderNav);
  document.addEventListener('kosmos:chapter', (e) => markActive((e as CustomEvent<string>).detail));
}

export function showCredits(): void {
  const host = document.getElementById('chrome') as HTMLElement;
  const modal = el('div', 'credits-modal ia');
  const p = el('div', 'panel strong scroll');
  const li = (k: string) => `<li>${t(`credits.${k}`)}</li>`;
  p.innerHTML = `
    <h2>${t('credits.title')}</h2>
    <p style="color:var(--text-2);font-size:14px;margin:0">${t('credits.intro')}</p>
    <h4>${t('credits.catalogs')}</h4>
    <ul>${['hyg', 'twomrs', 'oec', 'openngc', 'stellarium', 'jpl', 'textures'].map(li).join('')}</ul>
    <h4>${t('credits.live')}</h4>
    <ul>${['iss', 'll2', 'noaa', 'nasa', 'sdo', 'sen'].map(li).join('')}</ul>
    <h4>${t('credits.tech')}</h4>
    <ul>${['three'].map(li).join('')}</ul>
    <p style="color:var(--muted);font-size:12px;margin-top:18px">${t('credits.madeWith')}</p>`;
  const close = iconButton(ICON_CLOSE, () => modal.remove(), t('ui.close'));
  Object.assign(close.style, { position: 'absolute', top: '14px', right: '14px' });
  p.appendChild(close);
  modal.appendChild(p);
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  host.appendChild(modal);
}
