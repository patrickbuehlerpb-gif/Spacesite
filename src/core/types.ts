import type * as THREE from 'three';
import type { App } from './App';

/** Everything a chapter gets when it is mounted. */
export interface ChapterContext {
  app: App;
  renderer: THREE.WebGLRenderer;
  /** Root element for chapter UI (inside #ui). Add `.ia` to interactive elements. */
  ui: HTMLElement;
  width: number;
  height: number;
  /** Optional route parameter, e.g. `#/sterne/betelgeuse` → "betelgeuse". */
  param?: string;
}

/**
 * A chapter is one self-contained experience (own THREE.Scene + camera + UI).
 * The App owns the single WebGL canvas and calls update()/render() every frame
 * for the active chapter only. Chapters must dispose everything in unmount().
 */
export interface Chapter {
  readonly id: string;
  mount(ctx: ChapterContext): Promise<void> | void;
  unmount(): void;
  update(dt: number, elapsed: number): void;
  render(): void;
  resize(width: number, height: number): void;
}

export type ChapterCtor = new () => Chapter;
export type Lang = 'de' | 'en';
