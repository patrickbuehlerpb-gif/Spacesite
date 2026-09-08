import type { ChapterCtor } from '../core/types';

export interface ChapterMeta {
  id: string;
  /** hash path, e.g. 'sterne' → #/sterne */
  path: string;
  /** show in top navigation */
  nav: boolean;
  /** accent colour token for menus/cards */
  accent: string;
  load: () => Promise<{ default: ChapterCtor }>;
}

/** Order = order in navigation and on the home menu. */
export const chapters: ChapterMeta[] = [
  { id: 'home', path: '', nav: false, accent: 'var(--gold)', load: () => import('./home/HomeChapter') },
  { id: 'stars', path: 'sterne', nav: true, accent: 'var(--cyan)', load: () => import('./stars/StarsChapter') },
  { id: 'solarsystem', path: 'sonnensystem', nav: true, accent: 'var(--gold)', load: () => import('./solarsystem/SolarSystemChapter') },
  { id: 'exoplanets', path: 'exoplaneten', nav: true, accent: 'var(--green)', load: () => import('./exoplanets/ExoplanetsChapter') },
  { id: 'galaxies', path: 'galaxien', nav: true, accent: 'var(--violet)', load: () => import('./galaxies/GalaxiesChapter') },
  { id: 'zoom', path: 'zoom', nav: true, accent: 'var(--cyan)', load: () => import('./zoom/ZoomChapter') },
  { id: 'timeline', path: 'zeit', nav: true, accent: 'var(--rose)', load: () => import('./timeline/TimelineChapter') },
  { id: 'live', path: 'live', nav: true, accent: 'var(--green)', load: () => import('./live/LiveChapter') },
];

export function findChapter(path: string): ChapterMeta | undefined {
  return chapters.find((c) => c.path === path || c.id === path);
}
