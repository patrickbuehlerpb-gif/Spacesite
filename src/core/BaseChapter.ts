import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { Chapter, ChapterContext } from './types';
import { el } from './ui';

/**
 * Convenience base for chapters: owns a Scene + PerspectiveCamera, a UI root inside #ui,
 * optional CSS2D labels, and disposes everything on unmount.
 *
 * Subclasses implement setup() (async ok) and optionally tick(dt, t), teardown().
 */
export abstract class BaseChapter implements Chapter {
  abstract readonly id: string;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, 1, 0.01, 1e7);
  ctx!: ChapterContext;
  /** Chapter UI root (position:absolute; inset:0). Interactive children need class `ia`. */
  root!: HTMLElement;
  labelRenderer?: CSS2DRenderer;
  protected disposers: Array<() => void> = [];
  protected mounted = false;

  async mount(ctx: ChapterContext): Promise<void> {
    this.ctx = ctx;
    this.root = el('div', 'chapter-root');
    Object.assign(this.root.style, { position: 'absolute', inset: '0' });
    ctx.ui.appendChild(this.root);
    this.resize(ctx.width, ctx.height);
    this.mounted = true;
    await this.setup();
    this.resize(ctx.width, ctx.height);
  }

  protected abstract setup(): Promise<void> | void;
  protected teardown(): void {}
  protected tick(_dt: number, _elapsed: number): void {}

  /** Turn on CSS2D labels (HTML elements attached to 3D positions). */
  enableLabels(): CSS2DRenderer {
    if (this.labelRenderer) return this.labelRenderer;
    const r = new CSS2DRenderer();
    Object.assign(r.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none', overflow: 'hidden' });
    this.root.prepend(r.domElement);
    r.setSize(this.ctx.width, this.ctx.height);
    this.labelRenderer = r;
    return r;
  }

  /** Create a label attached to an Object3D. */
  label(text: string, cls = '', parent?: THREE.Object3D, offset?: THREE.Vector3): CSS2DObject {
    this.enableLabels();
    const d = el('div', `label3d ${cls}`.trim(), text);
    const o = new CSS2DObject(d);
    if (offset) o.position.copy(offset);
    (parent ?? this.scene).add(o);
    return o;
  }

  /** Register a cleanup function executed on unmount. */
  onDispose(fn: () => void): void { this.disposers.push(fn); }

  /** Add a DOM element to the chapter UI root. */
  addUI<T extends HTMLElement>(node: T): T { this.root.appendChild(node); return node; }

  update(dt: number, elapsed: number): void { this.tick(dt, elapsed); }

  render(): void {
    this.ctx.renderer.render(this.scene, this.camera);
    this.labelRenderer?.render(this.scene, this.camera);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.labelRenderer?.setSize(width, height);
  }

  unmount(): void {
    this.mounted = false;
    try { this.teardown(); } catch (e) { console.error(e); }
    for (const d of this.disposers.splice(0)) { try { d(); } catch (e) { console.error(e); } }
    disposeScene(this.scene);
    this.root?.remove();
    this.labelRenderer = undefined;
  }
}

/** Dispose geometries, materials and textures of a whole scene graph. */
export function disposeScene(scene: THREE.Object3D): void {
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      for (const v of Object.values(mat as unknown as Record<string, unknown>)) {
        if (v && typeof v === 'object' && 'isTexture' in (v as object) && (v as THREE.Texture).isTexture) (v as THREE.Texture).dispose();
      }
      const u = (mat as THREE.ShaderMaterial).uniforms;
      if (u) for (const key in u) { const val = u[key]?.value as THREE.Texture | undefined; if (val && (val as THREE.Texture).isTexture) val.dispose(); }
      mat.dispose();
    }
  });
  scene.clear();
}
