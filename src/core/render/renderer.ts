import type { Vec2 } from '../geometry';
import type { Strand } from '../strings/strand';
import { Bloom } from './bloom';
import { Particles } from './particles';
import type { Theme } from './themes';

export interface FrameState {
  strands: Strand[];
  theme: Theme;
  hands: { key: string; points: Vec2[]; pinching: boolean }[];
  /** Strings being drawn right now (pinch held). */
  previews: { a: Vec2; b: Vec2 }[];
  /** Two-hand pad threads, tension 0..1. */
  threads: { a: Vec2; b: Vec2 }[];
  tension: number;
  video: HTMLVideoElement | null;
  showVideo: boolean;
  videoBrightness: number;
  pulse: number; // 0..1 metronome pulse
  /** V-sign hold progress: a ring that fills before everything mutes. */
  mute: { at: Vec2; progress: number } | null;
  time: number;
}

/**
 * Scene is drawn with Canvas 2D (additive blending), then passed through a WebGL2
 * bloom. Without WebGL2 (or in light mode) the 2D canvas is shown directly.
 */
export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private scene: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bloom: Bloom | null = null;
  readonly particles = new Particles();
  width = 0;
  height = 0;
  private dpr = 1;

  constructor(host: HTMLElement, light: boolean) {
    this.scene = document.createElement('canvas');
    this.ctx = this.scene.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
    const out = document.createElement('canvas');
    this.bloom = light ? null : Bloom.create(out);
    this.canvas = this.bloom ? out : this.scene;
    this.canvas.className = 'stage-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    host.prepend(this.canvas);
    this.dpr = Math.min(window.devicePixelRatio || 1, light ? 1 : 2);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  get usingWebGL(): boolean {
    return this.bloom !== null;
  }

  get aspect(): number {
    return this.width / Math.max(1, this.height);
  }

  get diagonal(): number {
    return Math.hypot(this.width, this.height);
  }

  private resize(): void {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    for (const c of new Set([this.scene, this.canvas])) {
      c.width = Math.round(this.width * this.dpr);
      c.height = Math.round(this.height * this.dpr);
    }
  }

  /** Normalized stage → CSS pixels. */
  px(p: Vec2): Vec2 {
    return { x: p.x * this.width, y: p.y * this.height };
  }

  /** Length of a normalized segment as a fraction of the screen diagonal. */
  lengthRatio(a: Vec2, b: Vec2): number {
    return Math.hypot((a.x - b.x) * this.width, (a.y - b.y) * this.height) / this.diagonal;
  }

  draw(f: FrameState, dt: number): void {
    const c = this.ctx;
    const { width: W, height: H } = this;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.fillStyle = f.theme.background;
    c.fillRect(0, 0, W, H);

    // Mirrored camera, cover-fit, at the brightness the player picked.
    if (f.showVideo && f.videoBrightness > 0 && f.video && f.video.readyState >= 2) {
      const vw = f.video.videoWidth;
      const vh = f.video.videoHeight;
      const s = Math.max(W / vw, H / vh);
      c.save();
      c.globalAlpha = Math.min(1, Math.max(0, f.videoBrightness));
      c.translate(W, 0);
      c.scale(-1, 1);
      c.drawImage(f.video, (W - vw * s) / 2, (H - vh * s) / 2, vw * s, vh * s);
      c.restore();
    }

    c.globalCompositeOperation = 'lighter';
    const glow2d = !this.bloom;

    for (const s of f.strands) this.drawStrand(s, f, glow2d);

    for (const p of f.previews) {
      const a = this.px(p.a);
      const b = this.px(p.b);
      c.strokeStyle = f.theme.colors.harp;
      c.globalAlpha = 0.55;
      c.lineWidth = f.theme.width;
      c.setLineDash([6, 8]);
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
      c.setLineDash([]);
    }

    // Pad threads between fingertips: gently waving, brighter with tension.
    if (f.threads.length) {
      c.globalAlpha = 0.35 + f.tension * 0.5;
      c.lineWidth = 1 + f.tension * 1.5;
      f.threads.forEach((t, i) => {
        const a = this.px(t.a);
        const b = this.px(t.b);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2 + Math.sin(f.time * 3 + i) * (12 * (1 - f.tension));
        c.strokeStyle = f.theme.colors.crystal;
        c.beginPath();
        c.moveTo(a.x, a.y);
        c.quadraticCurveTo(mx, my, b.x, b.y);
        c.stroke();
      });
    }

    // Fingertips.
    for (const h of f.hands) {
      for (const i of [4, 8, 12, 16, 20]) {
        const p = h.points[i];
        if (!p) continue;
        const q = this.px(p);
        const r = i === 8 ? 5 : 3;
        c.globalAlpha = i === 8 || (h.pinching && i === 4) ? 0.95 : 0.45;
        c.fillStyle = h.pinching && (i === 4 || i === 8) ? f.theme.colors.bass : '#ffffff';
        c.beginPath();
        c.arc(q.x, q.y, r, 0, Math.PI * 2);
        c.fill();
      }
    }

    if (f.mute && f.mute.progress > 0) {
      const q = this.px(f.mute.at);
      c.globalAlpha = 0.9;
      c.strokeStyle = '#ffffff';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(q.x, q.y, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f.mute.progress);
      c.stroke();
    }

    this.particles.step(dt);
    for (const p of this.particles.items) {
      c.globalAlpha = Math.min(1, p.life * 1.4);
      c.fillStyle = p.color;
      c.fillRect(p.x - 1.2, p.y - 1.2, 2.4, 2.4);
    }

    // Metronome pulse: a soft frame at the bottom edge.
    if (f.pulse > 0) {
      c.globalAlpha = f.pulse * 0.35;
      c.fillStyle = f.theme.colors.bass;
      c.fillRect(0, H - 3, W, 3);
    }

    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    if (this.bloom) this.bloom.render(this.scene, f.theme.bloom);
  }

  private drawStrand(s: Strand, f: FrameState, glow2d: boolean): void {
    const c = this.ctx;
    const a = this.px(s.a);
    const b = this.px(s.b);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1) return;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const color = f.theme.colors[s.timbre];
    const energy = Math.min(1, s.energy);
    const segs = Math.max(12, Math.min(64, Math.round(len / 10)));

    const path = () => {
      c.beginPath();
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const d = s.displacement(t) * len;
        const x = a.x + (b.x - a.x) * t + nx * d;
        const y = a.y + (b.y - a.y) * t + ny * d;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
    };

    c.strokeStyle = color;
    c.lineCap = 'round';
    const base = 0.55 + energy * 0.45;
    if (glow2d) {
      // Fake bloom with wide, faint strokes underneath.
      for (const [w, alpha] of [
        [10, 0.06],
        [5, 0.12],
      ] as const) {
        c.globalAlpha = alpha * s.life * (0.6 + energy);
        c.lineWidth = f.theme.width * w;
        path();
        c.stroke();
      }
    }
    c.globalAlpha = base * s.life;
    c.lineWidth = f.theme.width * (1 + energy * 0.8);
    path();
    c.stroke();
    // Hot core.
    c.globalAlpha = (0.35 + energy * 0.65) * s.life;
    c.strokeStyle = '#ffffff';
    c.lineWidth = Math.max(0.6, f.theme.width * 0.35);
    path();
    c.stroke();
    // Anchor points.
    c.fillStyle = color;
    for (const p of [a, b]) {
      c.globalAlpha = 0.8 * s.life;
      c.beginPath();
      c.arc(p.x, p.y, f.theme.width * 1.6, 0, Math.PI * 2);
      c.fill();
    }
  }
}
