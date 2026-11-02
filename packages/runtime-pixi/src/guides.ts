import { Container, Graphics } from 'pixi.js';
import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH } from './viewport';

const GRID_LABEL = 'viewport-grid';
const GRID_SPACING = 120;

export interface ViewportGuidesOptions {
  showGrid?: boolean;
}

export function createViewportGuides(options: ViewportGuidesOptions = {}): Container {
  const guides = new Container({ label: 'viewport-guides' });
  guides.eventMode = 'none';

  const artboard = new Graphics()
    .rect(0, 0, ARTBOARD_WIDTH, ARTBOARD_HEIGHT)
    .fill(0x1a1c20)
    .stroke({ color: 0x55565c, width: 1, pixelLine: true });

  const grid = new Graphics({ label: GRID_LABEL });
  for (let x = GRID_SPACING; x < ARTBOARD_WIDTH; x += GRID_SPACING) {
    grid.moveTo(x, 0).lineTo(x, ARTBOARD_HEIGHT);
  }
  for (let y = GRID_SPACING; y < ARTBOARD_HEIGHT; y += GRID_SPACING) {
    grid.moveTo(0, y).lineTo(ARTBOARD_WIDTH, y);
  }
  grid.stroke({ color: 0x303238, width: 1, pixelLine: true });
  grid.visible = options.showGrid ?? true;

  const center = new Graphics()
    .moveTo(ARTBOARD_WIDTH / 2 - 18, ARTBOARD_HEIGHT / 2)
    .lineTo(ARTBOARD_WIDTH / 2 + 18, ARTBOARD_HEIGHT / 2)
    .moveTo(ARTBOARD_WIDTH / 2, ARTBOARD_HEIGHT / 2 - 18)
    .lineTo(ARTBOARD_WIDTH / 2, ARTBOARD_HEIGHT / 2 + 18)
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
