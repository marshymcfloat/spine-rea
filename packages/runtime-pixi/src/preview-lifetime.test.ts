import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPriestRuntimeFixture } from '@studio/test-fixtures';

const owned = vi.hoisted(() => ({
  rendererDestroy: vi.fn(), tickerDestroy: vi.fn(), tickerStop: vi.fn(),
  requestFrame: vi.fn(), cancelFrame: vi.fn(), application: undefined as unknown,
}));

vi.mock('pixi.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pixi.js')>();
  class FailingApplication extends actual.Application {
    override async init() {
      this.renderer = { destroy: owned.rendererDestroy } as never;
      Object.defineProperty(this, 'ticker', { configurable: true, value: { stop: owned.tickerStop, destroy: owned.tickerDestroy } });
      owned.application = this;
      throw new Error('Injected application plugin failure.');
    }
  }
  return { ...actual, Application: FailingApplication };
});

import { createRigPreview } from './preview';

describe('preview initialization lifetime', () => {
  beforeEach(() => { vi.clearAllMocks(); owned.rendererDestroy.mockReset(); });
  it('releases a renderer/ticker created before init rejects, with no orphan host RAF', async () => {
    const fetchTexture = vi.fn((_url: string, options: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    vi.stubGlobal('fetch', fetchTexture);
    const window = {
      performance: { now: () => 0 }, devicePixelRatio: 1,
      requestAnimationFrame: owned.requestFrame, cancelAnimationFrame: owned.cancelFrame,
      removeEventListener: vi.fn(), addEventListener: vi.fn(),
    };
    const document = { defaultView: window, hidden: false, removeEventListener: vi.fn(), addEventListener: vi.fn() };
    const host = { ownerDocument: document } as unknown as HTMLElement;
    const data = createPriestRuntimeFixture();
    const failed = vi.fn();
    try {
      const preview = createRigPreview({
        host, document: data, rigId: data.rigs[0]!.id, artboard: { width: 320, height: 480 },
        textureUrls: new Map(data.assets.map((asset) => [asset.id, `https://fixture.invalid/${asset.id}`])),
        onError: failed,
      });
      await expect(preview.ready).rejects.toThrow('Injected application plugin failure.');
      preview.dispose();
      preview.dispose();
      expect(owned.rendererDestroy).toHaveBeenCalledOnce();
      expect(owned.tickerStop).toHaveBeenCalledOnce();
      expect(owned.tickerDestroy).toHaveBeenCalledOnce();
      expect(owned.requestFrame).not.toHaveBeenCalled();
      expect(failed).toHaveBeenCalledOnce();
      expect((owned.application as { stage: { destroyed: boolean } }).stage.destroyed).toBe(true);
    } finally { vi.unstubAllGlobals(); }
  });

  it('still reports the primary failure when partial renderer disposal also fails', async () => {
    owned.rendererDestroy.mockImplementationOnce(() => { throw new Error('Injected renderer cleanup failure.'); });
    vi.stubGlobal('fetch', vi.fn((_url: string, options: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    })));
    const window = {
      performance: { now: () => 0 }, devicePixelRatio: 1,
      requestAnimationFrame: owned.requestFrame, cancelAnimationFrame: owned.cancelFrame,
      removeEventListener: vi.fn(), addEventListener: vi.fn(),
    };
    const host = { ownerDocument: { defaultView: window, hidden: false, removeEventListener: vi.fn(), addEventListener: vi.fn() } } as unknown as HTMLElement;
    const data = createPriestRuntimeFixture();
    const failed = vi.fn();
    try {
      const preview = createRigPreview({
        host, document: data, rigId: data.rigs[0]!.id, artboard: { width: 320, height: 480 },
        textureUrls: new Map(data.assets.map((asset) => [asset.id, `https://fixture.invalid/${asset.id}`])), onError: failed,
      });
      await expect(preview.ready).rejects.toThrow('Injected application plugin failure.');
      expect(failed).toHaveBeenCalledOnce();
      expect(failed.mock.calls[0]![0]).toBeInstanceOf(AggregateError);
      expect(failed.mock.calls[0]![0].message).toContain('Injected application plugin failure.');
      expect(owned.tickerDestroy).toHaveBeenCalledOnce();
      expect(owned.requestFrame).not.toHaveBeenCalled();
      expect(() => preview.dispose()).not.toThrow();
    } finally { vi.unstubAllGlobals(); }
  });
});
