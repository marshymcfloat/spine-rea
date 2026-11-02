import {
  parseProjectDocument,
  parseRuntimeDocument,
  type ProjectDocument,
  type RuntimeDocument,
} from '@studio/schema';
import projectData from '../fixtures/priest.project.json';
import runtimeData from '../fixtures/priest.runtime.json';

const projectDocument = parseProjectDocument(projectData);
const runtimeDocument = parseRuntimeDocument(runtimeData);

export function createPriestProjectFixture(): ProjectDocument {
  return structuredClone(projectDocument);
}

export function createPriestRuntimeFixture(): RuntimeDocument {
  return structuredClone(runtimeDocument);
}

/** Diagnostic workload only; the original authored fixture remains unchanged. */
export function createPriestStressFixture(gridSide = 65): RuntimeDocument {
  if (!Number.isInteger(gridSide) || gridSide < 3 || gridSide > 129) {
    throw new RangeError('Stress grid side must be an integer from 3 to 129.');
  }
  const document = createPriestRuntimeFixture();
  const robe = document.rigs[0]!.attachments.find((attachment) => attachment.id === 'robe');
  if (!robe || robe.type !== 'mesh') throw new Error('The priest fixture requires its weighted robe.');
  robe.vertices = [];
  robe.triangles = [];
  for (let row = 0; row < gridSide; row++) {
    const t = row / (gridSide - 1);
    for (let column = 0; column < gridSide; column++) {
      const u = column / (gridSide - 1);
      robe.vertices.push({
        x: 100 + 120 * u, y: 244 + 160 * t, u, v: t,
        influences: [
          { boneId: 'root', weight: 0.1 },
          { boneId: 'robe-top', weight: 0.9 * (1 - t) ** 2 },
          { boneId: 'robe-mid', weight: 1.8 * t * (1 - t) },
          { boneId: 'robe-hem', weight: 0.9 * t ** 2 },
        ],
      });
      if (row < gridSide - 1 && column < gridSide - 1) {
        const a = row * gridSide + column;
        robe.triangles.push(a, a + 1, a + gridSide, a + 1, a + gridSide + 1, a + gridSide);
      }
    }
  }
  return document;
}
