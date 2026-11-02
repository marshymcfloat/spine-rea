# Original priest technical fixtures

These fixtures are original geometric stand-ins for testing layered attachments,
transparent overlaps and bone-weighted meshes. They are not The Ninth Rite's final
priest art and are not imported from an existing animation editor or game asset.

The nine PNG layers cover the head, torso, upper arms, forearms, hands and robe.
The robe is the weighted grid region; the torso covers its upper edge. Separate
front/rear arm layers exercise draw order independently of the bone hierarchy.
Rounded joints and covered wrists provide overlap for technical pose tests.

## Source and provenance

- [Shape source](scripts/priest-shapes.mjs): original polygon, ellipse and rectangle definitions.
- [Generator](scripts/generate-priest-assets.mjs): dependency-free Node rasterization, PNG encoding and provenance generation.
- [Provenance](assets/priest/provenance.json): fixed authorship date, source hashes, PNG dimensions and output hashes.

The source was authored for this repository with Codex assistance. No external
artwork, stock asset, screenshot, tracing or generative image service was used.
Source and PNG files belong to the repository's original technical-fixture content;
no separate third-party artwork license is required.

From the repository root, regenerate or verify the committed assets with Node 24:

```powershell
node packages/test-fixtures/scripts/generate-priest-assets.mjs
node packages/test-fixtures/scripts/generate-priest-assets.mjs --check
```

Generation uses fixed sample positions, RGBA8 pixels, PNG filter zero and fixed-Huffman
zlib compression. No timestamps, network access or random values enter the PNGs.
The check command reads and compares all output bytes without changing files.
Update the source, regenerate, and review both source and output when changing art.

Project/runtime fixture APIs use the shared schema package. The fixture data establishes
format validity; it does not establish playback, export compilation or animation quality.

## Document fixtures

```ts
import { createPriestProjectFixture, createPriestRuntimeFixture } from '@studio/test-fixtures';

const project = createPriestProjectFixture();
const runtime = createPriestRuntimeFixture();
```

Each call returns an independent clone of schema-validated data. The committed
[authoring sample](fixtures/priest.project.json) and [runtime sample](fixtures/priest.runtime.json)
contain a 12-bone rig, eight rigid regions, a 3×3 weighted robe grid and five short
technical clip inputs. Their names match the planned priest clips, but the samples
are not finished animations authored through an editor.

The rig uses pixels with X right/Y down. Mesh vertices are in rig bind space, UVs
cover the source image, and the robe blends three bones using at most two influences
per vertex. Explicit draw order places the rear arm and robe behind the torso and
the front arm above it. Clip channels use seconds, radians and absolute local values.

The [document generator](scripts/generate-priest-documents.mjs) constructs fixed test
inputs using the shared format contract; it is not a compiler or animation evaluator.

```powershell
node packages/test-fixtures/scripts/generate-priest-documents.mjs
node packages/test-fixtures/scripts/generate-priest-documents.mjs --check
```

Fixture tests cover format parsing, real PNG metadata/provenance, geometry/order
coverage, JSON roundtrips, regeneration and nested mutation independence.

## Diagnostic density fixture

`createPriestStressFixture(gridSide = 65)` returns an independent runtime input with
the same art/rig/clips and a denser robe. Grid sides are bounded to integers 3–129.
The default has 4,225 robe vertices, 8,192 robe triangles and four influence entries
per vertex; the eight regions add 32 rendered vertices. It does not change committed
JSON/art or establish supported production capacity. Texture source area is 41,968
pixels across nine PNGs (167,872 bytes at RGBA8, excluding GPU/driver overhead).
Use [performance guidance](../../docs/PERFORMANCE.md) and store results in the issue.
