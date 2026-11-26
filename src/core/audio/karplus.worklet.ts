/* Karplus-Strong plucked-string synthesis, polyphonic, running on the audio thread. */

declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

interface Voice {
  buf: Float32Array;
  idx: number;
  /** Feedback gain per sample: sets the decay time. */
  feedback: number;
  /** Lowpass coefficient inside the loop: lower = darker. */
  damping: number;
  prev: number;
  gain: number;
  age: number;
  maxAge: number;
  muteRamp: number;
}

const MAX_VOICES = 32;

class KarplusProcessor extends AudioWorkletProcessor {
  private voices: Voice[] = [];

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent) => {
      const m = e.data as
        | { type: 'pluck'; freq: number; velocity: number; brightness: number; decay: number }
        | { type: 'mute' };
      if (m.type === 'mute') {
        for (const v of this.voices) v.muteRamp = 0.995;
        return;
      }
      this.pluck(m.freq, m.velocity, m.brightness, m.decay);
    };
  }

  private pluck(freq: number, velocity: number, brightness: number, decay: number): void {
    const len = Math.max(2, Math.round(sampleRate / freq));
    const buf = new Float32Array(len);
    // Noise burst, low-passed by brightness: softer plucks sound darker, like a real string.
    let last = 0;
    for (let i = 0; i < len; i++) {
      const n = Math.random() * 2 - 1;
      last = last + brightness * (n - last);
      buf[i] = last;
    }
    // Feedback for a 60 dB decay over `decay` seconds.
    const feedback = Math.pow(10, -3 / (decay * freq));
    if (this.voices.length >= MAX_VOICES) this.voices.shift();
    this.voices.push({
      buf,
      idx: 0,
      feedback: Math.min(0.9995, feedback),
      damping: 0.35 + brightness * 0.6,
      prev: 0,
      gain: 0.55 * velocity,
      age: 0,
      maxAge: Math.ceil(decay * sampleRate * 1.2),
      muteRamp: 1,
    });
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    const ch0 = out?.[0];
    if (!out || !ch0) return true;
    const frames = ch0.length;
    ch0.fill(0);
    for (const v of this.voices) {
      for (let i = 0; i < frames; i++) {
        const cur = v.buf[v.idx] as number;
        // Averaging lowpass inside the loop (classic KS), weighted by damping.
        const next = v.feedback * (v.damping * cur + (1 - v.damping) * v.prev);
        v.prev = cur;
        v.buf[v.idx] = next;
        v.idx = (v.idx + 1) % v.buf.length;
        ch0[i] = (ch0[i] as number) + cur * v.gain;
        if (v.muteRamp < 1) v.gain *= v.muteRamp;
      }
      v.age += frames;
    }
    this.voices = this.voices.filter((v) => v.age < v.maxAge && v.gain > 1e-4);
    for (let c = 1; c < out.length; c++) out[c]?.set(ch0);
    return true;
  }
}

registerProcessor('strandlight-karplus', KarplusProcessor);
