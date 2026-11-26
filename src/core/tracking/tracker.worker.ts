/// <reference lib="webworker" />
import { Detector } from './detector';
import type { FromWorker, ToWorker } from './types';

// Hand tracking runs here so the main thread stays free for rendering and audio.
const detector = new Detector();
const post = (msg: FromWorker, transfer: Transferable[] = []) =>
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, transfer);

const isMessage = (m: unknown): m is ToWorker =>
  !!m &&
  typeof m === 'object' &&
  ((m as ToWorker).type === 'init' || (m as ToWorker).type === 'frame');

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  // A dedicated worker only hears the page that created it, and such messages carry an
  // empty origin. Anything else (or any unexpected shape) is ignored.
  if (e.origin !== '' && e.origin !== self.location.origin) return;
  const msg = e.data;
  if (!isMessage(msg)) return;
  if (msg.type === 'init') {
    try {
      await detector.init(msg);
      post({ type: 'ready', delegate: detector.delegate });
    } catch (err) {
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  if (msg.type === 'frame') {
    try {
      const hands = detector.detect(msg.bitmap, msg.time);
      post(
        { type: 'result', hands, time: msg.time },
        hands.map((h) => h.points.buffer),
      );
    } catch (err) {
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      msg.bitmap.close();
    }
  }
};
