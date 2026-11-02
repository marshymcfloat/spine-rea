import { Application } from 'pixi.js';
import { createViewportGuides, fitViewport } from '@studio/runtime-pixi';

const host = document.getElementById('viewport');
const status = document.getElementById('status');
const message = document.getElementById('message');
if (!host || !status || !message) throw new Error('The demo layout is incomplete.');

const app = new Application();
let disposed = false;
let initialized = false;
let reportedReady = false;
let observer: ResizeObserver | undefined;

function dispose() {
  disposed = true;
  window.removeEventListener('pagehide', handlePageHide);
  observer?.disconnect();
  if (initialized) {
    initialized = false;
    app.destroy(true, { children: true, context: true });
  }
}

async function initialize() {
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
      dispose();
      return;
    }

    const guides = createViewportGuides();
    app.stage.addChild(guides);
    app.canvas.dataset.testid = 'studio-canvas';
    app.canvas.setAttribute('role', 'img');
    app.canvas.setAttribute('aria-label', 'Empty 1920 by 1080 reference artboard');
    host!.appendChild(app.canvas);

    const resize = () => {
      const { width, height } = host!.getBoundingClientRect();
      if (disposed || width <= 0 || height <= 0) return;
      app.renderer.resize(width, height);
      const transform = fitViewport(width, height);
      guides.scale.set(transform.scale);
      guides.position.set(transform.x, transform.y);
      app.render();
      if (!reportedReady) {
        reportedReady = true;
        message!.hidden = true;
        status!.textContent = 'Canvas ready';
      }
    };

    observer = new ResizeObserver(resize);
    observer.observe(host!);
    resize();
  } catch (error) {
    const shouldReport = !disposed;
    dispose();
    if (app.stage && !app.stage.destroyed) app.stage.destroy({ children: true, context: true });
    if (!shouldReport) return;
    status!.textContent = 'Canvas unavailable';
    message!.textContent = error instanceof Error ? error.message : 'The canvas could not be initialized.';
    message!.setAttribute('role', 'alert');
  }
}

function handlePageHide(event: PageTransitionEvent) {
  if (!event.persisted) dispose();
}

window.addEventListener('pagehide', handlePageHide);
if (import.meta.hot) import.meta.hot.dispose(dispose);
void initialize();
