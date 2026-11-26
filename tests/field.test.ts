import { describe, expect, it } from 'vitest';
import { MAX_STRANDS, StrandField } from '../src/core/strings/field';

describe('StrandField', () => {
  it('undoes and redoes adds, clears and moves', () => {
    const f = new StrandField();
    const s = f.add({ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.9 });
    f.add({ x: 0.5, y: 0.1 }, { x: 0.5, y: 0.9 });
    expect(f.live).toHaveLength(2);
    f.clear();
    expect(f.live).toHaveLength(0);
    f.undo();
    expect(f.live).toHaveLength(2);
    const from: [typeof s.a, typeof s.b] = [{ ...s.a }, { ...s.b }];
    const moved = f.byId(s.id);
    if (!moved) throw new Error('missing');
    moved.a = { x: 0.3, y: 0.3 };
    f.commitMove(s.id, from);
    f.undo();
    expect(f.byId(s.id)?.a).toEqual({ x: 0.1, y: 0.1 });
    f.redo();
    expect(f.byId(s.id)?.a).toEqual({ x: 0.3, y: 0.3 });
  });

  it('fades out the oldest string beyond the cap', () => {
    const f = new StrandField();
    for (let i = 0; i < MAX_STRANDS + 3; i++) f.add({ x: i / 60, y: 0.1 }, { x: i / 60, y: 0.9 });
    expect(f.live).toHaveLength(MAX_STRANDS);
  });

  it('detects a fingertip crossing a string', () => {
    const f = new StrandField();
    const s = f.add({ x: 0.5, y: 0.1 }, { x: 0.5, y: 0.9 });
    s.life = 1;
    const hits = f.crossings({ x: 0.4, y: 0.5 }, { x: 0.6, y: 0.5 });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.t).toBeCloseTo(0.5);
    expect(f.crossings({ x: 0.4, y: 0.5 }, { x: 0.45, y: 0.5 })).toHaveLength(0);
  });
});
