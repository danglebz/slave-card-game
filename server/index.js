// index.js — เว็บเซิร์ฟเวอร์ + WebSocket สำหรับเกมไพ่สลาฟ
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { networkInterfaces } from 'node:os';
import fs from 'node:fs';
import { Room } from './room.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const SAVE_PATH = join(__dirname, '..', 'rooms.json');
const CLIENT_DIR = join(__dirname, '..', 'dist'); // client ที่ build จาก Vite

const app = express();
// ปิด cache ของไฟล์ static (html/css/js) เพื่อให้ทุกเครื่องได้เวอร์ชันล่าสุดเสมอ
// ป้องกันปัญหา "บางคนเห็นการ์ดเพี้ยน" เพราะเบราว์เซอร์ cache ไฟล์เก่าไว้
app.use(express.static(CLIENT_DIR, {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
  },
}));

const server = createServer(app);
const io = new Server(server);

/** @type {Map<string, Room>} */
const rooms = new Map();

// ----- เซฟ/โหลดสถานะห้องลงไฟล์ (กัน server restart แล้วเกมหาย) -----
let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveRooms, 400); // debounce กันเขียนถี่เกิน
}
function saveRooms() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    const data = { rooms: [...rooms.values()].map((r) => r.toState()) };
    fs.writeFileSync(SAVE_PATH, JSON.stringify(data));
  } catch (e) {
    console.error('เซฟห้องไม่สำเร็จ:', e.message);
  }
}
function loadRooms() {
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
    if (rooms.size) console.log(`↩️  โหลดห้องที่ค้างไว้ ${rooms.size} ห้อง`);
  } catch (e) {
    console.error('โหลดห้องไม่สำเร็จ:', e.message);
  }
}

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

// ----- ตัวจับเวลาต่อตา (auto-pass / auto-play เมื่อหมดเวลา) -----
function clearTurnTimer(room) {
  clearTimeout(room._turnTimer);
  room._turnTimer = null;
  room.turnDeadline = null;
  room._turnSig = null;
}
// ตั้ง/รี-เซ็ตเวลาต่อตา — รีเซ็ตเฉพาะตอน "ตาเปลี่ยนจริง" (กัน reconnect มากวนเวลา)
function humansOnline(room) {
  return room.players.some((p) => p.connected && !p.isBot);
}

function armTurnTimer(room) {
  const anyOnline = humansOnline(room); // มีคนจริงออนไลน์ไหม (บอทไม่นับ)
  const timerOn = room.settings?.timer !== false; // หัวห้องปิด timer ได้
  // เดินเวลาเฉพาะตอนเล่นจริง + มีคนออนไลน์ + เปิด timer
  const sig = room.phase === 'playing' && anyOnline && timerOn ? `${room.turn}:${room.pileOwner}` : null;
  if (sig === null) { clearTurnTimer(room); return; }
  if (sig === room._turnSig) return; // ตาเดิม → เดินเวลาต่อ (ไม่รีเซ็ต)
  clearTimeout(room._turnTimer);
  room._turnTimer = null;
  room._turnSig = sig;
  const ms = room.turnMs(); // เวลาต่อตาตามตั้งค่าห้อง
  room.turnDeadline = Date.now() + ms;
  // ตั้ง auto-act เฉพาะตอนเปิด auto-pass; ถ้าปิด = โชว์ countdown เฉยๆ ไม่บังคับ
  if (room.settings?.autoPass !== false) {
    room._turnTimer = setTimeout(() => onTurnTimeout(room.code), ms);
  }
}
function onTurnTimeout(code) {
  const room = rooms.get(code);
  if (!room || room.phase !== 'playing') return;
  try { room.autoAct(); } catch (e) { console.error('auto-act:', e.message); }
  broadcast(room); // จะ arm รอบใหม่ให้เอง
}

// ----- ให้บอทเดิน (ตอนถึงตาบอท / บอทต้องเลือกไพ่แลก) -----
function clearBotTimer(room) {
  clearTimeout(room._botTimer);
  room._botTimer = null;
}
function scheduleBot(room) {
  clearBotTimer(room);
  if (!humansOnline(room)) return; // ไม่มีคนจริงดูอยู่ → ไม่ต้องเดินบอท
  let act = null;
  if (room.phase === 'playing' && room.players[room.turn]?.isBot) {
    act = () => room.botAct();
  } else if (room.phase === 'exchange' && room.giveTasks) {
    const pending = Object.keys(room.giveTasks).find(
      (i) => !room.giveTasks[i].cards && room.players[+i]?.isBot,
    );
    if (pending != null) act = () => room.botGive(+pending);
  }
  if (!act) return;
  const base = Number(process.env.BOT_MS) || 600;
  room._botTimer = setTimeout(() => {
    const r = rooms.get(room.code);
    if (!r) return;
    try { act(); } catch (e) { console.error('bot:', e.message); }
    broadcast(r); // เดินคนถัดไป (อาจเป็นบอทอีกตัว) ต่อเอง
  }, base + Math.floor(Math.random() * 500)); // หน่วงให้ดูเป็นธรรมชาติ
}

function broadcast(room) {
  armTurnTimer(room); // ตั้งเวลาก่อนส่ง state เพื่อให้ client ได้ turnRemainingMs ที่ถูกต้อง
  scheduleBot(room);  // ถ้าถึงตาบอท ตั้งเวลาให้บอทเดิน
  for (const p of room.players) {
    if (p.connected && !p.isBot) io.to(p.id).emit('state', room.stateFor(p.id));
  }
  scheduleSave(); // สถานะเปลี่ยน → เซฟ
}

