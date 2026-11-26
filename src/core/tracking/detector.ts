import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { RawHand, TrackerInit } from './types';

/** Wraps MediaPipe HandLandmarker. Shared by the worker and the main-thread fallback. */
export class Detector {
  private landmarker: HandLandmarker | null = null;
  delegate: 'GPU' | 'CPU' = 'CPU';

  async init(opts: Omit<TrackerInit, 'type'>): Promise<void> {
    const fileset = await FilesetResolver.forVisionTasks(opts.wasmBase);
    const make = (delegate: 'GPU' | 'CPU') =>
      HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: opts.modelUrl, delegate },
        runningMode: 'VIDEO',
        numHands: opts.numHands,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    try {
      this.landmarker = await make(opts.delegate);
      this.delegate = opts.delegate;
    } catch {
      this.landmarker = await make('CPU');
      this.delegate = 'CPU';
    }
  }

  detect(source: ImageBitmap | HTMLVideoElement, time: number): RawHand[] {
    if (!this.landmarker) return [];
    const res = this.landmarker.detectForVideo(source, time);
    const hands: RawHand[] = [];
    res.landmarks.forEach((lms, i) => {
      const points = new Float32Array(63);
      lms.forEach((p, j) => {
        points[j * 3] = p.x;
        points[j * 3 + 1] = p.y;
        points[j * 3 + 2] = p.z;
      });
      const cat = res.handedness[i]?.[0];
      hands.push({
        points,
        handedness: cat?.categoryName === 'Left' ? 'Left' : 'Right',
        score: cat?.score ?? 0,
      });
    });
    return hands;
  }
}
