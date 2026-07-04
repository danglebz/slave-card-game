// Integration: switching rooms on the SAME socket must detach the old seat (no orphan / phantom
// player), and a failed join must report the code it failed on. Spawns the REAL server (like
// test/smoke/server.test.ts) and drives socket.io-client "devices".
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fs from 'node:fs';
import { io as ioClient, type Socket } from 'socket.io-client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = join(__dirname, '..', '..', 'server', 'index.ts');
// unique port + rooms file (avoids smoke 3199 / reconnect 3211 / e2e 3100 / dev 3000)
const PORT = 3212;
const URL = `http://localhost:${PORT}`;
const ROOMS_FILE = join(__dirname, '..', '..', 'tmp', 'rooms.roomswitch.json');

let child: ReturnType<typeof spawn>;
const sockets: Socket[] = [];

function connect(): Socket {
  const s = ioClient(URL, { transports: ['websocket'], reconnection: false });
  sockets.push(s);
  return s;
}

function waitState(socket: Socket, pred: (state: any) => boolean, timeoutMs = 5_000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('state', onState);
      reject(new Error('ไม่ได้รับ state ที่ต้องการใน 5 วิ'));
    }, timeoutMs);
    function onState(state: any) {
      if (!pred(state)) return;
      clearTimeout(timer);
      socket.off('state', onState);
      resolve(state);
    }
    socket.on('state', onState);
  });
}

function waitEvent(socket: Socket, event: string, timeoutMs = 5_000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`ไม่ได้รับ event "${event}" ใน 5 วิ`)),
      timeoutMs,
    );
    socket.once(event, (payload: any) => {
      clearTimeout(timer);
      resolve(payload);
    });
    socket.once('connect_error', (e: any) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

async function createRoom(name: string): Promise<{ socket: Socket; code: string }> {
  const socket = connect();
  const joinedP = waitEvent(socket, 'joined');
  socket.on('connect', () => socket.emit('create', { name }));
  const { code } = await joinedP;
  return { socket, code };
}

beforeAll(async () => {
  child = spawn('node', ['--import', 'tsx', SERVER], {
    env: { ...process.env, PORT: String(PORT), ROOMS_FILE },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server ไม่ boot ใน 10 วิ')), 10_000);
    child.stdout!.on('data', (buf) => {
      if (buf.toString().includes('พร้อมเล่นแล้ว')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('exit', (code) => reject(new Error(`server ออกก่อนพร้อม (code ${code})`)));
  });
}, 15_000);

afterAll(() => {
  for (const s of sockets) s.disconnect();
  child?.kill('SIGKILL');
  try {
    fs.rmSync(ROOMS_FILE, { force: true });
  } catch {
    // ignore
  }
});

describe('integration: สลับห้องบน socket เดิม + join ห้องที่ไม่มี', () => {
  it('สลับไปห้องอื่น → ที่นั่งเดิมถูกถอด ไม่เหลือ phantom ในห้องเก่า', async () => {
    // Room A: Alice (host) + Obs
    const { socket: socketA, code: codeA } = await createRoom('Alice');
    const socketObs = connect();
    await waitEvent(socketObs, 'connect');
    socketObs.emit('join', { code: codeA, name: 'Obs' });
    await waitState(socketObs, (s) => s.code === codeA && s.players.length === 2);

    // Room B: Bob (host)
    const { code: codeB } = await createRoom('Bob');

    // register both listeners BEFORE the switch: the server broadcasts A's update to Obs
    // synchronously inside the join handler, so a listener attached after the emit would miss it
    const inBP = waitState(
      socketA,
      (s) => s.code === codeB && s.players.some((p: any) => p.name === 'Alice'),
    );
    const aAfterP = waitState(socketObs, (s) => s.code === codeA && s.players.length === 1);

    // Alice (still in A) joins room B on the SAME socket → must leave A behind
    socketA.emit('join', { code: codeB, name: 'Alice' });

    // Alice is now seated in B (not a spectator; B was in lobby)
    const inB = await inBP;
    expect(inB.youAreSpectator).toBe(false);
    expect(inB.players.map((p: any) => p.name).sort()).toEqual(['Alice', 'Bob']);

    // room A must have dropped Alice's seat entirely (lobby) → only Obs remains, no orphan/phantom
    const aAfter = await aAfterP;
    expect(aAfter.players[0].name).toBe('Obs');
  }, 20_000);

  it('join ห้องที่ไม่มีอยู่ → errorMsg แนบ code ที่ล้มเหลว (ไม่กระทบห้องอื่น)', async () => {
    const socketC = connect();
    await waitEvent(socketC, 'connect');
    const errP = waitEvent(socketC, 'errorMsg');
    socketC.emit('join', { code: 'ZZZZ', name: 'Zed' });
    const err = await errP;
    expect(err.key).toBe('err.roomNotFound');
    expect(err.vars?.code).toBe('ZZZZ');
  }, 15_000);
});
