// index.ts — web server + WebSocket for the Slave card game
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { networkInterfaces } from 'node:os';
import fs from 'node:fs';
import { Room } from './room';
import { anyLegalMove, disallowedComboTypes } from './game';
import { GameError, gerr } from './errors';
import { createSocketLimiter } from './ratelimit';
import { initSentry, logger, captureError, metrics, snapshot } from './observability';
import { pushEnabled, vapidPublicKey, saveSub, dropSub, dropRoom, notifyRoom } from './push';
import * as v from 'valibot';
import {
  CreateSchema,
  JoinSchema,
  SettingsPatchSchema,
  SetColorSchema,
  KickSchema,
  PlaySchema,
  GiveSchema,
  PushSubscribeSchema,
} from '../shared/schemas';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const SAVE_PATH = process.env.ROOMS_FILE || join(__dirname, '..', 'rooms.json');
// client built by Vite
const CLIENT_DIR = join(__dirname, '..', 'dist');

const fastify = Fastify({ logger: false });

// Disable caching of static files (html/css/js) so every machine always gets the latest version
// Prevents the "some people see garbled cards" issue caused by browsers caching old files
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

// ----- health check + metrics (view room/player counts) -----
fastify.get('/healthz', async () => ({ ok: true, uptimeSec: snapshot(rooms).uptimeSec }));
fastify.get<{ Querystring: { token?: string } }>('/metrics', async (req, reply) => {
  // Block outsiders if METRICS_TOKEN is set (unset = open to read — only aggregate numbers, no personal data)
  const token = process.env.METRICS_TOKEN;
  if (token && req.query.token !== token) {
    reply.code(403);
    return { error: 'forbidden' };
  }
  return snapshot(rooms);
});

// ----- Web Push: let the client fetch the VAPID public key to subscribe (404 if not enabled) -----
fastify.get('/push/vapidPublicKey', async (_req, reply) => {
  if (!pushEnabled) {
    reply.code(404);
    return { error: 'push-disabled' };
  }
  reply.header('Cache-Control', 'no-store');
  return { key: vapidPublicKey };
});

