import { dist, projectOnSegment, segmentCross, type Vec2 } from '../geometry';
import { Strand, type StrandData } from './strand';

export const MAX_STRANDS = 48;

type Action =
  | { kind: 'add'; data: StrandData }
  | { kind: 'remove'; data: StrandData }
  | { kind: 'clear'; data: StrandData[] }
  | { kind: 'move'; id: number; from: [Vec2, Vec2]; to: [Vec2, Vec2] };

/** Owns every string on stage plus undo/redo history. */
export class StrandField {
  strands: Strand[] = [];
  private nextId = 1;
  private undoStack: Action[] = [];
  private redoStack: Action[] = [];
  onChange: () => void = () => {};

  get live(): Strand[] {
    return this.strands.filter((s) => !s.fading);
  }

  add(a: Vec2, b: Vec2, record = true): Strand {
    const s = new Strand(this.nextId++, a, b);
    this.strands.push(s);
    // Over the cap, the oldest string fades out gracefully instead of vanishing.
    const live = this.live;
    if (live.length > MAX_STRANDS) {
      const oldest = live[0];
      if (oldest) oldest.fading = true;
    }
    if (record) this.push({ kind: 'add', data: s.toData() });
    this.onChange();
    return s;
  }

  remove(id: number, record = true): void {
    const s = this.strands.find((x) => x.id === id && !x.fading);
    if (!s) return;
    s.fading = true;
    if (record) this.push({ kind: 'remove', data: s.toData() });
    this.onChange();
  }

  clear(): void {
    const data = this.live.map((s) => s.toData());
    if (data.length === 0) return;
    for (const s of this.live) s.fading = true;
    this.push({ kind: 'clear', data });
    this.onChange();
  }

  /** Records a finished move/stretch so it can be undone. */
  commitMove(id: number, from: [Vec2, Vec2]): void {
    const s = this.byId(id);
    if (!s) return;
    this.push({ kind: 'move', id, from, to: [{ ...s.a }, { ...s.b }] });
    this.onChange();
  }

  load(data: StrandData[]): void {
    for (const s of this.live) s.fading = true;
    for (const d of data.slice(-MAX_STRANDS)) this.add(d.a, d.b, false);
    this.undoStack = [];
    this.redoStack = [];
    this.onChange();
  }

  undo(): void {
    const act = this.undoStack.pop();
    if (!act) return;
    this.apply(act, true);
    this.redoStack.push(act);
    this.onChange();
  }

  redo(): void {
    const act = this.redoStack.pop();
    if (!act) return;
    this.apply(act, false);
    this.undoStack.push(act);
    this.onChange();
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  byId(id: number): Strand | undefined {
    return this.strands.find((s) => s.id === id && !s.fading);
  }

  /** Finds the nearest string endpoint within `radius` (normalized, aspect-corrected). */
  nearestEndpoint(
    p: Vec2,
    radius: number,
    aspect: number,
  ): { strand: Strand; end: 'a' | 'b' } | null {
    let best: { strand: Strand; end: 'a' | 'b' } | null = null;
    let bestD = radius;
    const P = { x: p.x * aspect, y: p.y };
    for (const s of this.live) {
      for (const end of ['a', 'b'] as const) {
        const q = s[end];
        const d = dist(P, { x: q.x * aspect, y: q.y });
        if (d < bestD) {
          bestD = d;
          best = { strand: s, end };
        }
      }
    }
    return best;
  }

  nearestStrand(p: Vec2, aspect: number): { strand: Strand; t: number; d: number } | null {
    let best: { strand: Strand; t: number; d: number } | null = null;
    const P = { x: p.x * aspect, y: p.y };
    for (const s of this.live) {
      const r = projectOnSegment(
        { x: s.a.x * aspect, y: s.a.y },
        { x: s.b.x * aspect, y: s.b.y },
        P,
      );
      if (!best || r.d < best.d) best = { strand: s, t: r.t, d: r.d };
    }
    return best;
  }

  /** Every string crossed by the movement p1→p2, with the crossing parameter. */
  crossings(p1: Vec2, p2: Vec2): { strand: Strand; t: number }[] {
    const hits: { strand: Strand; t: number }[] = [];
    for (const s of this.live) {
      if (s.life < 0.5) continue;
      const t = segmentCross(s.a, s.b, p1, p2);
      if (t !== null) hits.push({ strand: s, t });
    }
    return hits;
  }

  step(dt: number, sustain: boolean): void {
    for (const s of this.strands) s.step(dt, sustain);
    this.strands = this.strands.filter((s) => !(s.fading && s.life <= 0));
  }

  serialize(): StrandData[] {
    return this.live.map((s) => s.toData());
  }

  private push(a: Action): void {
    this.undoStack.push(a);
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
  }

  private apply(act: Action, reverse: boolean): void {
    switch (act.kind) {
      case 'add': {
        if (reverse) {
          const s = this.findSame(act.data);
          if (s) s.fading = true;
        } else this.restore(act.data);
        break;
      }
      case 'remove': {
        if (reverse) this.restore(act.data);
        else {
          const s = this.findSame(act.data);
          if (s) s.fading = true;
        }
        break;
      }
      case 'clear': {
        if (reverse) for (const d of act.data) this.restore(d);
        else for (const s of this.live) s.fading = true;
        break;
      }
      case 'move': {
        const s = this.strands.find((x) => x.id === act.id && !x.fading);
        if (!s) break;
        const [a, b] = reverse ? act.from : act.to;
        s.a = { ...a };
        s.b = { ...b };
        break;
      }
    }
  }

  /** Re-creates a strand keeping its original id so later history entries still match. */
  private restore(d: StrandData): void {
    const s = new Strand(d.id, d.a, d.b);
    this.strands.push(s);
  }

  private findSame(d: StrandData): Strand | undefined {
    return this.strands.find((s) => s.id === d.id && !s.fading);
  }
}
