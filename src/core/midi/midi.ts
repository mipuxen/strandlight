import type { Timbre } from '../music/mapping';

/** Each timbre plays on its own MIDI channel (1, 2, 3). */
export const CHANNEL: Record<Timbre, number> = { crystal: 0, harp: 1, bass: 2 };

export const noteOn = (ch: number, note: number, vel: number): number[] => [
  0x90 | ch,
  note & 0x7f,
  Math.max(1, Math.min(127, Math.round(vel * 127))),
];
export const noteOff = (ch: number, note: number): number[] => [0x80 | ch, note & 0x7f, 0];
export const cc = (ch: number, num: number, value: number): number[] => [
  0xb0 | ch,
  num & 0x7f,
  Math.max(0, Math.min(127, Math.round(value * 127))),
];

/** Sends every pluck as MIDI note on/off via Web MIDI (Chromium browsers). */
export class MidiOut {
  private access: MIDIAccess | null = null;
  private outputId: string | null = null;

  static get supported(): boolean {
    return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
  }

  async enable(): Promise<string[]> {
    this.access = await navigator.requestMIDIAccess({ sysex: false });
    const names = this.outputs().map((o) => o.name ?? o.id);
    this.outputId = this.outputs()[0]?.id ?? null;
    return names;
  }

  outputs(): MIDIOutput[] {
    return this.access ? [...this.access.outputs.values()] : [];
  }

  select(id: string): void {
    this.outputId = id;
  }

  get active(): boolean {
    return this.outputId !== null;
  }

  private out(): MIDIOutput | undefined {
    return this.outputId ? this.access?.outputs.get(this.outputId) : undefined;
  }

  pluck(timbre: Timbre, note: number, velocity: number, tension: number, durationMs = 400): void {
    const o = this.out();
    if (!o) return;
    const ch = CHANNEL[timbre];
    o.send(cc(ch, 1, tension));
    o.send(noteOn(ch, note, velocity));
    o.send(noteOff(ch, note), performance.now() + durationMs);
  }
}
