import type { Transform } from '@studio/schema';
import type { AffineMatrix } from './types';

export function requireFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
}

export function interpolate(from: number, to: number, alpha: number): number {
  if (alpha === 0 || from === to) return from;
  if (alpha === 1) return to;
  const value = from * (1 - alpha) + to * alpha;
  requireFinite(value, 'Interpolated value');
  return value;
}

function checked(matrix: AffineMatrix, label: string): AffineMatrix {
  for (const value of Object.values(matrix)) requireFinite(value, label);
  return matrix;
}

export function localMatrix(transform: Transform): AffineMatrix {
  const cosine = Math.cos(transform.rotation);
  const sine = Math.sin(transform.rotation);
  return checked({
    a: cosine * transform.scaleX,
    b: sine * transform.scaleX,
    c: -sine * transform.scaleY,
    d: cosine * transform.scaleY,
    tx: transform.x,
    ty: transform.y,
  }, 'Local matrix coefficient');
}

export function compose(parent: AffineMatrix, local: AffineMatrix): AffineMatrix {
  return checked({
    a: parent.a * local.a + parent.c * local.b,
    b: parent.b * local.a + parent.d * local.b,
    c: parent.a * local.c + parent.c * local.d,
    d: parent.b * local.c + parent.d * local.d,
    tx: parent.a * local.tx + parent.c * local.ty + parent.tx,
    ty: parent.b * local.tx + parent.d * local.ty + parent.ty,
  }, 'World matrix coefficient');
}
