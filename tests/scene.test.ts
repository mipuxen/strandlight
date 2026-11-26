import { describe, expect, it } from 'vitest';
import {
  decodeScene,
  encodeScene,
  parseScene,
  SCENE_VERSION,
  type Scene,
} from '../src/core/scene/scene';

const scene: Scene = {
  v: SCENE_VERSION,
  strands: [{ id: 3, a: { x: 0.12345, y: 0.2 }, b: { x: 0.4, y: 0.9 } }],
  mode: 'musician',
  scale: 'dorian',
  tonic: 2,
  bpm: 100,
  theme: 'golden-harp',
  a4: 442,
};

describe('scenes', () => {
  it('round-trips through a compressed URL code', async () => {
    const code = await encodeScene(scene);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = await decodeScene(code);
    expect(back?.mode).toBe('musician');
    expect(back?.strands[0]?.a.x).toBeCloseTo(0.123, 3);
  });

  it('rejects malformed or hostile input', async () => {
    expect(parseScene(null)).toBeNull();
    expect(parseScene({ v: 99, strands: [] })).toBeNull();
    const cleaned = parseScene({
      ...scene,
      theme: '<img src=x onerror=alert(1)>',
      bpm: 9999,
      strands: [{ a: { x: 'x' } }],
    });
    expect(cleaned?.theme).toBe('neon-cosmos');
    expect(cleaned?.bpm).toBe(90);
    expect(cleaned?.strands).toHaveLength(0);
    expect(await decodeScene('not-valid!!')).toBeNull();
  });
});
