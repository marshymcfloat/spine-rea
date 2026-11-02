const robe = [65, 48, 59, 255];
const fold = [93, 67, 77, 255];
const seam = [119, 86, 91, 255];
const skin = [204, 171, 137, 255];
const skinShadow = [166, 130, 105, 255];
const collar = [220, 212, 189, 255];

const polygon = (points, color) => ({ kind: 'polygon', points, color });
const ellipse = (cx, cy, rx, ry, color) => ({ kind: 'ellipse', cx, cy, rx, ry, color });
const rectangle = (x, y, width, height, color) => ({ kind: 'rectangle', x, y, width, height, color });

const upperArmShapes = [
  ellipse(16, 15, 12, 12, robe),
  polygon([[4, 15], [27, 15], [28, 63], [23, 75], [7, 75], [3, 63]], robe),
  polygon([[7, 20], [12, 20], [13, 70], [8, 69]], fold),
  rectangle(7, 66, 17, 6, seam),
];

const forearmShapes = [
  ellipse(14, 13, 10, 10, robe),
  polygon([[4, 13], [24, 13], [25, 55], [20, 65], [7, 65], [3, 55]], robe),
  polygon([[6, 17], [10, 17], [11, 58], [7, 57]], fold),
  rectangle(7, 56, 14, 6, seam),
];

const handShapes = [
  ellipse(12, 17, 8, 10, skin),
  rectangle(7, 3, 10, 13, skin),
  ellipse(18, 15, 3, 6, skinShadow),
  rectangle(7, 3, 10, 4, skinShadow),
];

function mirrorShapes(shapes, width) {
  return shapes.map((shape) => {
    if (shape.kind === 'polygon') {
      return { ...shape, points: shape.points.map(([x, y]) => [width - x, y]) };
    }
    if (shape.kind === 'ellipse') return { ...shape, cx: width - shape.cx };
    return { ...shape, x: width - shape.x - shape.width };
  });
}

// These shapes are original technical stand-ins, not traced production artwork.
export const priestLayers = [
  {
    id: 'robe', width: 120, height: 160,
    purpose: 'Weighted grid-mesh region; lower robe overlaps behind the torso.',
    shapes: [
      polygon([[31, 5], [89, 5], [111, 149], [95, 155], [25, 155], [9, 149]], robe),
      polygon([[35, 11], [44, 11], [36, 147], [25, 149]], fold),
      polygon([[57, 9], [63, 9], [68, 150], [53, 150]], fold),
      polygon([[78, 11], [85, 11], [97, 149], [86, 149]], fold),
      polygon([[18, 141], [102, 141], [104, 148], [16, 148]], seam),
    ],
  },
  {
    id: 'torso', width: 80, height: 96,
    purpose: 'Opaque torso covers the upper robe and rear shoulder joint.',
    shapes: [
      polygon([[17, 9], [63, 9], [75, 30], [68, 90], [12, 90], [5, 30]], robe),
      polygon([[19, 12], [31, 16], [29, 85], [15, 85]], fold),
      polygon([[29, 8], [40, 16], [51, 8], [47, 29], [33, 29]], collar),
      rectangle(37, 18, 6, 9, [36, 32, 37, 255]),
      rectangle(12, 75, 56, 8, seam),
    ],
  },
  {
    id: 'head', width: 64, height: 72,
    purpose: 'Separate head and neck permit rigid head rotation with covered joints.',
    shapes: [
      ellipse(32, 30, 25, 27, robe),
      rectangle(25, 46, 14, 22, skinShadow),
      ellipse(32, 33, 19, 23, skin),
      polygon([[13, 26], [18, 10], [42, 8], [51, 26], [44, 20], [20, 20]], robe),
      rectangle(22, 31, 4, 2, [50, 42, 44, 255]),
      rectangle(38, 31, 4, 2, [50, 42, 44, 255]),
      rectangle(27, 46, 10, 2, skinShadow),
    ],
  },
  { id: 'upper-arm-left', width: 32, height: 80, purpose: 'Rear upper sleeve with joint overlap.', shapes: upperArmShapes },
  { id: 'upper-arm-right', width: 32, height: 80, purpose: 'Front upper sleeve with joint overlap.', shapes: mirrorShapes(upperArmShapes, 32) },
  { id: 'forearm-left', width: 28, height: 70, purpose: 'Separate rear forearm sleeve.', shapes: forearmShapes },
  { id: 'forearm-right', width: 28, height: 70, purpose: 'Separate front forearm sleeve.', shapes: mirrorShapes(forearmShapes, 28) },
  { id: 'hand-left', width: 24, height: 30, purpose: 'Separate rear hand with covered wrist.', shapes: handShapes },
  { id: 'hand-right', width: 24, height: 30, purpose: 'Separate front hand with covered wrist.', shapes: mirrorShapes(handShapes, 24) },
];
