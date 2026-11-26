import { AudioEngine } from './core/audio/engine';
import { clamp, dist, type Vec2 } from './core/geometry';
import { GestureEngine, type GestureEvent } from './core/gestures/gestures';
import { HandSmoother, type Hand } from './core/gestures/hand';
import { Looper, type LoopEvent } from './core/instruments/looper';
import { Metronome } from './core/instruments/metronome';
import {
  continuousNoteForLength,
  noteForLength,
  scaleNotes,
  timbreFor,
  tuningForMode,
  type Tuning,
} from './core/music/mapping';
import { MidiOut } from './core/midi/midi';
import { OscClient } from './core/midi/osc-client';
import { Recorder } from './core/record/recorder';
import { Renderer } from './core/render/renderer';
import { themeById } from './core/render/themes';
import {
  decodeScene,
  encodeScene,
  parseScene,
  SCENE_VERSION,
  type Scene,
} from './core/scene/scene';
import { StrandField } from './core/strings/field';
import type { Strand } from './core/strings/strand';
import { Tracker } from './core/tracking/tracker';
import { FINGER_TIPS, LM, type RawHand } from './core/tracking/types';
import { onLocaleChange, t } from './i18n/i18n';
import { loadSettings, saveSettings, type Settings } from './settings';
import { Guide, type GuideSignal } from './ui/guide';
import { Shell } from './ui/shell';
import { toast } from './ui/toast';

const SCENE_KEY = 'strandlight.scene';
const GUIDE_KEY = 'strandlight.guideDone';
const GRAB_RADIUS = 0.045; // normalized stage height
const MIN_STRAND = 0.03; // length ratio below which a pinch is treated as a tap
const RETRIGGER_MS = 70;

type Drag =
  | { kind: 'draw'; start: Vec2; end: Vec2 }
  | { kind: 'end'; strand: Strand; end: 'a' | 'b'; from: [Vec2, Vec2] }
  | { kind: 'body'; strand: Strand; grabAt: Vec2; from: [Vec2, Vec2] };

/** Wires tracking, gestures, strings, audio, rendering and UI together. */
export class App {
  private settings: Settings = loadSettings();
  private renderer: Renderer;
  private field = new StrandField();
  private audio = new AudioEngine();
  private gestures = new GestureEngine();
  private smoothers = new Map<Hand['key'], HandSmoother>();
  private hands: Hand[] = [];
  private tracker: Tracker | null = null;
  private drags = new Map<string, Drag>();
  private looper = new Looper();
  private metronome = new Metronome();
  private recorder = new Recorder();
  private midi = new MidiOut();
  private osc = new OscClient();
  private shell: Shell;
  private guide: Guide;
  private sustain = false;
  private touchMode = false;
  private started = false;
  private pulse = 0;
  private lastFrame = performance.now();
  private attractTimer = 0;
  private padSince: number | null = null;
  private lastMuteToast = 0;
  private light: boolean;

  constructor(private host: HTMLElement) {
    const coarse =
      matchMedia('(pointer: coarse)').matches && Math.min(innerWidth, innerHeight) < 820;
    const hasGL2 = !!document.createElement('canvas').getContext('webgl2');
    this.light = coarse || !hasGL2;
    this.renderer = new Renderer(host, this.light);
    this.metronome.setBpm(this.settings.bpm);
    this.metronome.enabled = this.settings.metronome;
    this.audio.a4 = this.settings.a4;

    this.shell = new Shell(host, () => this.settings, {
      start: () => void this.start(false),
      startTouch: () => void this.start(true),
      undo: () => this.field.undo(),
      redo: () => this.field.redo(),
      clear: () => this.clear(),
      toggleVideo: () => this.update({ showVideo: !this.settings.showVideo }),
      toggleLoop: () => this.toggleLoop(),
      toggleRecord: () => void this.toggleRecord(),
      update: (p) => this.update(p),
      tap: () => {
        const bpm = this.metronome.tap(this.clock());
        this.update({ bpm });
        return bpm;
      },
      saveScene: () => this.saveScene(),
      exportScene: () => this.exportScene(),
      importScene: (f) => void this.importScene(f),
      shareScene: () => void this.shareScene(),
      harpPreset: () => this.harpPreset(),
      enableMidi: async () => {
        try {
          return await this.midi.enable();
        } catch {
          toast(t('error.midi'), 'error');
          return [];
        }
      },
      selectMidi: (id) => this.midi.select(id),
      midiOutputs: () => this.midi.outputs().map((o) => ({ id: o.id, name: o.name ?? o.id })),
      connectOsc: () => this.osc.connect(),
      oscConnected: () => this.osc.connected,
      looper: this.looper,
    });
    this.guide = new Guide(this.shell.root, () => this.touchMode);
    this.guide.onDone = () => {
      try {
        localStorage.setItem(GUIDE_KEY, '1');
      } catch {
        /* ignore */
      }
    };
    onLocaleChange(() => this.guide.refreshText());

    this.field.onChange = () => this.retuneAll();
    this.looper.onPlay = (e) => this.playLoopEvent(e);
    this.looper.onChange = () => this.shell.renderLooper();
    this.metronome.onBeat = (_beat, accent) => {
      this.audio.click(accent);
      this.pulse = 1;
    };
    this.osc.onStatus = () => this.shell.renderPanel();

    this.applyTheme();
    this.bindPointer();
    this.bindKeys();
    this.attractMode();
    if (!hasGL2) toast(t('error.webgl'));
    requestAnimationFrame(this.frame);
  }

