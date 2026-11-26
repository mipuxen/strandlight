/**
 * Hand poses for the ghost hand, using the same 21 landmarks MediaPipe tracks.
 * Units: palm length (wrist → middle knuckle) = 1. x to the right, y down.
 * The hand is seen as in a mirror: palm toward the camera, thumb on the left.
 */
export type Pt = [number, number];
export type Pose = Pt[];

const open: Pose = [
  [0, 0],
  [-0.36, -0.14],
  [-0.62, -0.34],
  [-0.82, -0.55],
  [-0.97, -0.73],
  [-0.3, -0.95],
  [-0.36, -1.35],
  [-0.4, -1.6],
  [-0.43, -1.83],
  [-0.05, -1.0],
  [-0.06, -1.46],
  [-0.07, -1.73],
  [-0.08, -1.97],
  [0.2, -0.95],
  [0.24, -1.36],
  [0.27, -1.61],
  [0.29, -1.82],
  [0.42, -0.82],
  [0.52, -1.12],
  [0.58, -1.32],
  [0.62, -1.5],
];

/** Thumb and index tips touching; the other fingers relaxed. */
const pinch: Pose = [
  [0, 0],
  [-0.36, -0.14],
  [-0.56, -0.4],
  [-0.64, -0.76],
  [-0.64, -1.1],
  [-0.3, -0.95],
  [-0.43, -1.3],
  [-0.55, -1.33],
  [-0.62, -1.17],
  [-0.05, -1.0],
  [-0.07, -1.42],
  [-0.08, -1.66],
  [-0.09, -1.86],
  [0.2, -0.95],
  [0.25, -1.32],
  [0.28, -1.54],
  [0.3, -1.72],
  [0.42, -0.82],
  [0.52, -1.1],
  [0.58, -1.28],
  [0.62, -1.44],
];

/** Index finger out, the rest folded: the pose for plucking. */
const point: Pose = [
  [0, 0],
  [-0.34, -0.16],
  [-0.46, -0.42],
  [-0.36, -0.62],
  [-0.2, -0.74],
  [-0.3, -0.95],
  [-0.36, -1.35],
  [-0.4, -1.6],
  [-0.43, -1.83],
  [-0.05, -1.0],
  [-0.07, -1.3],
  [-0.05, -1.1],
  [-0.04, -0.94],
  [0.2, -0.95],
  [0.22, -1.22],
  [0.22, -1.05],
  [0.2, -0.92],
  [0.42, -0.82],
  [0.48, -1.04],
  [0.47, -0.92],
  [0.44, -0.82],
];

/** Every finger folded, thumb across. */
const fist: Pose = [
  [0, 0],
  [-0.36, -0.16],
  [-0.46, -0.45],
  [-0.26, -0.7],
  [-0.04, -0.78],
  [-0.3, -0.95],
  [-0.34, -1.24],
  [-0.31, -1.06],
  [-0.28, -0.93],
  [-0.05, -1.0],
  [-0.07, -1.3],
  [-0.05, -1.1],
  [-0.04, -0.94],
  [0.2, -0.95],
  [0.22, -1.22],
  [0.22, -1.05],
  [0.2, -0.92],
  [0.42, -0.82],
  [0.48, -1.04],
  [0.47, -0.92],
  [0.44, -0.82],
];

export const POSES = { open, pinch, point, fist } as const;
export type PoseId = keyof typeof POSES;

export function mix(a: Pose, b: Pose, t: number): Pose {
  return a.map(([x, y], i) => {
    const [bx, by] = b[i] as Pt;
    return [x + (bx - x) * t, y + (by - y) * t];
  });
}

/** The point a gesture acts with: pinch midpoint, or the index fingertip. */
export function actionPoint(p: Pose): Pt {
  const [tx, ty] = p[4] as Pt;
  const [ix, iy] = p[8] as Pt;
  const d = Math.hypot(tx - ix, ty - iy);
  // When thumb and index are close, the action point moves to between them.
  const k = Math.max(0, Math.min(1, 1 - (d - 0.08) / 0.4));
  return [ix + ((tx + ix) / 2 - ix) * k, iy + ((ty + iy) / 2 - iy) * k];
}

export const FINGERS: number[][] = [
  [1, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];
export const PALM = [0, 1, 2, 5, 9, 13, 17];