// ----- Save/load room state to a file (prevents losing games on server restart) -----
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  // debounce to avoid writing too frequently
  saveTimer = setTimeout(saveRooms, 400);
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
      // Everyone is offline on load → schedule cleanup if nobody reconnects within 10 minutes
      room._cleanupTimer = setTimeout(() => {
        if (rooms.get(room.code)?.isEmpty()) {
          rooms.delete(room.code);
          dropRoom(room.code);
        }
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

// ----- Per-turn timer (auto-pass / auto-play when time runs out) -----
function clearTurnTimer(room: Room): void {
  if (room._turnTimer) clearTimeout(room._turnTimer);
  room._turnTimer = null;
  room.turnDeadline = null;
  room._turnSig = null;
}
// Set/reset the per-turn timer — reset only when "the turn actually changes" (prevents reconnect from disturbing the timer)
function humansOnline(room: Room): boolean {
  return room.players.some((p) => p.connected && !p.isBot);
}

function armTurnTimer(room: Room): void {
  // is any real person online (bots don't count)
  const anyOnline = humansOnline(room);
  // host can turn the timer off
  const timerOn = room.settings?.timer !== false;
  // Run the timer only during real play + someone online + timer enabled
  const sig =
    room.phase === 'playing' && anyOnline && timerOn ? `${room.turn}:${room.pileOwner}` : null;
  if (sig === null) {
    clearTurnTimer(room);
    return;
  }
  // same turn → keep the timer running (no reset)
  if (sig === room._turnSig) return;
  if (room._turnTimer) clearTimeout(room._turnTimer);
  room._turnTimer = null;
  room._turnSig = sig;
  // per-turn time per room settings
  const ms = room.turnMs();
  room.turnDeadline = Date.now() + ms;
  // Set auto-act only when auto-pass is on; if off = just show the countdown, don't force
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
  // will arm the next round itself
  broadcast(room);
}

// ----- Make bots move (when it's a bot's turn / a bot must pick cards to exchange) -----
function clearBotTimer(room: Room): void {
  if (room._botTimer) clearTimeout(room._botTimer);
  room._botTimer = null;
}
function scheduleBot(room: Room): void {
  clearBotTimer(room);
  // no real person watching → no need to move bots
  if (!humansOnline(room)) return;
  let act: (() => void) | null = null;
  if (room.phase === 'playing' && room.players[room.turn]?.isBot) {
    act = () => room.botAct();
  } else if (room.phase === 'exchange' && room.giveTasks) {
    // a bot winner, or a human winner who dropped/left mid-exchange → auto-return their lowest cards
    // (otherwise a disconnected/AFK winner blocks performExchange and the whole room stalls forever)
    const pending = room.pendingAutoGiver();
    if (pending != null) act = () => room.botGive(pending);
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
      // move on to the next player (may be another bot) itself
      broadcast(r);
    },
    // delay to make it look natural
    base + Math.floor(Math.random() * 500),
  );
}

// ----- Auto-pass when "there's nothing playable at all" -----
// Real player's turn + there's a pile + no combo in hand can beat the pile → they have to pass anyway, so pass automatically
// (short delay so the player sees the pile first) — always done, not tied to the timer/autoPass settings
const STUCK_MS = Number(process.env.STUCK_MS) || 1200;
function clearStuckTimer(room: Room): void {
  if (room._stuckTimer) clearTimeout(room._stuckTimer);
  room._stuckTimer = null;
}
function stuckHere(room: Room): boolean {
  // host disabled this feature
  if (room.settings?.autoPassStuck === false) return false;
  if (room.phase !== 'playing' || !room.pile) return false;
  const cur = room.players[room.turn];
  if (!cur || cur.isBot || cur.finished || !cur.connected) return false;
  // no card can be played = stuck
  return !anyLegalMove(cur.hand, room.pile, disallowedComboTypes(room.settings));
}
function scheduleStuckPass(room: Room): void {
  clearStuckTimer(room);
  if (!humansOnline(room) || !stuckHere(room)) return;
  const turnAt = room.turn;
  room._stuckTimer = setTimeout(() => {
    const r = rooms.get(room.code);
    // turn changed / can play now → cancel
    if (!r || r.turn !== turnAt || !stuckHere(r)) return;
    try {
      r._pass(r.turn, true, 'ไม่มีไพ่ลงได้');
    } catch (e) {
      captureError(e, { where: 'stuckPass', code: r.code });
    }
    broadcast(r);
  }, STUCK_MS);
}

function broadcast(room: Room): void {
  // arm the timer before sending state so the client gets the correct turnRemainingMs
  armTurnTimer(room);
  // if it's a bot's turn, schedule the bot's move
  scheduleBot(room);
  // if it's a real player's turn but nothing is playable, pass automatically
  scheduleStuckPass(room);
  for (const p of room.players) {
    if (p.connected && !p.isBot) io.to(p.id).emit('state', room.stateFor(p.id));
  }
  // spectators
  for (const s of room.spectators) io.to(s.id).emit('state', room.stateFor(s.id));
  // fire Web Push on transitions (your turn / game start / end / join-leave) if enabled
  notifyRoom(room);
  // state changed → save
  scheduleSave();
}

io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
  let joinedCode: string | null = null;

  // ----- Anti-spam: token bucket per socket (over the limit = drop the event) -----
  metrics.connections++;
  metrics.peakConcurrent = Math.max(metrics.peakConcurrent, io.engine.clientsCount);
  const allow = createSocketLimiter();
  socket.use(([event], next) => {
    if (!allow(event)) {
      metrics.rateLimited++;
      socket.emit('errorMsg', { key: 'err.rateLimit' });
      // don't call next() → don't run the handler
      return;
    }
    next();
  });

  const err = (key: string, vars?: Record<string, string | number>) =>
    socket.emit('errorMsg', { key, vars });
  // convert a caught error → errorMsg (GameError has key/vars; others = generic)
  const fail = (e: unknown) => (e instanceof GameError ? err(e.key, e.vars) : err('err.generic'));

  // validate payload from client → return the value that passed the schema, or emit errorMsg + null if it fails
  // note: issue message is an i18n key (see shared/schemas.ts)
  const parse = <T>(schema: v.GenericSchema<unknown, T>, raw: unknown): T | null => {
    const r = v.safeParse(schema, raw);
    if (r.success) return r.output;
    err(r.issues[0].message);
    return null;
  };

  socket.on('create', (raw) => {
    const p = parse(CreateSchema, raw);
    if (!p) return;
    // creating a new room while already in one → leave the old one first (don't orphan the seat)
    if (joinedCode) detachRoom();
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
      fail(e);
    }
  });

  socket.on('join', (raw) => {
    const p = parse(JoinSchema, raw);
    if (!p) return;
    const { code, name, color } = p;
    try {
      const room = rooms.get(code);
      // send the attempted code back so the client only clears/leaves the room it actually failed on
      if (!room) return err('err.roomNotFound', { code });
      // switching to a different room on the same socket → leave the old one first (only once the
      // target is confirmed to exist, so a stale/dead-room tap can't kick us out of our real room)
      if (joinedCode && joinedCode !== code) detachRoom();
      room.addPlayer(socket.id, name);
      room.setColor(socket.id, color);
      // cancel room deletion (someone has come back)
      if (room._cleanupTimer) clearTimeout(room._cleanupTimer);
      joinedCode = code;
      socket.join(code);
      socket.emit('joined', { code });
      broadcast(room);
    } catch (e) {
      fail(e);
    }
  });

  const withRoom = (fn: (room: Room) => void) => {
    const room = joinedCode ? rooms.get(joinedCode) : undefined;
    if (!room) return err('err.notInRoom');
    try {
      fn(room);
      broadcast(room);
    } catch (e) {
      fail(e);
    }
  };

  socket.on('start', () =>
    withRoom((room) => {
      if (room.hostId !== socket.id) gerr('err.hostOnly');
      room.start();
      metrics.gamesStarted++;
      logger.info(`เริ่มเกมห้อง ${room.code} (${room.players.length} คน)`);
    }),
  );

  // Room settings (timer / auto-pass) — host only
  socket.on('settings', (raw) => {
    const patch = parse(SettingsPatchSchema, raw);
    if (!patch) return;
    withRoom((room) => {
      if (room.hostId !== socket.id) gerr('err.hostOnly');
      room.setSettings(patch);
      // let armTurnTimer set a new timer per the just-changed value
      room._turnSig = null;
    });
  });

  // Add/remove bots — host only (in the lobby)
  socket.on('addBot', () =>
    withRoom((room) => {
      if (room.hostId !== socket.id) gerr('err.hostOnly');
      room.addBot();
    }),
  );
  socket.on('removeBot', () =>
    withRoom((room) => {
      if (room.hostId !== socket.id) gerr('err.hostOnly');
      room.removeBot();
    }),
  );
  socket.on('shuffleSeats', () =>
    withRoom((room) => {
      if (room.hostId !== socket.id) gerr('err.hostOnly');
      room.shuffleSeats();
    }),
  );
  // Host kicks a player (in the lobby) — notify the kicked person + remove them from the socket's room
  socket.on('kick', (raw) => {
    const p = parse(KickSchema, raw);
    if (!p) return;
    withRoom((room) => {
      if (room.hostId !== socket.id) gerr('err.hostOnly');
      const kickedId = room.kick(p.name);
      if (kickedId && !kickedId.startsWith('bot:')) {
        io.to(kickedId).emit('left');
        io.sockets.sockets.get(kickedId)?.leave(room.code);
      }
    });
  });
  // Player color — you can set your own anytime
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
      if (room.hostId !== socket.id) gerr('err.hostOnly');
      room.resetToLobby();
      room.start();
    }),
  );

  // ----- Web Push: bind the subscription to the seat in the current room (player or spectator) -----
  const seatName = (room: Room): string | null => {
    const idx = room.indexOf(socket.id);
    if (idx >= 0) return room.players[idx].name;
    return room.spectators.find((s) => s.id === socket.id)?.name ?? null;
  };
  socket.on('pushSubscribe', (raw) => {
    const p = parse(PushSubscribeSchema, raw);
    if (!p) return;
    const room = joinedCode ? rooms.get(joinedCode) : undefined;
    const name = room ? seatName(room) : null;
    if (room && name) saveSub(room.code, name, p.sub, p.lang);
  });
  socket.on('pushUnsubscribe', () => {
    const room = joinedCode ? rooms.get(joinedCode) : undefined;
    const name = room ? seatName(room) : null;
    if (room && name) dropSub(room.code, name);
  });

  // Detach this socket from its current room (server-side only, no 'left' emit) — remove the seat if
  // in the lobby, park it (offline) if mid-game. Shared by 'leave' and by create/join when the same
  // socket switches rooms (otherwise the old seat is orphaned: a phantom connected player that keeps
  // the room from ever being reaped and, mid-game, keeps auto-acting forever).
  const detachRoom = (): void => {
    const room = joinedCode ? rooms.get(joinedCode) : undefined;
    if (!room) {
      joinedCode = null;
      return;
    }
    const code = joinedCode!;
    joinedCode = null;
    socket.leave(code);
    // stop sending push to this seat
    const leftName = seatName(room);
    if (leftName) dropSub(code, leftName);
    // in case they're a spectator
    room.removeSpectator(socket.id);
    room.removePlayer(socket.id);
    if (room.players.length === 0 || room.isEmpty()) {
      clearTurnTimer(room);
      // room empty → stop the clock + bots
      clearBotTimer(room);
      clearStuckTimer(room);
      if (room._cleanupTimer) clearTimeout(room._cleanupTimer);
      // grace before deleting the room: lobby deletes fast (1 minute) · mid-game/exchange/round-end give enough time for mobile background
      // (a PWA is normally suspended when switching apps for over 60s — too short and the room is deleted before the player returns to rejoin)
      const graceMs = room.phase === 'lobby' ? 60_000 : 5 * 60_000;
      room._cleanupTimer = setTimeout(() => {
        const r = rooms.get(code);
        if (r && (r.players.length === 0 || r.isEmpty())) {
          rooms.delete(code);
          dropRoom(code);
          saveRooms();
        }
      }, graceMs);
      scheduleSave();
    } else {
      broadcast(room);
    }
  };

  // Leave the room intentionally (button press) — send the client back to the lobby, then detach
  socket.on('leave', () => {
    // always send the client back to the lobby
    socket.emit('left');
    detachRoom();
  });

  socket.on('disconnect', () => {
    const room = joinedCode ? rooms.get(joinedCode) : undefined;
    if (!room) return;
    // in case they're a spectator
    room.removeSpectator(socket.id);
    room.removePlayer(socket.id);
    if (room.players.length === 0 || room.isEmpty()) {
      // room empty (including refresh case) → wait a grace period in case of reconnect before deleting
      const code = joinedCode!;
      clearTurnTimer(room);
      // room empty → stop the clock + bots
      clearBotTimer(room);
      clearStuckTimer(room);
      if (room._cleanupTimer) clearTimeout(room._cleanupTimer);
      // grace before deleting the room: lobby deletes fast (1 minute) · mid-game/exchange/round-end give enough time for mobile background
      // (a PWA is normally suspended when switching apps for over 60s — too short and the room is deleted before the player returns to rejoin)
      const graceMs = room.phase === 'lobby' ? 60_000 : 5 * 60_000;
      room._cleanupTimer = setTimeout(() => {
        const r = rooms.get(code);
        if (r && (r.players.length === 0 || r.isEmpty())) {
          rooms.delete(code);
          dropRoom(code);
          saveRooms();
        }
      }, graceMs);
      // save state connected=false
      scheduleSave();
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

// enable error tracking if SENTRY_DSN is set
await initSentry();
// load leftover rooms before accepting connections
loadRooms();

// let plugins/routes register + create the http server before listening
await fastify.ready();
await fastify.listen({ port: PORT, host: '0.0.0.0' });

console.log('\n🃏  เกมส์ไพ่สลาฟ พร้อมเล่นแล้ว!\n');
console.log(`   เครื่องนี้:   http://localhost:${PORT}`);
for (const ip of lanAddresses()) {
  console.log(`   ในออฟฟิศ:   http://${ip}:${PORT}   ← ส่งลิงก์นี้ให้เพื่อน`);
}
console.log(`   metrics:     http://localhost:${PORT}/metrics`);
console.log('');

// Save immediately on server shutdown (Ctrl+C / kill / nodemon restart) to capture the latest state
let shuttingDown = false;
function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  saveRooms();
  process.exit(0);
}
['SIGINT', 'SIGTERM', 'SIGUSR2'].forEach((sig) => process.on(sig, shutdown));
