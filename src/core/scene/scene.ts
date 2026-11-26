import type { StrandData } from '../strings/strand';
import type { Mode } from '../music/mapping';
import type { ScaleId } from '../music/scales';

export const SCENE_VERSION = 1;

export interface Scene {
  v: number;
  strands: StrandData[];
  mode: Mode;
  scale: ScaleId;
  tonic: number;
  bpm: number;
  theme: string;
  a4: number;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Validates untrusted input (files, URLs) and returns a clean Scene or null. */
export function parseScene(input: unknown): Scene | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  if (o.v !== SCENE_VERSION || !Array.isArray(o.strands)) return null;
  const num = (x: unknown, lo: number, hi: number) =>
    typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
  const pt = (p: unknown) =>
    !!p &&
    typeof p === 'object' &&
    num((p as Record<string, unknown>).x, -0.5, 1.5) &&
    num((p as Record<string, unknown>).y, -0.5, 1.5);
  const strands: StrandData[] = [];
  for (const s of o.strands.slice(0, 48)) {
    if (!s || typeof s !== 'object') continue;
    const r = s as Record<string, unknown>;
    if (!pt(r.a) || !pt(r.b)) continue;
    const a = r.a as { x: number; y: number };
    const b = r.b as { x: number; y: number };
    strands.push({ id: 0, a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } });
  }
  const modes: Mode[] = ['beginner', 'musician', 'virtuoso'];
  return {
    v: SCENE_VERSION,
    strands,
    mode: modes.includes(o.mode as Mode) ? (o.mode as Mode) : 'beginner',
    scale:
      typeof o.scale === 'string' && /^[a-zA-Z]{2,20}$/.test(o.scale)
        ? (o.scale as ScaleId)
        : 'minorPentatonic',
    tonic: num(o.tonic, 0, 11) ? Math.round(o.tonic as number) : 0,
    bpm: num(o.bpm, 40, 200) ? Math.round(o.bpm as number) : 90,
    theme: typeof o.theme === 'string' && /^[a-z-]{2,20}$/.test(o.theme) ? o.theme : 'neon-cosmos',
    a4: num(o.a4, 432, 446) ? (o.a4 as number) : 440,
  };
}

export function compactScene(s: Scene): Scene {
  return {
    ...s,
    strands: s.strands.map((x) => ({
      id: 0,
      a: { x: round(x.a.x), y: round(x.a.y) },
      b: { x: round(x.b.x), y: round(x.b.y) },
    })),
  };
}

const toB64Url = (bytes: Uint8Array): string => {
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromB64Url = (s: string): Uint8Array => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function pipe(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** Scene → compressed, URL-safe string for #scene=… links. */
export async function encodeScene(s: Scene): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(compactScene(s)));
  return toB64Url(await pipe(json, new CompressionStream('deflate-raw')));
}

export async function decodeScene(encoded: string): Promise<Scene | null> {
  try {
    if (encoded.length > 20000) return null;
    const bytes = await pipe(fromB64Url(encoded), new DecompressionStream('deflate-raw'));
    if (bytes.length > 200000) return null;
    return parseScene(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}
