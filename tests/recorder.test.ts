import { describe, expect, it } from 'vitest';
import { fileName, pickMimeType } from '../src/core/record/recorder';
import { cc, noteOff, noteOn } from '../src/core/midi/midi';

describe('recorder helpers', () => {
  it('prefers MP4 and falls back to WebM', () => {
    expect(pickMimeType(() => true).ext).toBe('mp4');
    expect(pickMimeType((t) => t.startsWith('video/webm')).ext).toBe('webm');
  });

  it('names files strandlight-YYYYMMDD-HHMM', () => {
    expect(fileName(new Date(2026, 10, 27, 9, 5), 'mp4')).toBe('strandlight-20261127-0905.mp4');
  });
});

describe('MIDI messages', () => {
  it('builds note on/off and CC bytes', () => {
    expect(noteOn(1, 60, 1)).toEqual([0x91, 60, 127]);
    expect(noteOff(2, 48)).toEqual([0x82, 48, 0]);
    expect(cc(0, 1, 0.5)).toEqual([0xb0, 1, 64]);
  });
});
