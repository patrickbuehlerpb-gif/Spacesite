import * as THREE from 'three';

/**
 * First-person flight: drag (or pointer-lock) to look, WASD/arrows to move, Q/E roll, Shift = boost,
 * mouse wheel changes speed (log scale). Touch: drag to look; an optional on-screen throttle via `setThrottle`.
 * Speed is in scene units per second. Call update(dt) each frame.
 */
export class FreeFlight {
  enabled = true;
  speed = 1;
  minSpeed = 1e-6;
  maxSpeed = 1e9;
  lookSpeed = 0.0022;
  damping = 6;           // higher = snappier
  private keys = new Set<string>();
  private vel = new THREE.Vector3();
  private dragging = false;
  private last = { x: 0, y: 0 };
  private yaw = 0; private pitch = 0;
  private throttle = 0;  // -1..1 from touch UI
  private cleanup: Array<() => void> = [];
  private euler = new THREE.Euler(0, 0, 0, 'YXZ');

  constructor(public camera: THREE.PerspectiveCamera, dom: HTMLElement) {
    this.syncFromCamera();
    const kd = (e: KeyboardEvent) => { if (isTyping(e)) return; this.keys.add(e.code); if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault(); };
    const ku = (e: KeyboardEvent) => this.keys.delete(e.code);
    const down = (e: PointerEvent) => { if (!this.enabled || e.button !== 0) return; this.dragging = true; this.last = { x: e.clientX, y: e.clientY }; dom.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => {
      if (!this.dragging || !this.enabled) return;
      const dx = e.clientX - this.last.x, dy = e.clientY - this.last.y;
      this.last = { x: e.clientX, y: e.clientY };
      this.yaw -= dx * this.lookSpeed;
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * this.lookSpeed, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    };
    const up = () => { this.dragging = false; };
    const wheel = (e: WheelEvent) => { if (!this.enabled) return; e.preventDefault(); this.setSpeed(this.speed * Math.exp(-e.deltaY * 0.002)); };
    const blur = () => this.keys.clear();
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); window.addEventListener('blur', blur);
    dom.addEventListener('pointerdown', down); dom.addEventListener('pointermove', move);
    dom.addEventListener('pointerup', up); dom.addEventListener('pointercancel', up);
    dom.addEventListener('wheel', wheel, { passive: false });
    this.cleanup.push(() => {
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('blur', blur);
      dom.removeEventListener('pointerdown', down); dom.removeEventListener('pointermove', move);
      dom.removeEventListener('pointerup', up); dom.removeEventListener('pointercancel', up); dom.removeEventListener('wheel', wheel);
    });
  }

  /** Re-read yaw/pitch from the camera (after an external fly-to). */
  syncFromCamera(): void {
    this.euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.yaw = this.euler.y; this.pitch = this.euler.x;
    this.vel.set(0, 0, 0);
  }

  setSpeed(v: number): void { this.speed = THREE.MathUtils.clamp(v, this.minSpeed, this.maxSpeed); }
  setThrottle(v: number): void { this.throttle = THREE.MathUtils.clamp(v, -1, 1); }
  get isMoving(): boolean { return this.vel.lengthSq() > 1e-12; }

  update(dt: number): void {
    if (!this.enabled) return;
    const k = this.keys;
    const dir = new THREE.Vector3(
      (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0),
      (k.has('KeyR') || k.has('Space') ? 1 : 0) - (k.has('KeyF') || k.has('KeyC') ? 1 : 0),
      (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0),
    );
    dir.z -= this.throttle;
    const boost = k.has('ShiftLeft') || k.has('ShiftRight') ? 4 : 1;
    if (dir.lengthSq() > 0) dir.normalize().multiplyScalar(this.speed * boost);
    // exponential smoothing toward the desired velocity
    const a = 1 - Math.exp(-this.damping * dt);
    this.vel.lerp(dir, a);
    this.euler.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(this.euler);
    const step = this.vel.clone().multiplyScalar(dt).applyQuaternion(this.camera.quaternion);
    this.camera.position.add(step);
  }

  dispose(): void { this.cleanup.forEach((f) => f()); this.cleanup = []; }
}

export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}
