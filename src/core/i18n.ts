import type { Lang } from './types';

type Dict = Record<string, string>;
const dicts: Record<Lang, Dict> = { de: {}, en: {} };
const listeners = new Set<(l: Lang) => void>();

function detect(): Lang {
  try {
    const saved = localStorage.getItem('kosmos.lang');
    if (saved === 'de' || saved === 'en') return saved;
  } catch { /* private mode */ }
  const nav = (navigator.language || 'de').toLowerCase();
  return nav.startsWith('de') ? 'de' : 'en';
}

let current: Lang = detect();

/** Register a namespace of strings. Keys become `${ns}.${key}`. */
export function registerStrings(ns: string, de: Dict, en: Dict): void {
  for (const k in de) dicts.de[`${ns}.${k}`] = de[k];
  for (const k in en) dicts.en[`${ns}.${k}`] = en[k];
}

/** Translate. Params replace `{name}` placeholders. Falls back to the other language, then the key. */
export function t(key: string, params?: Record<string, string | number>): string {
  let s = dicts[current][key] ?? dicts[current === 'de' ? 'en' : 'de'][key] ?? key;
  if (params) for (const p in params) s = s.replaceAll(`{${p}}`, String(params[p]));
  return s;
}

export function lang(): Lang { return current; }
/** BCP-47 locale for Intl formatting. */
export function locale(): string { return current === 'de' ? 'de-CH' : 'en-US'; }

export function setLang(l: Lang): void {
  if (l === current) return;
  current = l;
  try { localStorage.setItem('kosmos.lang', l); } catch { /* ignore */ }
  document.documentElement.lang = l;
  listeners.forEach((fn) => fn(l));
}

/** Subscribe to language changes. Returns an unsubscribe function. */
export function onLang(fn: (l: Lang) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Pick a value by language from a {de, en} pair. */
export function pick<T>(v: { de: T; en: T }): T { return v[current]; }
