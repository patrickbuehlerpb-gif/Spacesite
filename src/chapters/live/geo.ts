/**
 * Geodesy helpers for the live globe. All vectors use the Earth-mesh frame of core/Earth.ts
 * (+Y = north pole, longitude 0 at +X when the mesh rotation is 0), unit = Earth radius.
 */
import * as THREE from 'three';
import { EARTH_RADIUS_KM, clamp } from '../../core/units';

const D = Math.PI / 180;

/** Unit vector for lat/lon (degrees), same convention as `latLonToVector3`, written into `out` (no allocation). */
export function llToUnit(lat: number, lon: number, out: THREE.Vector3): THREE.Vector3 {
  const phi = (90 - lat) * D, theta = (lon + 180) * D;
  const sp = Math.sin(phi);
  return out.set(-sp * Math.cos(theta), Math.cos(phi), sp * Math.sin(theta));
}

/** Inverse of llToUnit → degrees, lon in [-180, 180). */
export function unitToLL(v: THREE.Vector3): { lat: number; lon: number } {
  const len = v.length() || 1;
  const lat = Math.asin(clamp(v.y / len, -1, 1)) / D;
  let lon = Math.atan2(v.z, -v.x) / D - 180;
  lon = ((lon + 540) % 360) - 180;
  return { lat, lon };
}

/** Spherical interpolation between two unit vectors (k ∈ [0,1]) into `out`. */
export function slerpUnit(a: THREE.Vector3, b: THREE.Vector3, k: number, out: THREE.Vector3): THREE.Vector3 {
  const d = clamp(a.dot(b), -1, 1);
  const om = Math.acos(d);
  if (om < 1e-6) return out.copy(a);
  const so = Math.sin(om);
  const wa = Math.sin((1 - k) * om) / so, wb = Math.sin(k * om) / so;
  return out.set(a.x * wa + b.x * wb, a.y * wa + b.y * wb, a.z * wa + b.z * wb);
}

/** Great-circle distance in km (haversine). */
export function greatCircleKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = lat1 * D, p2 = lat2 * D, dl = (lon2 - lon1) * D;
  const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

const _o = new THREE.Vector3(), _s = new THREE.Vector3(), _d = new THREE.Vector3();
/** Slant range (km) and elevation angle (deg) of a satellite seen from an observer at sea level. */
export function lookAngles(obsLat: number, obsLon: number, satLat: number, satLon: number, satAltKm: number): { rangeKm: number; elevationDeg: number } {
  llToUnit(obsLat, obsLon, _o);
  llToUnit(satLat, satLon, _s).multiplyScalar(EARTH_RADIUS_KM + satAltKm);
  _d.copy(_s).addScaledVector(_o, -EARTH_RADIUS_KM);
  const rangeKm = _d.length();
  const elevationDeg = Math.asin(clamp(_d.dot(_o) / rangeKm, -1, 1)) / D;
  return { rangeKm, elevationDeg };
}

/** Greenwich mean sidereal time (radians) – same expression as data/solarsystem.subsolarPoint. */
export function gmstRad(jd: number): number {
  const n = jd - 2451545.0;
  const g = (280.46061837 + 360.98564736629 * n) % 360;
  return ((g + 360) % 360) * D;
}

/** Orbit-rig spherical angles (theta = azimuth about Y, phi = polar) that look at a world direction. */
export function rigAnglesFor(dir: THREE.Vector3): { theta: number; phi: number } {
  const len = dir.length() || 1;
  return { theta: Math.atan2(dir.x, dir.z), phi: Math.acos(clamp(dir.y / len, -1, 1)) };
}

// ---------------------------------------------------------------------------------------------
// ISS propagation between fixes
// ---------------------------------------------------------------------------------------------
export interface Fix { t: number; lat: number; lon: number; alt: number }

/**
 * Keeps the last two fixes and extrapolates along their great circle. Times are local receive
 * times (seconds), so a skewed API clock cannot throw the prediction off.
 */
