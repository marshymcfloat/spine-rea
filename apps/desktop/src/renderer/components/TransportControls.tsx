import { useEffect, useState } from 'react';
import type { PreviewReadout, RigPreview } from '@studio/runtime-pixi';

export interface TransportControlsProps { preview: RigPreview | null }

export function TransportControls({ preview }: TransportControlsProps) {
  const [readout, setReadout] = useState<PreviewReadout | null>(null);
  useEffect(() => {
    setReadout(null);
    return preview?.subscribe(setReadout);
  }, [preview]);
  const ready = preview !== null && readout !== null;
  const playing = readout?.state.status === 'playing';
  return (
    <div className="transport-controls" role="group" aria-label="Animation preview controls">
      <label className="clip-control">Clip
        <select aria-label="Animation clip" disabled={!ready} value={readout?.state.clipId ?? preview?.clips[0]?.id ?? ''}
          onChange={(event) => preview?.selectClip(event.currentTarget.value)}>
          {!preview && <option value="">Loading…</option>}
          {preview?.clips.map((clip) => <option key={clip.id} value={clip.id}>{clip.name}</option>)}
        </select>
      </label>
      <button type="button" disabled={!ready} onClick={() => preview?.togglePlayback()}>{playing ? 'Pause' : 'Play'}</button>
      <button type="button" disabled={!ready} onClick={() => preview?.stop()}>Stop</button>
      <input aria-label="Seek animation" type="range" min="0" max={readout?.duration || 1} step="0.001"
        disabled={!ready || readout?.state.clipId === null} value={readout?.state.timeSeconds ?? 0}
        onChange={(event) => preview?.seek(Number(event.currentTarget.value))} />
      <output data-testid="playback-time" aria-label="Playback time" aria-live="off">{(readout?.state.timeSeconds ?? 0).toFixed(2)} s</output>
      <label>Speed
        <select aria-label="Playback speed" disabled={!ready} value={readout?.state.speed ?? 1}
          onChange={(event) => preview?.setSpeed(Number(event.currentTarget.value))}>
          {[0, 0.5, 1, 2, 4].map((value) => <option key={value} value={value}>{value}×</option>)}
        </select>
      </label>
      <label>Fade
        <select aria-label="Crossfade duration" disabled={!ready} value={readout?.crossfadeSeconds ?? 0.2}
          onChange={(event) => preview?.setCrossfade(Number(event.currentTarget.value))}>
          {[0, 0.2, 0.5, 1, 2].map((value) => <option key={value} value={value}>{value} s</option>)}
        </select>
      </label>
    </div>
  );
}