  // ───────────────────────────── lifecycle

  private async start(touch: boolean): Promise<void> {
    if (this.started) return;
    this.started = true;
    clearInterval(this.attractTimer);
    try {
      await this.audio.start();
    } catch {
      toast(t('error.audio'), 'error');
    }
    this.audio.setVolume(this.settings.volume);
    this.audio.a4 = this.settings.a4;
    this.field.load([]);
    await this.loadInitialScene();
    this.shell.showPlaying();
    this.touchMode = touch;

    if (!touch) {
      if (!navigator.mediaDevices?.getUserMedia) {
        this.fallbackToTouch('error.noCamera');
      } else {
        this.tracker = new Tracker({
          light: this.light,
          onHands: (h, time) => this.onHands(h, time),
          onStatus: (s) => {
            if (s === 'loading') this.shell.setStatus('status.model');
            if (s === 'ready') this.shell.setStatus('status.ready');
          },
        });
        this.shell.setStatus('status.camera');
        try {
          await this.tracker.start();
        } catch (err) {
          const name = err instanceof DOMException ? err.name : '';
          this.fallbackToTouch(
            name === 'NotAllowedError'
              ? 'error.cameraDenied'
              : name === 'NotFoundError' || name === 'OverconstrainedError'
                ? 'error.noCamera'
                : 'error.tracking',
          );
        }
      }
    }

    if (!this.guideDone()) this.guide.start();
  }

  private guideDone(): boolean {
    try {
      return localStorage.getItem(GUIDE_KEY) === '1';
    } catch {
      return false;
    }
  }

  private fallbackToTouch(
    reason: 'error.cameraDenied' | 'error.noCamera' | 'error.tracking',
  ): void {
    this.tracker?.stop();
    this.tracker = null;
    this.touchMode = true;
    this.shell.setStatus(null);
    toast(t(reason), 'error', 6000);
    this.guide.refreshText();
  }

  /** Before the camera is allowed, the stage is alive: demo strings ring on their own. */
  private attractMode(): void {
    const demo: [Vec2, Vec2][] = [
      [
        { x: 0.18, y: 0.3 },
        { x: 0.34, y: 0.78 },
      ],
      [
        { x: 0.3, y: 0.22 },
        { x: 0.52, y: 0.86 },
      ],
      [
        { x: 0.46, y: 0.2 },
        { x: 0.6, y: 0.5 },
      ],
      [
        { x: 0.62, y: 0.26 },
        { x: 0.83, y: 0.74 },
      ],
      [
        { x: 0.7, y: 0.16 },
        { x: 0.78, y: 0.36 },
      ],
    ];
    for (const [a, b] of demo) this.field.add(a, b, false);
    this.attractTimer = window.setInterval(() => {
      const live = this.field.live;
      const s = live[Math.floor(Math.random() * live.length)];
      if (s) s.pluck(0.3 + Math.random() * 0.4, 0.5 + Math.random() * 0.5, performance.now());
    }, 650);
  }

  // ───────────────────────────── settings

