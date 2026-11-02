import { createGeometryEvaluator, createPlaybackController, createRigEvaluator } from '@studio/animation-core';
import type { EvaluatedPose, PlaybackState, RigGeometryFrame } from '@studio/animation-core';
import type { ProjectDocument, RuntimeDocument } from '@studio/schema';
import { Application, Container, ImageSource, Texture } from 'pixi.js';
import { disposePreviewApplication } from './application-lifetime';
import { createViewportGuides, setViewportGridVisible } from './guides';
import { createRigView, type RigView } from './rig-view';
import { fitArtboard } from './viewport';

const MAX_CAPTURE_SAMPLES = 60_000;
const READOUT_INTERVAL_MS = 100;

export interface PreviewReadout {
  state: PlaybackState;
  duration: number;
  crossfadeSeconds: number;
}

export interface PreviewCapture {
  frameTimestampsMs: number[];
  frameIntervalsMs: number[];
  evaluationMs: number[];
  skinningMs: number[];
  uploadMs: number[];
  renderMs: number[];
  totalMs: number[];
  droppedSamples: number;
}

export interface PreviewDiagnostics {
  snapshot(): {
    pose: EvaluatedPose;
    geometry: {
      rigId: string;
      drawOrder: string[];
      attachments: { id: string; assetId: string; type: 'region' | 'mesh'; positions: number[]; uvs: number[]; indices: number[]; opacity: number }[];
    };
    state: PlaybackState;
    settings: Record<string, number | boolean | string>;
    counts: Record<string, number | boolean>;
    timings: { capturing: boolean; sampleCount: number; droppedSamples: number };
  };
  startCapture(): void;
  endCapture(): PreviewCapture;
}

declare global {
  interface Window {
    __studioDiagnosticsRequested?: { stressGridSide?: number };
    __studioPreview?: PreviewDiagnostics;
  }
}

export interface RigPreviewOptions {
  host: HTMLElement;
  document: ProjectDocument | RuntimeDocument;
  rigId: string;
  textureUrls: ReadonlyMap<string, string>;
  artboard: { width: number; height: number };
  zoom?: number;
  showGrid?: boolean;
  diagnostics?: boolean;
  onReady?(): void;
  onError?(error: unknown): void;
}

export interface RigPreview {
  readonly ready: Promise<void>;
  readonly clips: readonly { id: string; name: string; duration: number }[];
  subscribe(listener: (readout: PreviewReadout) => void): () => void;
  togglePlayback(): void;
  stop(): void;
  selectClip(clipId: string): void;
  seek(seconds: number): void;
  setSpeed(speed: number): void;
  setCrossfade(seconds: number): void;
  setView(zoom: number, showGrid: boolean): void;
  dispose(): void;
}

function emptyCapture(): PreviewCapture {
  return {
    frameTimestampsMs: [], frameIntervalsMs: [], evaluationMs: [], skinningMs: [],
    uploadMs: [], renderMs: [], totalMs: [], droppedSamples: 0,
  };
}

