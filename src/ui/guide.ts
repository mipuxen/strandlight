import { t, type MessageKey } from '../i18n/i18n';
import { el, svg } from './dom';

export type GuideSignal = 'hand' | 'pinch' | 'strand' | 'pluck' | 'flick';

interface Step {
  text: MessageKey;
  touchText?: MessageKey;
  until: GuideSignal;
  /** Ghost-hand motion as keyframes in viewport fractions. */
  path: [number, number][];
  pinch?: boolean;
}

const STEPS: Step[] = [
  {
    text: 'guide.step1',
    until: 'hand',
    path: [
      [0.5, 0.7],
      [0.5, 0.55],
      [0.5, 0.6],
    ],
  },
  {
    text: 'guide.step2',
    touchText: 'guide.touch2',
    until: 'pinch',
    path: [
      [0.35, 0.5],
      [0.35, 0.5],
      [0.65, 0.42],
    ],
    pinch: true,
  },
  {
    text: 'guide.step3',
    touchText: 'guide.touch2',
    until: 'strand',
    path: [
      [0.35, 0.5],
      [0.65, 0.42],
      [0.65, 0.42],
    ],
    pinch: true,
  },
  {
    text: 'guide.step4',
    touchText: 'guide.touch4',
    until: 'pluck',
    path: [
      [0.5, 0.3],
      [0.5, 0.65],
    ],
  },
  {
    text: 'guide.step5',
    touchText: 'guide.touch4',
    until: 'flick',
    path: [
      [0.45, 0.35],
      [0.55, 0.62],
    ],
  },
];

/** A translucent hand outline drawn in code, so the guide needs no video and works in every language. */
function ghostHand(): SVGSVGElement {
  const finger = (x: number, len: number, rot: number) =>
    svg('line', {
      x1: x,
      y1: 52,
      x2: x,
      y2: 52 - len,
      transform: `rotate(${rot} ${x} 52)`,
      class: 'ghost-finger',
    });
  return svg(
    'svg',
    { viewBox: '0 0 100 120', class: 'ghost-hand', 'aria-hidden': 'true' },
    svg('path', { d: 'M28 60 Q26 98 50 108 Q76 104 76 62 Z', class: 'ghost-palm' }),
    finger(36, 34, -6),
    finger(48, 42, -2),
    finger(60, 40, 3),
    finger(71, 30, 9),
    svg('line', { x1: 30, y1: 76, x2: 12, y2: 58, class: 'ghost-finger ghost-thumb' }),
  );
}

/** Five-step interactive guide. Each step completes when the player actually does it. */
export class Guide {
  private root: HTMLElement;
  private text: HTMLElement;
  private dots: HTMLElement[];
  private hand: SVGSVGElement;
  private trail: HTMLElement;
  private step = -1;
  private anim: Animation | null = null;
  active = false;
  onDone: () => void = () => {};

  constructor(
    parent: HTMLElement,
    private touch: () => boolean,
  ) {
    this.hand = ghostHand();
    this.trail = el('div', { class: 'ghost-trail' });
    this.text = el('p', { class: 'guide-text' });
    this.dots = STEPS.map(() => el('span', { class: 'guide-dot' }));
    const skip = el('button', {
      class: 'btn btn-ghost guide-skip',
      type: 'button',
      text: t('guide.skip'),
    });
    skip.addEventListener('click', () => this.finish(false));
    this.root = el(
      'div',
      { class: 'guide', hidden: true },
      this.trail,
      el('div', { class: 'ghost-wrap' }, this.hand),
      el(
        'div',
        { class: 'guide-card' },
        el('div', { class: 'guide-dots' }, ...this.dots),
        this.text,
        skip,
      ),
    );
    parent.append(this.root);
  }

  start(): void {
    this.active = true;
    this.root.hidden = false;
    this.step = -1;
    // In touch mode there is no hand to show, so start at drawing.
    this.go(this.touch() ? 1 : 0);
  }

  signal(s: GuideSignal): void {
    if (!this.active) return;
    const cur = STEPS[this.step];
    if (cur && cur.until === s) this.go(this.step + 1);
  }

  refreshText(): void {
    const cur = STEPS[this.step];
    if (cur) this.text.textContent = t(this.touch() && cur.touchText ? cur.touchText : cur.text);
  }

  private go(i: number): void {
    if (i >= STEPS.length) return this.finish(true);
    this.step = i;
    const s = STEPS[i] as Step;
    this.refreshText();
    this.dots.forEach((d, j) => d.classList.toggle('on', j <= i));
    this.hand.classList.toggle('pinching', !!s.pinch);
    this.anim?.cancel();
    const frames = s.path.map(([x, y]) => ({
      transform: `translate(calc(${x * 100}vw - 50%), calc(${y * 100}vh - 30%))`,
    }));
    const wrap = this.hand.parentElement as HTMLElement;
    this.anim = wrap.animate(frames, {
      duration: 2200,
      iterations: Infinity,
      easing: 'ease-in-out',
    });
    const [x0, y0] = s.path[0] as [number, number];
    const [x1, y1] = s.path[s.path.length - 1] as [number, number];
    const showTrail = i === 1 || i === 2;
    this.trail.hidden = !showTrail;
    if (showTrail) {
      const dx = (x1 - x0) * innerWidth;
      const dy = (y1 - y0) * innerHeight;
      Object.assign(this.trail.style, {
        left: `${x0 * 100}vw`,
        top: `${y0 * 100}vh`,
        width: `${Math.hypot(dx, dy)}px`,
        transform: `rotate(${Math.atan2(dy, dx)}rad)`,
      });
    }
  }

  private finish(completed: boolean): void {
    this.anim?.cancel();
    this.active = false;
    if (completed) {
      this.hand.parentElement?.setAttribute('hidden', '');
      this.trail.hidden = true;
      this.text.textContent = t('guide.done');
      this.dots.forEach((d) => d.classList.add('on'));
      setTimeout(() => this.hide(), 2200);
    } else this.hide();
    this.onDone();
  }

  private hide(): void {
    this.root.hidden = true;
    this.hand.parentElement?.removeAttribute('hidden');
  }
}
