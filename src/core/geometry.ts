export interface Vec2 {
  x: number;
  y: number;
}

export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Signed side of point p relative to the directed line a→b (cross product). */
export const side = (a: Vec2, b: Vec2, p: Vec2): number =>
  (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);

/** Closest point on segment ab to p, returned as parameter t in [0, 1] and distance. */
export function projectOnSegment(a: Vec2, b: Vec2, p: Vec2): { t: number; d: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1e-9;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1);
  const d = Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
  return { t, d };
}

/** True when segment p1→p2 crosses segment a→b. Returns the parameter along ab, or null. */
export function segmentCross(a: Vec2, b: Vec2, p1: Vec2, p2: Vec2): number | null {
  const s1 = side(a, b, p1);
  const s2 = side(a, b, p2);
  if (s1 === 0 || Math.sign(s1) === Math.sign(s2)) return null;
  const s3 = side(p1, p2, a);
  const s4 = side(p1, p2, b);
  if (Math.sign(s3) === Math.sign(s4)) return null;
  // Intersection parameter along ab.
  const t = s3 / (s3 - s4);
  return clamp(t, 0, 1);
}
