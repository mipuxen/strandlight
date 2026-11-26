import { describe, expect, it } from 'vitest';
import {
  GestureEngine,
  PINCH_OFF,
  PINCH_ON,
  REFERENCE_PALM,
  pinchDistance,
} from '../src/core/gestures/gestures';
import type { Hand } from '../src/core/gestures/hand';
import type { Vec2 } from '../src/core/geometry';

/** Builds an open hand at (cx, cy) with a given thumb–index gap (normalized units). */
function hand(gap: number, cx = 0.5, cy = 0.5, key: Hand['key'] = 'Right'): Hand {
  const points: Vec2[] = Array.from({ length: 21 }, () => ({ x: cx, y: cy }));
  points[0] = { x: cx, y: cy + REFERENCE_PALM }; // wrist
  points[9] = { x: cx, y: cy }; // middle knuckle → palm size = REFERENCE_PALM
  points[5] = { x: cx - 0.03, y: cy };
  points[17] = { x: cx + 0.04, y: cy };
  points[8] = { x: cx, y: cy - 0.1 }; // index tip
  points[4] = { x: cx + gap, y: cy - 0.1 }; // thumb tip
  for (const i of [12, 16, 20]) points[i] = { x: cx, y: cy - 0.12 };
  return { key, points, seenAt: 0 };
}

describe('pinch', () => {
  it('measures distance at the reference palm size', () => {
    expect(pinchDistance(hand(0.05), 1)).toBeCloseTo(0.05, 5);
  });

  it('uses hysteresis: on below 0.045, off only above 0.07', () => {
    const g = new GestureEngine();
    const types = (h: Hand, t: number) => g.update([h], t, 1).map((e) => e.type);
    expect(types(hand(0.1), 0)).not.toContain('pinchStart');
    expect(types(hand(PINCH_ON - 0.005), 16)).toContain('pinchStart');
    // Between the thresholds the pinch holds.
    expect(types(hand(0.06), 32)).toContain('pinchMove');
    expect(types(hand(PINCH_OFF + 0.01), 48)).toContain('pinchEnd');
  });

  it('ignores tracking gaps shorter than 200 ms', () => {
    const g = new GestureEngine();
    g.update([hand(0.02)], 0, 1);
    expect(g.update([], 150, 1).map((e) => e.type)).not.toContain('pinchEnd');
    expect(g.update([], 260, 1).map((e) => e.type)).toContain('pinchEnd');
  });

  it('is scale-invariant: a farther (smaller) hand pinches at the same ratio', () => {
    const near = hand(0.04);
    const far: Hand = {
      ...near,
      points: near.points.map((p) => ({ x: 0.5 + (p.x - 0.5) / 2, y: 0.5 + (p.y - 0.5) / 2 })),
    };
    expect(pinchDistance(far, 1)).toBeCloseTo(pinchDistance(near, 1), 5);
  });
});

describe('fist', () => {
  it('emits once when all fingertips fold toward the wrist', () => {
    const g = new GestureEngine();
    const h = hand(0.1);
    const wrist = h.points[0] as Vec2;
    for (const i of [8, 12, 16, 20]) h.points[i] = { x: wrist.x, y: wrist.y - 0.05 };
    h.points[4] = { x: wrist.x + 0.1, y: wrist.y - 0.05 };
    expect(g.update([h], 0, 1).filter((e) => e.type === 'fist')).toHaveLength(1);
    expect(g.update([h], 16, 1).filter((e) => e.type === 'fist')).toHaveLength(0);
  });
});
