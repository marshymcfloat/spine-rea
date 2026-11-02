import { useEffect, useRef } from 'react';
import { createRigPreview, type RigPreview } from '@studio/runtime-pixi';
import { createPriestProjectFixture, createPriestStressFixture } from '@studio/test-fixtures';
import { createPriestTextureUrls } from '@studio/test-fixtures/texture-urls';

export type CanvasState = { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; message: string };
export interface ViewportProps {
  zoom: number;
  showGrid: boolean;
  onStateChange: (state: CanvasState) => void;
  onPreviewReady: (preview: RigPreview | null) => void;
}

export function Viewport({ zoom, showGrid, onStateChange, onPreviewReady }: ViewportProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<RigPreview | null>(null);
  const settingsRef = useRef({ zoom, showGrid });
  useEffect(() => {
    settingsRef.current = { zoom, showGrid };
    previewRef.current?.setView(zoom, showGrid);
  }, [zoom, showGrid]);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let preview: RigPreview | undefined;
    onStateChange({ kind: 'loading' });
    try {
      const diagnostics = window.__studioDiagnosticsRequested;
      const data = diagnostics?.stressGridSide === undefined
        ? createPriestProjectFixture() : createPriestStressFixture(diagnostics.stressGridSide);
      preview = createRigPreview({
        host, document: data, rigId: data.rigs[0]!.id,
        artboard: { width: 320, height: 480 }, textureUrls: createPriestTextureUrls(),
        ...settingsRef.current, diagnostics: diagnostics !== undefined,
        onReady() {
          previewRef.current = preview!;
          onPreviewReady(preview!);
          onStateChange({ kind: 'ready' });
        },
        onError(error) {
          previewRef.current = null;
          onPreviewReady(null);
          onStateChange({ kind: 'error', message: error instanceof Error ? error.message : 'The preview could not be loaded.' });
        },
      });
      void preview.ready.catch(() => {});
    } catch (error) {
      onStateChange({ kind: 'error', message: error instanceof Error ? error.message : 'The preview could not be loaded.' });
    }
    return () => {
      preview?.dispose();
      previewRef.current = null;
      onPreviewReady(null);
    };
  }, [onStateChange, onPreviewReady]);
  return <div className="pixi-viewport" ref={hostRef} />;
}
