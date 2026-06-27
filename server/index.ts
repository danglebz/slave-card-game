// index.ts — เว็บเซิร์ฟเวอร์ + WebSocket สำหรับเกมส์ไพ่สลาฟ
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { networkInterfaces } from 'node:os';
import fs from 'node:fs';
import { Room } from './room';
import { anyLegalMove } from './game';
import { createSocketLimiter } from './ratelimit';
import { initSentry, logger, captureError, metrics, snapshot } from './observability';
import * as v from 'valibot';
import {
  CreateSchema,
  JoinSchema,
  SettingsPatchSchema,
  SetColorSchema,
  PlaySchema,
  GiveSchema,
} from '../shared/schemas';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const SAVE_PATH = process.env.ROOMS_FILE || join(__dirname, '..', 'rooms.json');
const CLIENT_DIR = join(__dirname, '..', 'dist'); // client ที่ build จาก Vite

const fastify = Fastify({ logger: false });

// ปิด cache ของไฟล์ static (html/css/js) เพื่อให้ทุกเครื่องได้เวอร์ชันล่าสุดเสมอ
// ป้องกันปัญหา "บางคนเห็นการ์ดเพี้ยน" เพราะเบราว์เซอร์ cache ไฟล์เก่าไว้
await fastify.register(fastifyStatic, {
  root: CLIENT_DIR,
  index: ['index.html'],
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
  },
});

const io = new Server<ClientToServerEvents, ServerToClientEvents>(fastify.server);

const rooms = new Map<string, Room>();

// ----- health check + metrics (ดูจำนวนห้อง/ผู้เล่น) -----
fastify.get('/healthz', async () => ({ ok: true, uptimeSec: snapshot(rooms).uptimeSec }));
fastify.get<{ Querystring: { token?: string } }>('/metrics', async (req, reply) => {
  // กันคนนอกถ้าตั้ง METRICS_TOKEN ไว้ (ไม่ตั้ง = เปิดอ่านได้ — มีแค่ตัวเลขรวม ไม่มีข้อมูลส่วนตัว)
  const token = process.env.METRICS_TOKEN;
  if (token && req.query.token !== token) {
    reply.code(403);
    return { error: 'forbidden' };
  }
  return snapshot(rooms);
});

// ----- เซฟ/โหลดสถานะห้องลงไฟล์ (กัน server restart แล้วเกมหาย) -----
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveRooms, 400); // debounce กันเขียนถี่เกิน
}
function saveRooms(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  try {
    const data = { rooms: [...rooms.values()].map((r) => r.toState()) };
    fs.writeFileSync(SAVE_PATH, JSON.stringify(data));
  } catch (e) {
    captureError(e, { where: 'saveRooms' });
  }
}
function loadRooms(): void {
  try {
    if (!fs.existsSync(SAVE_PATH)) return;
    const data = JSON.parse(fs.readFileSync(SAVE_PATH, 'utf8'));
    for (const rs of data.rooms || []) {
      const room = Room.fromState(rs);
      rooms.set(room.code, room);
      // ทุกคนออฟไลน์ตอนโหลด → ตั้งเวลาเก็บกวาดถ้าไม่มีใคร reconnect ใน 10 นาที
      room._cleanupTimer = setTimeout(() => {
        if (rooms.get(room.code)?.isEmpty()) rooms.delete(room.code);
      }, 600000);
    }
    if (rooms.size) logger.info(`↩️  โหลดห้องที่ค้างไว้ ${rooms.size} ห้อง`);
  } catch (e) {
    captureError(e, { where: 'loadRooms' });
  }
}

function makeCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code: string;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join(
      '',
    );
  } while (rooms.has(code));
  return code;
}

// ----- ตัวจับเวลาต่อตา (auto-pass / auto-play เมื่อหมดเวลา) -----
function clearTurnTimer(room: Room): void {
  if (room._turnTimer) clearTimeout(room._turnTimer);
  room._turnTimer = null;
  room.turnDeadline = null;
  room._turnSig = null;
}
// ตั้ง/รี-เซ็ตเวลาต่อตา — รีเซ็ตเฉพาะตอน "ตาเปลี่ยนจริง" (กัน reconnect มากวนเวลา)
function humansOnline(room: Room): boolean {
  return room.players.some((p) => p.connected && !p.isBot);
}

