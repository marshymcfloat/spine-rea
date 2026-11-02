import { describe, expect, it } from 'vitest';
import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH, fitViewport } from './viewport';

describe('fitViewport', () => {
  it('fits a landscape artboard inside the available area', () => {
    expect(fitViewport(2016, 1176)).toEqual({ scale: 1, x: 48, y: 48 });
  });

  it('centers the artboard in a portrait viewport without stretching it', () => {
    const result = fitViewport(480, 800);
    expect(result.scale).toBeCloseTo(0.2);
    expect(result.x).toBeCloseTo(48);
    expect(result.y).toBeCloseTo(292);
    expect(result.x * 2 + ARTBOARD_WIDTH * result.scale).toBeCloseTo(480);
    expect(result.y * 2 + ARTBOARD_HEIGHT * result.scale).toBeCloseTo(800);
  });

  it('zooms about the artboard center', () => {
    const result = fitViewport(2016, 1176, 2);
    expect(result.scale).toBe(2);
    expect(result.x + ARTBOARD_WIDTH * result.scale / 2).toBe(1008);
    expect(result.y + ARTBOARD_HEIGHT * result.scale / 2).toBe(588);
  });

  it('keeps a positive fitted area in very small viewports', () => {
    const result = fitViewport(32, 24);
    expect(result.scale).toBeGreaterThan(0);
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeGreaterThanOrEqual(0);
    expect(ARTBOARD_WIDTH * result.scale).toBeLessThanOrEqual(32);
    expect(ARTBOARD_HEIGHT * result.scale).toBeLessThanOrEqual(24);
  });

  it.each([
    [0, 100, 1],
    [100, -1, 1],
    [100, 100, 0],
    [Number.NaN, 100, 1],
    [100, Number.POSITIVE_INFINITY, 1],
    [100, 100, Number.NaN],
  ])('rejects invalid dimensions or zoom: %s, %s, %s', (width, height, zoom) => {
    expect(() => fitViewport(width, height, zoom)).toThrow(RangeError);
  });
});
