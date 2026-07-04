#!/usr/bin/env node
// loadtest.mjs — a standalone Socket.IO load generator for the Slave card game
// เครื่องมือยิงโหลด (load test) แบบสแตนด์อโลนสำหรับเกมไพ่สลาฟ — ใช้ socket.io-client ที่ติดตั้งอยู่แล้ว
//
// It spins up many real WebSocket clients: one client per room emits 'create', the rest 'join';
// the host tops the room up with bots (if needed) and 'start's the game. Every client then reacts to
// 'state' and, when it is its turn, plays the lowest legal single (or 'pass'es) for a bounded number
// of actions. At the end it prints a summary and exits non-zero if the error rate is high.
//
// สร้างไคลเอนต์ WebSocket จริงจำนวนมาก: ห้องละ 1 ตัว 'create' ที่เหลือ 'join' — โฮสต์เติมบอท (ถ้าจำเป็น)
// แล้ว 'start' จากนั้นทุกตัวฟัง 'state' พอถึงตาก็ลงไพ่เดี่ยวใบต่ำสุดที่ถูกกติกา (ไม่ได้ก็ 'pass') ตามจำนวนแอ็กชันจำกัด
// จบแล้วพิมพ์สรุป + exit ด้วยโค้ด != 0 ถ้าอัตราความผิดพลาดสูง
//
// Usage / วิธีใช้:
//   ROOMS=20 PER=4 node scripts/loadtest.mjs http://localhost:3000
//   (URL ส่งเป็น argv[2] หรือ env TARGET ก็ได้; ค่าปริยาย http://localhost:3000)
//
// Knobs / ปุ่มปรับ (env หรือ argv):
//   TARGET / argv[2]  ปลายทาง (default http://localhost:3000)
//   ROOMS             จำนวนห้อง (default 20)
//   PER               ไคลเอนต์จริงต่อห้อง (default 4)
//   ACTIONS           จำนวนแอ็กชันสูงสุดต่อไคลเอนต์ก่อนหยุดเล่น (default 40)
//   DURATION_MS       เพดานเวลารวมแบบฮาร์ด (default 30000) — กันค้าง
//   ERROR_RATE_MAX    เพดานอัตราพัง (fail/connections) ที่ยังถือว่าผ่าน (default 0.05)
//   CONNECT_TIMEOUT   ไทม์เอาต์ตอนเปิดซ็อกเก็ต (default 8000)

import { io } from 'socket.io-client';

// ----- knobs / อ่านค่าปรับจาก argv + env -----
const TARGET = process.argv[2] || process.env.TARGET || 'http://localhost:3000';
const ROOMS = int(process.env.ROOMS, 20);
const PER = Math.max(1, int(process.env.PER, 4));
const ACTIONS = int(process.env.ACTIONS, 40);
const DURATION_MS = int(process.env.DURATION_MS, 30_000);
const ERROR_RATE_MAX = num(process.env.ERROR_RATE_MAX, 0.05);
const CONNECT_TIMEOUT = int(process.env.CONNECT_TIMEOUT, 8_000);

function int(v, d) {
  const n = parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : d;
}
function num(v, d) {
  const n = parseFloat(v ?? '');
  return Number.isFinite(n) ? n : d;
}

// unique tag so repeated runs never collide on player names / เติมแท็กกันชื่อชนกันเวลารันซ้ำ
const RUN = Date.now().toString(36).slice(-4);

// ----- metrics / ตัวนับ -----
const m = {
  wantConnections: ROOMS * PER,
  connected: 0,
  connectFail: 0, // connect_error / timeout while opening the socket
  connectTimes: [], // ms from socket construction → 'connect'
  joined: 0, // 'joined' acks from create/join
  stateMsgs: 0, // 'state' snapshots received
  errorMsgs: 0, // 'errorMsg' events (mostly benign: illegal move → we pass next state)
  actions: 0, // play/pass/give we emitted
};

const sockets = [];
let startedAt = 0;

