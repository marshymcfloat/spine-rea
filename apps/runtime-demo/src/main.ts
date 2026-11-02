import { createRigPreview, type RigPreview } from '@studio/runtime-pixi';
import { createPriestRuntimeFixture, createPriestStressFixture } from '@studio/test-fixtures';
import { createPriestTextureUrls } from '@studio/test-fixtures/texture-urls';

const host = document.getElementById('viewport');
const status = document.getElementById('status');
const message = document.getElementById('message');
const clip = document.getElementById('clip') as HTMLSelectElement | null;
const play = document.getElementById('play') as HTMLButtonElement | null;
const stop = document.getElementById('stop') as HTMLButtonElement | null;
const seek = document.getElementById('seek') as HTMLInputElement | null;
const speed = document.getElementById('speed') as HTMLSelectElement | null;
const fade = document.getElementById('fade') as HTMLSelectElement | null;
const time = document.getElementById('time');
if (!host || !status || !message || !clip || !play || !stop || !seek || !speed || !fade || !time) {
  throw new Error('The demo layout is incomplete.');
}

let disposed = false;
let ready = false;
let preview: RigPreview | undefined;
const cleanups: (() => void)[] = [];
function dispose() {
  if (disposed) return;
  disposed = true;
  window.removeEventListener('pagehide', pageHide);
  for (const cleanup of cleanups) cleanup();
  preview?.dispose();
}
function pageHide(event: PageTransitionEvent) { if (!event.persisted) dispose(); }
function bind(element: HTMLElement, event: string, handler: () => void) {
  element.addEventListener(event, handler);
  cleanups.push(() => element.removeEventListener(event, handler));
}
function failed(error: unknown) {
  if (disposed) return;
  ready = false;
  status!.textContent = 'Canvas unavailable';
  message!.hidden = false;
  message!.textContent = error instanceof Error ? error.message : 'The preview could not be initialized.';
  message!.setAttribute('role', 'alert');
  for (const control of [clip, play, stop, seek, speed, fade]) control!.disabled = true;
}

try {
  const diagnostics = window.__studioDiagnosticsRequested;
  const data = diagnostics?.stressGridSide === undefined
    ? createPriestRuntimeFixture() : createPriestStressFixture(diagnostics.stressGridSide);
  preview = createRigPreview({
    host, document: data, rigId: data.rigs[0]!.id,
    artboard: { width: 320, height: 480 }, textureUrls: createPriestTextureUrls(),
    diagnostics: diagnostics !== undefined,
    onReady() {
      ready = true;
      message!.hidden = true;
      status!.textContent = 'Canvas ready';
      for (const control of [clip, play, stop, seek, speed, fade]) control!.disabled = false;
    },
    onError: failed,
  });
  for (const option of preview.clips) {
    const element = document.createElement('option');
    element.value = option.id;
    element.textContent = option.name;
    clip.appendChild(element);
  }
  cleanups.push(preview.subscribe((readout) => {
    clip!.value = readout.state.clipId ?? preview!.clips[0]!.id;
    play!.textContent = readout.state.status === 'playing' ? 'Pause' : 'Play';
    seek!.max = String(readout.duration || 1);
    seek!.value = String(readout.state.timeSeconds);
    seek!.disabled = !ready || readout.state.clipId === null;
    time!.textContent = `${readout.state.timeSeconds.toFixed(2)} s`;
    speed!.value = String(readout.state.speed);
    fade!.value = String(readout.crossfadeSeconds);
  }));
  bind(clip, 'change', () => preview!.selectClip(clip!.value));
  bind(play, 'click', () => preview!.togglePlayback());
  bind(stop, 'click', () => preview!.stop());
  bind(seek, 'input', () => preview!.seek(Number(seek!.value)));
  bind(speed, 'change', () => preview!.setSpeed(Number(speed!.value)));
  bind(fade, 'change', () => preview!.setCrossfade(Number(fade!.value)));
  void preview.ready.catch(() => {});
} catch (error) { failed(error); }

window.addEventListener('pagehide', pageHide);
if (import.meta.hot) import.meta.hot.dispose(dispose);
