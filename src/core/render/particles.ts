export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

const MAX = 1500;

/** Sparks that fly along a string on a flick. Positions in CSS pixels. */
export class Particles {
  items: Particle[] = [];

  burst(x: number, y: number, dirX: number, dirY: number, color: string, count = 24): void {
    for (let i = 0; i < count; i++) {
      const along = (Math.random() - 0.5) * 2;
      const speed = 120 + Math.random() * 380;
      this.items.push({
        x,
        y,
        vx: dirX * speed * along + (Math.random() - 0.5) * 60,
        vy: dirY * speed * along + (Math.random() - 0.5) * 60,
        life: 0.6 + Math.random() * 0.6,
        color,
      });
    }
    if (this.items.length > MAX) this.items.splice(0, this.items.length - MAX);
  }

  step(dt: number): void {
    for (const p of this.items) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-dt * 2.5);
      p.vy *= Math.exp(-dt * 2.5);
      p.vy += 40 * dt;
      p.life -= dt;
    }
    this.items = this.items.filter((p) => p.life > 0);
  }
}