// ----- card helpers / ตัวช่วยฝั่งไพ่ -----
// value the server uses to compare cards = r*4 + s (see shared/rules.ts)
// ค่าของไพ่ที่เซิร์ฟเวอร์ใช้เทียบ = r*4 + s
function cardValue(c) {
  return c.r * 4 + c.s;
}

// Decide a (best-effort legal) move from the current state view.
// Returns { play:[id] } | { give:[id...] } | { pass:true } | null (nothing to do this state).
// ตัดสินใจการเล่นที่ (พยายาม) ถูกกติกาจาก state ปัจจุบัน
function decide(state) {
  // exchange phase: a winner who still must return cards → give the lowest ones
  // เฟสแลกไพ่: ผู้ชนะที่ยังต้องคืนไพ่ → คืนใบต่ำสุดตามจำนวนที่ต้อง (กันเกมค้างเฟสแลก)
  if (state.phase === 'exchange') {
    const ex = state.exchange;
    if (ex && ex.role === 'winner' && !ex.myDone && ex.myCount > 0) {
      const hand = [...(state.hand || [])].sort((a, b) => cardValue(a) - cardValue(b));
      if (hand.length >= ex.myCount) return { give: hand.slice(0, ex.myCount).map((c) => c.id) };
    }
    return null;
  }

  if (state.phase !== 'playing') return null;
  // not our turn / ยังไม่ถึงตาเรา
  if (state.youIndex < 0 || state.turn !== state.youIndex) return null;

  const hand = [...(state.hand || [])].sort((a, b) => cardValue(a) - cardValue(b));
  if (hand.length === 0) return null;
  const pile = state.pile;

  // leading (no pile): play the lowest single — in game 1 the starter's lowest is 3♣, satisfying the rule
  // เป็นคนนำ (ไม่มีกอง): ลงเดี่ยวใบต่ำสุด — เกมแรกใบต่ำสุดของคนเปิดคือ 3♣ พอดี ผ่านกติกา
  if (!pile) return { play: [hand[0].id] };

  // pile present: only try to beat a plain single; pairs/triples/etc → just pass (always legal)
  // มีกองอยู่: สู้เฉพาะ "เดี่ยว" — ถ้าเป็นคู่/ตอง/ฯลฯ ก็ผ่าน (ผ่านได้เสมอ ถูกกติกา)
  if (pile.type === 'single') {
    const beat = hand.find((c) => cardValue(c) > pile.value);
    if (beat) return { play: [beat.id] };
  }
  return { pass: true };
}

// ----- one socket + its play loop / หนึ่งซ็อกเก็ต + ลูปการเล่น -----
// onConnect(socket) fires after 'connect' (host emits 'create'; joiner emits 'join').
// onJoined(code, socket) fires on the server 'joined' ack.
function makeClient(name, { onConnect, onJoined }) {
  const t0 = performance.now();
  const socket = io(TARGET, {
    transports: ['websocket'], // skip polling→ws upgrade (see the LB stickiness note in docs/SCALING.md)
    reconnection: false,
    timeout: CONNECT_TIMEOUT,
    forceNew: true,
  });
  sockets.push(socket);

  let acted = 0;
  let idle = false; // hit the action cap → stop acting (still counts 'state' for the rate metric)

  socket.on('connect', () => {
    m.connected++;
    m.connectTimes.push(performance.now() - t0);
    onConnect?.(socket);
  });
  socket.on('connect_error', () => {
    m.connectFail++;
  });
  socket.on('joined', (payload) => {
    m.joined++;
    onJoined?.(payload?.code, socket);
  });
  socket.on('errorMsg', () => {
    m.errorMsgs++; // illegal move just means "retry on the next state" — nothing fatal
  });
  socket.on('state', (state) => {
    m.stateMsgs++;
    if (idle) return;
    const move = decide(state);
    if (!move) return;
    if (acted >= ACTIONS) {
      idle = true;
      return;
    }
    acted++;
    m.actions++;
    if (move.play) socket.emit('play', { cards: move.play });
    else if (move.give) socket.emit('give', { cards: move.give });
    else socket.emit('pass');
  });

  return socket;
}

