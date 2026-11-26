import { t, type MessageKey } from '../i18n/i18n';
import { el } from './dom';
import { animate, SceneView } from './ghost/scene-view';
import type { SceneId } from './ghost/scenes';

export type GuideSignal = 'hand' | 'pinch' | 'pull' | 'strand' | 'pluck' | 'flick';

interface Step {
  scene: SceneId;
  text: MessageKey;
  touchText: MessageKey;
  hint: MessageKey;
  touchHint: MessageKey;
  /** The step is finished when the player does this. */
  until: GuideSignal;
}

const STEPS: Step[] = [
  {
    scene: 'show',
    text: 'guide.step1',
    touchText: 'guide.step1',
    hint: 'guide.hint.camera',
    touchHint: 'guide.hint.camera',
    until: 'hand',
  },
  {
    scene: 'pinch',
    text: 'guide.step2',
    touchText: 'guide.touch2',
    hint: 'guide.hint.pinch',
    touchHint: 'guide.hint.touch',
    until: 'pinch',
  },
  {
    scene: 'pull',
    text: 'guide.step3',
    touchText: 'guide.touch3',
    hint: 'guide.hint.pull',
    touchHint: 'guide.hint.touch',
    until: 'pull',
  },
  {
    scene: 'release',
    text: 'guide.step4',
    touchText: 'guide.touch4',
    hint: 'guide.hint.pull',
    touchHint: 'guide.hint.touch',
    until: 'strand',
  },
  {
    scene: 'pluck',
    text: 'guide.step5',
    touchText: 'guide.touch5',
    hint: 'guide.hint.pluck',
    touchHint: 'guide.hint.pluck',
    until: 'pluck',
  },
  {
    scene: 'flick',
    text: 'guide.step6',
    touchText: 'guide.touch6',
    hint: 'guide.hint.pluck',
    touchHint: 'guide.hint.pluck',
    until: 'flick',
  },
];

const ORDER: GuideSignal[] = STEPS.map((s) => s.until);
const HINT_AFTER_MS = 8000;

/**
 * Interactive guide. While learning it sits in the middle of the screen with a
 * large ghost hand; afterwards it shrinks to a small "How to play" dock at the bottom.
 */
export class Guide {
  private root: HTMLElement;
  private view: SceneView;
  private card: HTMLElement;
  private counter: HTMLElement;
  private text: HTMLElement;
  private hint: HTMLElement;
  private dots: HTMLElement[];
  private skip: HTMLButtonElement;
  private mini: HTMLElement;
  private miniView: SceneView;
  private step = -1;
  private hintTimer = 0;
  private stopAnim: (() => void) | null = null;
  private stopMini: (() => void) | null = null;
  active = false;
  onDone: () => void = () => {};
  onHelp: () => void = () => {};

  constructor(
    parent: HTMLElement,
    private touch: () => boolean,
  ) {
    this.view = new SceneView('show', innerWidth, innerHeight, 'guide-scene', 0.32);
    this.counter = el('p', { class: 'guide-counter' });
    this.text = el('p', { class: 'guide-text' });
    this.hint = el('p', { class: 'guide-hint', hidden: true });
    this.dots = STEPS.map(() => el('span', { class: 'guide-dot' }));
    this.skip = el('button', { class: 'btn btn-ghost guide-skip', type: 'button' });
    this.skip.addEventListener('click', () => this.finish(false));
    this.card = el(
      'div',
      { class: 'guide-card', role: 'status', 'aria-live': 'polite' },
      el('div', { class: 'guide-dots' }, ...this.dots),
      this.counter,
      this.text,
      this.hint,
      this.skip,
    );
    this.root = el('div', { class: 'guide', hidden: true }, this.card);
    this.root.prepend(this.view.el);

    // The small dock shown after the guide: a tiny looping hand + "How to play".
    this.miniView = new SceneView('pluck', 96, 64, 'mini-scene', 0.32);
    const label = el('span', { class: 'guide-mini-label' });
    this.mini = el(
      'button',
      { class: 'guide-mini', type: 'button', hidden: true },
      this.miniView.el,
      label,
    );
    this.mini.addEventListener('click', () => this.onHelp());

    parent.append(this.root, this.mini);
    window.addEventListener('resize', () => this.fit());
    this.refreshText();
  }

  start(): void {
    this.hideMini();
    this.active = true;
    this.root.hidden = false;
    this.fit();
    this.view.touch = this.touch();
    this.stopAnim = animate(this.view);
    this.step = -1;
    // In touch mode there is no hand to show, so start at drawing.
    this.go(this.touch() ? 1 : 0);
  }

  /** The ghost hand plays in the space above the card. */
  private fit(): void {
    const r = this.view.el.getBoundingClientRect();
    this.view.resize(
      Math.max(1, r.width || innerWidth),
      Math.max(1, r.height || innerHeight * 0.6),
    );
  }

  /** Advances when the player does the current step — or any later one. */
  signal(s: GuideSignal): void {
    if (!this.active) return;
    const idx = ORDER.indexOf(s);
    if (idx >= this.step) this.go(idx + 1);
  }

  refreshText(): void {
    this.skip.textContent = t('guide.skip');
    (this.mini.querySelector('.guide-mini-label') as HTMLElement).textContent =
      `${t('guide.mini')} · H`;
    const cur = STEPS[this.step];
    if (!cur) return;
    const touch = this.touch();
    const first = touch ? 1 : 0;
    this.counter.textContent = t('guide.step', {
      n: this.step - first + 1,
      total: STEPS.length - first,
    });
    this.text.textContent = t(touch ? cur.touchText : cur.text);
    this.hint.textContent = t(touch ? cur.touchHint : cur.hint);
  }

  private go(i: number): void {
    if (i >= STEPS.length) return this.finish(true);
    this.step = i;
    const s = STEPS[i] as Step;
    this.view.touch = this.touch();
    this.view.setScene(s.scene);
    this.dots.forEach((d, j) => d.classList.toggle('on', j <= i));
    this.dots.forEach((d, j) => (d.hidden = this.touch() && j === 0));
    this.card.classList.remove('pop');
    void this.card.offsetWidth;
    this.card.classList.add('pop');
    this.hint.hidden = true;
    clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => (this.hint.hidden = false), HINT_AFTER_MS);
    this.refreshText();
  }

  private finish(completed: boolean): void {
    clearTimeout(this.hintTimer);
    this.active = false;
    this.onDone();
    if (completed) {
      this.view.el.classList.add('fade');
      this.dots.forEach((d) => d.classList.add('on'));
      this.counter.textContent = '';
      this.hint.hidden = true;
      this.text.textContent = t('guide.done');
      setTimeout(() => this.close(), 2200);
    } else this.close();
  }

  private close(): void {
    this.stopAnim?.();
    this.stopAnim = null;
    this.view.el.classList.remove('fade');
    this.root.hidden = true;
    this.showMini();
  }

  showMini(): void {
    this.mini.hidden = false;
    this.miniView.touch = this.touch();
    this.stopMini ??= animate(this.miniView);
  }

  private hideMini(): void {
    this.mini.hidden = true;
    this.stopMini?.();
    this.stopMini = null;
  }
}
