import { LOCALES, locale, onLocaleChange, setLocale, t, type MessageKey } from '../i18n/i18n';
import { MUSICIAN_SCALES, NOTE_NAMES } from '../core/music/scales';
import { THEMES } from '../core/render/themes';
import { LOOPER_LAYERS, type Looper } from '../core/instruments/looper';
import { BPM_MAX, BPM_MIN } from '../core/instruments/metronome';
import type { Mode } from '../core/music/mapping';
import type { RecordSource } from '../core/record/recorder';
import type { ScaleChoice, Settings } from '../settings';
import { el, icon } from './dom';

export interface ShellActions {
  start(): void;
  startTouch(): void;
  undo(): void;
  redo(): void;
  clear(): void;
  toggleVideo(): void;
  toggleLoop(): void;
  toggleRecord(): void;
  update(patch: Partial<Settings>): void;
  tap(): number;
  saveScene(): void;
  exportScene(): void;
  importScene(file: File): void;
  shareScene(): void;
  harpPreset(): void;
  enableMidi(): Promise<string[]>;
  selectMidi(id: string): void;
  midiOutputs(): { id: string; name: string }[];
  connectOsc(): void;
  oscConnected(): boolean;
  looper: Looper;
}

const REPO_URL = 'https://github.com/mipuxen/strandlight';
export const AUTHOR = 'Khoshimov Shukhratbek';
const AUTHOR_URL = 'https://github.com/mipuxen';

/** The author's signature, shown on the start screen and in settings. */
const signature = () =>
  el(
    'a',
    { class: 'signature', href: AUTHOR_URL, target: '_blank', rel: 'noopener noreferrer' },
    el('span', { class: 'signature-mark', text: 'KS', 'aria-hidden': 'true' }),
    el('span', { text: t('app.author', { name: AUTHOR }) }),
  );

/** All DOM chrome around the stage. Rebuilt on language or mode change. */
export class Shell {
  readonly root: HTMLElement;
  private attract: HTMLElement;
  private status: HTMLElement;
  private toolbar: HTMLElement;
  private panel: HTMLElement;
  private help: HTMLElement;
  private looperRow: HTMLElement;
  private recBadge: HTMLElement;
  private countdown: HTMLElement;
  private topbar: HTMLElement;
  private idleTimer = 0;
  private statusKey: { key: MessageKey; params?: Record<string, number> } | null = null;
  recording = false;
  playing = false;

  constructor(
    host: HTMLElement,
    private settings: () => Settings,
    private actions: ShellActions,
  ) {
    this.root = el('div', { class: 'shell' });
    this.attract = el('section', { class: 'attract' });
    this.status = el('p', { class: 'status', role: 'status', 'aria-live': 'polite' });
    this.toolbar = el('nav', { class: 'toolbar', hidden: true });
    this.panel = el('aside', { class: 'panel', hidden: true, 'aria-label': 'Settings' });
    this.help = el('div', { class: 'modal', hidden: true, role: 'dialog', 'aria-modal': 'true' });
    this.looperRow = el('div', { class: 'looper-row', hidden: true });
    this.recBadge = el('div', { class: 'rec-badge', hidden: true });
    this.countdown = el('div', { class: 'countdown', hidden: true });
    this.topbar = el('header', { class: 'topbar' });
    this.root.append(
      this.topbar,
      this.attract,
      this.status,
      this.looperRow,
      this.toolbar,
      this.panel,
      this.help,
      this.recBadge,
      this.countdown,
    );
    host.append(this.root);
    this.render();
    onLocaleChange(() => this.render());

    // The interface fades after 3 s without mouse, touch or keyboard activity.
    const wake = () => {
      this.root.classList.remove('idle');
      clearTimeout(this.idleTimer);
      this.idleTimer = window.setTimeout(() => {
        if (this.panel.hidden && this.help.hidden) this.root.classList.add('idle');
      }, 3000);
    };
    for (const ev of ['pointermove', 'pointerdown', 'keydown']) window.addEventListener(ev, wake);
    wake();
  }

