import * as THREE from 'three';
import { BaseChapter } from '../../core/BaseChapter';
import { t } from '../../core/i18n';
import { showIntro } from '../../core/ui';
import { loadStarCatalog } from '../../data/stars';
import { createStarPoints, colorsFromBv } from '../../core/StarPoints';

/** STUB – to be implemented. Shows the real night sky as a placeholder. */
export default class TimelineChapter extends BaseChapter {
  readonly id = 'timeline';
  private points?: THREE.Points;

  protected async setup(): Promise<void> {
    const cat = await loadStarCatalog();
    this.points = createStarPoints(cat.pos, cat.absMag, colorsFromBv(cat.ci), { size: 8 });
    this.scene.add(this.points);
    this.camera.position.set(0.0001, 0, 0);
    this.camera.lookAt(1, 0.3, 0.2);
    void showIntro(this.root, { kicker: 'KOSMOS', title: t('chapter.timeline.title'), blurb: t('chapter.timeline.blurb') });
  }

  protected tick(dt: number): void {
    this.camera.rotateY(dt * 0.01);
  }
}
