import type { Mode } from './core/music/mapping';
import type { ScaleId } from './core/music/scales';
import type { RecordSource } from './core/record/recorder';

export type ScaleChoice = ScaleId | 'free';

export interface Settings {
  mode: Mode;
  theme: string;
  scale: ScaleChoice;
  tonic: number;
  a4: number;
  bpm: number;
  metronome: boolean;
  velocity: boolean;
  volume: number;
  showVideo: boolean;
  /** Camera background brightness, 0..1. */
  videoBrightness: number;
  recordSource: RecordSource;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'beginner',
  theme: 'neon-cosmos',
  scale: 'minorPentatonic',
  tonic: 0,
  a4: 440,
  bpm: 90,
  metronome: false,
  velocity: true,
  volume: 0.85,
  showVideo: true,
  videoBrightness: 0.55,
  recordSource: 'scene',
};

const KEY = 'strandlight.settings';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    // Only keep known keys with the right types.
    const out = { ...DEFAULT_SETTINGS };
    for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      if (typeof parsed[k] === typeof DEFAULT_SETTINGS[k])
        (out as Record<string, unknown>)[k] = parsed[k];
    }
    return out;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore: private mode */
  }
}
