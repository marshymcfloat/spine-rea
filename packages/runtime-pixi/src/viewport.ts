export const ARTBOARD_WIDTH = 1920;
export const ARTBOARD_HEIGHT = 1080;
const VIEWPORT_PADDING = 48;

export interface ViewportTransform {
  scale: number;
  x: number;
  y: number;
}

/** Zoom is relative to the fitted artboard, so 1 means fit at any window size. */
export function fitViewport(width: number, height: number, zoom = 1): ViewportTransform {
  if (![width, height, zoom].every((value) => Number.isFinite(value) && value > 0)) {
    throw new RangeError('Viewport dimensions and zoom must be finite positive numbers.');
  }

  const padding = Math.min(VIEWPORT_PADDING, width / 4, height / 4);
  const scale = Math.min(
    (width - padding * 2) / ARTBOARD_WIDTH,
    (height - padding * 2) / ARTBOARD_HEIGHT,
  ) * zoom;

  return {
    scale,
    x: (width - ARTBOARD_WIDTH * scale) / 2,
    y: (height - ARTBOARD_HEIGHT * scale) / 2,
  };
}