  private update(patch: Partial<Settings>): void {
    const prevMode = this.settings.mode;
    this.settings = { ...this.settings, ...patch };
    saveSettings(this.settings);
    if (patch.bpm !== undefined) this.metronome.setBpm(patch.bpm);
    if (patch.metronome !== undefined) this.metronome.enabled = patch.metronome;
    if (patch.volume !== undefined) this.audio.setVolume(patch.volume);
    if (patch.a4 !== undefined) this.audio.a4 = patch.a4;
    if (patch.theme !== undefined) this.applyTheme();
    if (patch.mode !== undefined && patch.mode !== prevMode) {
      // Beginner has no scale choice, so moving up starts from a sensible default.
      if (
        patch.mode === 'musician' &&
        (this.settings.scale === 'chromatic' || this.settings.scale === 'free')
      ) {
        this.settings.scale = 'minorPentatonic';
      }
      if (patch.mode === 'beginner') {
        this.looper.reset();
        this.setSustain(false);
      }
    }
    if (patch.scale !== undefined || patch.tonic !== undefined || patch.mode !== undefined)
      this.retuneAll();
    this.shell.renderToolbar();
    this.shell.renderLooper();
    if (patch.bpm === undefined && patch.volume === undefined && patch.a4 === undefined)
      this.shell.renderPanel();
  }

  private applyTheme(): void {
    const theme = themeById(this.settings.theme);
    document.documentElement.dataset.theme = theme.id;
  }

  private tuning(): Tuning {
    const scale = this.settings.scale === 'free' ? 'chromatic' : this.settings.scale;
    return tuningForMode(this.settings.mode, scale, this.settings.tonic);
  }

  /** Recomputes timbre and note for every string from its length. */
  private retuneAll(): void {
    const tuning = this.tuning();
    const free = this.settings.mode === 'virtuoso' && this.settings.scale === 'free';
    for (const s of this.field.strands) {
      const r = this.renderer.lengthRatio(s.a, s.b);
      s.timbre = timbreFor(r);
      s.note = free ? continuousNoteForLength(r, tuning) : noteForLength(r, tuning);
    }
  }

  // ───────────────────────────── hands

  private toStage(raw: RawHand): Vec2[] {
    const v = this.tracker?.video;
    const W = this.renderer.width;
    const H = this.renderer.height;
    const vw = v?.videoWidth || 1280;
    const vh = v?.videoHeight || 720;
    const s = Math.max(W / vw, H / vh);
    const ox = (W - vw * s) / 2;
    const oy = (H - vh * s) / 2;
    const pts: Vec2[] = [];
    for (let i = 0; i < 21; i++) {
      const u = raw.points[i * 3] as number;
      const w = raw.points[i * 3 + 1] as number;
      // Mirror horizontally so the screen behaves like a mirror.
      pts.push({ x: (W - (ox + u * vw * s)) / W, y: (oy + w * vh * s) / H });
    }
    return pts;
  }

  private onHands(raw: RawHand[], time: number): void {
    const now = performance.now();
    const seen = new Set<Hand['key']>();
    const hands: Hand[] = [];
    for (const r of raw) {
      // The camera image is mirrored, so MediaPipe's "Left" is the player's right hand.
      const key: Hand['key'] = r.handedness === 'Left' ? 'Right' : 'Left';
      if (seen.has(key)) continue;
      seen.add(key);
      let sm = this.smoothers.get(key);
      if (!sm) {
        sm = new HandSmoother();
        this.smoothers.set(key, sm);
      }
      hands.push({ key, points: sm.apply(this.toStage(r), time), seenAt: now });
    }
    for (const [key, sm] of this.smoothers) if (!seen.has(key)) sm.reset();
    // Keep hands visible through short tracking gaps (≤ 200 ms).
    const kept = this.hands.filter((h) => !seen.has(h.key) && now - h.seenAt < 200);
    this.hands = [...hands, ...kept];
    if (hands.length) this.signal('hand');
    for (const e of this.gestures.update(hands, now, this.renderer.aspect)) this.onGesture(e, now);
  }

  private onGesture(e: GestureEvent, now: number): void {
    switch (e.type) {
      case 'pinchStart':
        this.signal('pinch');
        this.beginDrag(`hand-${e.hand}`, e.at);
        break;
      case 'pinchMove':
        this.moveDrag(`hand-${e.hand}`, e.at);
        break;
      case 'pinchEnd':
        this.endDrag(`hand-${e.hand}`);
        break;
      case 'tipMove':
        this.sweep(e.from, e.to, e.speed, now);
        break;
      case 'flick':
        this.flick(e.at, e.speed, now);
        break;
      case 'fist':
        this.muteAll();
        break;
      case 'sustain':
        if (this.settings.mode !== 'beginner') this.setSustain(e.on);
        break;
      case 'handLost':
        this.drags.delete(`hand-${e.hand}`);
        break;
    }
  }

