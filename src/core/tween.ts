/** Tiny tween manager, ticked by the App every frame. */
export type Ease = (t: number) => number;
export const easeInOutCubic: Ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic: Ease = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutSine: Ease = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const linear: Ease = (t) => t;

interface Active { dur: number; t: number; ease: Ease; update: (k: number) => void; resolve: () => void; cancelled: boolean }
const active = new Set<Active>();

export interface TweenHandle { cancel(): void; done: Promise<void> }

/** Run `update(k)` with k∈[0,1] over `durationMs`. Resolves when finished (or cancelled). */
export function tween(durationMs: number, update: (k: number) => void, ease: Ease = easeInOutCubic): TweenHandle {
  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));
  const a: Active = { dur: Math.max(1, durationMs), t: 0, ease, update, resolve, cancelled: false };
  if (durationMs <= 0) { update(1); resolve(); return { cancel() {}, done }; }
  active.add(a);
  return {
    cancel() { if (!a.cancelled) { a.cancelled = true; active.delete(a); resolve(); } },
    done,
  };
}

export function tickTweens(dtSeconds: number): void {
  for (const a of Array.from(active)) {
    a.t += dtSeconds * 1000;
    const k = Math.min(1, a.t / a.dur);
    a.update(a.ease(k));
    if (k >= 1) { active.delete(a); a.resolve(); }
  }
}

export function cancelAllTweens(): void {
  for (const a of Array.from(active)) { a.cancelled = true; a.resolve(); }
  active.clear();
}
