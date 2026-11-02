# Shared geometry contract

Decision date: 2026-11-03. Preserved implementation contract from
[SPI-9 / draft PR #5](https://github.com/marshymcfloat/slot-animation-studio/pull/5).
That proof remains separate from the merged foundation while its performance
acceptance is open. Product v0.2 retains this work and moves mesh authoring,
topology/rebind UI and painted/numeric weights to P2. The API below describes
the retained proof; it does not claim those authoring tools exist. Read
[formats](FORMATS.md), [playback](PLAYBACK.md) and [performance](PERFORMANCE.md).

`createGeometryEvaluator(document, rigId)` snapshots validated data at a document
revision and derives inverse setup matrices and resolved influence indices once.
It uses the same rig identity/source array order as `createRigEvaluator`.

`createOutput()` returns independent caller-owned `RigGeometryFrame` buffers.
`write(pose, output)` fills those same position arrays and attachment opacity;
it accepts only outputs created by that evaluator. Invalid poses, output shapes,
singular/unrepresentable inverse binds or nonfinite/Float32-overflow geometry fail
explicitly. A failed write leaves the previous output intact. Animated zero scale
is valid. Existing pose/clip/player snapshots retain their independent ownership.

Every output has rig ID, source-ordered attachments and explicit flat draw order.
Each attachment has ID, asset ID, type, interleaved XY `Float32Array` positions,
interleaved normalized UV `Float32Array`, triangle `Uint32Array` indices and opacity.
Identity, topology and UVs stay fixed for its revision. Consumers must not change
them. Writes replace positions/opacity; they do not rebuild topology or resources.

Weighted positions use `sum(weight * currentWorld * inverseSetupWorld * bindVertex)`.
Bind vertices are already in rig space; no bone transform is applied again by Pixi.
Weights are validated, not silently normalized. Region quads use image corners
minus the image-pixel pivot, then attachment-local and current bone transforms.
Source-image UVs remain fixed. The character scene transform belongs to the host.

`createRigView({ frame, textures })` in `@studio/runtime-pixi` creates retained Pixi
meshes from this geometry, with children in `frame.drawOrder`. `update()` uploads
the changed positions and opacity without evaluating bones or skinning.
`dispose()` is idempotent and releases owned geometry/containers, never the supplied
textures. Hosts own texture loading/disposal, one elapsed-time clock/render path,
visibility/resume policy and transient preview controls. These controls do not edit
authored documents and do not require document commands.

The original priest project and runtime fixtures exercise the same geometry path.
Their equivalence is not compiler/export proof; compilation remains a separate task.
