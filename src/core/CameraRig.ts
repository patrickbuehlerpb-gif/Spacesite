import * as THREE from 'three';
import { tween, easeInOutCubic, type Ease, type TweenHandle } from './tween';

export interface FlyTarget { position: THREE.Vector3; lookAt?: THREE.Vector3; quaternion?: THREE.Quaternion; fov?: number }

/** Smoothly move a camera to a target pose. Returns a handle (cancel + done promise). */
export function flyCamera(camera: THREE.PerspectiveCamera, target: FlyTarget, durationMs = 1800, ease: Ease = easeInOutCubic): TweenHandle {
  const p0 = camera.position.clone();
  const q0 = camera.quaternion.clone();
  const f0 = camera.fov;
  const q1 = target.quaternion?.clone() ?? (() => {
    const m = new THREE.Matrix4().lookAt(target.position, target.lookAt ?? new THREE.Vector3(), camera.up);
    return new THREE.Quaternion().setFromRotationMatrix(m);
  })();
  const f1 = target.fov ?? f0;
  return tween(durationMs, (k) => {
    camera.position.lerpVectors(p0, target.position, k);
    camera.quaternion.slerpQuaternions(q0, q1, k);
    if (f1 !== f0) { camera.fov = f0 + (f1 - f0) * k; camera.updateProjectionMatrix(); }
  }, ease);
}

/**
 * Orbit-style camera state (target + spherical coords) that can be driven by pointer AND animated.
 * Lighter than OrbitControls and easy to tween; use OrbitControls from three/addons if you need inertia etc.
 */
export class OrbitRig {
  target = new THREE.Vector3();
  theta = 0.6;   // azimuth
  phi = 1.1;     // polar (0 = top)
  radius = 10;
  minRadius = 0.1;
  maxRadius = 1e12;
  minPhi = 0.05;
  maxPhi = Math.PI - 0.05;
  rotateSpeed = 1;
  zoomSpeed = 1;
  enabled = true;
  private dragging = false;
  private last = { x: 0, y: 0 };
  private pinch = 0;
  private cleanup: Array<() => void> = [];

  constructor(public camera: THREE.PerspectiveCamera, dom: HTMLElement) {
    const down = (e: PointerEvent) => { if (!this.enabled || e.button !== 0) return; this.dragging = true; this.last = { x: e.clientX, y: e.clientY }; dom.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => {
      if (!this.dragging || !this.enabled) return;
      const dx = e.clientX - this.last.x, dy = e.clientY - this.last.y;
      this.last = { x: e.clientX, y: e.clientY };
      this.theta -= dx * 0.005 * this.rotateSpeed;
      this.phi = THREE.MathUtils.clamp(this.phi - dy * 0.005 * this.rotateSpeed, this.minPhi, this.maxPhi);
    };
    const up = () => { this.dragging = false; };
    const wheel = (e: WheelEvent) => { if (!this.enabled) return; e.preventDefault(); this.zoomBy(Math.exp(e.deltaY * 0.0012 * this.zoomSpeed)); };
    const tstart = (e: TouchEvent) => { if (e.touches.length === 2) this.pinch = dist(e); };
    const tmove = (e: TouchEvent) => {
      if (e.touches.length === 2 && this.pinch > 0) { e.preventDefault(); const d = dist(e); this.zoomBy(this.pinch / d); this.pinch = d; }
    };
    const dist = (e: TouchEvent) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    dom.addEventListener('pointerdown', down);
    dom.addEventListener('pointermove', move);
    dom.addEventListener('pointerup', up);
    dom.addEventListener('pointercancel', up);
    dom.addEventListener('wheel', wheel, { passive: false });
    dom.addEventListener('touchstart', tstart, { passive: true });
    dom.addEventListener('touchmove', tmove, { passive: false });
    this.cleanup.push(() => {
      dom.removeEventListener('pointerdown', down); dom.removeEventListener('pointermove', move);
      dom.removeEventListener('pointerup', up); dom.removeEventListener('pointercancel', up);
      dom.removeEventListener('wheel', wheel); dom.removeEventListener('touchstart', tstart); dom.removeEventListener('touchmove', tmove);
    });
  }

  zoomBy(f: number): void { this.radius = THREE.MathUtils.clamp(this.radius * f, this.minRadius, this.maxRadius); }

  /** Apply the rig state to the camera. Call every frame. */
  update(): void {
    const sp = Math.sin(this.phi);
    this.camera.position.set(
      this.target.x + this.radius * sp * Math.sin(this.theta),
      this.target.y + this.radius * Math.cos(this.phi),
      this.target.z + this.radius * sp * Math.cos(this.theta),
    );
    this.camera.lookAt(this.target);
  }

  /** Animate to a new target/radius. */
  flyTo(o: { target?: THREE.Vector3; radius?: number; theta?: number; phi?: number }, ms = 1400): TweenHandle {
    const t0 = this.target.clone(), r0 = this.radius, th0 = this.theta, ph0 = this.phi;
    const t1 = o.target ?? t0, r1 = o.radius ?? r0, th1 = o.theta ?? th0, ph1 = o.phi ?? ph0;
    return tween(ms, (k) => {
      this.target.lerpVectors(t0, t1, k);
      // log-interpolate radius so zooms feel uniform across scales
      this.radius = Math.exp(THREE.MathUtils.lerp(Math.log(r0), Math.log(r1), k));
      this.theta = THREE.MathUtils.lerp(th0, th1, k);
      this.phi = THREE.MathUtils.lerp(ph0, ph1, k);
    });
  }

  dispose(): void { this.cleanup.forEach((f) => f()); this.cleanup = []; }
}