function armTurnTimer(room: Room): void {
  const anyOnline = humansOnline(room); // มีคนจริงออนไลน์ไหม (บอทไม่นับ)
  const timerOn = room.settings?.timer !== false; // หัวห้องปิด timer ได้
  // เดินเวลาเฉพาะตอนเล่นจริง + มีคนออนไลน์ + เปิด timer
  const sig =
    room.phase === 'playing' && anyOnline && timerOn ? `${room.turn}:${room.pileOwner}` : null;
  if (sig === null) {
    clearTurnTimer(room);
    return;
  }
  if (sig === room._turnSig) return; // ตาเดิม → เดินเวลาต่อ (ไม่รีเซ็ต)
  if (room._turnTimer) clearTimeout(room._turnTimer);
  room._turnTimer = null;
  room._turnSig = sig;
  const ms = room.turnMs(); // เวลาต่อตาตามตั้งค่าห้อง
  room.turnDeadline = Date.now() + ms;
  // ตั้ง auto-act เฉพาะตอนเปิด auto-pass; ถ้าปิด = โชว์ countdown เฉยๆ ไม่บังคับ
  if (room.settings?.autoPass !== false) {
    room._turnTimer = setTimeout(() => onTurnTimeout(room.code), ms);
  }
}
function onTurnTimeout(code: string): void {
  const room = rooms.get(code);
  if (!room || room.phase !== 'playing') return;
  try {
    room.autoAct();
  } catch (e) {
    captureError(e, { where: 'autoAct', code });
  }
  broadcast(room); // จะ arm รอบใหม่ให้เอง
}

// ----- ให้บอทเดิน (ตอนถึงตาบอท / บอทต้องเลือกไพ่แลก) -----
function clearBotTimer(room: Room): void {
  if (room._botTimer) clearTimeout(room._botTimer);
  room._botTimer = null;
}
function scheduleBot(room: Room): void {
  clearBotTimer(room);
  if (!humansOnline(room)) return; // ไม่มีคนจริงดูอยู่ → ไม่ต้องเดินบอท
  let act: (() => void) | null = null;
  if (room.phase === 'playing' && room.players[room.turn]?.isBot) {
    act = () => room.botAct();
  } else if (room.phase === 'exchange' && room.giveTasks) {
    const pending = Object.keys(room.giveTasks).find(
      (i) => !room.giveTasks![+i].cards && room.players[+i]?.isBot,
    );
    if (pending != null) act = () => room.botGive(+pending);
  }
  if (!act) return;
  const base = Number(process.env.BOT_MS) || 600;
  const doAct = act;
  room._botTimer = setTimeout(
    () => {
      const r = rooms.get(room.code);
      if (!r) return;
      try {
        doAct();
      } catch (e) {
        captureError(e, { where: 'botAct', code: room.code });
      }
      broadcast(r); // เดินคนถัดไป (อาจเป็นบอทอีกตัว) ต่อเอง
    },
    base + Math.floor(Math.random() * 500),
  ); // หน่วงให้ดูเป็นธรรมชาติ
}

// ----- ผ่านอัตโนมัติเมื่อ "ลงอะไรไม่ได้เลย" -----
// ถึงตาคนจริง + มีกองอยู่ + ไม่มีชุดใดในมือชนะกองได้ → ยังไงก็ต้องผ่าน เลยผ่านให้อัตโนมัติ
// (หน่วงสั้น ๆ ให้ผู้เล่นเห็นกองก่อน) — ทำเสมอ ไม่ผูกกับตั้งค่า timer/autoPass
const STUCK_MS = Number(process.env.STUCK_MS) || 1200;
function clearStuckTimer(room: Room): void {
  if (room._stuckTimer) clearTimeout(room._stuckTimer);
  room._stuckTimer = null;
}
function stuckHere(room: Room): boolean {
  if (room.settings?.autoPassStuck === false) return false; // หัวห้องปิดฟีเจอร์นี้
  if (room.phase !== 'playing' || !room.pile) return false;
  const cur = room.players[room.turn];
  if (!cur || cur.isBot || cur.finished || !cur.connected) return false;
  return !anyLegalMove(cur.hand, room.pile); // ไม่มีไพ่ลงได้ = ติด
}
function scheduleStuckPass(room: Room): void {
  clearStuckTimer(room);
  if (!humansOnline(room) || !stuckHere(room)) return;
  const turnAt = room.turn;
  room._stuckTimer = setTimeout(() => {
    const r = rooms.get(room.code);
    if (!r || r.turn !== turnAt || !stuckHere(r)) return; // ตาเปลี่ยน/เล่นได้แล้ว → ยกเลิก
    try {
      r._pass(r.turn, true, 'ไม่มีไพ่ลงได้');
    } catch (e) {
      captureError(e, { where: 'stuckPass', code: r.code });
    }
    broadcast(r);
  }, STUCK_MS);
}

