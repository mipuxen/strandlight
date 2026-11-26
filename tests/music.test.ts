import { describe, expect, it } from 'vitest';
import { noteForLength, scaleNotes, timbreFor, tuningForMode } from '../src/core/music/mapping';
import { SCALES, midiToFreq, midiName } from '../src/core/music/scales';

describe('timbre by length', () => {
  it('maps short/medium/long to crystal/harp/bass', () => {
    expect(timbreFor(0.1)).toBe('crystal');
    expect(timbreFor(0.25)).toBe('harp');
    expect(timbreFor(0.55)).toBe('harp');
    expect(timbreFor(0.7)).toBe('bass');
  });
});

describe('notes', () => {
  it('Beginner is always C minor pentatonic over 2 octaves', () => {
    const t = tuningForMode('beginner', 'lydian', 7);
    expect(t.scale).toBe('minorPentatonic');
    expect(t.tonic).toBe(0);
    expect(scaleNotes(t)).toHaveLength(SCALES.minorPentatonic.length * 2 + 1);
  });

  it('never produces a note outside the scale', () => {
    const t = tuningForMode('musician', 'hijaz', 2);
    const allowed = new Set(scaleNotes(t));
    for (let r = 0; r <= 1; r += 0.01) expect(allowed.has(noteForLength(r, t))).toBe(true);
  });

  it('longer strings sound lower', () => {
    const t = tuningForMode('beginner', 'minorPentatonic', 0);
    expect(noteForLength(0.8, t)).toBeLessThan(noteForLength(0.1, t));
  });

  it('tunes A4 and names notes', () => {
    expect(midiToFreq(69)).toBe(440);
    expect(midiToFreq(69, 432)).toBe(432);
    expect(midiToFreq(81)).toBeCloseTo(880);
    expect(midiName(60)).toBe('C4');
  });
});
