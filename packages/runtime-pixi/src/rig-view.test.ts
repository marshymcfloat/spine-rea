import type { RigGeometryFrame } from '@studio/animation-core';
import { Mesh, Texture } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { createRigView } from './rig-view';

function frame(): RigGeometryFrame {
  const attachment = (id: string) => ({
    id, assetId: 'texture', type: 'mesh' as const, opacity: 1,
    positions: new Float32Array([0, 0, 10, 0, 0, 10]),
    uvs: new Float32Array([0, 0, 1, 0, 0, 1]), indices: new Uint32Array([0, 1, 2]),
  });
  return { rigId: 'rig', attachments: [attachment('front'), attachment('back')], drawOrder: ['back', 'front'] };
}

describe('retained Pixi rig adapter', () => {
  it('retains geometry buffers and follows explicit draw order without a GPU', () => {
    const data = frame();
    const view = createRigView({ frame: data, textures: new Map([['texture', Texture.EMPTY]]) });
    expect(view.container.children.map((child) => child.label)).toEqual(['back', 'front']);
    const mesh = view.container.children[0] as Mesh;
    const geometry = mesh.geometry;
    const positionBuffer = geometry.getBuffer('aPosition');
    const updated = vi.spyOn(positionBuffer, 'update');
    data.attachments[1]!.positions[0] = 7;
    data.attachments[1]!.opacity = 0.25;
    view.update();
    expect(mesh.geometry).toBe(geometry);
    expect(geometry.getBuffer('aPosition')).toBe(positionBuffer);
    expect(positionBuffer.data).toBe(data.attachments[1]!.positions);
    expect(positionBuffer.data[0]).toBe(7);
    expect(mesh.alpha).toBe(0.25);
    expect(updated).toHaveBeenCalledOnce();
    view.dispose();
  });

  it('disposes owned geometry exactly once and never destroys supplied textures', () => {
    const texture = new Texture();
    const view = createRigView({ frame: frame(), textures: new Map([['texture', texture]]) });
    const geometry = (view.container.children[0] as Mesh).geometry;
    const destroyGeometry = vi.spyOn(geometry, 'destroy');
    const destroyTexture = vi.spyOn(texture, 'destroy');
    view.dispose();
    view.dispose();
    expect(destroyGeometry).toHaveBeenCalledOnce();
    expect(destroyTexture).not.toHaveBeenCalled();
    expect(() => view.update()).toThrow('disposed');
    texture.destroy();
  });

  it('rejects missing textures before constructing a partial scene', () => {
    expect(() => createRigView({ frame: frame(), textures: new Map() })).toThrow('Missing texture');
  });
});
