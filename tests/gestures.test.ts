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

describe('V sign mute', () => {
  /** Index and middle up and apart; ring and pinky folded back toward the wrist. */
  function vSign(): Hand {
    const h = hand(0.15);
    const pts = h.points;
    pts[6] = { x: 0.47, y: 0.42 };
    pts[8] = { x: 0.44, y: 0.32 };
    pts[10] = { x: 0.52, y: 0.42 };
    pts[12] = { x: 0.55, y: 0.32 };
    pts[14] = { x: 0.53, y: 0.46 };
    pts[16] = { x: 0.53, y: 0.52 };
    pts[18] = { x: 0.55, y: 0.48 };
    pts[20] = { x: 0.55, y: 0.53 };
    return h;
  }

  it('mutes once after being held for half a second', () => {
    const g = new GestureEngine();
    const types = (t: number) => g.update([vSign()], t, 1).map((e) => e.type);
    expect(types(0)).not.toContain('mute');
    expect(types(300)).not.toContain('mute');
    expect(types(520)).toContain('mute');
    expect(types(700)).not.toContain('mute');
  });

  it('does not fire for an open hand or a pointing finger', () => {
    const g = new GestureEngine();
    for (let t = 0; t < 1000; t += 50) {
      expect(g.update([hand(0.15)], t, 1).map((e) => e.type)).not.toContain('mute');
    }
  });
});
