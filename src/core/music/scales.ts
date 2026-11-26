/** Scale definitions as semitone offsets from the tonic. */
export const SCALES = {
  minorPentatonic: [0, 3, 5, 7, 10],
  majorPentatonic: [0, 2, 4, 7, 9],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  blues: [0, 3, 5, 6, 7, 10],
  hijaz: [0, 1, 4, 5, 7, 8, 10],
  japanese: [0, 1, 5, 7, 8],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
} as const;

export type ScaleId = keyof typeof SCALES;

/** The 12 scales offered in Musician mode (chromatic is Virtuoso only). */
export const MUSICIAN_SCALES: ScaleId[] = [
  'minorPentatonic',
  'majorPentatonic',
  'major',
  'minor',
  'dorian',
  'phrygian',
  'lydian',
  'mixolydian',
  'harmonicMinor',
  'blues',
  'hijaz',
  'japanese',
];

export const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

export const midiToFreq = (midi: number, a4 = 440): number => a4 * Math.pow(2, (midi - 69) / 12);

export const midiName = (midi: number): string =>
  `${NOTE_NAMES[((Math.round(midi) % 12) + 12) % 12]}${Math.floor(Math.round(midi) / 12) - 1}`;
