import type { Application } from 'pixi.js';

/** Application.destroy may encounter a plugin whose init never completed. */
export function disposePreviewApplication(app: Application, window: Pick<Window, 'removeEventListener'>): void {
  const renderer = app.renderer;
  const stage = app.stage;
  const ticker = app.ticker;
  const partial = app as Application & { _cancelResize?: () => void; queueResize?: EventListener };
  try {
    app.destroy({ removeView: true, releaseGlobalResources: false }, { children: true, texture: false, textureSource: false, context: true });
    return;
  } catch {
    // Finish each owned resource even when a partially initialized plugin failed.
  }
  const failures: unknown[] = [];
  const attempt = (cleanup: () => void) => { try { cleanup(); } catch (error) { failures.push(error); } };
  attempt(() => ticker?.stop());
  attempt(() => ticker?.destroy());
  attempt(() => { if (partial.queueResize) window.removeEventListener('resize', partial.queueResize); });
  attempt(() => partial._cancelResize?.());
  attempt(() => { if (stage && !stage.destroyed) stage.destroy({ children: true, texture: false, textureSource: false, context: true }); });
  attempt(() => { if (renderer) renderer.destroy({ removeView: true, releaseGlobalResources: false }); });
  if (failures.length > 0) throw new AggregateError(failures, 'Application cleanup failed.');
}
