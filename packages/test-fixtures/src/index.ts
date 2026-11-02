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