  render(): void {
    this.renderTopbar();
    this.renderAttract();
    this.renderToolbar();
    this.renderPanel();
    this.renderHelp();
    this.renderLooper();
    if (this.statusKey) this.status.textContent = t(this.statusKey.key, this.statusKey.params);
  }

  setStatus(key: MessageKey | null, params?: Record<string, number>): void {
    this.statusKey = key ? { key, ...(params ? { params } : {}) } : null;
    this.status.textContent = key ? t(key, params) : '';
  }

  showPlaying(): void {
    this.playing = true;
    this.attract.hidden = true;
    this.toolbar.hidden = false;
    this.renderLooper();
  }

  private renderTopbar(): void {
    const select = el('select', { class: 'lang-select', 'aria-label': t('toolbar.language') });
    for (const l of LOCALES) {
      const o = el('option', { value: l.code, text: l.name });
      if (l.code === locale()) o.selected = true;
      select.append(o);
    }
    select.addEventListener('change', () => void setLocale(select.value));
    const menu = this.iconButton('menu', 'toolbar.menu', () => this.togglePanel());
    this.topbar.replaceChildren(
      el('div', { class: 'wordmark', text: 'Strandlight' }),
      el(
        'div',
        { class: 'top-actions' },
        el('label', { class: 'lang' }, icon('globe'), select),
        menu,
      ),
    );
  }

  private renderAttract(): void {
    const start = el('button', { class: 'btn btn-primary', type: 'button', text: t('app.start') });
    start.addEventListener('click', () => this.actions.start());
    const touch = el('button', { class: 'btn btn-ghost', type: 'button', text: t('app.touch') });
    touch.addEventListener('click', () => this.actions.startTouch());
    this.attract.replaceChildren(
      el('h1', { class: 'title', text: 'Strandlight' }),
      el('p', { class: 'tagline', text: t('app.tagline') }),
      el('div', { class: 'cta' }, start, touch),
      el('p', { class: 'privacy', text: t('app.privacy') }),
      el('a', {
        class: 'source',
        href: REPO_URL,
        target: '_blank',
        rel: 'noopener noreferrer',
        text: t('app.source'),
      }),
      signature(),
    );
  }

  private iconButton(
    name: string,
    label: MessageKey,
    onClick: () => void,
    extra = '',
  ): HTMLButtonElement {
    const b = el(
      'button',
      { class: `icon-btn ${extra}`, type: 'button', 'aria-label': t(label), title: t(label) },
      icon(name),
    );
    b.addEventListener('click', onClick);
    return b;
  }

  renderToolbar(): void {
    const s = this.settings();
    const items: HTMLElement[] = [
      this.iconButton('undo', 'toolbar.undo', () => this.actions.undo()),
      this.iconButton('redo', 'toolbar.redo', () => this.actions.redo()),
      this.iconButton('clear', 'toolbar.clear', () => this.actions.clear()),
      this.iconButton(
        'camera',
        'toolbar.camera',
        () => this.actions.toggleVideo(),
        s.showVideo ? 'on' : '',
      ),
    ];
    if (s.mode !== 'beginner')
      items.push(this.iconButton('loop', 'toolbar.loop', () => this.actions.toggleLoop()));
    items.push(
      this.recording
        ? this.iconButton('stop', 'toolbar.stop', () => this.actions.toggleRecord(), 'rec')
        : this.iconButton('record', 'toolbar.record', () => this.actions.toggleRecord()),
      this.iconButton('help', 'toolbar.help', () => this.openHelp()),
    );
    this.toolbar.replaceChildren(...items);
  }

