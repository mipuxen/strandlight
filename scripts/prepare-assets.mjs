// Copies the MediaPipe wasm runtime out of node_modules and downloads the hand model,
// verifying every file against assets.lock.json. Nothing is loaded from a CDN at runtime.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
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

const model = lock.model;
const modelDest = join(root, 'public/models', model.name);
const verify = (buf) => {
  const hash = sha256(buf);
  if (model.sha256 === null) {
    console.warn(`⚠ ${model.name} is not pinned yet. Downloaded sha256: ${hash}`);
    console.warn('  Pin it in assets.lock.json after checking it against a second source.');
    return true;
  }
  if (hash !== model.sha256) {
    console.error(`✖ ${model.name}: hash mismatch (got ${hash}, expected ${model.sha256})`);
    return false;
  }
  return true;
};

if (existsSync(modelDest) && verify(readFileSync(modelDest))) {
  console.log(`✔ ${model.name} already present`);
} else {
  try {
    const res = await fetch(model.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (verify(buf)) {
      mkdirSync(dirname(modelDest), { recursive: true });
      writeFileSync(modelDest, buf);
      console.log(`✔ ${model.name} downloaded`);
    } else failed = true;
  } catch (err) {
    const msg = `Could not download ${model.name}: ${err.message}`;
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