io.on('connection', (socket) => {
  let joinedCode = null;

  const err = (msg) => socket.emit('errorMsg', msg);

  socket.on('create', ({ name }) => {
    try {
      name = (name || '').trim();
      if (!name) return err('กรุณาใส่ชื่อ');
      const code = makeCode();
      const room = new Room(code);
      rooms.set(code, room);
      room.addPlayer(socket.id, name);
      joinedCode = code;
      socket.join(code);
      socket.emit('joined', { code });
      broadcast(room);
    } catch (e) {
      err(e.message);
    }
  });

  socket.on('join', ({ code, name }) => {
    try {
      code = (code || '').trim().toUpperCase();
      name = (name || '').trim();
      if (!name) return err('กรุณาใส่ชื่อ');
      const room = rooms.get(code);
      if (!room) return err('ไม่พบห้องนี้ (เช็กรหัสห้องอีกที)');
      room.addPlayer(socket.id, name);
      clearTimeout(room._cleanupTimer); // ยกเลิกการลบห้อง (มีคนกลับเข้ามาแล้ว)
      joinedCode = code;
      socket.join(code);
      socket.emit('joined', { code });
      broadcast(room);
    } catch (e) {
      err(e.message);
    }
  });

  const withRoom = (fn) => {
    const room = rooms.get(joinedCode);
    if (!room) return err('คุณยังไม่ได้อยู่ในห้อง');
    try {
      fn(room);
      broadcast(room);
    } catch (e) {
      err(e.message);
    }
  };

  socket.on('start', () => withRoom((room) => {
    if (room.hostId !== socket.id) throw new Error('เฉพาะหัวห้องเริ่มเกมได้');
    room.start();
  }));

  // ตั้งค่าห้อง (timer / auto-pass) — เฉพาะหัวห้อง
  socket.on('settings', (patch) => withRoom((room) => {
    if (room.hostId !== socket.id) throw new Error('เฉพาะหัวห้องปรับตั้งค่าได้');
    room.setSettings(patch || {});
    room._turnSig = null; // ให้ armTurnTimer ตั้งเวลาใหม่ตามค่าที่เพิ่งเปลี่ยน
  }));

  // เพิ่ม/ลบบอท — เฉพาะหัวห้อง (ในล็อบบี้)
  socket.on('addBot', () => withRoom((room) => {
    if (room.hostId !== socket.id) throw new Error('เฉพาะหัวห้องเพิ่มบอทได้');
    room.addBot();
  }));
  socket.on('removeBot', () => withRoom((room) => {
    if (room.hostId !== socket.id) throw new Error('เฉพาะหัวห้องลบบอทได้');
    room.removeBot();
  }));

  socket.on('play', ({ cards }) => withRoom((room) => {
    room.play(socket.id, Array.isArray(cards) ? cards : []);
  }));

  socket.on('pass', () => withRoom((room) => room.pass(socket.id)));

  socket.on('give', ({ cards }) => withRoom((room) => {
    room.giveCards(socket.id, Array.isArray(cards) ? cards : []);
  }));

  socket.on('again', () => withRoom((room) => {
    if (room.hostId !== socket.id) throw new Error('เฉพาะหัวห้องเริ่มรอบใหม่ได้');
    room.resetToLobby();
    room.start();
  }));

  // ออกจากห้องโดยตั้งใจ (กดปุ่ม) — ลบที่นั่งถ้าอยู่ล็อบบี้, พักที่นั่ง(ออฟไลน์)ถ้ากำลังเล่น
  socket.on('leave', () => {
    const room = rooms.get(joinedCode);
    socket.emit('left'); // ให้ client กลับหน้าล็อบบี้เสมอ
    if (!room) return;
    const code = joinedCode;
    joinedCode = null;
    socket.leave(code);
    room.removePlayer(socket.id);
    if (room.players.length === 0 || room.isEmpty()) {
      clearTurnTimer(room); clearBotTimer(room); // ห้องว่าง → หยุดนาฬิกา + บอท
      clearTimeout(room._cleanupTimer);
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
    const room = rooms.get(joinedCode);
    if (!room) return;
    room.removePlayer(socket.id);
    if (room.players.length === 0 || room.isEmpty()) {
      // ห้องว่าง (รวมกรณีรีเฟรช) → รอ grace period เผื่อ reconnect ก่อนค่อยลบ
      const code = joinedCode;
      clearTurnTimer(room); clearBotTimer(room); // ห้องว่าง → หยุดนาฬิกา + บอท
      clearTimeout(room._cleanupTimer);
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

function lanAddresses() {
  const out = [];
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const i of ifaces || []) {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    }
  }
  return out;
}

loadRooms(); // โหลดห้องที่ค้างไว้ก่อนเปิดรับ connection

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n🃏  เกมไพ่สลาฟ พร้อมเล่นแล้ว!\n');
  console.log(`   เครื่องนี้:   http://localhost:${PORT}`);
  for (const ip of lanAddresses()) {
    console.log(`   ในออฟฟิศ:   http://${ip}:${PORT}   ← ส่งลิงก์นี้ให้เพื่อน`);
  }
  console.log('');
});

// เซฟทันทีตอนปิด server (Ctrl+C / kill / nodemon restart) เพื่อเก็บสถานะล่าสุด
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  saveRooms();
  process.exit(0);
}
['SIGINT', 'SIGTERM', 'SIGUSR2'].forEach((sig) => process.on(sig, shutdown));
