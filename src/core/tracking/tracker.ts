import { isAndroid } from '../platform';
import type { FromWorker, RawHand } from './types';

export interface TrackerOptions {
  light: boolean;
  onHands: (hands: RawHand[], time: number) => void;
  onStatus: (status: 'loading' | 'ready' | 'error', detail?: string) => void;
}

const assetUrl = (path: string) => new URL(path, document.baseURI).href;

/**
 * Owns the camera stream and feeds frames to the tracking worker, one at a time
 * (back-pressure keeps latency low instead of queueing stale frames).
 * Camera frames never leave this device: they go only to the local worker.
 */
export class Tracker {
  readonly video = document.createElement('video');
  private worker: Worker | null = null;
  private busy = false;
  private errors = 0;
  private running = false;
  private stream: MediaStream | null = null;
  private fallback: import('./detector').Detector | null = null;

  constructor(private opts: TrackerOptions) {
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.setAttribute('playsinline', '');
  }

  get mediaStream(): MediaStream | null {
    return this.stream;
  }

  async start(): Promise<void> {
    this.opts.onStatus('loading');
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: this.opts.light ? 640 : 1280 },
        height: { ideal: this.opts.light ? 480 : 720 },
        frameRate: { ideal: 60 },
      },
    });
    this.video.srcObject = this.stream;
    await this.video.play();

    const init = {
      wasmBase: assetUrl('mediapipe'),
      modelUrl: assetUrl('models/hand_landmarker.task'),
      numHands: 2,
      // Android GPUs (Chrome and WebViews) often hang on the GPU delegate: use the CPU there.
      delegate: (isAndroid ? 'CPU' : 'GPU') as 'CPU' | 'GPU',
    };

    try {
      await this.startWorker(init);
    } catch {
      // Some browsers cannot run the wasm runtime in a worker; fall back to the main thread.
      this.worker?.terminate();
      this.worker = null;
      const { Detector } = await import('./detector');
      this.fallback = new Detector();
      await this.fallback.init(init);
    }
    this.opts.onStatus('ready');
    this.running = true;
    this.loop();
  }

  private startWorker(init: Record<string, unknown>): Promise<void> {
    return new Promise((resolve, reject) => {
      const w = new Worker(new URL('./tracker.worker.ts', import.meta.url));
      this.worker = w;
      const timeout = setTimeout(() => reject(new Error('worker timeout')), 25000);
      w.onerror = (e) => {
        clearTimeout(timeout);
        reject(new Error(e.message));
      };
      w.onmessage = (e: MessageEvent<FromWorker>) => {
        const msg = e.data;
        if (msg.type === 'ready') {
          clearTimeout(timeout);
          w.onmessage = (ev: MessageEvent<FromWorker>) => this.onWorker(ev.data);
          resolve();
        } else if (msg.type === 'error') {
          clearTimeout(timeout);
          reject(new Error(msg.message));
        }
      };
      w.postMessage({ type: 'init', ...init });
    });
  }

  private onWorker(msg: FromWorker): void {
    if (msg.type === 'result') {
      this.busy = false;
      this.errors = 0;
      this.opts.onHands(msg.hands, msg.time);
    } else if (msg.type === 'error') {
      this.busy = false;
      // Persistent per-frame errors mean tracking cannot work on this device.
      if (++this.errors === 30) this.opts.onStatus('error', msg.message);
    }
  }

  private loop = (): void => {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    if (this.busy || this.video.readyState < 2) return;
    const time = performance.now();
    if (this.fallback) {
      this.opts.onHands(this.fallback.detect(this.video, time), time);
      return;
    }
    if (!this.worker) return;
    this.busy = true;
    const scale = this.opts.light ? 0.5 : 1;
    createImageBitmap(this.video, {
      resizeWidth: Math.round(this.video.videoWidth * scale),
      resizeHeight: Math.round(this.video.videoHeight * scale),
    })
      .then((bitmap) => this.worker?.postMessage({ type: 'frame', bitmap, time }, [bitmap]))
      .catch(() => {
        this.busy = false;
      });
  };

  stop(): void {
    this.running = false;
    this.worker?.terminate();
    this.worker = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}