  renderLooper(): void {
    const l = this.actions.looper;
    const s = this.settings();
    const show = this.playing && s.mode !== 'beginner';
    this.looperRow.hidden = !show;
    if (!show) return;
    const label =
      l.state === 'idle'
        ? t('looper.idle')
        : l.state === 'recording'
          ? t('looper.recording')
          : l.state === 'overdub'
            ? t('looper.overdub', { layer: l.recordingLayer + 1 })
            : t('looper.playing', { layers: l.activeLayers });
    const chips: HTMLElement[] = [];
    for (let i = 0; i < LOOPER_LAYERS; i++) {
      if (!l.layers[i]?.length) continue;
      const mute = el('button', {
        class: `chip ${l.muted[i] ? 'muted' : ''}`,
        type: 'button',
        text: t('looper.layer', { n: i + 1 }),
        title: t('looper.mute'),
        'aria-pressed': String(!!l.muted[i]),
      });
      mute.addEventListener('click', () => l.toggleMute(i));
      const clear = el(
        'button',
        { class: 'chip chip-x', type: 'button', 'aria-label': t('looper.clear') },
        icon('close'),
      );
      clear.addEventListener('click', () => l.clearLayer(i));
      chips.push(el('span', { class: 'chip-group' }, mute, clear));
    }
    this.looperRow.replaceChildren(
      el('span', { class: `looper-state ${l.state}`, text: label }),
      ...chips,
    );
  }

  togglePanel(force?: boolean): void {
    this.panel.hidden = force === undefined ? !this.panel.hidden : !force;
    if (!this.panel.hidden) this.renderPanel();
  }

  private segmented<T extends string>(
    name: string,
    options: { value: T; label: string; hint?: string }[],
    current: T,
    onPick: (v: T) => void,
  ): HTMLElement {
    const group = el('div', { class: 'segmented', role: 'radiogroup', 'aria-label': name });
    for (const o of options) {
      const b = el('button', {
        type: 'button',
        role: 'radio',
        'aria-checked': String(o.value === current),
        class: o.value === current ? 'on' : '',
        text: o.label,
        title: o.hint,
      });
      b.addEventListener('click', () => onPick(o.value));
      group.append(b);
    }
    return group;
  }

  private field(label: MessageKey, control: HTMLElement, hint?: string): HTMLElement {
    return el(
      'div',
      { class: 'field' },
      el('span', { class: 'field-label', text: t(label) }),
      control,
      hint ? el('small', { text: hint }) : null,
    );
  }

