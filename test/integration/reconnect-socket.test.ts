// Integration: real reconnection over live Socket.IO (the true PWA "dropped out of the room" path)
//  - Spawns the REAL server as a child process (like test/smoke/server.test.ts)
//  - Drives socket.io-client "devices" through create → join → start → drop → rejoin
// Core regression: rejoining by NAME mid-game must RECLAIM the same seat (no ghost/duplicate seat)
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fs from 'node:fs';
import { io as ioClient, type Socket } from 'socket.io-client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = join(__dirname, '..', '..', 'server', 'index.ts');
// unique port + rooms file so it never clashes with smoke (3199) / e2e (3100) / dev (4000)
const PORT = 3211;
const URL = `http://localhost:${PORT}`;
const ROOMS_FILE = join(__dirname, '..', '..', 'tmp', 'rooms.reconnect.json');

let child: ReturnType<typeof spawn>;
// keep track of every socket we open so afterAll can force-close them
const sockets: Socket[] = [];

function connect(): Socket {
  const s = ioClient(URL, { transports: ['websocket'], reconnection: false });
  sockets.push(s);
  return s;
}

// wait for the FIRST 'state' event that satisfies `pred` (a client can receive several)
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

// wait for a one-off event (e.g. 'joined') with a timeout
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

beforeAll(async () => {
  child = spawn('node', ['--import', 'tsx', SERVER], {
    env: {
      ...process.env,
      PORT: String(PORT),
      ROOMS_FILE,
    },
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

describe('integration: reconnection over live Socket.IO', () => {
  it('reclaim seat mid-game + preserve table + new name → spectator', async () => {
    // ----- Alice creates the room -----
    const socketA = connect();
    // attach the 'joined' listener FIRST, then emit 'create' once connected (emits buffer until then)
    const joinedP = waitEvent(socketA, 'joined');
    socketA.on('connect', () => socketA.emit('create', { name: 'Alice' }));
    const joined = await joinedP;
    const code: string = joined.code;
    expect(code).toMatch(/^[A-Z0-9]{4}$/);

    // ----- Bob joins -----
    const socketB = connect();
    await waitEvent(socketB, 'connect');
    socketB.emit('join', { code, name: 'Bob' });
    await waitEvent(socketB, 'joined');

    // wait until the room has both players in the lobby before starting
    await waitState(socketA, (s) => s.phase === 'lobby' && s.players.length === 2);

    // ----- Alice (host) starts the game -----
    socketA.emit('start');
    const playingA = await waitState(socketA, (s) => s.phase === 'playing');

    const aliceIndex = playingA.youIndex;
    const aliceHandLen = playingA.hand.length;
    const namesBefore = playingA.players.map((p: any) => p.name);
    expect(aliceIndex).toBeGreaterThanOrEqual(0);
    expect(aliceHandLen).toBeGreaterThan(0);
    expect(playingA.youAreSpectator).toBe(false);
    expect(playingA.players.length).toBe(2);

    // ----- Alice's device drops out of the room -----
    socketA.disconnect();

    // ----- Alice reconnects on a NEW device and rejoins by name -----
    const socketA2 = connect();
    await waitEvent(socketA2, 'connect');
    socketA2.emit('join', { code, name: 'Alice' });

    // Scenario 1: the reclaimed state must be the SAME seat, mid-game, no duplicate
    const reclaimed = await waitState(socketA2, (s) => s.phase === 'playing' && s.youIndex >= 0);
    expect(reclaimed.youAreSpectator).toBe(false);
    expect(reclaimed.youIndex).toBe(aliceIndex);
    expect(reclaimed.hand.length).toBe(aliceHandLen);
    expect(reclaimed.phase).toBe('playing');
    // the core regression assertion: NO ghost/duplicate seat was created
    expect(reclaimed.players.length).toBe(2);

    // Scenario 2: the table (turn + player roster) is preserved across the reconnect
    expect(reclaimed.players.map((p: any) => p.name)).toEqual(namesBefore);
    expect(reclaimed.turn).toBe(playingA.turn);
    expect(reclaimed.phase).toBe('playing');

    // Scenario 3: a NEW name joining mid-game becomes a spectator
    const socketC = connect();
    await waitEvent(socketC, 'connect');
    socketC.emit('join', { code, name: 'Carol' });
    const carol = await waitState(socketC, (s) => s.phase === 'playing');
    expect(carol.youAreSpectator).toBe(true);
    expect(carol.youIndex).toBe(-1);
    // Carol is a spectator, not a seated player → still only 2 seats
    expect(carol.players.length).toBe(2);
  }, 20_000);
});
