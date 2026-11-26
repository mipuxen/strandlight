export const BPM_MIN = 40;
export const BPM_MAX = 200;

/** Beat clock shared by the metronome and the looper. Times are in seconds. */
export class Metronome {
  bpm = 90;
  enabled = false;
  private lastBeat = -1;
  private taps: number[] = [];
  onBeat: (beat: number, accent: boolean) => void = () => {};

  get beatLength(): number {
    return 60 / this.bpm;
  }

  setBpm(bpm: number): void {
    this.bpm = Math.round(Math.min(BPM_MAX, Math.max(BPM_MIN, bpm)));
  }

  /** Tap tempo: average of the last few intervals, reset after a 2 s pause. */
  tap(now: number): number {
    const last = this.taps[this.taps.length - 1];
    if (last !== undefined && now - last > 2) this.taps = [];
    this.taps.push(now);
    if (this.taps.length > 5) this.taps.shift();
    if (this.taps.length >= 2) {
      const first = this.taps[0] as number;
      const avg = (now - first) / (this.taps.length - 1);
      this.setBpm(60 / avg);
    }
    return this.bpm;
  }

  tick(now: number): void {
    const beat = Math.floor(now / this.beatLength);
    if (beat !== this.lastBeat) {
      this.lastBeat = beat;
      if (this.enabled) this.onBeat(beat, beat % 4 === 0);
    }
  }

  /** Fractional position within the current beat, 0..1, for the visual pulse. */
  phase(now: number): number {
    return (now / this.beatLength) % 1;
  }
}