export class IssPropagator {
  private a?: Fix;
  private b?: Fix;
  private va = new THREE.Vector3();
  private vb = new THREE.Vector3();
  private axis = new THREE.Vector3();
  private rate = 0; // rad/s
  private ready = false;

  get last(): Fix | undefined { return this.b; }
  get hasDirection(): boolean { return this.ready; }

  push(fix: Fix): void {
    if (this.b && Math.abs(this.b.lat - fix.lat) < 1e-6 && Math.abs(this.b.lon - fix.lon) < 1e-6) { this.b = { ...this.b, t: fix.t }; return; }
    this.a = this.b; this.b = fix;
    llToUnit(fix.lat, fix.lon, this.vb);
    if (this.a && fix.t - this.a.t > 0.5) {
      llToUnit(this.a.lat, this.a.lon, this.va);
      this.axis.crossVectors(this.va, this.vb);
      const ang = Math.acos(clamp(this.va.dot(this.vb), -1, 1));
      if (this.axis.lengthSq() > 1e-12 && ang > 1e-6) { this.axis.normalize(); this.rate = ang / (fix.t - this.a.t); this.ready = true; }
    }
  }

  /** Use a future sample (from the ground track) to get a direction before the second live fix arrives. */
  seedDirection(future: Fix): void {
    if (this.ready || !this.b) return;
    const dt = future.t - this.b.t;
    if (dt <= 0) return;
    const vf = llToUnit(future.lat, future.lon, this.va);
    this.axis.crossVectors(this.vb, vf);
    const ang = Math.acos(clamp(this.vb.dot(vf), -1, 1));
    if (this.axis.lengthSq() > 1e-12 && ang > 1e-6) { this.axis.normalize(); this.rate = ang / dt; this.ready = true; }
  }

  /** Predicted unit vector at time t (seconds) into `out`. Returns false when no fix exists yet. */
  predict(t: number, out: THREE.Vector3): boolean {
    if (!this.b) return false;
    out.copy(this.vb);
    if (this.ready) out.applyAxisAngle(this.axis, this.rate * clamp(t - this.b.t, -30, 120));
    return true;
  }
}

// ---------------------------------------------------------------------------------------------
// Line geometry fillers (no allocations after construction)
// ---------------------------------------------------------------------------------------------
export interface TrackSample { t: number; lat: number; lon: number }
const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _m = new THREE.Vector3();

/** Subdivided great-circle polyline through `samples` at radius r. Returns the number of vertices written. */
export function fillTrack(samples: TrackSample[], r: number, subdiv: number, buf: Float32Array): number {
  let n = 0;
  const max = Math.floor(buf.length / 3);
  for (let i = 0; i + 1 < samples.length; i++) {
    llToUnit(samples[i].lat, samples[i].lon, _p);
    llToUnit(samples[i + 1].lat, samples[i + 1].lon, _q);
    const last = i + 2 === samples.length;
    for (let k = 0; k < subdiv + (last ? 1 : 0); k++) {
      if (n >= max) return n;
      slerpUnit(_p, _q, k / subdiv, _m).multiplyScalar(r);
      buf[n * 3] = _m.x; buf[n * 3 + 1] = _m.y; buf[n * 3 + 2] = _m.z; n++;
    }
  }
  return n;
}

const _u = new THREE.Vector3(), _v = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0), _x = new THREE.Vector3(1, 0, 0);
/** Small circle of angular radius `ang` (rad) around unit vector `c`, at radius r, n vertices. */
export function fillCircle(c: THREE.Vector3, ang: number, r: number, n: number, buf: Float32Array): void {
  _u.crossVectors(c, Math.abs(c.y) > 0.95 ? _x : _y).normalize();
  _v.crossVectors(c, _u).normalize();
  const ca = Math.cos(ang) * r, sa = Math.sin(ang) * r;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, cs = Math.cos(a) * sa, sn = Math.sin(a) * sa;
    buf[i * 3] = c.x * ca + _u.x * cs + _v.x * sn;
    buf[i * 3 + 1] = c.y * ca + _u.y * cs + _v.y * sn;
    buf[i * 3 + 2] = c.z * ca + _u.z * cs + _v.z * sn;
  }
}
