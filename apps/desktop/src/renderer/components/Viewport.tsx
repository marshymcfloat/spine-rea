import { useEffect, useRef } from 'react';
import { Application, type Container } from 'pixi.js';
import { createViewportGuides, fitViewport, setViewportGridVisible } from '@studio/runtime-pixi';

export type CanvasState =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'error'; message: string };

export interface ViewportProps {
  zoom: number;
  showGrid: boolean;
  onStateChange: (state: CanvasState) => void;
}

interface ViewportInstance {
  app: Application;
  guides: Container;
  resize: () => void;
}

export function Viewport({ zoom, showGrid, onStateChange }: ViewportProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<ViewportInstance | null>(null);
  const settingsRef = useRef({ zoom, showGrid });
  const onStateChangeRef = useRef(onStateChange);

  useEffect(() => {
    settingsRef.current = { zoom, showGrid };
    onStateChangeRef.current = onStateChange;
    instanceRef.current?.resize();
  }, [zoom, showGrid, onStateChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const app = new Application();
    let disposed = false;
    let initialized = false;
    let reportedReady = false;
    let observer: ResizeObserver | undefined;
    onStateChangeRef.current({ kind: 'loading' });

    const destroy = () => {
      observer?.disconnect();
      if (instanceRef.current?.app === app) instanceRef.current = null;
      if (initialized) {
        initialized = false;
        app.destroy(true, { children: true, context: true });
      }
    };

    const initialize = async () => {
      try {
        await app.init({
          preference: 'webgl',
          backgroundColor: 0x121418,
          antialias: true,
          autoDensity: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          autoStart: false,
          sharedTicker: false,
        });
        initialized = true;
        if (disposed) {
          destroy();
          return;
        }

        const guides = createViewportGuides({ showGrid: settingsRef.current.showGrid });
        app.stage.addChild(guides);
        app.canvas.dataset.testid = 'studio-canvas';
        app.canvas.setAttribute('role', 'img');
        app.canvas.setAttribute('aria-label', 'Empty 1920 by 1080 reference artboard');
        host.appendChild(app.canvas);

        const resize = () => {
          const { width, height } = host.getBoundingClientRect();
          if (disposed || width <= 0 || height <= 0) return;
          app.renderer.resize(width, height);
          const transform = fitViewport(width, height, settingsRef.current.zoom);
          guides.scale.set(transform.scale);
          guides.position.set(transform.x, transform.y);
          setViewportGridVisible(guides, settingsRef.current.showGrid);
          app.render();
          if (!reportedReady) {
            reportedReady = true;
            onStateChangeRef.current({ kind: 'ready' });
          }
        };

        instanceRef.current = { app, guides, resize };
        observer = new ResizeObserver(resize);
        observer.observe(host);
        resize();
      } catch (error) {
        destroy();
        if (!initialized && app.stage && !app.stage.destroyed) {
          app.stage.destroy({ children: true, context: true });
        }
        if (!disposed) {
          onStateChangeRef.current({
            kind: 'error',
            message: error instanceof Error ? error.message : 'The canvas could not be initialized.',
          });
        }
      }
    };

    void initialize();
    return () => {
      disposed = true;
      destroy();
    };
  }, []);

  return <div className="pixi-viewport" ref={hostRef} />;
}
