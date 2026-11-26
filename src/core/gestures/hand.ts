import { OneEuroFilter } from '../filters/one-euro';
import type { Vec2 } from '../geometry';

/** A hand in stage space (normalized, mirrored like a mirror), already smoothed. */
export interface Hand {
  key: 'Left' | 'Right';
  points: Vec2[]; // 21 points
  seenAt: number;
}

/** One Euro filter per landmark coordinate for a single hand. */
export class HandSmoother {
  private fx = Array.from({ length: 21 }, () => new OneEuroFilter());
  private fy = Array.from({ length: 21 }, () => new OneEuroFilter());

  apply(points: Vec2[], time: number): Vec2[] {
    return points.map((p, i) => ({
      x: (this.fx[i] as OneEuroFilter).filter(p.x, time),
      y: (this.fy[i] as OneEuroFilter).filter(p.y, time),
    }));
  }

  reset(): void {
    this.fx.forEach((f) => f.reset());
    this.fy.forEach((f) => f.reset());
  }
}
