import { useEffect, useState } from 'react';
import type { RigPreview } from '@studio/runtime-pixi';
import type { AppInfo } from '../shared/bridge';
import { ViewControls } from './components/ViewControls';
import { Viewport, type CanvasState } from './components/Viewport';
import { TransportControls } from './components/TransportControls';

export function App() {
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [preview, setPreview] = useState<RigPreview | null>(null);
  const [canvasState, setCanvasState] = useState<CanvasState>({ kind: 'loading' });
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [bridgeUnavailable, setBridgeUnavailable] = useState(false);
  const isReady = canvasState.kind === 'ready';

  useEffect(() => {
    let active = true;
    const readInfo = async () => {
      try {
        const info = await window.studio.getAppInfo();
        if (active) setAppInfo(info);
      } catch {
        if (active) setBridgeUnavailable(true);
      }
    };
    void readInfo();
    return () => { active = false; };
  }, []);

  return (
    <div className="studio-shell">
      <header className="app-header">
        <div className="app-brand">
          <span className="studio-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M17 5H7v7h10v7H7M5 3v4M19 17v4" />
            </svg>
          </span>
          <span className="app-name">Slot Animation Studio</span>
          <span className="header-divider" aria-hidden="true" />
          <span className="project-name">Priest fixture preview</span>
        </div>
        <span className="local-label">Local workspace</span>
      </header>

      <main className="workspace-layout">
        <aside className="side-panel project-panel" aria-label="Project">
          <div className="panel-heading"><h2>Fixture</h2><span className="panel-count">9</span></div>
          <div className="project-empty">
            <svg className="empty-project-icon" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <path d="M5.5 9.5h8l3-4h10v21h-21zM5.5 12.5h21" />
            </svg>
            <p>Geometric priest</p>
            <span>9 original layers · 12 bones · 5 clips</span>
          </div>
          <div className="panel-note">
            <span className="eyebrow">Animation preview</span>
            <p>Play the supplied clips and inspect their weighted robe. Authoring and project saving are not available yet.</p>
          </div>
        </aside>

        <section className="workspace-center" aria-labelledby="workspace-heading">
          <div className="workspace-toolbar">
            <div className="workspace-title">
              <h1 id="workspace-heading">Workspace</h1>
              <span>Priest preview</span>
            </div>
            <ViewControls
              zoom={zoom}
              showGrid={showGrid}
              disabled={!isReady}
              onZoomChange={setZoom}
              onGridChange={setShowGrid}
            />
          </div>

          <div className="viewport-area" aria-busy={canvasState.kind === 'loading'}>
            <Viewport zoom={zoom} showGrid={showGrid} onStateChange={setCanvasState} onPreviewReady={setPreview} />
            <div className="viewport-label" aria-hidden="true">320 × 480 <span>/</span> Fixture</div>
            {canvasState.kind === 'loading' && (
              <div className="canvas-message"><p>Preparing canvas…</p></div>
            )}
            {canvasState.kind === 'error' && (
              <div className="canvas-message canvas-error" role="alert">
                <p>Canvas unavailable</p>
                <span>{canvasState.message}</span>
              </div>
            )}
            {isReady && <div className="empty-canvas-label">Weighted robe · Original fixture</div>}
            <div className="viewport-footnote" aria-hidden="true">X → <span>Y ↓</span></div>
          </div>

          <TransportControls preview={preview} />
          <div className="workspace-caption">
            <span>Preview controls</span>
            <span>100% = fit to window</span>
          </div>
        </section>

        <aside className="side-panel view-panel" aria-label="View details">
          <div className="panel-heading"><h2>View</h2><span className="panel-tag">Fixture</span></div>
          <section className="inspector-section" aria-labelledby="artboard-heading">
            <h3 id="artboard-heading">Artboard</h3>
            <dl className="view-properties">
              <div><dt>Width</dt><dd>320 <span>px</span></dd></div>
              <div><dt>Height</dt><dd>480 <span>px</span></dd></div>
              <div><dt>Aspect ratio</dt><dd>2 : 3</dd></div>
            </dl>
          </section>
          <section className="inspector-section" aria-labelledby="guides-heading">
            <h3 id="guides-heading">Guides</h3>
            <dl className="view-properties">
              <div><dt>Grid</dt><dd>{showGrid ? 'Visible' : 'Hidden'}</dd></div>
              <div><dt>Origin</dt><dd>Top left</dd></div>
              <div><dt>View scale</dt><dd>{Math.round(zoom * 100)}% of fit</dd></div>
            </dl>
          </section>
          <div className="view-note">No selection</div>
        </aside>
      </main>

      <footer className="app-statusbar">
        <div className="canvas-status" role="status" aria-live="polite">
          <span className={`status-dot ${isReady ? 'is-ready' : ''}`} aria-hidden="true" />
          {canvasState.kind === 'ready' ? 'Canvas ready' : canvasState.kind === 'error' ? 'Canvas unavailable' : 'Preparing canvas'}
        </div>
        <span className="status-project">Fixture preview</span>
        <span className="app-version">
          {appInfo ? `v${appInfo.version}` : bridgeUnavailable ? 'App details unavailable' : 'Reading app details…'}
        </span>
      </footer>
    </div>
  );
}
