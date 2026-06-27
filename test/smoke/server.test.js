// Smoke: รัน server จริงเป็น child process แล้วเช็คว่า "ติดและต่อได้"
//  - HTTP เสิร์ฟไหม (ตอบ 200)
//  - Socket.IO ต่อได้ + create ห้อง → ได้ event 'joined' และ 'state'
// ไม่ทดสอบ logic เกม (นั่นเป็นหน้าที่ unit/integration) — แค่ยืนยันว่าระบบ "boot" ได้
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { io as ioClient } from 'socket.io-client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = join(__dirname, '..', '..', 'server', 'index.js');
const PORT = 3199; // พอร์ตเฉพาะเทส กันชนกับ dev server (3000)
const URL = `http://localhost:${PORT}`;

let child;

beforeAll(async () => {
  child = spawn('node', [SERVER], {
    env: {
      ...process.env,
      PORT: String(PORT),
      ROOMS_FILE: join(__dirname, '..', '..', 'tmp', 'rooms.smoke.json'), // ไม่เขียนทับ rooms.json จริง
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // รอจน server log ว่าพร้อม
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
    // ยังไม่ได้ build → อาจ 404 (ไม่มี index.html) แต่ขอแค่ server ตอบกลับมา ไม่ใช่ ECONNREFUSED
    expect(res.status).toBeGreaterThanOrEqual(200);
  });

  it('/healthz ตอบ ok', async () => {
    const res = await fetch(`${URL}/healthz`);
    expect(res.status).toBe(200);
    const body = /** @type {any} */ (await res.json());
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