  // ───────────────────────────── drawing and moving strings

  private beginDrag(id: string, at: Vec2): void {
    if (this.settings.mode !== 'beginner') {
      const end = this.field.nearestEndpoint(at, GRAB_RADIUS, this.renderer.aspect);
      if (end) {
        this.drags.set(id, {
          kind: 'end',
          strand: end.strand,
          end: end.end,
          from: [{ ...end.strand.a }, { ...end.strand.b }],
        });
        return;
      }
      const near = this.field.nearestStrand(at, this.renderer.aspect);
      if (near && near.d < GRAB_RADIUS * 0.5) {
        const s = near.strand;
        this.drags.set(id, {
          kind: 'body',
          strand: s,
          grabAt: { ...at },
          from: [{ ...s.a }, { ...s.b }],
        });
        return;
      }
    }
    this.drags.set(id, { kind: 'draw', start: { ...at }, end: { ...at } });
  }

  private moveDrag(id: string, at: Vec2): void {
    const d = this.drags.get(id);
    if (!d) return;
    if (d.kind === 'draw') d.end = { ...at };
    else if (d.kind === 'end') {
      d.strand[d.end] = { ...at };
      this.bend(d.strand);
    } else {
      const dx = at.x - d.grabAt.x;
      const dy = at.y - d.grabAt.y;
      d.strand.a = { x: d.from[0].x + dx, y: d.from[0].y + dy };
      d.strand.b = { x: d.from[1].x + dx, y: d.from[1].y + dy };
    }
  }

  /** While stretching, the pitch follows the length smoothly (pitch bend). */
  private bend(s: Strand): void {
    const r = this.renderer.lengthRatio(s.a, s.b);
    s.bend = continuousNoteForLength(r, this.tuning()) - s.note;
  }

  private endDrag(id: string): void {
    const d = this.drags.get(id);
    this.drags.delete(id);
    if (!d) return;
    if (d.kind === 'draw') {
      if (this.renderer.lengthRatio(d.start, d.end) < MIN_STRAND) return;
      const s = this.field.add(d.start, d.end);
      this.retuneAll();
      s.pluck(0.5, 0.35, performance.now());
      this.signal('strand');
    } else {
      d.strand.bend = 0;
      this.field.commitMove(d.strand.id, d.from);
    }
  }

  private clear(): void {
    if (!this.field.live.length) return;
    this.field.clear();
    toast(t('toast.cleared'));
  }

  /** Virtuoso "real harp" preset: parallel strings in diatonic order, low to high. */
  private harpPreset(): void {
    const tuning = tuningForMode(
      'virtuoso',
      this.settings.scale === 'free' || this.settings.scale === 'chromatic'
        ? 'major'
        : this.settings.scale,
      this.settings.tonic,
    );
    const notes = scaleNotes(tuning);
    const H = this.renderer.height;
    const diag = this.renderer.diagonal;
    const strands: { a: Vec2; b: Vec2 }[] = [];
    // Invert the length→note mapping so each string lands exactly on its note.
    notes.forEach((_, i) => {
      const pos = i / (notes.length - 1);
      const r = (Math.pow(2, 2 * (1 - pos)) - 1) / 3;
      const lenPx = (0.05 + 0.85 * r) * diag;
      if (lenPx > H * 0.86) return;
      strands.push({ a: { x: 0, y: 0.5 - lenPx / H / 2 }, b: { x: 0, y: 0.5 + lenPx / H / 2 } });
    });
    const n = strands.length;
    strands.forEach((s, i) => {
      const x = 0.12 + (0.76 * i) / Math.max(1, n - 1);
      s.a.x = x;
      s.b.x = x;
    });
    this.field.clear();
    for (const s of strands) this.field.add(s.a, s.b);
    this.update({ scale: tuning.scale });
    toast(t('toast.strings', { count: n }));
  }

  // ───────────────────────────── playing

