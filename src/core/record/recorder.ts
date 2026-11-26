export type RecordSource = 'scene' | 'camera' | 'screen';

/** Prefer MP4 (H.264/AAC) where the browser supports it, otherwise WebM (VP9/Opus). */
export function pickMimeType(isSupported: (t: string) => boolean): { mime: string; ext: string } {
  const candidates: [string, string][] = [
    ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'mp4'],
    ['video/mp4;codecs=avc1,mp4a', 'mp4'],
    ['video/mp4', 'mp4'],
    ['video/webm;codecs=vp9,opus', 'webm'],
    ['video/webm;codecs=vp8,opus', 'webm'],
    ['video/webm', 'webm'],
  ];
  for (const [mime, ext] of candidates) if (isSupported(mime)) return { mime, ext };
  return { mime: '', ext: 'webm' };
}

export function fileName(date: Date, ext: string): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `strandlight-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}.${ext}`;
}

/**
 * Records on the device and downloads the file directly. Audio always comes straight
 * from the AudioContext, so no microphone permission is needed.
 */
export class Recorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private extraStream: MediaStream | null = null;
  startedAt = 0;

  get recording(): boolean {
    return this.rec?.state === 'recording';
  }

  async start(opts: {
    source: RecordSource;
    canvas: HTMLCanvasElement;
    camera: MediaStream | null;
    audio: MediaStream | null;
  }): Promise<void> {
    let video: MediaStreamTrack[] = [];
    if (opts.source === 'scene') video = opts.canvas.captureStream(60).getVideoTracks();
    else if (opts.source === 'camera') {
      if (!opts.camera) throw new Error('no-camera');
      video = opts.camera.getVideoTracks().map((t) => t.clone());
    } else {
      this.extraStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      video = this.extraStream.getVideoTracks();
    }
    const tracks = [...video, ...(opts.audio?.getAudioTracks() ?? [])];
    const stream = new MediaStream(tracks);
    const { mime, ext } = pickMimeType((t) => MediaRecorder.isTypeSupported(t));
    this.chunks = [];
    this.rec = new MediaRecorder(stream, {
      ...(mime ? { mimeType: mime } : {}),
      videoBitsPerSecond: 8_000_000,
      audioBitsPerSecond: 192_000,
    });
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    const ext0 = ext;
    this.rec.onstop = () => {
      const blob = new Blob(this.chunks, { type: mime || 'video/webm' });
      this.download(blob, fileName(new Date(), ext0));
      this.extraStream?.getTracks().forEach((t) => t.stop());
      this.extraStream = null;
      if (opts.source === 'camera') video.forEach((t) => t.stop());
    };
    // If the user stops screen sharing from the browser bar, end the recording too.
    this.extraStream?.getVideoTracks()[0]?.addEventListener('ended', () => this.stop());
    this.rec.start(1000);
    this.startedAt = performance.now();
  }

  stop(): void {
    if (this.rec && this.rec.state !== 'inactive') this.rec.stop();
  }

  private download(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}
