import { LOCALES, locale, onLocaleChange, setLocale, t, type MessageKey } from '../i18n/i18n';
import { MUSICIAN_SCALES, NOTE_NAMES } from '../core/music/scales';
import { THEMES } from '../core/render/themes';
import { LOOPER_LAYERS, type Looper } from '../core/instruments/looper';
import { BPM_MAX, BPM_MIN } from '../core/instruments/metronome';
import type { Mode } from '../core/music/mapping';
import type { RecordSource } from '../core/record/recorder';
import type { ScaleChoice, Settings } from '../settings';
import { el, icon } from './dom';
import { toast } from './toast';
import { animate, SceneView } from './ghost/scene-view';
import type { SceneId } from './ghost/scenes';

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
export const AUTHOR_ALIAS = 'Bruce';
const AUTHOR_URL = 'https://github.com/mipuxen';

/** All DOM chrome around the stage. Rebuilt on language or mode change. */
export class Shell {
  readonly root: HTMLElement;
  private attract: HTMLElement;
  private status: HTMLElement;
  private toolbar: HTMLElement;
  private panel: HTMLElement;
  private help: HTMLElement;
  private about: HTMLElement;
  private stopHelpAnims: (() => void)[] = [];
  private camPop: HTMLElement | null = null;
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
    this.about = el('div', { class: 'modal', hidden: true, role: 'dialog', 'aria-modal': 'true' });
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
      this.about,
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
    if (this.helpOpen) this.renderHelp();
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
      this.signature(),
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
        () => this.toggleCameraPop(),
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
      this.signature(),
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

  /** The author's signature, shown on the start screen and in settings. Opens About. */
  private signature(): HTMLElement {
    const b = el(
      'button',
      { class: 'signature', type: 'button', 'aria-label': t('about.open') },
      el('span', { class: 'signature-mark', text: 'KS', 'aria-hidden': 'true' }),
      el('span', { text: t('app.author', { name: `${AUTHOR} "${AUTHOR_ALIAS}"` }) }),
    );
    b.addEventListener('click', () => this.openAbout());
    return b;
  }

  openAbout(): void {
    const close = el('button', { type: 'button', class: 'btn btn-primary', text: t('help.close') });
    close.addEventListener('click', () => this.closeAbout());
    const link = (href: string, text: string) =>
      el('a', { class: 'btn btn-small', href, target: '_blank', rel: 'noopener noreferrer', text });
    this.about.replaceChildren(
      el(
        'div',
        { class: 'modal-card about-card' },
        el('img', {
          class: 'about-seal',
          src: './seal.svg',
          alt: `${AUTHOR} seal`,
          width: 132,
          height: 132,
        }),
        el('p', { class: 'field-label', text: t('about.title') }),
        el(
          'h2',
          { class: 'about-name' },
          el('span', { text: AUTHOR }),
          el('span', { class: 'about-alias', text: ` "${AUTHOR_ALIAS}"` }),
        ),
        el('p', { class: 'about-role', text: t('about.role') }),
        el('p', { text: t('about.bio') }),
        el('p', { class: 'about-muted', text: t('about.project') }),
        el(
          'div',
          { class: 'inline wrap about-links' },
          link(AUTHOR_URL, `${t('about.github')} · @mipuxen`),
          link(REPO_URL, t('about.repo')),
        ),
        close,
      ),
    );
    this.about.onclick = (e) => {
      if (e.target === this.about) this.closeAbout();
    };
    this.about.hidden = false;
    close.focus();
  }

  closeAbout(): void {
    this.about.hidden = true;
  }

  /** Camera background: on/off and brightness, right above the toolbar. */
  toggleCameraPop(force?: boolean): void {
    const open = force ?? !this.camPop;
    this.camPop?.remove();
    this.camPop = null;
    if (!open) return;
    const s = this.settings();
    const on = el('input', { type: 'checkbox', role: 'switch' });
    on.checked = s.showVideo;
    const pct = Math.round(s.videoBrightness * 100);
    const range = el('input', {
      type: 'range',
      min: 0,
      max: 100,
      step: 1,
      value: pct,
      'aria-label': t('settings.cameraBrightness'),
    });
    const out = el('output', { text: `${pct}%` });
    on.addEventListener('change', () => this.actions.update({ showVideo: on.checked }));
    range.addEventListener('input', () => {
      out.textContent = `${range.value}%`;
      this.actions.update({ videoBrightness: Number(range.value) / 100, showVideo: true });
      on.checked = true;
    });
    const close = el(
      'button',
      { type: 'button', class: 'icon-btn cam-x', 'aria-label': t('help.close') },
      icon('close'),
    );
    close.addEventListener('click', () => this.toggleCameraPop(false));
    this.camPop = el(
      'div',
      { class: 'cam-pop', role: 'dialog', 'aria-label': t('toolbar.camera') },
      el('div', { class: 'cam-head' }, el('strong', { text: t('toolbar.camera') }), close),
      el('label', { class: 'check' }, on, el('span', { text: t('settings.cameraShow') })),
      el(
        'div',
        { class: 'inline' },
        el('span', { class: 'cam-label', text: t('settings.cameraBrightness') }),
        range,
        out,
      ),
    );
    this.root.append(this.camPop);
  }

