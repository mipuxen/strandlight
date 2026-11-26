import { dist, type Vec2 } from '../geometry';
import { LM } from '../tracking/types';
import type { Hand } from './hand';

/**
 * Pinch thresholds from the spec (0.045 on, 0.07 off) are defined for a reference
 * palm size of 0.15 (wrist → middle knuckle, normalized). They scale with the real
 * palm so the gesture works at any distance from the camera.
 */
export const PINCH_ON = 0.045;
export const PINCH_OFF = 0.07;
export const REFERENCE_PALM = 0.15;
/** Tracking gaps shorter than this are ignored. */
export const LOSS_GRACE_MS = 200;
export const PALM_HOLD_MS = 1000;
/** Fingertip speed (stage heights per second) that counts as a flick. */
export const FLICK_SPEED = 3.2;

export type GestureEvent =
  | { type: 'pinchStart'; hand: Hand['key']; at: Vec2 }
  | { type: 'pinchMove'; hand: Hand['key']; at: Vec2 }
  | { type: 'pinchEnd'; hand: Hand['key']; at: Vec2 }
  | { type: 'tipMove'; hand: Hand['key']; from: Vec2; to: Vec2; speed: number }
  | { type: 'flick'; hand: Hand['key']; at: Vec2; speed: number }
  | { type: 'muteProgress'; hand: Hand['key']; progress: number }
  | { type: 'mute'; hand: Hand['key'] }
  | { type: 'sustain'; on: boolean }
  | { type: 'handLost'; hand: Hand['key'] };

interface HandState {
  pinching: boolean;
  pinchPoint: Vec2;
  lastTip: Vec2 | null;
  lastTime: number;
  vSince: number | null;
  muted: boolean;
  palmSince: number | null;
  lastFlick: number;
  seenAt: number;
}

/** Aspect-corrected distance so a circle on screen is a circle here. */
const adist = (a: Vec2, b: Vec2, aspect: number) =>
  dist({ x: a.x * aspect, y: a.y }, { x: b.x * aspect, y: b.y });

export function palmSize(h: Hand, aspect: number): number {
  return (
    adist(h.points[LM.wrist] as Vec2, h.points[LM.middleMcp] as Vec2, aspect) || REFERENCE_PALM
  );
}

/** Pinch ratio: thumb–index distance expressed at the reference palm size. */
export function pinchDistance(h: Hand, aspect: number): number {
  const d = adist(h.points[LM.thumbTip] as Vec2, h.points[LM.indexTip] as Vec2, aspect);
  return (d / palmSize(h, aspect)) * REFERENCE_PALM;
}

/**
 * Finger state from the joints, not from absolute distances: a finger is extended when
 * its tip is clearly farther from the wrist than its middle joint (PIP), and curled when
 * the tip has folded back closer to the wrist than that joint. This works at any
 * distance from the camera and for any hand size.
 */
function fingerReach(h: Hand, tip: number, pip: number, aspect: number): number {
  const w = h.points[LM.wrist] as Vec2;
  return adist(h.points[tip] as Vec2, w, aspect) / (adist(h.points[pip] as Vec2, w, aspect) || 1);
}
const isExtended = (h: Hand, tip: number, pip: number, aspect: number) =>
  fingerReach(h, tip, pip, aspect) > 1.12;
const isCurled = (h: Hand, tip: number, pip: number, aspect: number) =>
  fingerReach(h, tip, pip, aspect) < 1.0;

/** V sign: index and middle extended and apart, ring and pinky curled. Mutes everything. */
export function isVSign(h: Hand, aspect: number): boolean {
  const palm = palmSize(h, aspect);
  const spread = adist(h.points[LM.indexTip] as Vec2, h.points[LM.middleTip] as Vec2, aspect);
  return (
    isExtended(h, LM.indexTip, 6, aspect) &&
    isExtended(h, LM.middleTip, 10, aspect) &&
    isCurled(h, LM.ringTip, 14, aspect) &&
    isCurled(h, LM.pinkyTip, 18, aspect) &&
    spread > palm * 0.3
  );
}

/** How long the V sign must be held before it mutes. */
export const MUTE_HOLD_MS = 500;

