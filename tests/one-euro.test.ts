import { describe, expect, it } from 'vitest';
import { OneEuroFilter } from '../src/core/filters/one-euro';

describe('OneEuroFilter', () => {
  it('passes the first sample through unchanged', () => {
    expect(new OneEuroFilter().filter(0.42, 0)).toBe(0.42);
  });

  it('reduces jitter on a still signal', () => {
    const f = new OneEuroFilter();
    let maxDev = 0;
    for (let i = 0; i < 120; i++) {
      const noisy = 0.5 + (i % 2 ? 0.01 : -0.01);
      const out = f.filter(noisy, i * 16.7);
      if (i > 10) maxDev = Math.max(maxDev, Math.abs(out - 0.5));
    }
    // ±0.01 of raw jitter comes out at least 3× smaller.
    expect(maxDev).toBeLessThan(0.0033);
  });

  it('follows fast movement with little lag', () => {
    const f = new OneEuroFilter();
    let out = 0;
    for (let i = 0; i <= 30; i++) out = f.filter(i / 30, i * 16.7);
    expect(out).toBeGreaterThan(0.95);
  });
});