  renderPanel(): void {
    if (this.panel.hidden) return;
    const s = this.settings();
    const a = this.actions;
    const close = this.iconButton(
      'close',
      'help.close',
      () => this.togglePanel(false),
      'panel-close',
    );
    const parts: (HTMLElement | null)[] = [];

    const modes: Mode[] = ['beginner', 'musician', 'virtuoso'];
    parts.push(
      this.field(
        'settings.mode',
        this.segmented(
          t('settings.mode'),
          modes.map((m) => ({
            value: m,
            label: t(`mode.${m}` as MessageKey),
            hint: t(`mode.${m}.hint` as MessageKey),
          })),
          s.mode,
          (mode) => a.update({ mode }),
        ),
        t(`mode.${s.mode}.hint` as MessageKey),
      ),
      this.field(
        'settings.theme',
        this.segmented(
          t('settings.theme'),
          THEMES.map((th) => ({ value: th.id, label: t(`theme.${th.id}` as MessageKey) })),
          s.theme as (typeof THEMES)[number]['id'],
          (theme) => a.update({ theme }),
        ),
      ),
    );

    if (s.mode !== 'beginner') {
      const scale = el('select', {});
      const options: ScaleChoice[] = [
        ...MUSICIAN_SCALES,
        ...(s.mode === 'virtuoso' ? (['chromatic', 'free'] as const) : []),
      ];
      for (const id of options) {
        const label = id === 'free' ? '∿ Free' : t(`scale.${id}` as MessageKey);
        const o = el('option', { value: id, text: label });
        if (id === s.scale) o.selected = true;
        scale.append(o);
      }
      scale.addEventListener('change', () => a.update({ scale: scale.value as ScaleChoice }));
      const tonic = el('select', {});
      NOTE_NAMES.forEach((n, i) => {
        const o = el('option', { value: String(i), text: n });
        if (i === s.tonic) o.selected = true;
        tonic.append(o);
      });
      tonic.addEventListener('change', () => a.update({ tonic: Number(tonic.value) }));
      parts.push(
        el(
          'div',
          { class: 'row' },
          this.field('settings.scale', scale),
          this.field('settings.tonic', tonic),
        ),
      );

      const bpm = el('input', {
        type: 'range',
        min: BPM_MIN,
        max: BPM_MAX,
        value: s.bpm,
        'aria-label': t('settings.tempo'),
      });
      const bpmOut = el('output', { text: `${s.bpm} BPM` });
      bpm.addEventListener('input', () => {
        bpmOut.textContent = `${bpm.value} BPM`;
        a.update({ bpm: Number(bpm.value) });
      });
      const metro = el('button', {
        type: 'button',
        class: `btn btn-small ${s.metronome ? 'on' : ''}`,
        text: t('settings.metronome'),
        'aria-pressed': String(s.metronome),
      });
      metro.addEventListener('click', () => a.update({ metronome: !s.metronome }));
      const tap = el('button', { type: 'button', class: 'btn btn-small', text: t('settings.tap') });
      tap.addEventListener('click', () => {
        const v = a.tap();
        bpm.value = String(v);
        bpmOut.textContent = `${v} BPM`;
      });
      parts.push(
        this.field('settings.tempo', el('div', { class: 'inline wrap' }, bpm, bpmOut, metro, tap)),
      );
    }

    if (s.mode === 'virtuoso') {
      const a4 = el('input', {
        type: 'range',
        min: 432,
        max: 446,
        step: 1,
        value: s.a4,
        'aria-label': t('settings.a4'),
      });
      const a4Out = el('output', { text: `${s.a4} Hz` });
      a4.addEventListener('input', () => {
        a4Out.textContent = `${a4.value} Hz`;
        a.update({ a4: Number(a4.value) });
      });
      const vel = el('input', { type: 'checkbox' });
      vel.checked = s.velocity;
      vel.addEventListener('change', () => a.update({ velocity: vel.checked }));
      const harp = el('button', {
        type: 'button',
        class: 'btn btn-small',
        text: t('settings.harpPreset'),
      });
      harp.addEventListener('click', () => a.harpPreset());
      parts.push(
        this.field('settings.a4', el('div', { class: 'inline' }, a4, a4Out)),
        el('label', { class: 'check' }, vel, el('span', { text: t('settings.velocity') })),
        this.field('settings.harpPreset', harp, t('settings.harpPreset.hint')),
        this.midiField(),
        this.oscField(),
      );
    }

    const vol = el('input', {
      type: 'range',
      min: 0,
      max: 1,
      step: 0.01,
      value: s.volume,
      'aria-label': t('settings.volume'),
    });
    vol.addEventListener('input', () => a.update({ volume: Number(vol.value) }));
    parts.push(this.field('settings.volume', vol));

    const btn = (key: MessageKey, fn: () => void) => {
      const b = el('button', { type: 'button', class: 'btn btn-small', text: t(key) });
      b.addEventListener('click', fn);
      return b;
    };
    const file = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
    file.addEventListener('change', () => {
      const f = file.files?.[0];
      if (f) a.importScene(f);
      file.value = '';
    });
    parts.push(
      this.field(
        'settings.scene',
        el(
          'div',
          { class: 'inline wrap' },
          btn('settings.save', () => a.saveScene()),
          btn('settings.export', () => a.exportScene()),
          btn('settings.import', () => file.click()),
          btn('settings.share', () => a.shareScene()),
          file,
        ),
      ),
    );

    const sources: RecordSource[] = ['scene', 'camera', 'screen'];
    parts.push(
      this.field(
        'settings.recordSource',
        this.segmented(
          t('settings.recordSource'),
          sources.map((src) => ({ value: src, label: t(`record.${src}` as MessageKey) })),
          s.recordSource,
          (recordSource) => a.update({ recordSource }),
        ),
      ),
      el('p', { class: 'panel-note', text: t('settings.privacy') }),
      el('a', {
        class: 'source',
        href: REPO_URL,
        target: '_blank',
        rel: 'noopener noreferrer',
        text: t('app.source'),
      }),
      signature(),
    );

    this.panel.replaceChildren(
      el('div', { class: 'panel-head' }, el('h2', { text: t('settings.title') }), close),
      ...(parts.filter(Boolean) as HTMLElement[]),
    );
  }