function broadcast(room: Room): void {
  armTurnTimer(room); // ตั้งเวลาก่อนส่ง state เพื่อให้ client ได้ turnRemainingMs ที่ถูกต้อง
  scheduleBot(room); // ถ้าถึงตาบอท ตั้งเวลาให้บอทเดิน
  scheduleStuckPass(room); // ถ้าถึงตาคนจริงแต่ลงอะไรไม่ได้ ผ่านให้อัตโนมัติ
  for (const p of room.players) {
    if (p.connected && !p.isBot) io.to(p.id).emit('state', room.stateFor(p.id));
  }
  for (const s of room.spectators) io.to(s.id).emit('state', room.stateFor(s.id)); // ผู้ชม
  scheduleSave(); // สถานะเปลี่ยน → เซฟ
}

io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
  let joinedCode: string | null = null;

  // ----- กันสแปม: token bucket ต่อ socket (เกินลิมิต = ตัด event ทิ้ง) -----
  metrics.connections++;
  metrics.peakConcurrent = Math.max(metrics.peakConcurrent, io.engine.clientsCount);
  const allow = createSocketLimiter();
  socket.use(([event], next) => {
    if (!allow(event)) {
      metrics.rateLimited++;
      socket.emit('errorMsg', 'คุณส่งคำสั่งถี่เกินไป รอสักครู่');
      return; // ไม่เรียก next() → ไม่รัน handler
    }
    next();
  });

  const err = (msg: string) => socket.emit('errorMsg', msg);

  // validate payload จาก client → คืนค่าที่ผ่าน schema, หรือ emit errorMsg + null ถ้าไม่ผ่าน
  const parse = <T>(schema: v.GenericSchema<unknown, T>, raw: unknown): T | null => {
    const r = v.safeParse(schema, raw);
    if (r.success) return r.output;
    err(r.issues[0].message);
    return null;
  };

  socket.on('create', (raw) => {
    const p = parse(CreateSchema, raw);
    if (!p) return;
    try {
      const code = makeCode();
      const room = new Room(code);
      rooms.set(code, room);
      room.addPlayer(socket.id, p.name);
      room.setColor(socket.id, p.color);
      joinedCode = code;
      socket.join(code);
      socket.emit('joined', { code });
      metrics.roomsCreated++;
      logger.info(`สร้างห้อง ${code} โดย "${p.name}"`, { rooms: rooms.size });
      broadcast(room);
    } catch (e) {
      err((e as Error).message);
    }
  });

  socket.on('join', (raw) => {
    const p = parse(JoinSchema, raw);
    if (!p) return;
    const { code, name, color } = p;
    try {
      const room = rooms.get(code);
      if (!room) return err('ไม่พบห้องนี้ (เช็กรหัสห้องอีกที)');
      room.addPlayer(socket.id, name);
      room.setColor(socket.id, color);
      if (room._cleanupTimer) clearTimeout(room._cleanupTimer); // ยกเลิกการลบห้อง (มีคนกลับเข้ามาแล้ว)
      joinedCode = code;
      socket.join(code);
      socket.emit('joined', { code });
      broadcast(room);
    } catch (e) {
      err((e as Error).message);
    }
  });

  const withRoom = (fn: (room: Room) => void) => {
    const room = joinedCode ? rooms.get(joinedCode) : undefined;
    if (!room) return err('คุณยังไม่ได้อยู่ในห้อง');
    try {
      fn(room);
      broadcast(room);
    } catch (e) {
      err((e as Error).message);
    }
  };

  socket.on('start', () =>
    withRoom((room) => {
      if (room.hostId !== socket.id) throw new Error('เฉพาะหัวห้องเริ่มเกมได้');
      room.start();
      metrics.gamesStarted++;
      logger.info(`เริ่มเกมห้อง ${room.code} (${room.players.length} คน)`);
    }),
  );

  // ตั้งค่าห้อง (timer / auto-pass) — เฉพาะหัวห้อง
  socket.on('settings', (raw) => {
    const patch = parse(SettingsPatchSchema, raw);
    if (!patch) return;
    withRoom((room) => {
      if (room.hostId !== socket.id) throw new Error('เฉพาะหัวห้องปรับตั้งค่าได้');
      room.setSettings(patch);
      room._turnSig = null; // ให้ armTurnTimer ตั้งเวลาใหม่ตามค่าที่เพิ่งเปลี่ยน
    });
  });

  // เพิ่ม/ลบบอท — เฉพาะหัวห้อง (ในล็อบบี้)
  socket.on('addBot', () =>
    withRoom((room) => {
      if (room.hostId !== socket.id) throw new Error('เฉพาะหัวห้องเพิ่มบอทได้');
      room.addBot();
    }),
  );
  socket.on('removeBot', () =>
    withRoom((room) => {
      if (room.hostId !== socket.id) throw new Error('เฉพาะหัวห้องลบบอทได้');
      room.removeBot();
    }),
  );
  socket.on('shuffleSeats', () =>
    withRoom((room) => {
      if (room.hostId !== socket.id) throw new Error('เฉพาะหัวห้องสลับที่นั่งได้');
      room.shuffleSeats();
    }),
  );
  // สีประจำตัว — ตั้งของตัวเองได้ทุกเมื่อ
  socket.on('setColor', (raw) => {
    const p = parse(SetColorSchema, raw);
    if (!p) return;
    withRoom((room) => room.setColor(socket.id, p.color));
  });

  socket.on('play', (raw) => {
    const p = parse(PlaySchema, raw);
    if (!p) return;
    withRoom((room) => room.play(socket.id, p.cards));
  });

  socket.on('pass', () => withRoom((room) => room.pass(socket.id)));

  socket.on('give', (raw) => {
    const p = parse(GiveSchema, raw);
    if (!p) return;
    withRoom((room) => room.giveCards(socket.id, p.cards));
  });

  socket.on('again', () =>
    withRoom((room) => {
      if (room.hostId !== socket.id) throw new Error('เฉพาะหัวห้องเริ่มรอบใหม่ได้');
      room.resetToLobby();
      room.start();
    }),
  );

  // ออกจากห้องโดยตั้งใจ (กดปุ่ม) — ลบที่นั่งถ้าอยู่ล็อบบี้, พักที่นั่ง(ออฟไลน์)ถ้ากำลังเล่น
  socket.on('leave', () => {
    const room = joinedCode ? rooms.get(joinedCode) : undefined;
    socket.emit('left'); // ให้ client กลับหน้าล็อบบี้เสมอ
    if (!room) return;
    const code = joinedCode!;
    joinedCode = null;
    socket.leave(code);
    room.removeSpectator(socket.id); // เผื่อเป็นผู้ชม
    room.removePlayer(socket.id);
    if (room.players.length === 0 || room.isEmpty()) {
      clearTurnTimer(room);
      clearBotTimer(room); // ห้องว่าง → หยุดนาฬิกา + บอท
      clearStuckTimer(room);
      if (room._cleanupTimer) clearTimeout(room._cleanupTimer);
      room._cleanupTimer = setTimeout(() => {
        const r = rooms.get(code);
        if (r && (r.players.length === 0 || r.isEmpty())) {
          rooms.delete(code);
          saveRooms();
        }
      }, 60000);
      scheduleSave();
    } else {
      broadcast(room);
    }
  });

  socket.on('disconnect', () => {
    const room = joinedCode ? rooms.get(joinedCode) : undefined;
    if (!room) return;
    room.removeSpectator(socket.id); // เผื่อเป็นผู้ชม
    room.removePlayer(socket.id);
    if (room.players.length === 0 || room.isEmpty()) {
      // ห้องว่าง (รวมกรณีรีเฟรช) → รอ grace period เผื่อ reconnect ก่อนค่อยลบ
      const code = joinedCode!;
      clearTurnTimer(room);
      clearBotTimer(room); // ห้องว่าง → หยุดนาฬิกา + บอท
      clearStuckTimer(room);
      if (room._cleanupTimer) clearTimeout(room._cleanupTimer);
      room._cleanupTimer = setTimeout(() => {
        const r = rooms.get(code);
        if (r && (r.players.length === 0 || r.isEmpty())) {
          rooms.delete(code);
          saveRooms();
        }
      }, 60000);
      scheduleSave(); // บันทึกสถานะ connected=false
    } else {
      broadcast(room);
    }
  });
});

