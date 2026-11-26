import { svg } from '../dom';
import { GhostHand } from './ghost-hand';
import type { Pt } from './poses';
import { sampleScene, type SceneFrame, type SceneId } from './scenes';

/** Renders an instructional scene (ghost hand + strings) into its own SVG. */
export class SceneView {
  readonly el: SVGSVGElement;
  private hands = [new GhostHand(), new GhostHand()];
  private strings: SVGPathElement[] = [];
  private stringLayer: SVGGElement;
  private trail: SVGLineElement;
  private sparks: SVGGElement;
  private press: SVGCircleElement;
  private ring: SVGCircleElement;
  private ringTrack: SVGCircleElement;
  private threads: SVGPathElement[];
  private start = performance.now();
  scene: SceneId;
  touch = false;

  constructor(
    scene: SceneId,
    private width: number,
    private height: number,
    className = '',
    private handSize = 0.2,
  ) {
    this.scene = scene;
    this.stringLayer = svg('g', {});
    this.trail = svg('line', { class: 'sv-trail' });
    this.sparks = svg('g', { class: 'sv-sparks' });
    this.press = svg('circle', { class: 'sv-press' });
    this.ringTrack = svg('circle', { class: 'sv-ring-track' });
    this.ring = svg('circle', { class: 'sv-ring' });
    this.threads = Array.from({ length: 5 }, () => svg('path', { class: 'sv-thread' }));
    this.el = svg(
      'svg',
      {
        class: `scene-view ${className}`,
        viewBox: `0 0 ${width} ${height}`,
        'aria-hidden': 'true',
      },
      this.stringLayer,
      ...this.threads,
      this.trail,
      this.sparks,
      this.ringTrack,
      this.ring,
      ...this.hands.map((h) => h.root),
      this.press,
    );
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.el.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }

  setScene(scene: SceneId): void {
    if (scene === this.scene) return;
    this.scene = scene;
    this.start = performance.now();
  }

  render(now: number): void {
    const f = sampleScene(
      this.scene,
      (now - this.start) / 1000,
      this.width,
      this.height,
      this.touch,
      this.handSize,
    );
    this.draw(f);
  }

  private draw(f: SceneFrame): void {
    // Strings: a quadratic curve whose middle swings with the vibration.
    while (this.strings.length < f.strings.length) {
      const p = svg('path', {});
      this.strings.push(p);
      this.stringLayer.append(p);
    }
    this.strings.forEach((p, i) => {
      const s = f.strings[i];
      if (!s) {
        p.setAttribute('d', '');
        return;
      }
      const [ax, ay] = s.a;
      const [bx, by] = s.b;
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const nx = -(by - ay) / len;
      const ny = (bx - ax) / len;
      const d = Math.sin(s.phase) * s.amp * len * 0.08;
      const mx = (ax + bx) / 2 + nx * d * 2;
      const my = (ay + by) / 2 + ny * d * 2;
      p.setAttribute('d', `M${ax},${ay} Q${mx},${my} ${bx},${by}`);
      p.setAttribute('class', `sv-string sv-${s.color}`);
      p.setAttribute('opacity', String(s.opacity));
    });

    if (f.trail) {
      this.trail.setAttribute('x1', String(f.trail.a[0]));
      this.trail.setAttribute('y1', String(f.trail.a[1]));
      this.trail.setAttribute('x2', String(f.trail.b[0]));
      this.trail.setAttribute('y2', String(f.trail.b[1]));
      this.trail.setAttribute('opacity', '1');
    } else this.trail.setAttribute('opacity', '0');

    this.sparks.replaceChildren(
      ...f.sparks.map((s) =>
        svg('circle', { cx: s.x, cy: s.y, r: 2.2, opacity: s.a, class: 'sv-spark' }),
      ),
    );

    if (f.press) {
      this.press.setAttribute('cx', String(f.press.x));
      this.press.setAttribute('cy', String(f.press.y));
      this.press.setAttribute('r', String(f.press.r));
      this.press.setAttribute('opacity', '1');
    } else this.press.setAttribute('opacity', '0');

    if (f.ring) {
      const r = Math.min(this.width, this.height) * 0.08;
      const c = 2 * Math.PI * r;
      for (const el of [this.ring, this.ringTrack]) {
        el.setAttribute('cx', String(f.ring.x));
        el.setAttribute('cy', String(f.ring.y));
        el.setAttribute('r', String(r));
        el.setAttribute('opacity', '1');
      }
      this.ring.setAttribute('stroke-dasharray', `${c * f.ring.p} ${c}`);
      this.ring.setAttribute('transform', `rotate(-90 ${f.ring.x} ${f.ring.y})`);
    } else {
      this.ring.setAttribute('opacity', '0');
      this.ringTrack.setAttribute('opacity', '0');
    }

    this.hands.forEach((h, i) => {
      const frame = f.hands[i];
      if (frame) h.render(frame);
      else h.root.setAttribute('opacity', '0');
    });

    // Two hands: five threads between matching fingertips.
    const two = f.hands.length === 2;
    [4, 8, 12, 16, 20].forEach((tip, j) => {
      const th = this.threads[j] as SVGPathElement;
      if (!two) return th.setAttribute('d', '');
      const a = this.hands[0]?.points[tip] as Pt | undefined;
      const b = this.hands[1]?.points[tip] as Pt | undefined;
      if (!a || !b) return th.setAttribute('d', '');
      const sag = Math.sin(performance.now() / 300 + j) * 6;
      th.setAttribute(
        'd',
        `M${a[0]},${a[1]} Q${(a[0] + b[0]) / 2},${(a[1] + b[1]) / 2 + sag} ${b[0]},${b[1]}`,
      );
    });
  }
}

/** One shared animation loop for every visible scene. */
const views = new Set<SceneView>();
let running = false;
function loop(now: number): void {
  for (const v of views) if (v.el.isConnected) v.render(now);
  if (views.size) requestAnimationFrame(loop);
  else running = false;
}

export function animate(v: SceneView): () => void {
  views.add(v);
  if (!running) {
    running = true;
    requestAnimationFrame(loop);
  }
  return () => views.delete(v);
}
