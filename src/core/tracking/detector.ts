import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { RawHand, TrackerInit } from './types';

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

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
    if (opts.delegate === 'GPU') {
      try {
        // On some GPUs (often Android) creation never settles instead of failing.
        this.landmarker = await withTimeout(make('GPU'), 8000);
        this.delegate = 'GPU';
        return;
      } catch {
        /* fall through to CPU */
      }
    }
    this.landmarker = await withTimeout(make('CPU'), 20000);
    this.delegate = 'CPU';
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
