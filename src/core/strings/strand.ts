import type { Vec2 } from '../geometry';
import type { Timbre } from '../music/mapping';

/** Positions are normalized to the stage: x and y in [0, 1]. */
export interface StrandData {
  id: number;
  a: Vec2;
  b: Vec2;
}

const MODES = 4;

/**
 * A light string with a simplified physical vibration: a sum of standing-wave modes,
 * each excited according to where it was plucked and decaying exponentially.
 */
export class Strand implements StrandData {
  a: Vec2;
  b: Vec2;
  note = 60;
  timbre: Timbre = 'harp';
  /** 0..1 opacity used for birth and fade-out. */
  life = 0;
  fading = false;
  /** Bend in semitones applied while the string is stretched. */
  bend = 0;
  private amp = new Float32Array(MODES);
  private phase = new Float32Array(MODES);
  private age = new Float32Array(MODES);
  lastPluck = -Infinity;

  constructor(
    public readonly id: number,
    a: Vec2,
    b: Vec2,
  ) {
    this.a = { ...a };
    this.b = { ...b };
  }

  /** Excite the string at parameter t (0..1 along it) with strength 0..1. */
  pluck(t: number, strength: number, now: number): void {
    for (let n = 0; n < MODES; n++) {
      const k = n + 1;
      this.amp[n] = Math.min(
        1.2,
        (this.amp[n] ?? 0) * 0.3 + (strength * Math.sin(k * Math.PI * t)) / k,
      );
      this.phase[n] = 0;
      this.age[n] = 0;
    }
    this.lastPluck = now;
  }

  damp(): void {
    this.amp.fill(0);
  }

  get energy(): number {
    let e = 0;
    for (let n = 0; n < MODES; n++) e += Math.abs(this.amp[n] ?? 0);
    return e;
  }

  step(dt: number, sustain: boolean): void {
    const decay = sustain ? 0.9 : 2.2;
    for (let n = 0; n < MODES; n++) {
      const k = n + 1;
      this.age[n] = (this.age[n] ?? 0) + dt;
      this.phase[n] = (this.phase[n] ?? 0) + dt * (14 + 9 * k) * Math.PI;
      this.amp[n] = (this.amp[n] ?? 0) * Math.exp(-dt * decay * (1 + 0.6 * n));
    }
    if (this.fading) this.life = Math.max(0, this.life - dt * 1.5);
    else this.life = Math.min(1, this.life + dt * 4);
  }

  /** Perpendicular displacement at parameter s (0..1), in units of string length. */
  displacement(s: number): number {
    let y = 0;
    for (let n = 0; n < MODES; n++) {
      const k = n + 1;
      y += (this.amp[n] ?? 0) * Math.sin(k * Math.PI * s) * Math.cos(this.phase[n] ?? 0);
    }
    return y * 0.06;
  }

  toData(): StrandData {
    return { id: this.id, a: { ...this.a }, b: { ...this.b } };
  }
}
