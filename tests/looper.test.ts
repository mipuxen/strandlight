import { describe, expect, it } from 'vitest';
import { Looper, quantize } from '../src/core/instruments/looper';
import { Metronome } from '../src/core/instruments/metronome';

const ev = { strandId: 1, midi: 60, timbre: 'harp' as const, velocity: 0.8, pan: 0 };

describe('Looper', () => {
  it('quantizes to sixteenths', () => {
    expect(quantize(1.13)).toBe(1.25);
    expect(quantize(0.1)).toBe(0);
  });

  it('records a bar and plays it back every cycle', () => {
    const l = new Looper();
    const played: number[] = [];
    l.onPlay = (e) => played.push(e.beat);
    l.toggle(0);
    l.record(1.02, ev);
    l.record(2.49, ev);
    l.toggle(3.9); // rounds to one bar (4 beats)
    expect(l.lengthBeats).toBe(4);
    for (let b = 3.9; b < 12; b += 0.05) l.tick(b);
    expect(played.filter((x) => x === 1)).toHaveLength(2);
    expect(played.filter((x) => x === 2.5)).toHaveLength(2);
  });

  it('overdubs into the next layer for exactly one cycle', () => {
    const l = new Looper();
    l.toggle(0);
    l.record(0.5, ev);
    l.toggle(4);
    l.toggle(4.2);
    expect(l.state).toBe('overdub');
    l.record(5, ev);
    for (let b = 4.2; b < 8.5; b += 0.05) l.tick(b);
    expect(l.state).toBe('playing');
    expect(l.activeLayers).toBe(2);
  });
});

describe('Metronome', () => {
  it('clamps BPM to 40–200 and supports tap tempo', () => {
    const m = new Metronome();
    m.setBpm(500);
    expect(m.bpm).toBe(200);
    m.tap(0);
    m.tap(0.5);
    m.tap(1);
    expect(m.bpm).toBe(120);
  });
});
