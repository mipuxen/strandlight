#!/usr/bin/env node
// strandlight-bridge: localhost WebSocket → OSC over UDP.
// Usage: npx strandlight-bridge [--port 8765] [--osc-host 127.0.0.1] [--osc-port 9000]
import { createSocket } from 'node:dgram';
import { WebSocketServer } from 'ws';
import { encodeMessage } from './osc.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const wsPort = Number(arg('port', 8765));
const oscHost = arg('osc-host', '127.0.0.1');
const oscPort = Number(arg('osc-port', 9000));

// Only pages from these origins may talk to the bridge.
const ALLOWED_ORIGINS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https:\/\/mipuxen\.github\.io$/,
  /^https:\/\/strandlight\.vercel\.app$/,
  ...(arg('allow-origin', '')
    ? [new RegExp(`^${arg('allow-origin', '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)]
    : []),
];

const udp = createSocket('udp4');
// Bind to loopback only: the bridge is never reachable from the network.
const wss = new WebSocketServer({
  host: '127.0.0.1',
  port: wsPort,
  maxPayload: 4096,
  verifyClient: ({ origin }) => ALLOWED_ORIGINS.some((re) => re.test(origin ?? '')),
});

const valid = (m) =>
  m &&
  typeof m.address === 'string' &&
  /^\/strandlight(\/[a-z0-9{}_]+)+$/i.test(m.address) &&
  m.address.length < 64 &&
  Array.isArray(m.args) &&
  m.args.length <= 8 &&
  m.args.every((a) => typeof a === 'number' && Number.isFinite(a));

wss.on('connection', (ws, req) => {
  console.log(`● connected: ${req.headers.origin}`);
  ws.on('message', (raw) => {
    let m;
    try {
      m = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!valid(m)) return;
    udp.send(encodeMessage(m.address, m.args), oscPort, oscHost);
  });
  ws.on('close', () => console.log('○ disconnected'));
});

console.log(`Strandlight bridge: ws://127.0.0.1:${wsPort} → osc://${oscHost}:${oscPort}`);
console.log('Addresses: /strandlight/pluck  /strandlight/hand/{i}/tip/{j}  /strandlight/pinch');