  /** Shown inside KakaoTalk, Instagram and other in-app browsers. */
  showInAppBanner(externalUrl: string | null): void {
    const banner = el('div', { class: 'inapp-banner', role: 'status' });
    const render = () => {
      const action = el('button', {
        type: 'button',
        class: 'btn btn-primary btn-small',
        text: externalUrl ? t('inapp.open') : t('inapp.copy'),
      });
      action.addEventListener('click', () => {
        if (externalUrl) window.location.href = externalUrl;
        else
          void navigator.clipboard
            ?.writeText(window.location.href)
            .then(() => toast(t('toast.linkCopied')));
      });
      const close = el(
        'button',
        { type: 'button', class: 'icon-btn inapp-x', 'aria-label': t('help.close') },
        icon('close'),
      );
      close.addEventListener('click', () => banner.remove());
      banner.replaceChildren(
        el('p', { text: t('inapp.text') }),
        el('div', { class: 'inline' }, action, close),
      );
    };
    render();
    onLocaleChange(render);
    this.root.append(banner);
  }

  openHelp(): void {
    this.renderHelp();
    this.help.hidden = false;
    this.root.classList.remove('idle');
    (this.help.querySelector('.help-x') as HTMLButtonElement | null)?.focus({
      preventScroll: true,
    });
  }

  closeHelp(): void {
    this.help.hidden = true;
    this.stopHelpAnims.forEach((stop) => stop());
    this.stopHelpAnims = [];
  }

  get helpOpen(): boolean {
    return !this.help.hidden;
  }

  /** Help as cards: each gesture with its own looping ghost-hand animation. */
  private renderHelp(): void {
    this.stopHelpAnims.forEach((stop) => stop());
    this.stopHelpAnims = [];
    const close = el('button', {
      type: 'button',
      class: 'btn btn-primary help-close',
      text: t('help.close'),
    });
    close.addEventListener('click', () => this.closeHelp());
    const x = el(
      'button',
      { type: 'button', class: 'icon-btn help-x', 'aria-label': t('help.close') },
      icon('close'),
    );
    x.addEventListener('click', () => this.closeHelp());

    const cards: { scene: SceneId; key: string; modes?: boolean }[] = [
      { scene: 'pull', key: 'draw' },
      { scene: 'pluck', key: 'pluck' },
      { scene: 'flick', key: 'flick' },
      { scene: 'stretch', key: 'stretch', modes: true },
      { scene: 'mute', key: 'mute' },
      { scene: 'palm', key: 'palm', modes: true },
      { scene: 'pad', key: 'pad' },
    ];
    const grid = el('div', { class: 'help-grid' });
    for (const c of cards) {
      const view = new SceneView(c.scene, 240, 160, 'card-scene', 0.26);
      view.touch = false;
      this.stopHelpAnims.push(animate(view));
      grid.append(
        el(
          'article',
          { class: 'help-card' },
          view.el,
          el('h3', { text: t(`help.card.${c.key}.title` as MessageKey) }),
          el('p', { text: t(`help.card.${c.key}.text` as MessageKey) }),
          c.modes
            ? el('span', {
                class: 'help-badge',
                text: `${t('mode.musician')} · ${t('mode.virtuoso')}`,
              })
            : null,
        ),
      );
    }

    // String length → sound, drawn to scale with each timbre's color.
    const sound = el(
      'div',
      { class: 'help-sound' },
      ...(['crystal', 'harp', 'bass'] as const).map((tb) =>
        el(
          'div',
          { class: 'help-sound-row' },
          el('span', { class: `help-sound-line ${tb}` }),
          el('span', { text: t(`help.sound.${tb}` as MessageKey) }),
        ),
      ),
    );

    const keys: [string, MessageKey][] = [
      ['Z', 'help.key.undo'],
      ['Shift + Z', 'help.key.redo'],
      ['C', 'help.key.clear'],
      ['V', 'help.key.camera'],
      ['Space', 'help.key.loop'],
      ['H', 'help.key.help'],
      ['Esc', 'help.close'],
    ];
    const keyList = el(
      'div',
      { class: 'help-keys' },
      ...keys.map(([k, label]) =>
        el('div', { class: 'help-key' }, el('kbd', { text: k }), el('span', { text: t(label) })),
      ),
    );
    const tips = el(
      'ul',
      { class: 'help-tips' },
      ...(['help.tip1', 'help.tip2', 'help.tip3', 'help.tip4'] as MessageKey[]).map((k) =>
        el('li', { text: t(k) }),
      ),
    );

    this.help.replaceChildren(
      el(
        'div',
        { class: 'modal-card help-card-wrap' },
        el(
          'div',
          { class: 'help-head' },
          el(
            'div',
            {},
            el('h2', { text: t('help.title') }),
            el('p', { class: 'help-sub', text: t('help.subtitle') }),
          ),
          x,
        ),
        grid,
        el('h3', { class: 'help-section', text: t('help.sound.title') }),
        sound,
        el(
          'div',
          { class: 'help-columns' },
          el('section', {}, el('h3', { class: 'help-section', text: t('help.keys') }), keyList),
          el('section', {}, el('h3', { class: 'help-section', text: t('help.tips.title') }), tips),
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