  /** A fingertip (or pointer) moving from `from` to `to` plucks every string it crosses. */
  private sweep(from: Vec2, to: Vec2, speed: number, now: number): void {
    for (const hit of this.field.crossings(from, to)) {
      if (now - hit.strand.lastPluck < RETRIGGER_MS) continue;
      const velocity = this.settings.velocity ? clamp(0.2 + speed / 3, 0.2, 1) : 0.75;
      this.play(hit.strand, hit.t, velocity, now);
    }
  }

  private flick(at: Vec2, speed: number, now: number): void {
    const near = this.field.nearestStrand(at, this.renderer.aspect);
    if (!near || near.d > 0.16) return;
    const s = near.strand;
    const a = this.renderer.px(s.a);
    const b = this.renderer.px(s.b);
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const p = { x: a.x + (b.x - a.x) * near.t, y: a.y + (b.y - a.y) * near.t };
    this.renderer.particles.burst(
      p.x,
      p.y,
      (b.x - a.x) / len,
      (b.y - a.y) / len,
      themeById(this.settings.theme).colors[s.timbre],
      36,
    );
    if (now - s.lastPluck >= RETRIGGER_MS) this.play(s, near.t, clamp(speed / 4, 0.6, 1), now);
    this.signal('flick');
  }

  private play(s: Strand, at: number, velocity: number, now: number, fromLoop = false): void {
    s.pluck(at, 0.4 + velocity * 0.6, now);
    const r = this.renderer.lengthRatio(s.a, s.b);
    const mid = (s.a.x + s.b.x) / 2;
    const note = s.note + s.bend;
    this.audio.pluck({ midi: note, timbre: s.timbre, velocity, pan: mid * 2 - 1 });
    if (this.settings.mode === 'virtuoso') {
      const tension = clamp(1 - r, 0, 1);
      this.midi.pluck(s.timbre, Math.round(note), velocity, tension);
      this.osc.send('/strandlight/pluck', [
        s.id,
        Math.round(note),
        velocity,
        ['crystal', 'harp', 'bass'].indexOf(s.timbre),
      ]);
    }
    if (!fromLoop) {
      this.looper.record(this.beats(), {
        strandId: s.id,
        midi: note,
        timbre: s.timbre,
        velocity,
        pan: mid * 2 - 1,
      });
      this.signal('pluck');
    }
  }

  private playLoopEvent(e: LoopEvent): void {
    const s = this.field.byId(e.strandId);
    if (s) s.pluck(0.5, 0.4 + e.velocity * 0.6, performance.now());
    this.audio.pluck({ midi: e.midi, timbre: e.timbre, velocity: e.velocity, pan: e.pan });
  }

  private muteAll(): void {
    this.audio.muteAll();
    for (const s of this.field.strands) s.damp();
    const now = performance.now();
    if (now - this.lastMuteToast > 2500) {
      this.lastMuteToast = now;
      toast(t('toast.muted'), 'info', 1200);
    }
  }

  private setSustain(on: boolean): void {
    if (this.sustain === on) return;
    this.sustain = on;
    this.audio.setSustain(on);
    if (on) toast(t('toast.sustainOn'), 'info', 1200);
  }

  /** Both hands visible: five live threads between matching fingertips play a pad chord. */
  private updatePad(now: number): { threads: { a: Vec2; b: Vec2 }[]; tension: number } {
    const L = this.hands.find((h) => h.key === 'Left');
    const R = this.hands.find((h) => h.key === 'Right');
    const pinching = this.gestures.isPinching('Left') || this.gestures.isPinching('Right');
    if (!L || !R || pinching) {
      if (this.padSince !== null) this.audio.setPad(null, 0);
      this.padSince = null;
      return { threads: [], tension: 0 };
    }
    this.padSince ??= now;
    const threads = FINGER_TIPS.map((i) => ({ a: L.points[i] as Vec2, b: R.points[i] as Vec2 }));
    const avg =
      threads.reduce((sum, th) => sum + this.renderer.lengthRatio(th.a, th.b), 0) / threads.length;
    const tension = clamp((avg - 0.15) / 0.55, 0, 1);
    if (now - this.padSince > 300) {
      const notes = scaleNotes(this.tuning());
      const y = ((L.points[LM.wrist] as Vec2).y + (R.points[LM.wrist] as Vec2).y) / 2;
      const root = Math.round(clamp(1 - y, 0, 1) * Math.max(0, notes.length - 9));
      // Stack every other scale step: a chord that always fits the scale.
      const chord = [0, 2, 4, 6, 8].map(
        (k) => (notes[Math.min(notes.length - 1, root + k)] as number) - 12,
      );
      this.audio.setPad(chord, tension);
    }
    return { threads, tension };
  }

