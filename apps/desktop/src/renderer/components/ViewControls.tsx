export interface ViewControlsProps {
  zoom: number;
  showGrid: boolean;
  disabled: boolean;
  onZoomChange: (zoom: number) => void;
  onGridChange: (visible: boolean) => void;
}

export function ViewControls({
  zoom, showGrid, disabled, onZoomChange, onGridChange,
}: ViewControlsProps) {
  return (
    <div className="view-controls" role="group" aria-label="View controls">
      <button
        className="icon-button"
        type="button"
        aria-label="Zoom out"
        title="Zoom out"
        disabled={disabled || zoom <= 0.25}
        onClick={() => onZoomChange(Math.max(0.25, zoom - 0.25))}
      >
        <span aria-hidden="true">−</span>
      </button>
      <output className="zoom-value" data-testid="zoom-value" aria-label="Zoom relative to fit">
        {Math.round(zoom * 100)}%
      </output>
      <button
        className="icon-button"
        type="button"
        aria-label="Zoom in"
        title="Zoom in"
        disabled={disabled || zoom >= 3}
        onClick={() => onZoomChange(Math.min(3, zoom + 0.25))}
      >
        <span aria-hidden="true">+</span>
      </button>
      <span className="control-divider" aria-hidden="true" />
      <button
        className="text-button"
        type="button"
        aria-label="Fit artboard"
        disabled={disabled}
        onClick={() => onZoomChange(1)}
      >
        Fit
      </button>
      <button
        className="text-button grid-button"
        type="button"
        aria-pressed={showGrid}
        disabled={disabled}
        onClick={() => onGridChange(!showGrid)}
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
          <path d="M2.5 2.5h11v11h-11zM6 2.5v11M10 2.5v11M2.5 6h11M2.5 10h11" />
        </svg>
        Grid
      </button>
    </div>
  );
}
