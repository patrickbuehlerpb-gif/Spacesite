import * as THREE from 'three';
import type { Chapter, ChapterContext } from './types';
import { chapters, findChapter, type ChapterMeta } from '../chapters/registry';
import { parseHash, onRoute } from './Router';
import { tickTweens, cancelAllTweens } from './tween';
import { buildChrome } from './chrome';
import { onLoadProgress } from './Loader';
import { t } from './i18n';

declare global {
  interface Window { __kosmos: { ready: boolean; chapter: string; frames: number; errors: string[] } }
}

/**
 * Owns the single WebGL canvas/renderer, the render loop, chapter switching and global chrome.
 */
export class App {
  readonly canvas = document.getElementById('gl') as HTMLCanvasElement;
  readonly ui = document.getElementById('ui') as HTMLElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  current: Chapter | null = null;
  currentMeta: ChapterMeta | null = null;
  private timer = new THREE.Timer();
  private switching = false;
  private pending: { path: string; param?: string } | null = null;
  private fade = document.getElementById('fade') as HTMLElement;
  private loading = document.getElementById('loading') as HTMLElement;
  private firstChapter = true;
  width = 1; height = 1;

  constructor() {
    window.__kosmos = { ready: false, chapter: '', frames: 0, errors: [] };
    window.addEventListener('error', (e) => window.__kosmos.errors.push(String(e.message)));
    window.addEventListener('unhandledrejection', (e) => window.__kosmos.errors.push(String(e.reason)));

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x05070d, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    buildChrome(this);
    this.onResize();
    window.addEventListener('resize', () => this.onResize());

    const fill = this.loading.querySelector('.loading-fill') as HTMLElement;
    const text = this.loading.querySelector('.loading-text') as HTMLElement;
    onLoadProgress((loaded, total, label) => {
      if (this.loading.classList.contains('hide')) return;
      fill.style.width = `${Math.round((loaded / Math.max(total, 1)) * 100)}%`;
      text.textContent = `${t('ui.loading')} ${label}`;
    });

    onRoute((r) => this.goto(r.path, r.param));
  }

  start(): void {
    const r = parseHash();
    void this.goto(r.path, r.param);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private onResize(): void {
    this.width = window.innerWidth; this.height = window.innerHeight;
    this.renderer.setSize(this.width, this.height, false);
    this.current?.resize(this.width, this.height);
  }

  private frame(): void {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.1);
    const elapsed = this.timer.getElapsed();
    tickTweens(dt);
    const c = this.current;
    if (!c || this.switching) return;
    try {
      c.update(dt, elapsed);
      c.render();
      const k = window.__kosmos;
      k.frames++;
      if (!k.ready && k.frames > 5) k.ready = true;
    } catch (e) {
      console.error(e);
      window.__kosmos.errors.push(String(e));
    }
  }

  /** Switch chapters with a fade. Queues if a switch is in progress. */
  async goto(path: string, param?: string): Promise<void> {
    const meta = findChapter(path) ?? chapters[0];
    if (this.currentMeta?.id === meta.id && this.current && !this.switching) {
      // same chapter: only the param changed → let chapters react via 'kosmos:param'
      this.ui.dispatchEvent(new CustomEvent('kosmos:param', { detail: param }));
      return;
    }
    if (this.switching) { this.pending = { path, param }; return; }
    this.switching = true;
    window.__kosmos.ready = false; window.__kosmos.frames = 0;
    document.title = `${t(`chapter.${meta.id}.title`).replace(/<[^>]+>/g, '')} – KOSMOS`;
    document.body.dataset.chapter = meta.id;
    document.dispatchEvent(new CustomEvent('kosmos:chapter', { detail: meta.id }));

    if (!this.firstChapter) { this.fade.classList.add('on'); await wait(380); }
    cancelAllTweens();
    if (this.current) { try { this.current.unmount(); } catch (e) { console.error(e); } }
    this.current = null; this.currentMeta = null;
    this.ui.replaceChildren();
    this.renderer.clear();

    try {
      const mod = await meta.load();
      const chapter = new mod.default();
      const ctx: ChapterContext = { app: this, renderer: this.renderer, ui: this.ui, width: this.width, height: this.height, param };
      await chapter.mount(ctx);
      this.current = chapter; this.currentMeta = meta;
      window.__kosmos.chapter = meta.id;
    } catch (e) {
      console.error('Chapter failed to mount', e);
      window.__kosmos.errors.push(String(e));
      this.ui.innerHTML = `<div class="panel ia pos-tc" style="padding:16px 20px">${t('ui.error')}</div>`;
    }

    this.fade.classList.remove('on');
    if (this.firstChapter) { this.loading.classList.add('hide'); this.firstChapter = false; }
    this.switching = false;
    if (this.pending) { const p = this.pending; this.pending = null; void this.goto(p.path, p.param); }
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
