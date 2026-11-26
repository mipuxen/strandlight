import { svg } from '../dom';
import { actionPoint, FINGERS, PALM, type Pose, type Pt } from './poses';

export interface HandFrame {
  pose: Pose;
  /** Where the action point (pinch / index tip) sits, in the parent SVG's units. */
  x: number;
  y: number;
  scale: number;
  opacity: number;
  /** Highlight thumb+index (pinch) or index alone (point). */
  active: 'pinch' | 'index' | 'all' | 'none';
  rotate?: number;
}

/**
 * A semi-transparent hand drawn from 21 landmarks: a soft silhouette (palm and
 * fingers as one layer, so overlaps don't stack), bones, knuckles and glowing tips.
 */
export class GhostHand {
  readonly root: SVGGElement;
  private silhouette: SVGGElement;
  private palm: SVGPolygonElement;
  private fingers: SVGPolylineElement[];
  private outline: SVGPolylineElement[];
  private joints: SVGCircleElement[];
  private tips: SVGCircleElement[];
  /** Landmarks of the last frame, in parent coordinates. */
  points: Pt[] = [];

  constructor() {
    this.palm = svg('polygon', { class: 'gh-fill' });
    this.fingers = FINGERS.map(() => svg('polyline', { class: 'gh-finger' }));
    this.silhouette = svg('g', { class: 'gh-silhouette' }, this.palm, ...this.fingers);
    this.outline = FINGERS.map(() => svg('polyline', { class: 'gh-bone' }));
    this.joints = Array.from({ length: 21 }, () => svg('circle', { class: 'gh-joint' }));
    this.tips = [4, 8, 12, 16, 20].map(() => svg('circle', { class: 'gh-tip' }));
    this.root = svg(
      'g',
      { class: 'ghost-hand' },
      this.silhouette,
      ...this.outline,
      ...this.joints,
      ...this.tips,
    );
  }

  render(f: HandFrame): void {
    const [ax, ay] = actionPoint(f.pose);
    const rot = ((f.rotate ?? 0) * Math.PI) / 180;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    // Pose → parent coordinates, anchored so the action point lands on (x, y).
    const P = f.pose.map(([px, py]): Pt => {
      const dx = (px - ax) * f.scale;
      const dy = (py - ay) * f.scale;
      return [f.x + dx * cos - dy * sin, f.y + dx * sin + dy * cos];
    });
    this.points = P;
    const pts = (idx: number[]) => idx.map((i) => (P[i] as Pt).join(',')).join(' ');

    this.root.setAttribute('opacity', String(f.opacity));
    this.palm.setAttribute('points', pts(PALM));
    FINGERS.forEach((chain, i) => {
      // Fingers are thick rounded strokes; the thumb is the widest, the pinky the thinnest.
      const width = (i === 0 ? 0.24 : i === 4 ? 0.17 : 0.2) * f.scale;
      const finger = this.fingers[i] as SVGPolylineElement;
      finger.setAttribute('points', pts(chain));
      finger.setAttribute('stroke-width', String(width));
      // Bones run from the wrist through each joint to the tip.
      const bone = this.outline[i] as SVGPolylineElement;
      bone.setAttribute('points', pts([0, ...chain]));
      bone.setAttribute('stroke-width', String(Math.max(1, f.scale * 0.025)));
    });
    this.joints.forEach((c, i) => {
      const [x, y] = P[i] as Pt;
      c.setAttribute('cx', String(x));
      c.setAttribute('cy', String(y));
      c.setAttribute('r', String(Math.max(1.2, f.scale * 0.035)));
    });
    [4, 8, 12, 16, 20].forEach((lm, i) => {
      const [x, y] = P[lm] as Pt;
      const c = this.tips[i] as SVGCircleElement;
      const on =
        f.active === 'all' ||
        (f.active === 'pinch' && (lm === 4 || lm === 8)) ||
        (f.active === 'index' && lm === 8);
      c.setAttribute('cx', String(x));
      c.setAttribute('cy', String(y));
      c.setAttribute('r', String(Math.max(2, f.scale * (on ? 0.085 : 0.05))));
      c.setAttribute('class', on ? 'gh-tip on' : 'gh-tip');
    });
  }
}
