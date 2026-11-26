import { SCALES, type ScaleId } from './scales';

export type Timbre = 'crystal' | 'harp' | 'bass';
export type Mode = 'beginner' | 'musician' | 'virtuoso';

/** Timbre is chosen by string length relative to the screen diagonal. */
export function timbreFor(lengthRatio: number): Timbre {
  if (lengthRatio < 0.25) return 'crystal';
  if (lengthRatio <= 0.55) return 'harp';
  return 'bass';
}

export interface Tuning {
  scale: ScaleId;
  tonic: number; // 0 = C … 11 = B
  octaves: number;
  baseOctave: number; // MIDI octave of the lowest note (4 → C3 = 48)
}

export function tuningForMode(mode: Mode, scale: ScaleId, tonic: number): Tuning {
  if (mode === 'beginner') return { scale: 'minorPentatonic', tonic: 0, octaves: 2, baseOctave: 4 };
  if (mode === 'musician') return { scale, tonic, octaves: 3, baseOctave: 3 };
  return { scale, tonic, octaves: 4, baseOctave: 3 };
}

/** All playable MIDI notes for a tuning, ascending. */
export function scaleNotes(t: Tuning): number[] {
  const steps = SCALES[t.scale];
  const notes: number[] = [];
  const base = t.baseOctave * 12 + t.tonic;
  for (let o = 0; o < t.octaves; o++) for (const s of steps) notes.push(base + o * 12 + s);
  notes.push(base + t.octaves * 12);
  return notes;
}

/**
 * Longer strings sound lower, like a real harp. A length ratio of ~0.05 maps to the
 * top note and ~0.9 to the bottom note; the result is snapped to the nearest scale step.
 */
export function noteForLength(lengthRatio: number, t: Tuning): number {
  const notes = scaleNotes(t);
  const r = Math.min(1, Math.max(0, (lengthRatio - 0.05) / 0.85));
  // Perceptual curve: halving the length should feel like going up an octave.
  const pos = 1 - Math.log2(1 + r * 3) / 2;
  const idx = Math.round(pos * (notes.length - 1));
  return notes[Math.min(notes.length - 1, Math.max(0, idx))] as number;
}

/** Continuous (unsnapped) pitch used for pitch bend while a string is stretched. */
export function continuousNoteForLength(lengthRatio: number, t: Tuning): number {
  const notes = scaleNotes(t);
  const lo = notes[0] as number;
  const hi = notes[notes.length - 1] as number;
  const r = Math.min(1, Math.max(0, (lengthRatio - 0.05) / 0.85));
  const pos = 1 - Math.log2(1 + r * 3) / 2;
  return lo + pos * (hi - lo);
}
