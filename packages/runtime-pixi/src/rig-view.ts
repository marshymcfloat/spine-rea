import type { RigGeometryFrame } from '@studio/animation-core';
import { Container, Mesh, MeshGeometry, type Texture } from 'pixi.js';

export interface RigViewOptions {
  frame: RigGeometryFrame;
  textures: ReadonlyMap<string, Texture>;
}

export interface RigView {
  container: Container;
  update(): void;
  dispose(): void;
}

export function createRigView({ frame, textures }: RigViewOptions): RigView {
  const attachments = new Map(frame.attachments.map((attachment) => [attachment.id, attachment]));
  if (attachments.size !== frame.attachments.length || frame.drawOrder.length !== attachments.size ||
      new Set(frame.drawOrder).size !== attachments.size) throw new Error('Rig draw order must contain each attachment once.');
  const ordered = frame.drawOrder.map((id) => {
    const attachment = attachments.get(id);
    if (!attachment) throw new Error(`Unknown draw-order attachment: ${id}.`);
    const texture = textures.get(attachment.assetId);
    if (!texture) throw new Error(`Missing texture for asset: ${attachment.assetId}.`);
    return { attachment, texture };
  });
  const container = new Container({ label: frame.rigId, eventMode: 'none' });
  container.interactiveChildren = false;
  const retained: { attachment: RigGeometryFrame['attachments'][number]; mesh: Mesh; geometry: MeshGeometry }[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    container.destroy({ children: true, texture: false, textureSource: false });
    for (const entry of retained) entry.geometry.destroy(true);
  };
  try {
    for (const { attachment, texture } of ordered) {
      const geometry = new MeshGeometry({ positions: attachment.positions, uvs: attachment.uvs, indices: attachment.indices });
      try {
        const mesh = new Mesh({ geometry, texture, label: attachment.id, eventMode: 'none' });
        mesh.alpha = attachment.opacity;
        retained.push({ attachment, mesh, geometry });
        container.addChild(mesh);
      } catch (error) {
        geometry.destroy(true);
        throw error;
      }
    }
  } catch (error) {
    dispose();
    throw error;
  }
  return {
    container,
    update() {
      if (disposed) throw new Error('Rig view is disposed.');
      for (const { attachment, mesh, geometry } of retained) {
        geometry.getBuffer('aPosition').update();
        mesh.alpha = attachment.opacity;
      }
    },
    dispose,
  };
}
