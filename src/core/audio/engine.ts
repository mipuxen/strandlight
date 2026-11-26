import { midiToFreq } from '../music/scales';
import type { Timbre } from '../music/mapping';
import { makeImpulse } from './reverb';
import workletUrl from './karplus.worklet.ts?worker&url';

export interface PluckOptions {
  midi: number;
  timbre: Timbre;
  velocity: number; // 0..1
  pan?: number; // -1..1
  bend?: number; // semitones
}

/**
 * Web Audio synthesis engine. Every sound is generated in code:
 * Crystal = 2-operator FM, Harp = Karplus-Strong, Bass = Karplus-Strong + sub sine.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private dry!: GainNode;
  private reverbSend!: GainNode;
  private delaySend!: GainNode;
  private harpNode: AudioWorkletNode | null = null;
  private bassNode: AudioWorkletNode | null = null;
  private bassFilter!: BiquadFilterNode;
  private padBus!: GainNode;
  private padFilter!: BiquadFilterNode;
  private padOscs: OscillatorNode[][] = [];
  private padGain!: GainNode;
  private activeFm = new Set<{ stop: () => void }>();
  /** For the recorder: a stream of exactly what the instrument plays. */
  recordDest: MediaStreamAudioDestinationNode | null = null;
  a4 = 440;
  private sustain = false;
  private volume = 0.9;

  private built = false;

  /** True once the whole graph exists (start() is async because of the worklet). */
  get ready(): boolean {
    return this.built;
  }

  /** Must be called from a user gesture (browser autoplay rules). */
  async start(): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.15;

    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(limiter);
    limiter.connect(ctx.destination);
    this.recordDest = ctx.createMediaStreamDestination();
    limiter.connect(this.recordDest);

    this.dry = ctx.createGain();
    this.dry.connect(this.master);

    const convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(ctx);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.32;
    this.reverbSend.connect(convolver);
    convolver.connect(this.master);

    // Ping-pong stereo delay.
    this.delaySend = ctx.createGain();
    this.delaySend.gain.value = 0.16;
    const dl = ctx.createDelay(2);
    const dr = ctx.createDelay(2);
    dl.delayTime.value = 0.33;
    dr.delayTime.value = 0.5;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 3200;
    const merger = ctx.createChannelMerger(2);
    this.delaySend.connect(dl);
    dl.connect(tone);
    tone.connect(dr);
    dr.connect(fb);
    fb.connect(dl);
    dl.connect(merger, 0, 0);
    dr.connect(merger, 0, 1);
    merger.connect(this.master);

    const bus = (node: AudioNode) => {
      node.connect(this.dry);
      node.connect(this.reverbSend);
      node.connect(this.delaySend);
    };

    await ctx.audioWorklet.addModule(workletUrl);
    this.harpNode = new AudioWorkletNode(ctx, 'strandlight-karplus', {
      numberOfInputs: 0,
      outputChannelCount: [2],
    });
    bus(this.harpNode);

    this.bassNode = new AudioWorkletNode(ctx, 'strandlight-karplus', {
      numberOfInputs: 0,
      outputChannelCount: [2],
    });
    this.bassFilter = ctx.createBiquadFilter();
    this.bassFilter.type = 'lowpass';
    this.bassFilter.frequency.value = 900;
    this.bassFilter.Q.value = 0.8;
    this.bassNode.connect(this.bassFilter);
    bus(this.bassFilter);

    // Pad: 5 threads × 2 detuned saws through a soft filter.
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0;
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 600;
    this.padFilter.Q.value = 0.5;
    this.padBus = ctx.createGain();
    this.padBus.gain.value = 0.05;
    this.padBus.connect(this.padFilter);
    this.padFilter.connect(this.padGain);
    bus(this.padGain);
    for (let i = 0; i < 5; i++) {
      const pair: OscillatorNode[] = [];
      for (const detune of [-9, 9]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.detune.value = detune;
        o.frequency.value = 220;
        o.connect(this.padBus);
        o.start();
        pair.push(o);
      }
      this.padOscs.push(pair);
    }
    this.built = true;
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.built && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  setSustain(on: boolean): void {
    this.sustain = on;
    if (!this.built || !this.ctx) return;
    this.reverbSend.gain.setTargetAtTime(on ? 0.6 : 0.32, this.ctx.currentTime, 0.2);
  }

  pluck(o: PluckOptions): void {
    if (!this.built || !this.ctx || !this.harpNode || !this.bassNode) return;
    const freq = midiToFreq(o.midi + (o.bend ?? 0), this.a4);
    const v = Math.min(1, Math.max(0.08, o.velocity));
    const sustainMul = this.sustain ? 1.8 : 1;
    if (o.timbre === 'harp') {
      this.harpNode.port.postMessage({
        type: 'pluck',
        freq,
        velocity: v,
        brightness: 0.35 + v * 0.55,
        decay: 3.2 * sustainMul,
      });
    } else if (o.timbre === 'bass') {
      this.bassNode.port.postMessage({
        type: 'pluck',
        freq,
        velocity: v,
        brightness: 0.25 + v * 0.4,
        decay: 4.5 * sustainMul,
      });
      this.sub(freq / 2, v, 2.5 * sustainMul);
    } else {
      this.fm(freq, v, 4 * sustainMul);
    }
  }

  /** Sub sine under the bass for weight. */
  private sub(freq: number, v: number, decay: number): void {
    const ctx = this.ctx as AudioContext;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.28 * v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(1e-4, t + decay);
    osc.connect(g);
    g.connect(this.dry);
    osc.start(t);
    osc.stop(t + decay + 0.05);
    const handle = {
      stop: () => {
        g.gain.cancelScheduledValues(ctx.currentTime);
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      },
    };
    this.activeFm.add(handle);
    osc.onended = () => this.activeFm.delete(handle);
  }

  /** Two-operator FM with an inharmonic ratio: a glass bell. */
  private fm(freq: number, v: number, decay: number): void {
    const ctx = this.ctx as AudioContext;
    const t = ctx.currentTime;
    const carrier = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const amp = ctx.createGain();
    carrier.frequency.value = freq;
    mod.frequency.value = freq * 3.53;
    modGain.gain.setValueAtTime(freq * (1.2 + v * 2.2), t);
    modGain.gain.exponentialRampToValueAtTime(freq * 0.05, t + decay * 0.5);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(0.22 * v, t + 0.004);
    amp.gain.exponentialRampToValueAtTime(1e-4, t + decay);
    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(amp);
    amp.connect(this.dry);
    amp.connect(this.reverbSend);
    amp.connect(this.delaySend);
    carrier.start(t);
    mod.start(t);
    carrier.stop(t + decay + 0.05);
    mod.stop(t + decay + 0.05);
    const handle = {
      stop: () => {
        amp.gain.cancelScheduledValues(ctx.currentTime);
        amp.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      },
    };
    this.activeFm.add(handle);
    carrier.onended = () => this.activeFm.delete(handle);
  }

  /** Fist: silence every ringing voice. */
  muteAll(): void {
    this.harpNode?.port.postMessage({ type: 'mute' });
    this.bassNode?.port.postMessage({ type: 'mute' });
    for (const h of this.activeFm) h.stop();
    this.activeFm.clear();
    this.setPad(null, 0);
  }

  /** Two-hand pad. `notes` = 5 MIDI notes or null to fade out; tension 0..1 brightens it. */
  setPad(notes: number[] | null, tension: number): void {
    if (!this.built || !this.ctx) return;
    const t = this.ctx.currentTime;
    if (!notes) {
      this.padGain.gain.setTargetAtTime(0, t, 0.25);
      return;
    }
    this.padGain.gain.setTargetAtTime(1, t, 0.3);
    this.padFilter.frequency.setTargetAtTime(400 + tension * 3600, t, 0.08);
    notes.forEach((n, i) => {
      const f = midiToFreq(n, this.a4);
      for (const o of this.padOscs[i] ?? []) o.frequency.setTargetAtTime(f, t, 0.12);
    });
  }

  click(accent: boolean): void {
    if (!this.built || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = accent ? 1760 : 1320;
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(1e-4, t + 0.05);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.06);
  }
}
