// Copies the MediaPipe wasm runtime out of node_modules and downloads the hand model,
// verifying every file against assets.lock.json. Nothing is loaded from a CDN at runtime.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lockPath = join(root, 'assets.lock.json');
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
const strict = process.env.CI === 'true' || process.argv.includes('--strict');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

let failed = false;

for (const file of lock.wasm.files) {
  const src = join(root, 'node_modules/@mediapipe/tasks-vision/wasm', file.name);
  const dest = join(root, 'public/mediapipe', file.name);
  const buf = readFileSync(src);
  const hash = sha256(buf);
  if (hash !== file.sha256) {
    console.error(`✖ ${file.name}: hash mismatch (got ${hash})`);
    failed = true;
    continue;
  }
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}

// The model's source and hash are constants in code, not read from a file, so nothing
// outside this script can redirect the download. assets.lock.json mirrors them for docs.
const MODEL_NAME = 'hand_landmarker.task';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const MODEL_SHA256 = 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1';
if (lock.model.sha256 !== MODEL_SHA256 || lock.model.url !== MODEL_URL) {
  console.error('✖ assets.lock.json and scripts/prepare-assets.mjs disagree about the model');
  process.exit(1);
}

const modelDest = join(root, 'public/models', MODEL_NAME);
const matches = (buf) => sha256(buf) === MODEL_SHA256;

/** Reads the cached model if it exists; no separate exists-check, so there is no race. */
function readCached() {
  try {
    return readFileSync(modelDest);
  } catch {
    return null;
  }
}

const cached = readCached();
if (cached && matches(cached)) {
  console.log(`✔ ${MODEL_NAME} already present`);
} else {
  try {
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    // Only bytes whose SHA-256 equals the pinned hash are ever written to disk.
    if (!matches(buf)) {
      console.error(
        `✖ ${MODEL_NAME}: hash mismatch (got ${sha256(buf)}, expected ${MODEL_SHA256})`,
      );
      failed = true;
    } else {
      // CodeQL js/http-to-file-access flags this write because the bytes come from the
      // network. It is intentional: the URL is a constant and the bytes have just matched
      // the pinned SHA-256, which CodeQL cannot see as a sanitizer. Alert dismissed as a
      // false positive with this reason; see SECURITY.md.
      mkdirSync(dirname(modelDest), { recursive: true });
      writeFileSync(modelDest, buf, { mode: 0o644 });
      console.log(`✔ ${MODEL_NAME} downloaded and verified`);
    }
  } catch (err) {
    const msg = `Could not download ${MODEL_NAME}: ${err.message}`;
    if (strict) {
      console.error(`✖ ${msg}`);
      failed = true;
    } else {
      console.warn(`⚠ ${msg}. Camera mode will be unavailable; touch mode still works.`);
    }
  }
}

if (failed) process.exit(1);
console.log('✔ assets ready');
