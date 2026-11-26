import type { HandFrame } from './ghost-hand';
import { mix, POSES, type Pose, type PoseId } from './poses';

export type SceneId =
  'show' | 'pinch' | 'pull' | 'release' | 'pluck' | 'flick' | 'stretch' | 'mute' | 'palm' | 'pad';

export interface SceneString {
  a: [number, number];
  b: [number, number];
  /** Vibration amplitude 0..1 and phase in radians. */
  amp: number;
  phase: number;
  color: 'crystal' | 'harp' | 'bass';
  opacity: number;
}

export interface SceneFrame {
  hands: HandFrame[];
  strings: SceneString[];
  /** A dashed line being drawn right now. */
  trail: { a: [number, number]; b: [number, number] } | null;
  sparks: { x: number; y: number; a: number }[];
  /** Touch mode: a pressed fingertip ring. */
  press: { x: number; y: number; r: number } | null;
  /** 0..1 progress ring (open palm hold). */
  ring: { x: number; y: number; p: number } | null;
}

export const SCENE_LENGTH: Record<SceneId, number> = {
  show: 2.8,
  pinch: 2.6,
  pull: 3.4,
  release: 2.8,
  pluck: 2.6,
  flick: 2.2,
  stretch: 3.2,
  mute: 3,
  palm: 3,
  pad: 3.4,
};

const ease = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
const seg = (t: number, a: number, b: number) => ease((t - a) / (b - a));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const pose = (from: PoseId, to: PoseId, k: number): Pose => mix(POSES[from], POSES[to], k);

/**
 * One frame of an instructional scene at time t (seconds, looped), laid out in a
 * w × h box. `touch` swaps pinches for a pressed fingertip.
 */