  private midiField(): HTMLElement {
    const a = this.actions;
    const box = el('div', { class: 'inline wrap' });
    const outputs = a.midiOutputs();
    if (!('requestMIDIAccess' in navigator)) {
      box.append(el('small', { text: t('error.midi') }));
    } else if (outputs.length) {
      const sel = el('select', { 'aria-label': t('settings.midi') });
      for (const o of outputs) sel.append(el('option', { value: o.id, text: o.name }));
      sel.addEventListener('change', () => a.selectMidi(sel.value));
      box.append(sel);
    } else {
      const b = el('button', {
        type: 'button',
        class: 'btn btn-small',
        text: t('settings.midiEnable'),
      });
      b.addEventListener('click', () => void a.enableMidi().then(() => this.renderPanel()));
      box.append(b);
    }
    return this.field('settings.midi', box);
  }

  private oscField(): HTMLElement {
    const a = this.actions;
    const connected = a.oscConnected();
    const b = el('button', {
      type: 'button',
      class: `btn btn-small ${connected ? 'on' : ''}`,
      text: t('settings.oscConnect'),
    });
    b.addEventListener('click', () => a.connectOsc());
    return this.field(
      'settings.osc',
      el(
        'div',
        { class: 'inline wrap' },
        b,
        el('small', { text: connected ? t('settings.connected') : t('settings.notConnected') }),
        el('code', { text: 'npx strandlight-bridge' }),
      ),
    );
  }

  openHelp(): void {
    this.renderHelp();
    this.help.hidden = false;
    (this.help.querySelector('button') as HTMLButtonElement | null)?.focus();
  }

  closeHelp(): void {
    this.help.hidden = true;
  }

  get helpOpen(): boolean {
    return !this.help.hidden;
  }

  private renderHelp(): void {
    const close = el('button', { type: 'button', class: 'btn btn-primary', text: t('help.close') });
    close.addEventListener('click', () => this.closeHelp());
    const items: MessageKey[] = [
      'help.draw',
      'help.pluck',
      'help.flick',
      'help.stretch',
      'help.fist',
      'help.palm',
      'help.pad',
      'help.length',
    ];
    this.help.replaceChildren(
      el(
        'div',
        { class: 'modal-card' },
        el('h2', { text: t('help.title') }),
        el('ul', { class: 'help-list' }, ...items.map((k) => el('li', { text: t(k) }))),
        el('h3', { text: t('help.keys') }),
        el(
          'ul',
          { class: 'help-keys' },
          ...(['help.keyUndo', 'help.keyClear', 'help.keyLoop'] as MessageKey[]).map((k) =>
            el('li', { text: t(k) }),
          ),
        ),
        close,
      ),
    );
    this.help.onclick = (e) => {
      if (e.target === this.help) this.closeHelp();
    };
  }

  setRecording(on: boolean, startedAt = 0): void {
    this.recording = on;
    this.recBadge.hidden = !on;
    this.renderToolbar();
    if (!on) return;
    const tick = () => {
      if (!this.recording) return;
      const s = Math.floor((performance.now() - startedAt) / 1000);
      this.recBadge.textContent = `REC ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
      setTimeout(tick, 250);
    };
    tick();
  }

  /** 3-2-1 countdown before recording starts. */
  async runCountdown(): Promise<void> {
    this.countdown.hidden = false;
    for (const n of [3, 2, 1]) {
      this.countdown.textContent = String(n);
      this.countdown.classList.remove('pop');
      void this.countdown.offsetWidth;
      this.countdown.classList.add('pop');
      await new Promise((r) => setTimeout(r, 800));
    }
    this.countdown.hidden = true;
  }
}