  // ───────────────────────────── looper and clock

  /** Seconds on the audio clock (falls back to performance time before audio starts). */
  private clock(): number {
    return this.audio.ctx?.currentTime ?? performance.now() / 1000;
  }

  private beats(): number {
    return this.clock() / this.metronome.beatLength;
  }

  private toggleLoop(): void {
    if (this.settings.mode === 'beginner' || !this.started) return;
    this.looper.toggle(this.beats());
  }

  // ───────────────────────────── recording

  private async toggleRecord(): Promise<void> {
    if (this.recorder.recording) {
      this.recorder.stop();
      this.shell.setRecording(false);
      toast(t('toast.recordingSaved'));
      return;
    }
    await this.shell.runCountdown();
    try {
      await this.recorder.start({
        source: this.settings.recordSource,
        canvas: this.renderer.canvas,
        camera: this.tracker?.mediaStream ?? null,
        audio: this.audio.recordDest?.stream ?? null,
      });
      this.shell.setRecording(true, this.recorder.startedAt);
    } catch {
      toast(
        t(this.settings.recordSource === 'camera' ? 'error.noCamera' : 'error.tracking'),
        'error',
      );
    }
  }

  // ───────────────────────────── scenes

  private currentScene(): Scene {
    return {
      v: SCENE_VERSION,
      strands: this.field.serialize(),
      mode: this.settings.mode,
      scale: this.settings.scale === 'free' ? 'chromatic' : this.settings.scale,
      tonic: this.settings.tonic,
      bpm: this.settings.bpm,
      theme: this.settings.theme,
      a4: this.settings.a4,
    };
  }

  private applyScene(s: Scene): void {
    this.update({
      mode: s.mode,
      scale: s.scale,
      tonic: s.tonic,
      bpm: s.bpm,
      theme: s.theme,
      a4: s.a4,
    });
    this.field.load(s.strands);
    this.retuneAll();
  }

  private async loadInitialScene(): Promise<void> {
    const hash = new URLSearchParams(location.hash.slice(1)).get('scene');
    if (hash) {
      const s = await decodeScene(hash);
      if (s) {
        this.applyScene(s);
        toast(t('toast.loaded'));
      } else toast(t('error.sceneInvalid'), 'error');
      history.replaceState(null, '', location.pathname + location.search);
      return;
    }
    try {
      const raw = localStorage.getItem(SCENE_KEY);
      const s = raw ? parseScene(JSON.parse(raw)) : null;
      if (s) this.applyScene(s);
    } catch {
      /* ignore broken storage */
    }
  }

  private saveScene(): void {
    try {
      localStorage.setItem(SCENE_KEY, JSON.stringify(this.currentScene()));
      toast(t('toast.saved'));
    } catch {
      toast(t('error.sceneInvalid'), 'error');
    }
  }