function lanAddresses(): string[] {
  const out: string[] = [];
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const i of ifaces || []) {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    }
  }
  return out;
}

await initSentry(); // เปิด error tracking ถ้าตั้ง SENTRY_DSN ไว้
loadRooms(); // โหลดห้องที่ค้างไว้ก่อนเปิดรับ connection

await fastify.ready(); // ให้ plugin/route ลงทะเบียน + สร้าง http server เรียบร้อยก่อน
await fastify.listen({ port: PORT, host: '0.0.0.0' });

console.log('\n🃏  เกมส์ไพ่สลาฟ พร้อมเล่นแล้ว!\n');
console.log(`   เครื่องนี้:   http://localhost:${PORT}`);
for (const ip of lanAddresses()) {
  console.log(`   ในออฟฟิศ:   http://${ip}:${PORT}   ← ส่งลิงก์นี้ให้เพื่อน`);
}
console.log(`   metrics:     http://localhost:${PORT}/metrics`);
console.log('');

// เซฟทันทีตอนปิด server (Ctrl+C / kill / nodemon restart) เพื่อเก็บสถานะล่าสุด
let shuttingDown = false;
function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  saveRooms();
  process.exit(0);
}
['SIGINT', 'SIGTERM', 'SIGUSR2'].forEach((sig) => process.on(sig, shutdown));
