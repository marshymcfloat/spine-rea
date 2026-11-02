import { Container, Graphics } from 'pixi.js';
import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH } from './viewport';

const GRID_LABEL = 'viewport-grid';
const GRID_SPACING = 120;

export interface ViewportGuidesOptions {
  showGrid?: boolean;
  width?: number;
  height?: number;
}

export function createViewportGuides(options: ViewportGuidesOptions = {}): Container {
  const width = options.width ?? ARTBOARD_WIDTH;
  const height = options.height ?? ARTBOARD_HEIGHT;
  if (![width, height].every((value) => Number.isFinite(value) && value > 0)) throw new RangeError('Guide dimensions must be positive and finite.');
  const columns = options.width === undefined ? Math.min(64, Math.ceil(width / GRID_SPACING)) : 8;
  const rows = options.height === undefined ? Math.min(64, Math.ceil(height / GRID_SPACING)) : 8;
  const guides = new Container({ label: 'viewport-guides' });
  guides.eventMode = 'none';

  const artboard = new Graphics()
    .rect(0, 0, width, height)
    .fill(0x1a1c20)
    .stroke({ color: 0x55565c, width: 1, pixelLine: true });

  const grid = new Graphics({ label: GRID_LABEL });
  for (let column = 1; column < columns; column++) {
    const x = column * width / columns;
    grid.moveTo(x, 0).lineTo(x, height);
  }
  for (let row = 1; row < rows; row++) {
    const y = row * height / rows;
    grid.moveTo(0, y).lineTo(width, y);
  }
  grid.stroke({ color: 0x303238, width: 1, pixelLine: true });
  grid.visible = options.showGrid ?? true;

  const center = new Graphics()
    .moveTo(width / 2 - 18, height / 2)
    .lineTo(width / 2 + 18, height / 2)
    .moveTo(width / 2, height / 2 - 18)
    .lineTo(width / 2, height / 2 + 18)
    .stroke({ color: 0x666870, width: 1, pixelLine: true });

  const origin = new Graphics()
    .moveTo(-24, 0)
    .lineTo(28, 0)
    .moveTo(0, -24)
    .lineTo(0, 28)
    .stroke({ color: 0xd3a46e, width: 1, pixelLine: true })
    .circle(0, 0, 5)
    .fill(0xd3a46e);

  guides.addChild(artboard, grid, center, origin);
  return guides;
}

export function setViewportGridVisible(guides: Container, visible: boolean): void {
  const grid = guides.getChildByLabel(GRID_LABEL);
  if (grid) grid.visible = visible;
}