// ----- orchestrate one room / จัดฉากหนึ่งห้อง -----
function spawnRoom(roomIdx) {
  let joinedReal = 0; // real clients that have received their 'joined' ack
  let host = null;

  const maybeStart = () => {
    if (!host || joinedReal < PER) return;
    // need >=2 players to start; if PER===1, top up with bots
    // ต้องมี ≥2 คนถึงเริ่มได้ — ถ้า PER=1 เติมบอทให้ครบ
    const botsNeeded = Math.max(0, 2 - PER);
    for (let b = 0; b < botsNeeded; b++) host.emit('addBot');
    host.emit('start');
  };

  // host first — it 'create's on connect; once we have the code, spawn the joiners
  // สร้างโฮสต์ก่อน พอได้รหัสห้องจาก 'joined' แล้วค่อยสร้างผู้เข้าร่วม
  host = makeClient(`L${RUN}-${roomIdx}-0`, {
    onConnect: (s) => s.emit('create', { name: `L${RUN}-${roomIdx}-0` }),
    onJoined: (code) => {
      joinedReal++;
      maybeStart();
      for (let seat = 1; seat < PER; seat++) {
        const name = `L${RUN}-${roomIdx}-${seat}`;
        makeClient(name, {
          onConnect: (s) => s.emit('join', { code, name }),
          onJoined: () => {
            joinedReal++;
            maybeStart();
          },
        });
      }
    },
  });
}

// ----- summary / สรุปผล -----
function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.floor((p / 100) * s.length));
  return s[i];
}

function summarize() {
  const wallSec = (performance.now() - startedAt) / 1000;
  const errorRate = m.wantConnections ? m.connectFail / m.wantConnections : 0;
  const stateRate = wallSec > 0 ? m.stateMsgs / wallSec : 0;

  console.log(
    [
      '',
      '───────────── load test summary / สรุปผลยิงโหลด ─────────────',
      `target                 ${TARGET}`,
      `rooms × per            ${ROOMS} × ${PER}  (want ${m.wantConnections} connections)`,
      `connections opened     ${m.connected}`,
      `join acks              ${m.joined}`,
      `connect fails/timeouts ${m.connectFail}`,
      `connect ms  p50 / p95  ${percentile(m.connectTimes, 50).toFixed(1)} / ${percentile(
        m.connectTimes,
        95,
      ).toFixed(1)}`,
      `state msgs (total)     ${m.stateMsgs}`,
      `state msgs / sec       ${stateRate.toFixed(1)}`,
      `actions emitted        ${m.actions}`,
      `server errorMsg        ${m.errorMsgs}  (benign: illegal move → pass next)`,
      `wall clock             ${wallSec.toFixed(2)}s`,
      `error rate             ${(errorRate * 100).toFixed(2)}%  (threshold ${(
        ERROR_RATE_MAX * 100
      ).toFixed(2)}%)`,
      '─────────────────────────────────────────────────────────────',
      '',
    ].join('\n'),
  );

  return errorRate <= ERROR_RATE_MAX && m.connected > 0;
}

function shutdown(exitCode) {
  for (const s of sockets) {
    try {
      s.close();
    } catch {
      // ignore / เมิน
    }
  }
  // give sockets a tick to close, then exit / ให้เวลาปิดซ็อกเก็ตนิดนึงแล้วออก
  setTimeout(() => process.exit(exitCode), 150);
}

// ----- main / เริ่มทำงาน -----
console.log(
  `🃏 loadtest → ${TARGET}  (rooms=${ROOMS} per=${PER} actions=${ACTIONS} cap=${DURATION_MS}ms)`,
);
startedAt = performance.now();

for (let r = 0; r < ROOMS; r++) {
  // tiny stagger so we don't open every socket in the exact same tick / ทยอยเปิดกันกระแทกทีเดียว
  setTimeout(() => spawnRoom(r), Math.floor((r / Math.max(1, ROOMS)) * 500));
}

// hard cap: always terminate, print the summary, exit / เพดานเวลาแบบฮาร์ด: จบเสมอ
setTimeout(() => {
  const ok = summarize();
  shutdown(ok ? 0 : 1);
}, DURATION_MS);