export function createRigPreview(options: RigPreviewOptions): RigPreview {
  const { host, document: data, rigId, artboard } = options;
  const document = host.ownerDocument;
  const window = document.defaultView;
  if (!window) throw new Error('The preview requires a browser window.');
  const evaluator = createRigEvaluator(data, rigId);
  const geometry = createGeometryEvaluator(data, rigId);
  const controller = createPlaybackController(evaluator);
  const clips = Object.freeze(data.clips.filter((clip) => clip.rigId === rigId)
    .map(({ id, name, duration }) => Object.freeze({ id, name, duration })));
  if (!clips[0]) throw new Error('The preview requires at least one clip.');
  controller.play(clips[0].id);
  controller.pause();
  let pose = controller.getPose();
  const frame = geometry.createOutput();
  geometry.write(pose, frame);
  const app = new Application();
  const abort = new AbortController();
  const textures = new Map<string, Texture>();
  const bitmaps = new Set<ImageBitmap>();
  const listeners = new Set<(readout: PreviewReadout) => void>();
  let disposed = false;
  let applicationSettled = false;
  let applicationDisposed = false;
  let initialized = false;
  let view: RigView | undefined;
  let scene: Container | undefined;
  let guides: Container | undefined;
  let observer: ResizeObserver | undefined;
  let raf: number | null = null;
  let lastTimestamp: number | null = null;
  let lastReadout = -Infinity;
  let pageHidden = false;
  let zoom = options.zoom ?? 1;
  let showGrid = options.showGrid ?? true;
  let crossfadeSeconds = 0.2;
  let renderedFrames = 0;
  let capture: PreviewCapture | null = null;
  let capturing = false;
  let diagnosticHandle: PreviewDiagnostics | undefined;
  const resolution = Math.min(window.devicePixelRatio || 1, 2);
  const rigData = data.rigs.find((rig) => rig.id === rigId)!;
  const weightedInfluences = rigData.attachments.reduce((sum, attachment) => sum + (attachment.type === 'mesh'
    ? attachment.vertices.reduce((total, vertex) => total + vertex.influences.length, 0) : 0), 0);
  const regionVertices = rigData.attachments.filter((attachment) => attachment.type === 'region').length * 4;

  function readout(state = controller.getState()): PreviewReadout {
    return { state, duration: clips.find((clip) => clip.id === state.clipId)?.duration ?? 0, crossfadeSeconds };
  }

  function notify(state = controller.getState()): void {
    const value = readout(state);
    for (const listener of listeners) listener(value);
  }

  function cancelFrame(): void {
    if (raf !== null) window!.cancelAnimationFrame(raf);
    raf = null;
    lastTimestamp = null;
  }

  function cleanApplication(): void {
    if (!applicationSettled || applicationDisposed) return;
    applicationDisposed = true;
    disposePreviewApplication(app, window!);
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    cancelFrame();
    abort.abort();
    observer?.disconnect();
    document.removeEventListener('visibilitychange', visibility);
    window!.removeEventListener('pagehide', pageHide);
    window!.removeEventListener('pageshow', pageShow);
    if (diagnosticHandle && window!.__studioPreview === diagnosticHandle) delete window!.__studioPreview;
    listeners.clear();
    const failures: unknown[] = [];
    const attempt = (cleanup: () => void) => { try { cleanup(); } catch (error) { failures.push(error); } };
    attempt(() => view?.dispose());
    attempt(cleanApplication);
    for (const texture of textures.values()) attempt(() => texture.destroy(true));
    textures.clear();
    for (const bitmap of bitmaps) attempt(() => bitmap.close());
    bitmaps.clear();
    if (failures.length > 0) throw new AggregateError(failures, 'Preview cleanup failed.');
  }

  function fail(error: unknown): void {
    if (disposed) return;
    let reported = error;
    try { dispose(); }
    catch (cleanupError) {
      reported = new AggregateError([error, cleanupError], `${error instanceof Error ? error.message : 'The preview failed.'} Cleanup also failed.`);
    }
    options.onError?.(reported);
  }

  function render(): void {
    if (!initialized || disposed) return;
    app.render();
    renderedFrames++;
  }

  function updateGeometry(): void {
    pose = controller.getPose();
    geometry.write(pose, frame);
    view!.update();
  }

  function active(): boolean {
    const state = controller.getState();
    return !disposed && initialized && !document.hidden && !pageHidden && state.status === 'playing' && state.speed > 0;
  }

  function schedule(): void {
    if (raf !== null || !active()) return;
    if (lastTimestamp === null) lastTimestamp = window!.performance.now();
    raf = window!.requestAnimationFrame(tick);
  }

  function tick(_frameTimestamp: number): void {
    raf = null;
    if (!active()) { lastTimestamp = null; return; }
    const timestamp = window!.performance.now();
    const interval = timestamp - lastTimestamp!;
    lastTimestamp = timestamp;
    try {
      const profile = capturing && capture !== null;
      const started = profile ? window!.performance.now() : 0;
      controller.update(interval / 1000);
      pose = controller.getPose();
      const evaluated = profile ? window!.performance.now() : 0;
      geometry.write(pose, frame);
      const skinned = profile ? window!.performance.now() : 0;
      view!.update();
      const uploaded = profile ? window!.performance.now() : 0;
      render();
      const rendered = profile ? window!.performance.now() : 0;
      if (profile) {
        if (capture!.frameTimestampsMs.length < MAX_CAPTURE_SAMPLES) {
          capture!.frameTimestampsMs.push(timestamp);
          capture!.frameIntervalsMs.push(interval);
          capture!.evaluationMs.push(evaluated - started);
          capture!.skinningMs.push(skinned - evaluated);
          capture!.uploadMs.push(uploaded - skinned);
          capture!.renderMs.push(rendered - uploaded);
          capture!.totalMs.push(rendered - started);
        } else capture!.droppedSamples++;
      }
      const state = controller.getState();
      if (timestamp - lastReadout >= READOUT_INTERVAL_MS || state.status !== 'playing') {
        lastReadout = timestamp;
        notify(state);
      }
      schedule();
    } catch (error) { fail(error); }
  }

  function resize(): void {
    if (!initialized || disposed) return;
    const { width, height } = host.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    app.renderer.resize(width, height);
    const transform = fitArtboard(width, height, artboard.width, artboard.height, zoom);
    scene!.scale.set(transform.scale);
    scene!.position.set(transform.x, transform.y);
    setViewportGridVisible(guides!, showGrid);
    render();
  }

  function visibility(): void {
    if (document.hidden) cancelFrame();
    else { render(); schedule(); }
  }

  function pageHide(event: PageTransitionEvent): void {
    if (!event.persisted) dispose();
    else { pageHidden = true; cancelFrame(); }
  }

  function pageShow(event: PageTransitionEvent): void {
    if (!event.persisted || disposed) return;
    pageHidden = false;
    render();
    schedule();
  }

  async function loadTexture(asset: (typeof data.assets)[number]): Promise<void> {
    const url = options.textureUrls.get(asset.id);
    if (!url) throw new Error(`Missing texture URL for ${asset.id}.`);
    const response = await fetch(url, { signal: abort.signal });
    if (!response.ok) throw new Error(`Could not load texture: ${asset.id}.`);
    const bitmap = await createImageBitmap(await response.blob(), { premultiplyAlpha: 'premultiply' });
    if (disposed || abort.signal.aborted) { bitmap.close(); return; }
    if (bitmap.width !== asset.width || bitmap.height !== asset.height) {
      bitmap.close();
      throw new Error(`Texture dimensions do not match asset: ${asset.id}.`);
    }
    try {
      const texture = new Texture({ source: new ImageSource({ resource: bitmap, alphaMode: 'premultiplied-alpha' }), label: asset.id });
      bitmaps.add(bitmap);
      textures.set(asset.id, texture);
    } catch (error) { bitmap.close(); throw error; }
  }

  function installDiagnostics(): void {
    if (!options.diagnostics) return;
    diagnosticHandle = {
      snapshot() {
        const state = controller.getState();
        return {
          pose: controller.getPose(),
          geometry: {
            rigId: frame.rigId, drawOrder: [...frame.drawOrder],
            attachments: frame.attachments.map((attachment) => ({
              id: attachment.id, assetId: attachment.assetId, type: attachment.type,
              positions: Array.from(attachment.positions), uvs: Array.from(attachment.uvs),
              indices: Array.from(attachment.indices), opacity: attachment.opacity,
            })),
          },
          state,
          settings: {
            artboardWidth: artboard.width, artboardHeight: artboard.height,
            canvasWidth: app.renderer.width, canvasHeight: app.renderer.height,
            dpr: window!.devicePixelRatio || 1, resolution, zoom, showGrid, crossfadeSeconds,
            clipId: state.clipId ?? '', visible: !document.hidden && !pageHidden,
          },
          counts: {
            bones: rigData.bones.length, attachments: frame.attachments.length,
            vertices: frame.attachments.reduce((sum, attachment) => sum + attachment.positions.length / 2, 0),
            triangles: frame.attachments.reduce((sum, attachment) => sum + attachment.indices.length / 3, 0),
            influences: weightedInfluences + regionVertices, weightedInfluences, regionVertices,
            textures: textures.size, textureBytesEstimate: data.assets.reduce((sum, asset) => sum + asset.width * asset.height * 4, 0),
            renderedFrames, rafScheduled: raf !== null,
          },
          timings: { capturing, sampleCount: capture?.frameTimestampsMs.length ?? 0, droppedSamples: capture?.droppedSamples ?? 0 },
        };
      },
      startCapture() { capture = emptyCapture(); capturing = true; },
      endCapture() {
        capturing = false;
        return structuredClone(capture ?? emptyCapture());
      },
    };
    window!.__studioPreview = diagnosticHandle;
  }

  const ready = (async () => {
    try {
      await Promise.all([
        (async () => {
          try {
            await app.init({
              preference: 'webgl', backgroundColor: 0x121418, antialias: true,
              autoDensity: true, resolution, autoStart: false, sharedTicker: false,
            });
          } finally {
            applicationSettled = true;
            if (disposed) cleanApplication();
          }
        })(),
        Promise.all(data.assets.map(loadTexture)),
      ]);
      if (disposed) return;
      scene = new Container({ label: 'preview-scene', eventMode: 'none' });
      guides = createViewportGuides({ width: artboard.width, height: artboard.height, showGrid });
      view = createRigView({ frame, textures });
      scene.addChild(guides, view.container);
      app.stage.addChild(scene);
      app.canvas.dataset.testid = 'studio-canvas';
      app.canvas.setAttribute('role', 'img');
      app.canvas.setAttribute('aria-label', 'Layered priest animation preview');
      host.appendChild(app.canvas);
      initialized = true;
      observer = new ResizeObserver(() => { try { resize(); } catch (error) { fail(error); } });
      observer.observe(host);
      document.addEventListener('visibilitychange', visibility);
      window!.addEventListener('pagehide', pageHide);
      window!.addEventListener('pageshow', pageShow);
      resize();
      installDiagnostics();
      notify();
      options.onReady?.();
    } catch (error) { fail(error); throw error; }
  })();

  function changed(action: () => void, advance = true): void {
    assertReady();
    const timestamp = window!.performance.now();
    if (advance && lastTimestamp !== null && active()) controller.update((timestamp - lastTimestamp) / 1000);
    action();
    cancelFrame();
    lastTimestamp = timestamp;
    updateGeometry();
    render();
    notify();
    if (active()) schedule();
    else lastTimestamp = null;
  }

  function assertReady(): void {
    if (disposed || !initialized) throw new Error('The preview is not ready.');
  }

  return {
    ready,
    clips,
    subscribe(listener) { listeners.add(listener); listener(readout()); return () => { listeners.delete(listener); }; },
    togglePlayback() {
      assertReady();
      const state = controller.getState();
      changed(() => {
        if (state.status === 'playing') controller.pause();
        else if (state.status === 'paused') controller.resume();
        else controller.play(state.clipId ?? clips[0]!.id);
      });
    },
    stop() { changed(() => controller.stop()); },
    selectClip(clipId) {
      assertReady();
      if (!clips.some((clip) => clip.id === clipId)) throw new Error(`Unknown preview clip: ${clipId}.`);
      const playing = controller.getState().status === 'playing';
      changed(() => {
        controller.play(clipId, { crossfadeSeconds: playing ? crossfadeSeconds : 0 });
        if (!playing) controller.pause();
      });
    },
    seek(seconds) { changed(() => controller.seek(seconds), false); },
    setSpeed(value) {
      if (!Number.isFinite(value) || value < 0) throw new RangeError('Speed must be finite and nonnegative.');
      changed(() => controller.setSpeed(value));
    },
    setCrossfade(value) {
      assertReady();
      if (!Number.isFinite(value) || value < 0) throw new RangeError('Crossfade must be finite and nonnegative.');
      crossfadeSeconds = value;
      notify();
    },
    setView(value, grid) {
      if (!Number.isFinite(value) || value <= 0) throw new RangeError('Zoom must be positive and finite.');
      zoom = value; showGrid = grid;
      resize();
    },
    dispose,
  };
}
