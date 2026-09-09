import * as THREE from 'three';

/**
 * Shared types of the zoom chapter.
 *
 * Frame: everything lives in the equatorial J2000 frame (x → RA 0h, z → north celestial pole), the same frame as the
 * star/galaxy catalogues; the camera uses up = +Z. Each layer has its own THREE.Scene with its own unit
 * (metres per scene unit) and a visibility window in logD = log10(camera distance from Earth in metres).
 */
export interface LabelSpec {
  /** object id (info card key) */
  id: string;
  /** position in layer units (read every frame; may be updated by `dyn`) */
  pos: THREE.Vector3;
  text: string;
  sub?: string;
  /** extra classes: dim | gold | cyan | violet | rose | big */
  cls?: string;
  /** logD window in which the label is shown (defaults to the layer window) */
  lo?: number;
  hi?: number;
  /** declutter priority, lower wins */
  prio: number;
  /** per-frame position update (e.g. a label that follows the view direction) */
  dyn?: (out: THREE.Vector3, viewDir: THREE.Vector3) => void;
  /** created by the chapter */
  el?: HTMLButtonElement;
  w?: number;
  h?: number;
}

export interface Layer {
  id: string;
  /** metres per scene unit */
  unit: number;
  /** visibility window in logD (opacity ramps over `fade` decades inside the window) */
  lo: number;
  hi: number;
  fade: number;
  /** no fade at the inner / outer edge (first / last layer) */
  hardLo?: boolean;
  hardHi?: boolean;
  /** minimum far plane in layer units (so distant static content like the star catalogue stays visible near the origin) */
  minFar?: number;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** opacity setters (called when the layer opacity changes) */
  fades: Array<(k: number) => void>;
  /** projection setters (called on resize: uProj = h/2/tan(fov/2)) */
  proj: Array<(height: number, fovDeg: number) => void>;
  labels: LabelSpec[];
  /** per-frame update (dt s, logD, elapsed s, camera distance in layer units) */
  update?: (dt: number, logD: number, elapsed: number, dist: number) => void;
  /** i18n key of the data-source line */
  source: string;
  opacity: number;
}

export interface ObjectInfo {
  id: string;
  title: () => string;
  /** i18n key of the kind line */
  kind: string;
  rows: () => Array<[string, string]>;
  blurb: () => string;
  /** i18n key of the source line */
  src: string;
  /** logD to fly to when "zoom there" is pressed */
  zoom?: number;
}

export interface LayerBuild { layer: Layer; infos: ObjectInfo[] }

export function makeLayer(id: string, unit: number, lo: number, hi: number, source: string, extra: Partial<Layer> = {}): Layer {
  const camera = new THREE.PerspectiveCamera(55, 1, 0.01, 1e7);
  camera.up.set(0, 0, 1);
  return { id, unit, lo, hi, fade: 0.5, scene: new THREE.Scene(), camera, fades: [], proj: [], labels: [], source, opacity: 0, ...extra };
}
