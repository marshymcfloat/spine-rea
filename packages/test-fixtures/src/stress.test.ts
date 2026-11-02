import { expect, it } from 'vitest';
import { parseRuntimeDocument } from '@studio/schema';
import { createPriestRuntimeFixture, createPriestStressFixture } from './index';

it('provides a bounded, schema-valid four-influence workload without changing the original', () => {
  const stress = parseRuntimeDocument(createPriestStressFixture());
  const robe = stress.rigs[0]!.attachments.find((item) => item.id === 'robe');
  expect(robe?.type).toBe('mesh');
  if (robe?.type !== 'mesh') throw new Error('Missing stress robe.');
  expect(robe.vertices).toHaveLength(4225);
  expect(robe.triangles).toHaveLength(8192 * 3);
  expect(robe.vertices.every((vertex) => vertex.influences.length === 4)).toBe(true);
  const original = createPriestRuntimeFixture().rigs[0]!.attachments.find((item) => item.id === 'robe');
  expect(original?.type === 'mesh' && original.vertices.length).toBe(9);
  expect(() => createPriestStressFixture(130)).toThrow(RangeError);
  expect(() => createPriestStressFixture(2.5)).toThrow(RangeError);
});
