// Smoke: run the real server as a child process and check it "boots and connects"
//  - Does HTTP serve (responds 200)
//  - Socket.IO connects + create room → receives 'joined' and 'state' events
// Doesn't test game logic (that's unit/integration's job) — just confirms the system "boots"
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { io as ioClient } from 'socket.io-client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = join(__dirname, '..', '..', 'server', 'index.ts');
// test-only port, avoids clashing with the dev server (3000)
const PORT = 3199;
const URL = `http://localhost:${PORT}`;

let child;

beforeAll(async () => {
  child = spawn('node', ['--import', 'tsx', SERVER], {
    env: {
      ...process.env,
      PORT: String(PORT),
      // don't overwrite the real rooms.json
      ROOMS_FILE: join(__dirname, '..', '..', 'tmp', 'rooms.smoke.json'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // wait until the server logs that it's ready
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server ไม่ boot ใน 10 วิ')), 10_000);
    child.stdout.on('data', (buf) => {
      if (buf.toString().includes('พร้อมเล่นแล้ว')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('exit', (code) => reject(new Error(`server ออกก่อนพร้อม (code ${code})`)));
  });
}, 15_000);

afterAll(() => {
  child?.kill('SIGKILL');
});

describe('smoke: HTTP', () => {
  it('ตอบ request ที่ root (ไม่ล่ม)', async () => {
    const res = await fetch(URL);
    // not built yet → may 404 (no index.html), but we just want the server to respond, not ECONNREFUSED
    expect(res.status).toBeGreaterThanOrEqual(200);
  });

  it('/healthz ตอบ ok', async () => {
    const res = await fetch(`${URL}/healthz`);
    expect(res.status).toBe(200);
    const body = /** @type {any} */ await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.uptimeSec).toBe('number');
  });

  it('/metrics คืนจำนวนห้อง/ผู้เล่น', async () => {
    const res = await fetch(`${URL}/metrics`);
    expect(res.status).toBe(200);
    const m = await res.json();
    expect(m).toHaveProperty('rooms');
    expect(m).toHaveProperty('players');
    expect(m).toHaveProperty('roomsCreated');
  });
});

describe('smoke: Socket.IO', () => {
  it('ต่อ socket + create ห้อง → ได้ joined และ state', async () => {
    const socket = ioClient(URL, { transports: ['websocket'], reconnection: false });
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('ไม่ได้รับ event ใน 5 วิ')), 5_000);
        let gotJoined = false;
        socket.on('connect', () => socket.emit('create', { name: 'SmokeBot' }));
        socket.on('joined', (msg) => {
          gotJoined = true;
          expect(msg.code).toMatch(/^[A-Z0-9]{4}$/);
        });
        socket.on('state', (state) => {
          expect(gotJoined).toBe(true);
          expect(state.phase).toBe('lobby');
          expect(state.players[0].name).toBe('SmokeBot');
          clearTimeout(timer);
          resolve();
        });
        socket.on('connect_error', (e) => reject(e));
      });
    } finally {
      socket.disconnect();
    }
  });
});
