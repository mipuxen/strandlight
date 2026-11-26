import type { Timbre } from '../music/mapping';

export const LOOPER_LAYERS = 4;

/** Performances are stored as events, not audio, so loops cost almost no memory. */
export interface LoopEvent {
  /** Position in beats from the start of the loop. */
  beat: number;
  strandId: number;
  midi: number;
  timbre: Timbre;
  velocity: number;
  pan: number;
}

export type LooperState = 'idle' | 'recording' | 'playing' | 'overdub';

const BEATS_PER_BAR = 4;
const GRID = 0.25; // sixteenth notes

export const quantize = (beat: number, grid = GRID): number => Math.round(beat / grid) * grid;

export class Looper {
  layers: LoopEvent[][] = Array.from({ length: LOOPER_LAYERS }, () => []);
  muted: boolean[] = Array.from({ length: LOOPER_LAYERS }, () => false);
  state: LooperState = 'idle';
  /** Loop length in beats (set when the first layer is closed). */
  lengthBeats = 0;
  private startBeat = 0;
  private recLayer = 0;
  private lastPos = 0;
  onPlay: (e: LoopEvent) => void = () => {};
  onChange: () => void = () => {};

  /** Index of the layer currently being recorded. */
  get recordingLayer(): number {
    return this.recLayer;
  }

  get activeLayers(): number {
    return this.layers.filter((l) => l.length > 0).length;
  }

  /** Space bar. `nowBeat` is the current absolute clock position in beats. */
  toggle(nowBeat: number): void {
    if (this.state === 'idle') {
      this.recLayer = 0;
      this.layers[0] = [];
      this.startBeat = Math.round(nowBeat);
      this.state = 'recording';
    } else if (this.state === 'recording') {
      const raw = nowBeat - this.startBeat;
      this.lengthBeats = Math.max(BEATS_PER_BAR, Math.round(raw / BEATS_PER_BAR) * BEATS_PER_BAR);
      this.state = 'playing';
      this.lastPos = this.position(nowBeat);
    } else if (this.state === 'playing') {
      const next = this.layers.findIndex((l) => l.length === 0);
      if (next === -1) return;
      this.recLayer = next;
      this.state = 'overdub';
    } else {
      this.state = 'playing';
    }
    this.onChange();
  }

  record(nowBeat: number, e: Omit<LoopEvent, 'beat'>): void {
    if (this.state !== 'recording' && this.state !== 'overdub') return;
    const beat = this.state === 'recording' ? nowBeat - this.startBeat : this.position(nowBeat);
    const q = quantize(beat);
    const layer = this.layers[this.recLayer];
    if (!layer) return;
    layer.push({ ...e, beat: this.lengthBeats ? q % this.lengthBeats : q });
  }

  position(nowBeat: number): number {
    if (!this.lengthBeats) return 0;
    return (((nowBeat - this.startBeat) % this.lengthBeats) + this.lengthBeats) % this.lengthBeats;
  }

  tick(nowBeat: number): void {
    if (this.state !== 'playing' && this.state !== 'overdub') return;
    const pos = this.position(nowBeat);
    const wrapped = pos < this.lastPos;
    this.layers.forEach((layer, i) => {
      if (this.muted[i]) return;
      // While overdubbing, don't echo the layer being recorded in the same pass.
      if (this.state === 'overdub' && i === this.recLayer) return;
      for (const e of layer) {
        const hit = wrapped
          ? e.beat > this.lastPos || e.beat <= pos
          : e.beat > this.lastPos && e.beat <= pos;
        if (hit) this.onPlay(e);
      }
    });
    // An overdub lasts exactly one loop cycle.
    if (wrapped && this.state === 'overdub') {
      this.state = 'playing';
      this.onChange();
    }
    this.lastPos = pos;
  }

  clearLayer(i: number): void {
    this.layers[i] = [];
    if (this.activeLayers === 0) this.reset();
    this.onChange();
  }

  toggleMute(i: number): void {
    this.muted[i] = !this.muted[i];
    this.onChange();
  }

  reset(): void {
    this.layers = Array.from({ length: LOOPER_LAYERS }, () => []);
    this.muted = this.muted.map(() => false);
    this.state = 'idle';
    this.lengthBeats = 0;
    this.onChange();
  }
}