/** Open palm: every fingertip extended well beyond the knuckles and fingers spread. */
export function isOpenPalm(h: Hand, aspect: number): boolean {
  const palm = palmSize(h, aspect);
  const w = h.points[LM.wrist] as Vec2;
  const extended = [LM.indexTip, LM.middleTip, LM.ringTip, LM.pinkyTip].every(
    (i) => adist(h.points[i] as Vec2, w, aspect) > palm * 1.7,
  );
  const thumbOut =
    adist(h.points[LM.thumbTip] as Vec2, h.points[LM.indexMcp] as Vec2, aspect) > palm * 0.6;
  return extended && thumbOut;
}

/** Turns smoothed hands into high-level gesture events. Pure logic, no DOM. */
export class GestureEngine {
  private states = new Map<Hand['key'], HandState>();
  private sustain = false;

  update(hands: Hand[], now: number, aspect: number): GestureEvent[] {
    const out: GestureEvent[] = [];
    const seen = new Set<Hand['key']>();

    for (const h of hands) {
      seen.add(h.key);
      let st = this.states.get(h.key);
      if (!st) {
        st = {
          pinching: false,
          pinchPoint: { x: 0, y: 0 },
          lastTip: null,
          lastTime: now,
          vSince: null,
          muted: false,
          palmSince: null,
          lastFlick: -Infinity,
          seenAt: now,
        };
        this.states.set(h.key, st);
      }
      st.seenAt = now;
      const thumb = h.points[LM.thumbTip] as Vec2;
      const index = h.points[LM.indexTip] as Vec2;
      const mid = { x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 };

      // Pinch with hysteresis.
      const pd = pinchDistance(h, aspect);
      if (!st.pinching && pd < PINCH_ON) {
        st.pinching = true;
        st.pinchPoint = mid;
        out.push({ type: 'pinchStart', hand: h.key, at: mid });
      } else if (st.pinching && pd > PINCH_OFF) {
        st.pinching = false;
        out.push({ type: 'pinchEnd', hand: h.key, at: st.pinchPoint });
      } else if (st.pinching) {
        st.pinchPoint = mid;
        out.push({ type: 'pinchMove', hand: h.key, at: mid });
      }

      // Index fingertip motion: plucks and flicks. Not while pinching (that is drawing).
      const dt = Math.max(1e-3, (now - st.lastTime) / 1000);
      if (st.lastTip && !st.pinching) {
        const speed = adist(st.lastTip, index, aspect) / dt;
        out.push({ type: 'tipMove', hand: h.key, from: st.lastTip, to: index, speed });
        if (speed > FLICK_SPEED && now - st.lastFlick > 250) {
          st.lastFlick = now;
          out.push({ type: 'flick', hand: h.key, at: index, speed });
        }
      }
      st.lastTip = index;
      st.lastTime = now;

      // V sign held for half a second mutes everything, once per gesture.
      if (!st.pinching && isVSign(h, aspect)) {
        st.vSince ??= now;
        const progress = Math.min(1, (now - st.vSince) / MUTE_HOLD_MS);
        if (!st.muted) out.push({ type: 'muteProgress', hand: h.key, progress });
        if (progress >= 1 && !st.muted) {
          st.muted = true;
          out.push({ type: 'mute', hand: h.key });
        }
      } else {
        if (st.vSince !== null && !st.muted)
          out.push({ type: 'muteProgress', hand: h.key, progress: 0 });
        st.vSince = null;
        st.muted = false;
      }

      // Open palm held for a second toggles sustain on; closing it turns it off.
      if (isOpenPalm(h, aspect)) st.palmSince ??= now;
      else st.palmSince = null;
    }

    // Hands that disappeared: keep their state through short tracking gaps.
    for (const [key, st] of this.states) {
      if (seen.has(key)) continue;
      if (now - st.seenAt > LOSS_GRACE_MS) {
        if (st.pinching) out.push({ type: 'pinchEnd', hand: key, at: st.pinchPoint });
        out.push({ type: 'handLost', hand: key });
        this.states.delete(key);
      }
    }

    const palmHeld = [...this.states.values()].some(
      (s) => s.palmSince !== null && now - s.palmSince >= PALM_HOLD_MS,
    );
    const anyPalm = [...this.states.values()].some((s) => s.palmSince !== null);
    if (palmHeld && !this.sustain) {
      this.sustain = true;
      out.push({ type: 'sustain', on: true });
    } else if (!anyPalm && this.sustain) {
      this.sustain = false;
      out.push({ type: 'sustain', on: false });
    }
    return out;
  }

  isPinching(key: Hand['key']): boolean {
    return this.states.get(key)?.pinching ?? false;
  }

  reset(): void {
    this.states.clear();
    this.sustain = false;
  }
}
