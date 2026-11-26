export interface TrackerInit {
  type: 'init';
  wasmBase: string;
  modelUrl: string;
  numHands: number;
  delegate: 'GPU' | 'CPU';
}

export interface TrackerFrame {
  type: 'frame';
  bitmap: ImageBitmap;
  time: number;
}

export type ToWorker = TrackerInit | TrackerFrame;

export interface RawHand {
  /** 21 landmarks × (x, y, z), normalized to the video frame. */
  points: Float32Array;
  handedness: 'Left' | 'Right';
  score: number;
}

export type FromWorker =
  | { type: 'ready'; delegate: 'GPU' | 'CPU' }
  | { type: 'error'; message: string }
  | { type: 'result'; hands: RawHand[]; time: number };

/** MediaPipe landmark indices used by the gesture layer. */
export const LM = {
  wrist: 0,
  thumbTip: 4,
  indexMcp: 5,
  indexTip: 8,
  middleMcp: 9,
  middleTip: 12,
  ringTip: 16,
  pinkyMcp: 17,
  pinkyTip: 20,
} as const;

export const FINGER_TIPS = [4, 8, 12, 16, 20] as const;
