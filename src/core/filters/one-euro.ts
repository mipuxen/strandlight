/**
 * One Euro filter (Casiez et al., 2012): smooths jitter at low speed while
 * keeping latency low during fast movement.
 */
class LowPass {
  private y: number | null = null;
  filter(x: number, alpha: number): number {
    this.y = this.y === null ? x : alpha * x + (1 - alpha) * this.y;
    return this.y;
  }
  get last(): number | null {
    return this.y;
  }
  reset(): void {
    this.y = null;
  }
}

const alpha = (cutoff: number, dt: number): number => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export class OneEuroFilter {
  private x = new LowPass();
  private dx = new LowPass();
  private lastTime: number | null = null;

  /** Defaults tuned for normalized (0..1) coordinates at 30–60 fps. */
  constructor(
    private minCutoff = 1.0,
    private beta = 5,
    private dCutoff = 1.0,
  ) {}

  filter(value: number, timeMs: number): number {
    const dt = this.lastTime === null ? 1 / 60 : Math.max(1e-3, (timeMs - this.lastTime) / 1000);
    this.lastTime = timeMs;
    const prev = this.x.last;
    const rawDx = prev === null ? 0 : (value - prev) / dt;
    const edx = this.dx.filter(rawDx, alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.x.filter(value, alpha(cutoff, dt));
  }

  reset(): void {
    this.x.reset();
    this.dx.reset();
    this.lastTime = null;
  }
}