  private exportScene(): void {
    const blob = new Blob([JSON.stringify(this.currentScene(), null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'strandlight-scene.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  private async importScene(file: File): Promise<void> {
    if (file.size > 200_000) return toast(t('error.sceneInvalid'), 'error');
    try {
      const s = parseScene(JSON.parse(await file.text()));
      if (!s) throw new Error('invalid');
      this.applyScene(s);
      toast(t('toast.loaded'));
    } catch {
      toast(t('error.sceneInvalid'), 'error');
    }
  }

  private async shareScene(): Promise<void> {
    const code = await encodeScene(this.currentScene());
    const url = `${location.origin}${location.pathname}#scene=${code}`;
    try {
      await navigator.clipboard.writeText(url);
      toast(t('toast.linkCopied'));
    } catch {
      prompt('', url);
    }
  }

  // ───────────────────────────── pointer and keyboard

  /**
   * Touch and mouse: press, hold still for a moment, then drag to draw a string.
   * A quick swipe plucks every string it crosses.
   */
  private bindPointer(): void {
    const stage = this.renderer.canvas;
    type P = {
      start: Vec2;
      last: Vec2;
      lastT: number;
      downT: number;
      mode: 'pending' | 'swipe' | 'drag';
      timer: number;
    };
    const pointers = new Map<number, P>();
    const norm = (e: PointerEvent): Vec2 => ({
      x: e.clientX / this.renderer.width,
      y: e.clientY / this.renderer.height,
    });
    const toPx = (a: Vec2, b: Vec2) => dist(this.renderer.px(a), this.renderer.px(b));

    stage.addEventListener('pointerdown', (e) => {
      if (!this.started) return;
      stage.setPointerCapture(e.pointerId);
      const at = norm(e);
      const p: P = {
        start: at,
        last: at,
        lastT: e.timeStamp,
        downT: e.timeStamp,
        mode: 'pending',
        timer: 0,
      };
      p.timer = window.setTimeout(() => {
        if (p.mode !== 'pending') return;
        p.mode = 'drag';
        this.beginDrag(`ptr-${e.pointerId}`, p.start);
        this.moveDrag(`ptr-${e.pointerId}`, p.last);
        this.signal('pinch');
        navigator.vibrate?.(10);
      }, 220);
      pointers.set(e.pointerId, p);
    });

    stage.addEventListener('pointermove', (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const at = norm(e);
      if (p.mode === 'pending' && toPx(p.start, at) > 12) {
        clearTimeout(p.timer);
        p.mode = 'swipe';
      }
      if (p.mode === 'swipe') {
        const dt = Math.max(1, e.timeStamp - p.lastT) / 1000;
        const speed =
          dist(
            { x: p.last.x * this.renderer.aspect, y: p.last.y },
            { x: at.x * this.renderer.aspect, y: at.y },
          ) / dt;
        this.sweep(p.last, at, speed * 0.6, performance.now());
        if (speed > 5) this.flick(at, speed * 0.6, performance.now());
      } else if (p.mode === 'drag') this.moveDrag(`ptr-${e.pointerId}`, at);
      p.last = at;
      p.lastT = e.timeStamp;
    });

    const up = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      clearTimeout(p.timer);
      if (p.mode === 'drag') this.endDrag(`ptr-${e.pointerId}`);
      pointers.delete(e.pointerId);
    };
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
  }

  private bindKeys(): void {
    window.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') {
        this.shell.closeHelp();
        this.shell.togglePanel(false);
        return;
      }
      if (!this.started) return;
      switch (e.code) {
        case 'KeyZ':
          if (e.shiftKey) this.field.redo();
          else this.field.undo();
          break;
        case 'KeyC':
          this.clear();
          break;
        case 'KeyV':
          this.update({ showVideo: !this.settings.showVideo });
          break;
        case 'Space':
          e.preventDefault();
          this.toggleLoop();
          break;
        case 'KeyH':
          if (this.shell.helpOpen) this.shell.closeHelp();
          else this.shell.openHelp();
          break;
        default:
          return;
      }
    });
  }

  private signal(s: GuideSignal): void {
    this.guide.signal(s);
  }

  // ───────────────────────────── frame loop

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;

    this.metronome.tick(this.clock());
    this.looper.tick(this.beats());
    this.pulse = Math.max(0, this.pulse - dt * 4);
    this.field.step(dt, this.sustain);

    const pad = this.started ? this.updatePad(now) : { threads: [], tension: 0 };
    const previews: { a: Vec2; b: Vec2 }[] = [];
    for (const d of this.drags.values())
      if (d.kind === 'draw') previews.push({ a: d.start, b: d.end });

    // Hands that left the frame fade out of view after the grace period.
    this.hands = this.hands.filter((h) => now - h.seenAt < 250);

    this.renderer.draw(
      {
        strands: this.field.strands,
        theme: themeById(this.settings.theme),
        hands: this.hands.map((h) => ({
          key: h.key,
          points: h.points,
          pinching: this.gestures.isPinching(h.key),
        })),
        previews,
        threads: pad.threads,
        tension: pad.tension,
        video: this.tracker?.video ?? null,
        showVideo: this.settings.showVideo,
        pulse: this.pulse,
        time: now / 1000,
      },
      dt,
    );

    if (this.settings.mode === 'virtuoso' && this.osc.connected) {
      for (const [hi, h] of this.hands.entries()) {
        FINGER_TIPS.forEach((tip, j) => {
          const p = h.points[tip] as Vec2;
          this.osc.send(`/strandlight/hand/${hi}/tip/${j}`, [p.x, p.y]);
        });
        this.osc.send('/strandlight/pinch', [hi, this.gestures.isPinching(h.key) ? 1 : 0]);
      }
    }
  };
}