export function sampleScene(
  id: SceneId,
  time: number,
  w: number,
  h: number,
  touch = false,
  handSize = 0.2,
): SceneFrame {
  const L = SCENE_LENGTH[id];
  const t = time % L;
  const scale = Math.min(w, h) * handSize;
  const f: SceneFrame = {
    hands: [],
    strings: [],
    trail: null,
    sparks: [],
    press: null,
    ring: null,
  };
  const hand = (
    p: Pose,
    x: number,
    y: number,
    active: HandFrame['active'],
    opacity = 1,
  ): HandFrame => ({
    pose: p,
    x,
    y,
    scale,
    opacity,
    active,
    rotate: -8,
  });
  const fadeIn = seg(t, 0, 0.25) * (1 - seg(t, L - 0.25, L));
  const pinchOr = (k: number) => (touch ? pose('point', 'point', 0) : pose('open', 'pinch', k));
  const A: [number, number] = [w * 0.34, h * 0.6];
  const B: [number, number] = [w * 0.66, h * 0.4];

  switch (id) {
    case 'show': {
      const rise = seg(t, 0, 0.9);
      const sway = Math.sin(t * 3) * w * 0.015 * seg(t, 0.9, 1.3);
      f.hands.push(hand(POSES.open, w * 0.5 + sway, lerp(h * 1.25, h * 0.42, rise), 'all', fadeIn));
      break;
    }
    case 'pinch': {
      const k = seg(t, 0.5, 1.1) * (1 - seg(t, 2.0, 2.4));
      f.hands.push(
        hand(
          touch ? POSES.point : pose('open', 'pinch', k),
          w * 0.5,
          h * 0.48,
          touch ? 'index' : k > 0.6 ? 'pinch' : 'none',
          fadeIn,
        ),
      );
      if (touch) f.press = { x: w * 0.5, y: h * 0.48, r: scale * 0.18 * k };
      break;
    }
    case 'pull': {
      const k = seg(t, 0.2, 0.6);
      const move = seg(t, 0.7, 2.2);
      const x = lerp(A[0], B[0], move);
      const y = lerp(A[1], B[1], move);
      const holding = t < 2.4;
      f.hands.push(
        hand(
          holding ? pinchOr(k) : pose('pinch', 'open', seg(t, 2.4, 2.8)),
          x,
          y,
          holding ? (touch ? 'index' : 'pinch') : 'none',
          fadeIn,
        ),
      );
      if (t > 0.7 && holding) f.trail = { a: A, b: [x, y] };
      if (touch && holding) f.press = { x, y, r: scale * 0.18 };
      if (!holding)
        f.strings.push({
          a: A,
          b: B,
          amp: 0.4 * (1 - seg(t, 2.4, 3.2)),
          phase: t * 18,
          color: 'harp',
          opacity: fadeIn,
        });
      break;
    }
    case 'release': {
      const open = seg(t, 0.6, 1.1);
      const away = seg(t, 1.2, 2.2);
      f.strings.push({
        a: A,
        b: B,
        amp: 0.5 * seg(t, 0.9, 1.0) * (1 - seg(t, 1.0, 2.4)),
        phase: t * 20,
        color: 'harp',
        opacity: 1,
      });
      f.hands.push(
        hand(
          touch ? POSES.point : pose('pinch', 'open', open),
          B[0] + away * w * 0.08,
          B[1] - away * h * 0.12,
          open < 0.5 ? (touch ? 'index' : 'pinch') : 'none',
          fadeIn * (1 - away * 0.6),
        ),
      );
      if (touch && open < 0.5) f.press = { x: B[0], y: B[1], r: scale * 0.18 };
      break;
    }
    case 'pluck':
    case 'flick': {
      const fast = id === 'flick';
      const sx = w * 0.5;
      const sa: [number, number] = [sx, h * 0.18];
      const sb: [number, number] = [sx, h * 0.82];
      const t0 = fast ? 0.7 : 0.5;
      const t1 = fast ? 0.9 : 1.5;
      const move = seg(t, t0, t1);
      const x = lerp(w * 0.3, w * 0.7, move);
      const crossT = t0 + (t1 - t0) * 0.5;
      const since = t - crossT;
      const amp = since > 0 ? Math.exp(-since * 2.2) * (fast ? 1 : 0.7) : 0;
      f.strings.push({
        a: sa,
        b: sb,
        amp,
        phase: since * 26,
        color: fast ? 'crystal' : 'harp',
        opacity: 1,
      });
      f.hands.push(hand(POSES.point, x, h * 0.4, 'index', fadeIn));
      if (fast && since > 0 && since < 1) {
        for (let i = 0; i < 14; i++) {
          const dir = i % 2 ? 1 : -1;
          const d = since * (0.6 + (i % 7) * 0.12) * h * 0.7;
          f.sparks.push({
            x: sx + Math.sin(i * 3.1) * 4,
            y: h * 0.4 + dir * d,
            a: Math.max(0, 1 - since * 1.4),
          });
        }
      }
      break;
    }
    case 'stretch': {
      const grab = seg(t, 0.3, 0.7);
      const move = seg(t, 0.8, 1.8) * (1 - seg(t, 2.2, 3.0));
      const end: [number, number] = [lerp(B[0], w * 0.74, move), lerp(B[1], h * 0.22, move)];
      f.strings.push({
        a: A,
        b: end,
        amp: 0.15 * move,
        phase: t * 14,
        color: move > 0.5 ? 'bass' : 'harp',
        opacity: 1,
      });
      f.hands.push(
        hand(pose('open', 'pinch', grab), end[0], end[1], grab > 0.6 ? 'pinch' : 'none', fadeIn),
      );
      break;
    }
    case 'mute': {
      // Make a V, hold it while the ring fills, and the ringing string stops.
      const k = seg(t, 0.5, 0.9) * (1 - seg(t, 2.4, 2.8));
      const hold = seg(t, 0.9, 1.5);
      const ringing = t < 1.5 ? 0.6 : 0.6 * (1 - seg(t, 1.5, 1.6));
      f.strings.push({
        a: [w * 0.16, h * 0.84],
        b: [w * 0.28, h * 0.16],
        amp: ringing,
        phase: t * 22,
        color: 'harp',
        opacity: 1,
      });
      f.hands.push(
        hand(pose('open', 'vsign', k), w * 0.58, h * 0.3, hold > 0 ? 'all' : 'none', fadeIn),
      );
      if (k > 0.9 && t < 2.4) f.ring = { x: w * 0.85, y: h * 0.24, p: hold };
      break;
    }
    case 'palm': {
      const p = seg(t, 0.4, 1.4);
      f.hands.push(hand(POSES.open, w * 0.5, h * 0.36, p >= 1 ? 'all' : 'none', fadeIn));
      f.ring = { x: w * 0.8, y: h * 0.24, p };
      break;
    }
    case 'pad': {
      // Hands apart = tighter threads = brighter chord.
      const spread = 0.04 * Math.sin((t / L) * Math.PI * 2);
      const L1 = hand(mirror(POSES.open), w * (0.3 - spread), h * 0.3, 'all', fadeIn);
      const R1 = hand(POSES.open, w * (0.7 + spread), h * 0.3, 'all', fadeIn);
      L1.rotate = 12;
      R1.rotate = -12;
      f.hands.push(L1, R1);
      break;
    }
  }
  return f;
}

/** The left hand is the right hand mirrored. */
function mirror(p: Pose): Pose {
  return p.map(([x, y]) => [-x, y]);
}
