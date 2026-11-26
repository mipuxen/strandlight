import type { Timbre } from '../music/mapping';

export interface Theme {
  id: 'neon-cosmos' | 'golden-harp' | 'white-silk';
  background: string;
  colors: Record<Timbre, string>;
  /** Base line width in CSS pixels. */
  width: number;
  font: string;
  bloom: number;
}

export const THEMES: Theme[] = [
  {
    id: 'neon-cosmos',
    background: '#05060F',
    colors: { crystal: '#7CF7FF', harp: '#FF4FD8', bass: '#FFC857' },
    width: 2.2,
    font: "'Sora', system-ui, sans-serif",
    bloom: 1.15,
  },
  {
    id: 'golden-harp',
    background: '#0E0904',
    colors: { crystal: '#FFE3A3', harp: '#F2A93B', bass: '#C8703A' },
    width: 2,
    font: "'Inter', system-ui, sans-serif",
    bloom: 1.0,
  },
  {
    id: 'white-silk',
    background: '#000000',
    colors: { crystal: '#FFFFFF', harp: '#E6E9EE', bass: '#B8BEC8' },
    width: 1.1,
    font: "'Manrope', system-ui, sans-serif",
    bloom: 0.7,
  },
];

export const themeById = (id: string): Theme =>
  THEMES.find((t) => t.id === id) ?? (THEMES[0] as Theme);
