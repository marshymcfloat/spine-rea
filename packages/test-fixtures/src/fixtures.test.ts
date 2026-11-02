import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PROJECT_FORMAT,
  PROJECT_SCHEMA_VERSION,
  RUNTIME_FORMAT,
  RUNTIME_SCHEMA_VERSION,
  parseProjectDocument,
  parseRuntimeDocument,
  type ProjectDocument,
  type RuntimeDocument,
} from '@studio/schema';
import projectData from '../fixtures/priest.project.json';
import runtimeData from '../fixtures/priest.runtime.json';
import provenance from '../assets/priest/provenance.json';
import { createPriestProjectFixture, createPriestRuntimeFixture } from './index';

function first<T>(values: readonly T[]): T {
  const value = values[0];
  if (value === undefined) throw new Error('Expected a populated fixture collection.');
  return value;
}

function robeOf(document: ProjectDocument | RuntimeDocument) {
  const robe = first(document.rigs).attachments.find((attachment) => attachment.type === 'mesh');
  if (!robe) throw new Error('Expected a weighted robe mesh.');
  return robe;
}

describe('priest document fixtures', () => {
  it('validates both committed JSON documents through their independent format contracts', () => {
    const project = parseProjectDocument(projectData);
    const runtime = parseRuntimeDocument(runtimeData);
    expect(project.format).toBe(PROJECT_FORMAT);
    expect(project.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(runtime.format).toBe(RUNTIME_FORMAT);
    expect(runtime.schemaVersion).toBe(RUNTIME_SCHEMA_VERSION);
    expect(runtime).not.toHaveProperty('editor');
    expect(runtime).not.toHaveProperty('canvas');
    expect(runtime).not.toHaveProperty('name');
    expect(runtime).not.toHaveProperty('id');
    expect(runtime.assets).toEqual(project.assets);
    expect(runtime.rigs).toEqual(project.rigs);
    expect(runtime.clips).toEqual(project.clips);
  });

  it('references the actual original PNG layers and their dimensions', () => {
    const assets = createPriestProjectFixture().assets;
    expect(assets.map(({ path, width, height }) => ({ path, width, height }))).toEqual(
      provenance.assets.map(({ path, width, height }) => ({ path, width, height })),
    );
    expect(assets.every((asset) => asset.mimeType === 'image/png')).toBe(true);
  });

  it('covers weighted grid geometry and front/rear attachment ordering', () => {
    const project = createPriestProjectFixture();
    const rig = first(project.rigs);
    const robe = robeOf(project);
    expect(robe.vertices).toHaveLength(9);
    expect(robe.triangles).toHaveLength(24);
    expect(robe.vertices.some((vertex) => vertex.influences.length > 1)).toBe(true);
    expect(new Set(robe.vertices.flatMap((vertex) => vertex.influences.map((influence) => influence.boneId))).size).toBe(3);
    expect(rig.drawOrder.indexOf('robe')).toBeLessThan(rig.drawOrder.indexOf('torso'));
    expect(rig.drawOrder.indexOf('upper-arm-left')).toBeLessThan(rig.drawOrder.indexOf('torso'));
    expect(rig.drawOrder.indexOf('forearm-right')).toBeGreaterThan(rig.drawOrder.indexOf('torso'));
    expect(rig.drawOrder).not.toEqual(rig.attachments.map((attachment) => attachment.id));
  });

  it('provides the five named technical samples with easing and marker coverage', () => {
    const clips = createPriestProjectFixture().clips;
    expect(clips.map((clip) => clip.name)).toEqual([
      'priest_idle', 'priest_pray', 'priest_kneel', 'priest_praise', 'priest_entity',
    ]);
    const easingKinds = new Set(clips.flatMap((clip) => clip.tracks.flatMap((track) => track.keys.map((key) => key.easing.type))));
    expect(easingKinds).toEqual(new Set(['linear', 'hold', 'bezier']));
    expect(clips.some((clip) => clip.loop)).toBe(true);
    expect(clips.some((clip) => !clip.loop)).toBe(true);
    expect(clips.some((clip) => clip.markers.some((marker) => marker.data !== undefined))).toBe(true);
    expect(clips.some((clip) => clip.tracks.some((track) => track.kind === 'attachment'))).toBe(true);
  });

  it('returns independent project data at every nested editable boundary', () => {
    const project = createPriestProjectFixture();
    const original = createPriestProjectFixture();
    project.name = 'Changed';
    first(project.assets).path = 'changed.png';
    first(first(project.rigs).bones).setup.x = -100;
    first(first(robeOf(project).vertices).influences).weight = 0.1;
    first(first(first(project.clips).tracks).keys).value = 99;
    first(project.rigs).drawOrder.reverse();
    expect(createPriestProjectFixture()).toEqual(original);
    expect(createPriestRuntimeFixture()).toEqual(parseRuntimeDocument(runtimeData));
  });

  it('returns independent runtime objects, including marker payloads', () => {
    const runtime = createPriestRuntimeFixture();
    const original = createPriestRuntimeFixture();
    first(first(runtime.rigs).bones).setup.rotation = 2;
    first(robeOf(runtime).vertices).x = -400;
    const marker = first(runtime.clips.flatMap((clip) => clip.markers).filter((item) => item.data !== undefined));
    if (marker.data === null || typeof marker.data !== 'object' || Array.isArray(marker.data)) {
      throw new Error('Expected an object marker payload.');
    }
    marker.data.changed = true;
    expect(createPriestRuntimeFixture()).toEqual(original);
    expect(createPriestProjectFixture()).toEqual(parseProjectDocument(projectData));
  });

  it('survives JSON roundtrips without losing any fixture values', () => {
    const project = createPriestProjectFixture();
    const runtime = createPriestRuntimeFixture();
    expect(parseProjectDocument(JSON.parse(JSON.stringify(project)))).toEqual(project);
    expect(parseRuntimeDocument(JSON.parse(JSON.stringify(runtime)))).toEqual(runtime);
  });

  it('regenerates the fixed JSON samples without changing files', () => {
    const generator = fileURLToPath(new URL('../scripts/generate-priest-documents.mjs', import.meta.url));
    expect(execFileSync(process.execPath, [generator, '--check'], { encoding: 'utf8' })).toContain(
      'Verified 2 priest JSON documents.',
    );
  });
});
