import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// GitHub Pages serves the demo from /strandlight/; Vercel and local dev serve from /.
const base = process.env.STRANDLIGHT_BASE ?? '/';

/**
 * Strict Content Security Policy for static hosting (GitHub Pages cannot set headers).
 * 'wasm-unsafe-eval' is required to compile the MediaPipe WebAssembly runtime.
 * The only non-self connection allowed is the optional local OSC bridge.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: mediastream:",
  "font-src 'self'",
  "connect-src 'self' ws://127.0.0.1:* ws://localhost:*",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const csp = (): Plugin => ({
  name: 'strandlight-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace(
      '<meta charset="UTF-8" />',
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
    ),
});

export default defineConfig({
  base,
  plugins: [csp()],
  build: {
    target: 'es2022',
    sourcemap: true,
    assetsInlineLimit: 0,
  },
  worker: {
    // MediaPipe's wasm loader relies on importScripts(), which only classic workers have.
    format: 'iife',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
