// Replaces Pixi's generated functions with CSP-safe implementations.
import 'pixi.js/unsafe-eval';

export { createViewportGuides, setViewportGridVisible } from './guides';
export type { ViewportGuidesOptions } from './guides';
export { ARTBOARD_HEIGHT, ARTBOARD_WIDTH, fitViewport } from './viewport';
export type { ViewportTransform } from './viewport';
