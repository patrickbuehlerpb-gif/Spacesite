import { t } from '../../core/i18n';

/**
 * Tour «Reise durch das kosmische Netz»: nine stops from the Milky Way to the edge of the map.
 * `landmark` refers to an id in galaxy-landmarks.json (blurb + numbers come from there); `radius` is the orbit
 * radius (Mpc) at the stop, `phi` an optional polar angle (0 = from the north), `distMpc` overrides the
 * landmark distance for the narration (edge of the map).
 */
export interface TourStop {
  id: string;
  landmark?: string;
  radius: number;
  phi?: number;
  theta?: number;
  /** Mpc from the Milky Way, for the narration (defaults to the landmark distance) */
  distMpc?: number;
  /** strings key of the title (`galaxies.stop.<id>.title`) */
  titleKey: string;
  /** optional narration text key; otherwise the landmark blurb is used */
  textKey?: string;
}

export const TOUR: TourStop[] = [
  { id: 'milkyway', landmark: 'milkyway', radius: 0.055, phi: 0.95, titleKey: 'stop.milkyway.title', textKey: 'stop.milkyway.text' },
  { id: 'm31', landmark: 'm31', radius: 0.9, titleKey: 'stop.m31.title' },
  { id: 'localgroup', landmark: 'localgroup', radius: 3.6, titleKey: 'stop.localgroup.title' },
  { id: 'virgo', landmark: 'virgo', radius: 7, titleKey: 'stop.virgo.title', textKey: 'stop.virgo.text' },
  { id: 'norma', landmark: 'norma', radius: 45, titleKey: 'stop.norma.title', textKey: 'stop.norma.text' },
  { id: 'coma', landmark: 'coma', radius: 22, titleKey: 'stop.coma.title', textKey: 'stop.coma.text' },
  { id: 'perseuspisces', landmark: 'perseuspisces', radius: 70, titleKey: 'stop.perseuspisces.title', textKey: 'stop.perseuspisces.text' },
  { id: 'shapley', landmark: 'shapley', radius: 60, titleKey: 'stop.shapley.title', textKey: 'stop.shapley.text' },
  { id: 'edge', radius: 780, phi: 1.25, distMpc: 430, titleKey: 'stop.edge.title', textKey: 'stop.edge.text' },
];

/** Seconds a stop stays on screen before the tour advances automatically (when playing). */
export const STOP_DWELL_S = 11;

/**
 * Real event on Earth matching a light-travel time (million years): the strings key `galaxies.epoch.<n>`,
 * where n is the lower bound of the matching interval.
 */
export function epochKey(myr: number): string {
  const bounds = [1000, 540, 300, 200, 66, 34, 5, 2, 0.2, 0.1, 0.02];
  for (const b of bounds) if (myr >= b) return `galaxies.epoch.${b}`;
  return 'galaxies.epoch.0';
}

/** «Dieses Licht startete, als …» for a distance in Mpc (light-travel time ≈ distance in light-years). */
export function lightSentence(distMpc: number): string {
  const myr = distMpc * 3.2615637771; // Mpc → million light-years ≈ million years
  return t('galaxies.lightStart', { event: t(epochKey(myr)) });
}
