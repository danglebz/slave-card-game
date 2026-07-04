// room.ts — สถานะห้องและรอบเล่นเกมส์ไพ่สลาฟ (server-authoritative)
import {
  deal,
  sortHand,
  identifyCombo,
  canBeat,
  playMode,
  findStarter,
  cardId,
  cardFromId,
  rankLabel,
  SUITS,
  disallowedComboTypes,
} from './game';
import { botChoose } from './bot';
import { gerr } from './errors';
import type {
  Card,
  Combo,
  Phase,
  Settings,
  RoomState,
  PlayerView,
  ResultEntry,
  HistoryEntry,
  ExchangeInfo,
  RankKey,
  RankTally,
  RoundRecord,
  Scoreboard,
  ScorePlayer,
} from '../shared/types';

const RANK_KEYS: RankKey[] = ['king', 'queen', 'commoner', 'viceslave', 'slave'];
const emptyTally = (): RankTally => ({ king: 0, queen: 0, commoner: 0, viceslave: 0, slave: 0 });
const MAX_HISTORY = 40; // เก็บประวัติรอบล่าสุดกี่รอบ (กัน state บวม)

// ----- โครงสร้างภายใน -----
interface Player {
  id: string;
  name: string;
  connected: boolean;
  hand: Card[];
  finished: boolean;
  isBot?: boolean;
  color?: string | null;
}

interface Spectator {
  id: string;
  name: string;
}

interface GiveTask {
  to: number;
  count: number;
  cards: string[] | null;
}

type GiveTasks = Record<number, GiveTask>;

// ยศแต่ละอันดับเป็น i18n key (client แปลเป็น 'คิง'/'King' + emoji เอง)
const RANK_TITLES: Record<number, string[]> = {
  2: ['king', 'slave'],
  3: ['king', 'commoner', 'slave'],
  4: ['king', 'queen', 'viceslave', 'slave'],
  5: ['king', 'queen', 'commoner', 'viceslave', 'slave'],
  6: ['king', 'queen', 'commoner', 'commoner', 'viceslave', 'slave'],
};

let roomSeq = 0;

export class Room {
  static TURN_MS = Number(process.env.TURN_MS) || 30000; // เวลาต่อตา (ms) ก่อน auto-pass/auto-play

  code: string;
  id: number;
  players: Player[];
  hostId: string | null;
  phase: Phase;
  turn: number;
  pile: Combo | null;
  pileOwner: number | null;
  passed: Set<number>;
  dir: 1 | -1;
  finishOrder: number[];
  lastResult: ResultEntry[] | null;
  log: string[];
  history: HistoryEntry[];
  giveTasks: GiveTasks | null;
  roundOrder: number[] | null;
  noticeSeq: number;
  noticeKey: string | null;
  noticeVars: Record<string, string | number> | null;
  turnDeadline: number | null;
  spectators: Spectator[];
  settings: Settings;
  /** สถิติสะสมข้ามรอบ (key = ชื่อผู้เล่น) — นับยศแต่ละแบบทั้ง session */
  sessionStats: Record<string, RankTally>;
  /** ประวัติผลแต่ละรอบ (ใหม่สุดท้าย) — จำกัด MAX_HISTORY */
  roundHistory: RoundRecord[];

  // ฟิลด์ภายใน (ไม่ได้ประกาศใน type สาธารณะ — ใช้ภายในเกม/timer)
  _prevOrder: number[] | null;
  everPlayed: boolean;
  _lastPileCards: (Card & { id: string })[] | null;
  _miyakoExchange?: boolean;
  _cleanupTimer: ReturnType<typeof setTimeout> | null;
  _turnTimer?: ReturnType<typeof setTimeout> | null;
  _turnSig?: string | null;
  _botTimer?: ReturnType<typeof setTimeout> | null;
  _stuckTimer?: ReturnType<typeof setTimeout> | null;

  constructor(code: string) {
    this.code = code;
    this.id = ++roomSeq;
    this.players = []; // { id(socket), name, connected, hand:[], finished:false }
    this.hostId = null;
    this.phase = 'lobby'; // lobby | playing | finished
    this.turn = 0; // index ใน players ของคนที่ถึงตา
    this.pile = null; // combo ปัจจุบันบนโต๊ะ {type,len,value,...}
    this.pileOwner = null; // index ผู้เล่นที่ลงกองล่าสุด
    this.passed = new Set(); // index คนที่ผ่านในกองนี้แล้ว → ข้ามจนกว่ากองจะเคลียร์
    this.dir = 1; // ทิศการวน: 1 = ขวา (ปกติ), -1 = ซ้าย (หลังสลับทิศ)
    this.finishOrder = []; // index เรียงตามคนหมดมือก่อน
    this.lastResult = null; // ผลรอบก่อน (ตำแหน่ง)
    this.log = []; // ประวัติย่อ (ข้อความ) — สำรอง
    this.history = []; // ประวัติแบบมีโครงสร้าง: {name,cards} | {name,pass} | {event}
    this.giveTasks = null; // เฟสแลกไพ่: { [playerIdx]: { to, count, cards|null } }
    this._prevOrder = null; // อันดับรอบก่อน (ใช้กำหนดสลาฟขึ้นก่อน + ทิศหนีคิง)
    this.roundOrder = null; // คิง/สลาฟ ของรอบปัจจุบัน (ใช้กฎคิงตกบัลลังก์)
    this.noticeSeq = 0; // ตัวนับแจ้งเตือนเด้ง (toast) ฝั่ง client
    this.noticeKey = null;
    this.noticeVars = null;
    this.turnDeadline = null; // timestamp(ms) ที่ตาปัจจุบันจะหมดเวลา (ตั้งโดย server, ไม่เซฟลงไฟล์)
    this.spectators = []; // ผู้ชมที่เข้ามากลางรอบ: { id, name } — จะเข้าเล่นรอบหน้า
    this.everPlayed = false;
    this._lastPileCards = null;
    this.sessionStats = {}; // สถิติสะสมข้ามรอบ
    this.roundHistory = []; // ประวัติผลแต่ละรอบ
    this._cleanupTimer = null; // ตัวจับเวลาลบห้องร้าง (ตั้ง/เคลียร์ใน index.js)
    // ตั้งค่าห้อง (หัวห้องคุม)
    this.settings = {
      timer: true,
      autoPass: true,
      autoPassStuck: true,
      allowTriple: true,
      allowQuad: true,
      allowStraight: true,
      turnSeconds: Math.max(1, Math.round(Room.TURN_MS / 1000)),
    };
  }

  static MAX_PLAYERS = 6; // จำนวนผู้เล่นสูงสุดต่อห้อง
  static TURN_SECONDS_CHOICES = [15, 30, 45, 60];
  static COLORS = [
    '#ef4444',
    '#f97316',
    '#eab308',
    '#22c55e',
    '#06b6d4',
    '#3b82f6',
    '#a855f7',
    '#ec4899',
  ];

  // ตั้งสีประจำตัวของผู้เล่น (ตัวเองเท่านั้น) — รับ hex #rrggbb ใดๆ (validate กัน injection)
  setColor(socketId: string, color?: string): void {
    const p = this.players.find((x) => x.id === socketId);
    if (p && typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color))
      p.color = color.toLowerCase();
  }

  // ปรับตั้งค่าห้อง (เฉพาะค่าที่รู้จัก/ถูกต้อง)
  setSettings(patch: Partial<Settings>): void {
    if (!patch) return;
    if (typeof patch.timer === 'boolean') this.settings.timer = patch.timer;
    if (typeof patch.autoPass === 'boolean') this.settings.autoPass = patch.autoPass;
    if (typeof patch.autoPassStuck === 'boolean') this.settings.autoPassStuck = patch.autoPassStuck;
    if (typeof patch.allowTriple === 'boolean') this.settings.allowTriple = patch.allowTriple;
    if (typeof patch.allowQuad === 'boolean') this.settings.allowQuad = patch.allowQuad;
    if (typeof patch.allowStraight === 'boolean') this.settings.allowStraight = patch.allowStraight;
    if (patch.turnSeconds != null && Room.TURN_SECONDS_CHOICES.includes(patch.turnSeconds))
      this.settings.turnSeconds = patch.turnSeconds;
  }

  // เวลาต่อตาเป็น ms (ตามตั้งค่าห้อง)
  turnMs(): number {
    return (this.settings?.turnSeconds || Math.round(Room.TURN_MS / 1000)) * 1000;
  }

  addHistory(entry: HistoryEntry): void {
    this.history.push(entry);
    if (this.history.length > 50) this.history = this.history.slice(-50);
  }

  // ----- บอท (AI เติมคน) -----
  addBot(): void {
    if (this.phase !== 'lobby') gerr('err.botLobbyOnly');
    if (this.players.length >= Room.MAX_PLAYERS) gerr('err.roomFull', { max: Room.MAX_PLAYERS });
    // หาเลขบอทที่ว่างต่ำสุด เพื่อชื่อไม่ชนกัน
    const used = new Set(this.players.filter((p) => p.isBot).map((p) => p.name));
    let n = 1;
    while (used.has(`บอท ${n}`)) n++;
    this.players.push({
      id: `bot:${this.code}:${n}`,
      name: `บอท ${n}`,
      connected: true,
      hand: [],
      finished: false,
      isBot: true,
    });
  }

  removeBot(): void {
    if (this.phase !== 'lobby') gerr('err.removeBotLobbyOnly');
    for (let i = this.players.length - 1; i >= 0; i--) {
      if (this.players[i].isBot) {
        this.players.splice(i, 1);
        return;
      }
    }
    gerr('err.noBot');
  }

  hasBots(): boolean {
    return this.players.some((p) => p.isBot);
  }

  // หัวห้องเตะผู้เล่น (เฉพาะในล็อบบี้) — อ้างอิงด้วยชื่อ; คืน socket id ที่ถูกเตะ (ให้ index.ts แจ้ง/พาออก)
  kick(name: string): string | null {
    if (this.phase !== 'lobby') gerr('err.kickLobbyOnly');
    const idx = this.players.findIndex((p) => p.name === name);
    if (idx < 0) gerr('err.noSuchPlayer');
    if (this.players[idx].id === this.hostId) gerr('err.cantKickSelf');
    const [removed] = this.players.splice(idx, 1);
    return removed.id;
  }

  // สลับลำดับที่นั่ง (เปลี่ยนลำดับการวน) — เฉพาะในล็อบบี้
  shuffleSeats(): void {
    if (this.phase !== 'lobby') gerr('err.shuffleLobbyOnly');
    if (this.players.length < 2) gerr('err.needTwo');
    for (let i = this.players.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.players[i], this.players[j]] = [this.players[j], this.players[i]];
    }
  }

  // เข้าห้อง → คืน 'player' หรือ 'spectator'
  addPlayer(socketId: string, name: string): 'player' | 'spectator' {
    // reconnect / รีเฟรช: ชื่อซ้ำ → ยึดที่นั่งเดิม (ไม่สนว่า socket เก่า disconnect ทันหรือยัง)
    // กัน race ตอนรีเฟรชที่ socket ใหม่ต่อก่อน socket เก่าจะหลุด (ไม่นับบอท)
    const existing = this.players.find((p) => p.name === name && !p.isBot);
    if (existing) {
      const oldId = existing.id;
      existing.id = socketId;
      existing.connected = true;
      // ย้าย host ตามถ้าคนเดิมคือ host
      if (this.hostId === oldId) this.hostId = socketId;
      if (!this.players.some((p) => p.id === this.hostId && p.connected && !p.isBot)) {
        this.hostId = socketId;
      }
      return 'player';
    }
    // reconnect ผู้ชมที่ค้างอยู่
    const spec = this.spectators.find((s) => s.name === name);
    if (spec) {
      spec.id = socketId;
      return 'spectator';
    }
    // เข้าใหม่ตอนล็อบบี้ = ผู้เล่น
    if (this.phase === 'lobby') {
      if (this.players.length >= Room.MAX_PLAYERS) gerr('err.roomFull', { max: Room.MAX_PLAYERS });
      const player: Player = { id: socketId, name, connected: true, hand: [], finished: false };
      this.players.push(player);
      if (!this.hostId) this.hostId = socketId;
      return 'player';
    }
    // เข้าระหว่างเกม = ผู้ชม (ดูก่อน เล่นรอบหน้า) — ดูได้แม้ห้องเต็ม
    this.spectators.push({ id: socketId, name });
    return 'spectator';
  }

  removeSpectator(socketId: string): boolean {
    const n = this.spectators.length;
    this.spectators = this.spectators.filter((s) => s.id !== socketId);
    return this.spectators.length !== n;
  }

  // ดึงผู้ชมเข้าเป็นผู้เล่น (ตอนเริ่มรอบใหม่) เท่าที่นั่งว่าง
  promoteSpectators(): void {
    while (this.spectators.length && this.players.length < Room.MAX_PLAYERS) {
      const s = this.spectators.shift()!;
      this.players.push({ id: s.id, name: s.name, connected: true, hand: [], finished: false });
    }
  }

  removePlayer(socketId: string): void {
    const p = this.players.find((x) => x.id === socketId);
    if (!p) return;
    p.connected = false;
    if (this.phase === 'lobby') {
      this.players = this.players.filter((x) => x.id !== socketId);
    }
    // ย้าย host ถ้า host หลุด (ไม่ให้บอทเป็น host)
    if (this.hostId === socketId) {
      const next = this.players.find((x) => x.connected && !x.isBot);
      this.hostId = next ? next.id : null;
    }
  }

  indexOf(socketId: string): number {
    return this.players.findIndex((p) => p.id === socketId);
  }

  isEmpty(): boolean {
    // ห้องว่าง = ไม่มี "คนจริง" ออนไลน์ (บอทไม่นับ ไม่งั้นห้องไม่ถูกเก็บกวาด)
    return this.players.every((p) => p.isBot || !p.connected);
  }

  start(): void {
    this.promoteSpectators(); // ดึงผู้ชมที่รออยู่เข้าเล่นรอบนี้
    if (this.players.length < 2) gerr('err.needTwoStart');
    const prevOrder = Array.isArray(this.finishOrder) ? this.finishOrder.slice() : [];
    const hands = deal(this.players.length);
    this.players.forEach((p, i) => {
      p.hand = hands[i];
      p.finished = false;
    });
    this.phase = 'playing';
    this.pile = null;
    this.pileOwner = null;
    this.passed = new Set();
    this.dir = 1; // เริ่มทุกรอบด้วยการวนขวา
    this.everPlayed = false;
    this._lastPileCards = null;
    this.finishOrder = [];
    this.log = [];
    this.history = [];
    this.giveTasks = null;
    this._prevOrder = prevOrder.length === this.players.length ? prevOrder : null;
    this.addHistory({ event: '🆕 เริ่มรอบใหม่' });
    // ถ้ามีรอบก่อนครบทุกคน → เข้าเฟส "แลกไพ่" (เลือกเอง) ก่อนเริ่มเล่น
    if (this._prevOrder) {
      this.setupExchange(this._prevOrder);
    } else {
      this.beginPlay();
    }
  }

  // เริ่มเล่นจริง (หลังแลกไพ่เสร็จ หรือเกมแรกที่ไม่ต้องแลก)
  beginPlay(): void {
    this.phase = 'playing';
    this.giveTasks = null;
    const prev = this._prevOrder;
    if (prev && prev.length === this.players.length) {
      // รอบ 2+: สลาฟขึ้นก่อน, ไม่ต้องมี 3♣, ทิศ "หมุนหนีคิง"
      const n = this.players.length;
      const slave = prev[n - 1];
      const king = prev[0];
      this.turn = slave;
      this.everPlayed = true; // ข้ามเงื่อนไข "กองแรกต้องมี 3♣"
      // หมุนหนีคิง: เลือกทิศที่เดินออกจากคิง (คิงอยู่ปลายแถวที่สุด)
      const stepsCW = (king - slave + n) % n; // ก้าวไป +1 กี่ทีถึงคิง
      this.dir = stepsCW <= n / 2 ? -1 : 1; // ถ้าคิงใกล้ทาง +1 → วน -1 (หนี)
      this.log.push(`เริ่มรอบใหม่! ${this.players[slave].name} (สลาฟ) ขึ้นก่อน — หมุนหนีคิง`);
      this.addHistory({ event: `▶️ ${this.players[slave].name} (สลาฟ) ขึ้นก่อน` });
      this.roundOrder = prev.slice(); // ใช้เช็ค "คิงตกบัลลังก์" (สลาฟหมดก่อนคิง)
    } else {
      // เกมแรก: ถือ 3♣ ขึ้นก่อน + กองแรกต้องมี 3♣
      this.everPlayed = false;
      this.turn = findStarter(this.players.map((p) => p.hand));
      this.log.push(`เริ่มเกม! ${this.players[this.turn].name} ขึ้นก่อน (ถือ 3♣)`);
      this.addHistory({ event: `▶️ ${this.players[this.turn].name} ขึ้นก่อน` });
      this.roundOrder = null; // เกมแรกไม่มีคิง/สลาฟ → ไม่มีกฎคิงตกบัลลังก์
    }
    this._prevOrder = null;
  }

  // คิงตกบัลลังก์: สลาฟ(เดิม)หมดมือก่อนคิง(เดิม) → สลับคิง↔สลาฟ จบรอบ แจกใหม่ทันที
  miyakoOchi(): { ok: true } {
    const n = this.roundOrder!.length;
    const order = this.roundOrder!.slice();
    [order[0], order[n - 1]] = [order[n - 1], order[0]]; // สลับคิง↔สลาฟ
    this.finishOrder = order;
    const titles = RANK_TITLES[n] || [];
    this.lastResult = order.map((pIdx, rank) => ({
      name: this.players[pIdx].name,
      title: titles[rank] || 'slave',
    }));
    this.recordRound(this.lastResult); // ← สะสมสถิติ (คิงตกบัลลังก์ก็นับเป็นจบรอบ)
    this.log.push(`dethrone: ${this.players[order[n - 1]].name} (was king) becomes slave — redeal`);
    this.noticeSeq++;
    this.noticeKey = 'notice.dethrone';
    this.noticeVars = { name: this.players[order[n - 1]].name };
    this._miyakoExchange = true; // คิงตกบัลลังก์ → แลกไพ่เฉพาะคิง↔สลาฟ (ควีน/รองสลาฟไม่ต้องแลก)
    this.start(); // อ่าน finishOrder เป็นอันดับใหม่ → แจก + เข้าเฟสแลกไพ่ทันที
    return { ok: true };
  }

  // ตั้งเฟสแลกไพ่:
  //   ผู้แพ้ (สลาฟ/รองสลาฟ) → ถูกบังคับให้ไพ่ "สูงสุด" อัตโนมัติทันที
  //   ผู้ชนะ (คิง/ควีน) → เลือกไพ่ "คืน" ให้เองในเฟสนี้
  setupExchange(order: number[]): void {
    const n = order.length;
    const tiers = Math.floor(n / 2);
    // คิงตกบัลลังก์ → แลกเฉพาะคู่สุดขั้ว (คิง↔สลาฟ) เท่านั้น
    const onlyKingSlave = this._miyakoExchange;
    this._miyakoExchange = false;
    // ปกติแลกเฉพาะคู่ "มียศ": คิง/ควีน ↔ สลาฟ/รองสลาฟ — สามัญชนไม่แลก (เช่น 6 คน คู่กลางไม่แลก)
    const RANKED_TIERS = 2;
    const maxTier = onlyKingSlave ? 1 : Math.min(tiers, RANKED_TIERS);
    this.giveTasks = {}; // เฉพาะผู้ชนะที่ต้องเลือก: { [winnerIdx]: { to, count, cards|null } }
    for (let i = 0; i < maxTier; i++) {
      const count = RANKED_TIERS - i; // ตามสากล: คิง↔สลาฟ 2 ใบ, ควีน↔รองสลาฟ 1 ใบ (คงที่ทุกจำนวนคน)
      const w = order[i]; // ผู้ชนะ
      const l = order[n - 1 - i]; // ผู้แพ้
      // ผู้แพ้ส่งไพ่สูงสุดอัตโนมัติ → ผู้ชนะ
      const loser = this.players[l];
      sortHand(loser.hand);
      const highest = loser.hand.slice(-count); // ไพ่สูงสุด count ใบ
      const rm = new Set(highest.map(cardId));
      loser.hand = loser.hand.filter((c) => !rm.has(cardId(c)));
      this.players[w].hand.push(...highest.map((c) => ({ r: c.r, s: c.s })));
      sortHand(this.players[w].hand);
      this.addHistory({
        event: `⛓️ ${loser.name} ส่งไพ่สูงสุด ${count} ใบ ให้ ${this.players[w].name}`,
      });
      // ผู้ชนะต้องเลือก count ใบ คืนให้ผู้แพ้
      this.giveTasks[w] = { to: l, count, cards: null };
    }
    this.phase = 'exchange';
  }

  // ผู้ชนะส่งไพ่ที่เลือกคืนให้ผู้แพ้
  giveCards(socketId: string, cardIds: string[]): { ok: true } {
    return this._give(this.indexOf(socketId), cardIds);
  }

  _give(idx: number, cardIds: string[]): { ok: true } {
    if (this.phase !== 'exchange' || !this.giveTasks) gerr('err.notExchange');
    const task = this.giveTasks[idx];
    if (!task) gerr('err.noPickThisRound');
    if (task.cards) gerr('err.alreadyPicked');
    if (!Array.isArray(cardIds) || cardIds.length !== task.count) {
      gerr('err.pickN', { count: task.count });
    }
    const player = this.players[idx];
    const handIds = new Set(player.hand.map(cardId));
    for (const id of cardIds) if (!handIds.has(id)) gerr('err.noSuchCard');
    if (new Set(cardIds).size !== cardIds.length) gerr('err.dupCard');

    task.cards = cardIds.slice();
    // ผู้ชนะเลือกครบทุกคนแล้ว → ย้ายไพ่คืน แล้วเริ่มเล่น
    if (Object.values(this.giveTasks).every((t) => t.cards)) {
      this.performExchange();
    }
    return { ok: true };
  }

  performExchange(): void {
    // ย้ายเฉพาะไพ่ที่ผู้ชนะเลือกคืนให้ผู้แพ้ (ผู้แพ้ให้สูงสุดไปแล้วตอน setup)
    for (const [from, t] of Object.entries(this.giveTasks!)) {
      const rm = new Set(t.cards!);
      this.players[+from].hand = this.players[+from].hand.filter((c) => !rm.has(cardId(c)));
      for (const id of t.cards!) this.players[t.to].hand.push(cardFromId(id));
    }
    this.players.forEach((p) => sortHand(p.hand));
    this.addHistory({ event: '🎁 แลกไพ่เสร็จแล้ว' });
    this.beginPlay();
  }

  // บอทที่เป็นผู้ชนะ → เลือกไพ่ "ต่ำสุด" คืนให้ผู้แพ้อัตโนมัติ
  botGive(idx: number): boolean {
    const task = this.giveTasks && this.giveTasks[idx];
    if (!task || task.cards) return false;
    sortHand(this.players[idx].hand);
    const ids = this.players[idx].hand.slice(0, task.count).map(cardId);
    this._give(idx, ids);
    return true;
  }

  activeCount(): number {
    return this.players.filter((p) => !p.finished).length;
  }

  // หา index คนต่อไปที่ยังไม่หมดมือ (ตามทิศการวน)
  nextActive(from: number): number {
    const n = this.players.length;
    for (let step = 1; step <= n; step++) {
      const idx = (((from + step * this.dir) % n) + n) % n;
      if (!this.players[idx].finished) return idx;
    }
    return from;
  }

  play(socketId: string, cardIds: string[]): { ok: true } {
    return this._play(this.indexOf(socketId), cardIds);
  }

  _play(idx: number, cardIds: string[], auto = false): { ok: true } {
    if (this.phase !== 'playing') gerr('err.notPlaying');
    if (idx !== this.turn) gerr('err.notYourTurn');
    const player = this.players[idx];

    const cards = cardIds.map(cardFromId);
    // ตรวจว่าไพ่ที่ลงอยู่ในมือจริง
    const handIds = new Set(player.hand.map(cardId));
    for (const id of cardIds) {
      if (!handIds.has(id)) gerr('err.noSuchCard');
    }
    if (new Set(cardIds).size !== cardIds.length) gerr('err.dupCard');

    const combo = identifyCombo(cards);
    if (!combo) gerr('err.invalidCombo');

    // house rules: ชุดพิเศษที่หัวห้องปิด → ลงไม่ได้
    if (disallowedComboTypes(this.settings).has(combo!.type))
      gerr('err.comboDisabled', { type: combo!.type });

    // ไพ่แรกสุดของเกมต้องมี 3♣ (ดอกจิก) ร่วมด้วย
    if (!this.everPlayed && !cardIds.includes('3.0')) {
      gerr('err.first3');
    }

    if (!canBeat(this.pile, combo!)) {
      if (!this.pile) gerr('err.cannotPlay');
      // ชนิด/จำนวนตรงกับกอง? (ถ้าตรง = แค่เล็กกว่า / ถ้าไม่ตรง = ผิดชนิด)
      const sameShape =
        combo!.type === this.pile.type &&
        (combo!.type !== 'straight' || combo!.len === this.pile.len);
      // err.mustBeat ส่ง type/len/mode ของกอง → client ประกอบชื่อชุด + hint บอมบ์ตามบริบทเอง
      if (sameShape) gerr('err.tooSmall');
      else
        gerr('err.mustBeat', {
          type: this.pile.type,
          len: this.pile.len,
          mode: this.pile.mode === 'bomb' ? 'bomb' : 'normal',
        });
    }
    combo.mode = playMode(this.pile, combo);

    // เอาไพ่ออกจากมือ
    const removeSet = new Set(cardIds);
    player.hand = player.hand.filter((c) => !removeSet.has(cardId(c)));
    sortHand(player.hand);

    this.pile = combo;
    this.pileOwner = idx;
    this.everPlayed = true;
    this._lastPileCards = cardIds.map((id) => ({ ...cardFromId(id), id }));
    this.log.push(
      `${player.name} ลง ${cardIds.map(idToLabel).join(' ')}${auto ? ' (หมดเวลา)' : ''}`,
    );
    this.addHistory({ name: player.name, cards: cardIds.map(cardFromId), auto });

    if (player.hand.length === 0) {
      player.finished = true;
      this.finishOrder.push(idx);
      this.log.push(`🏆 ${player.name} หมดมือแล้ว!`);
      this.addHistory({ event: `🏆 ${player.name} หมดมือ!` });

      // คิงตกบัลลังก์: สลาฟ(เดิม)หมดมือก่อนคิง(เดิม) → จบรอบ แจกใหม่ทันที
      if (this.roundOrder) {
        const king = this.roundOrder[0];
        const slave = this.roundOrder[this.roundOrder.length - 1];
        if (idx === slave && !this.players[king].finished) {
          return this.miyakoOchi();
        }
      }
    }

    // เหลือคนเดียวที่ยังไม่หมดมือ → จบรอบ
    if (this.activeCount() <= 1) {
      const last = this.players.findIndex((p) => !p.finished);
      if (last >= 0) this.finishOrder.push(last);
      return this.endRound();
    }

    this.advanceTurn();
    return { ok: true };
  }

  pass(socketId: string): { ok: true } {
    return this._pass(this.indexOf(socketId));
  }

  _pass(idx: number, auto = false, reason = 'หมดเวลา'): { ok: true } {
    if (this.phase !== 'playing') gerr('err.notPlaying');
    if (idx !== this.turn) gerr('err.notYourTurn');
    if (!this.pile) gerr('err.leadMustPlay');

    // ผ่านแล้ว = ออกจากกองนี้ ถูกข้ามจนกว่ากองจะเคลียร์
    this.passed.add(idx);
    this.log.push(`${this.players[idx].name} ผ่าน${auto ? ` (${reason})` : ''}`);
    this.addHistory({ name: this.players[idx].name, pass: true, auto });
    this.advanceTurn();
    return { ok: true };
  }

  // หมดเวลาในตานี้ → เล่นแทนอัตโนมัติ: มีกองอยู่ = ผ่าน, นำกองอยู่ = ลงไพ่ต่ำสุด
  autoAct(): boolean {
    if (this.phase !== 'playing') return false;
    const idx = this.turn;
    const player = this.players[idx];
    if (!player || player.finished) return false;
    if (this.pile) {
      this._pass(idx, true);
    } else {
      sortHand(player.hand);
      const lowest = player.hand[0]; // ไพ่ต่ำสุด (เกมแรกคือ 3♣ อยู่แล้ว → ผ่านเงื่อนไข 3♣)
      if (!lowest) return false;
      this._play(idx, [cardId(lowest)], true);
    }
    return true;
  }

  // บอทเดินตา (เรียกเมื่อถึงตาบอท) — เลือกตาเดินที่ถูกกติกา หรือผ่าน
  botAct(): boolean {
    if (this.phase !== 'playing') return false;
    const idx = this.turn;
    const bot = this.players[idx];
    if (!bot || !bot.isBot || bot.finished) return false;
    // context ช่วยบอทตัดสินใจ: คู่แข่งเหลือไพ่น้อยสุดกี่ใบ + กองแรกต้องมี 3♣ ไหม
    const opp = this.players.filter((p, i) => i !== idx && !p.finished);
    const minOppCards = opp.length ? Math.min(...opp.map((p) => p.hand.length)) : Infinity;
    const move = botChoose(bot.hand, this.pile, {
      minOppCards,
      mustInclude3: !this.everPlayed,
      disallowed: disallowedComboTypes(this.settings),
    });
    try {
      if (move) this._play(idx, move);
      else if (this.pile) this._pass(idx);
      else this._play(idx, [cardId(sortHand(bot.hand)[0])]); // นำกองต้องลง (กันค้าง)
    } catch {
      // กันค้าง: ถ้าตาที่บอทเลือกผิดกติกาด้วยเหตุใด ๆ → ผ่าน หรือลงเดี่ยวต่ำสุด
      if (this.pile) this._pass(idx);
      else this._play(idx, [cardId(sortHand(bot.hand)[0])]);
    }
    return true;
  }

  // หาคนถัดไปที่ยังเล่นกองนี้อยู่ (ยังไม่หมดมือ และยังไม่ผ่าน, ตามทิศการวน) — คืน null ถ้าไม่มีใครเหลือ
  nextInTrick(from: number): number | null {
    const n = this.players.length;
    for (let step = 1; step <= n; step++) {
      const idx = (((from + step * this.dir) % n) + n) % n;
      if (this.players[idx].finished) continue;
      if (this.passed.has(idx)) continue;
      return idx;
    }
    return null;
  }

  advanceTurn(): void {
    const next = this.nextInTrick(this.turn);
    // ไม่มีใครเหลือ หรือวนกลับมาถึงเจ้าของกอง → ทุกคนอื่นผ่าน/หมดมือ → เจ้าของกองชนะกอง เคลียร์นำใหม่
    if (next === null || next === this.pileOwner) {
      this.pile = null;
      this._lastPileCards = null;
      this.passed = new Set();
      this.history = []; // เคลียร์กอง = ขึ้นกองใหม่ → ล้างประวัติให้เหลือแค่กองปัจจุบัน
      if (this.pileOwner != null && !this.players[this.pileOwner].finished) {
        // เจ้าของกองยังอยู่ → นำกองใหม่เอง (ทิศเดิม)
        this.turn = this.pileOwner;
        this.log.push(`— เคลียร์กอง ${this.players[this.turn].name} นำใหม่ —`);
      } else {
        // เจ้าของกองหมดมือ + ไม่มีใครกินกองได้ → สลับทิศ แล้วคนถัดไป(ทิศใหม่)นำ
        this.dir = -this.dir as 1 | -1;
        this.turn = this.nextActive(this.pileOwner == null ? this.turn : this.pileOwner);
        this.log.push(
          `🔄 สลับทิศ! เคลียร์กอง ${this.players[this.turn].name} นำใหม่ (วน${this.dir === 1 ? 'ขวา' : 'ซ้าย'})`,
        );
      }
      this.pileOwner = null;
    } else {
      this.turn = next;
    }
  }

  // บันทึกผลรอบลงสถิติสะสม + ประวัติ (เรียกตอนรอบจบจริง: endRound / miyakoOchi)
  recordRound(result: ResultEntry[]): void {
    if (!result?.length) return;
    for (const r of result) {
      const t = (this.sessionStats[r.name] ||= emptyTally());
      if ((RANK_KEYS as string[]).includes(r.title)) t[r.title as RankKey]++;
    }
    this.roundHistory.push({ order: result.map((r) => ({ name: r.name, title: r.title })) });
    if (this.roundHistory.length > MAX_HISTORY)
      this.roundHistory = this.roundHistory.slice(-MAX_HISTORY);
  }

  // สร้าง scoreboard (leaderboard เรียงแล้ว + ประวัติ) สำหรับส่งให้ client
  buildScoreboard(): Scoreboard {
    const players: ScorePlayer[] = Object.entries(this.sessionStats).map(([name, tally]) => ({
      name,
      tally,
      rounds: RANK_KEYS.reduce((s, k) => s + tally[k], 0),
    }));
    // เรียง: คิงมากสุด → สลาฟน้อยสุด → ควีนมาก → รองสลาฟน้อย → ชื่อ
    players.sort(
      (a, b) =>
        b.tally.king - a.tally.king ||
        a.tally.slave - b.tally.slave ||
        b.tally.queen - a.tally.queen ||
        a.tally.viceslave - b.tally.viceslave ||
        a.name.localeCompare(b.name),
    );
    return { players, history: this.roundHistory.slice(-MAX_HISTORY) };
  }

  endRound(): { ok: true; finished: true } {
    this.phase = 'finished';
    const n = this.players.length;
    const titles = RANK_TITLES[n] || [];
    this.lastResult = this.finishOrder.map((pIdx, rank) => ({
      name: this.players[pIdx].name,
      title: titles[rank] || 'slave',
    }));
    this.recordRound(this.lastResult); // ← สะสมสถิติ
    this.log.push('🎉 จบรอบ! ' + this.lastResult.map((r) => `${r.title}: ${r.name}`).join(', '));
    this.addHistory({
      event: '🎉 จบรอบ! ' + this.lastResult.map((r) => `${r.title}:${r.name}`).join(' · '),
    });
    return { ok: true, finished: true };
  }

  resetToLobby(): void {
    this.phase = 'lobby';
    this.pile = null;
    this.pileOwner = null;
    this.passed = new Set();
    this.giveTasks = null;
    this.everPlayed = false;
    this.players.forEach((p) => {
      p.hand = [];
      p.finished = false;
    });
  }

  // มุมมองที่ส่งให้ผู้เล่นแต่ละคน (เห็นไพ่ตัวเองเท่านั้น)
  stateFor(socketId: string): RoomState {
    const meIdx = this.indexOf(socketId);
    const isSpectator = meIdx < 0 && this.spectators.some((s) => s.id === socketId);
    const titleByName: Record<string, string> = {}; // ยศจากรอบก่อน
    for (const r of this.lastResult || []) titleByName[r.name] = r.title;
    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      youAreHost: this.hostId === socketId,
      youIndex: meIdx,
      youAreSpectator: isSpectator,
      spectatorCount: this.spectators.length,
      turn: this.turn,
      turnName: this.players[this.turn]?.name ?? null,
      turnRemainingMs:
        this.phase === 'playing' && this.turnDeadline
          ? Math.max(0, this.turnDeadline - Date.now())
          : null,
      turnMs: this.turnMs(),
      settings: this.settings,
      dir: this.dir,
      pile: this.pile,
      pileCards: this._lastPileCards || null,
      players: this.players.map(
        (p, i): PlayerView => ({
          name: p.name,
          connected: p.connected,
          cardCount: p.hand.length,
          finished: p.finished,
          isYou: i === meIdx,
          isHost: p.id === this.hostId,
          isTurn: i === this.turn,
          isBot: !!p.isBot,
          color: p.color || null,
          title: titleByName[p.name] || null,
        }),
      ),
      hand: meIdx >= 0 ? this.players[meIdx].hand.map((c) => ({ ...c, id: cardId(c) })) : [],
      result: this.lastResult,
      log: this.log.slice(-12),
      history: (this.history || []).slice(-16),
      exchange: this.exchangeFor(meIdx),
      notice: this.noticeKey
        ? { seq: this.noticeSeq, key: this.noticeKey, vars: this.noticeVars ?? undefined }
        : null,
      scoreboard: this.buildScoreboard(),
    };
  }

  // ข้อมูลเฟสแลกไพ่สำหรับผู้เล่นคนนี้
  exchangeFor(meIdx: number): ExchangeInfo | null {
    if (this.phase !== 'exchange' || !this.giveTasks) return null;
    const my = this.giveTasks[meIdx]; // ผู้ชนะ (ต้องเลือกไพ่คืน)
    // ผู้แพ้ที่รอรับไพ่คืน: มี task ที่ to === เรา
    const incoming = Object.entries(this.giveTasks).find(([, t]) => t.to === meIdx);
    const waiting = Object.entries(this.giveTasks)
      .filter(([, t]) => !t.cards)
      .map(([i]) => this.players[+i]?.name)
      .filter(Boolean);
    return {
      role: my ? 'winner' : incoming ? 'loser' : 'none',
      myCount: my ? my.count : 0,
      toName: my ? (this.players[my.to]?.name ?? null) : null,
      myDone: my ? !!my.cards : true, // ผู้ชนะ: เลือกแล้วหรือยัง; คนอื่น = รอ
      fromName: incoming ? (this.players[+incoming[0]]?.name ?? null) : null,
      gaveCount: incoming ? incoming[1].count : 0,
      waitingNames: waiting,
    };
  }

  // ----- เซฟ/โหลดสถานะลงไฟล์ (กัน server restart แล้วห้องหาย) -----
  toState(): Record<string, unknown> {
    return {
      code: this.code,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.connected,
        hand: p.hand,
        finished: p.finished,
        isBot: !!p.isBot,
        color: p.color || null,
      })),
      hostId: this.hostId,
      phase: this.phase,
      turn: this.turn,
      pile: this.pile,
      pileOwner: this.pileOwner,
      passed: [...this.passed],
      dir: this.dir,
      everPlayed: this.everPlayed,
      _lastPileCards: this._lastPileCards,
      finishOrder: this.finishOrder,
      lastResult: this.lastResult,
      log: this.log,
      history: this.history,
      giveTasks: this.giveTasks,
      _prevOrder: this._prevOrder,
      roundOrder: this.roundOrder,
      settings: this.settings,
      sessionStats: this.sessionStats,
      roundHistory: this.roundHistory,
    };
  }

  static fromState(data: any): Room {
    const room = new Room(data.code);
    Object.assign(room, data);
    room.passed = new Set(data.passed || []);
    room.history = data.history || [];
    room.giveTasks = data.giveTasks || null;
    room._prevOrder = data._prevOrder || null;
    room.roundOrder = data.roundOrder || null;
    room.sessionStats = data.sessionStats || {};
    room.roundHistory = data.roundHistory || [];
    room.settings = {
      timer: true,
      autoPass: true,
      autoPassStuck: true,
      allowTriple: true,
      allowQuad: true,
      allowStraight: true,
      turnSeconds: Math.max(1, Math.round(Room.TURN_MS / 1000)),
      ...(data.settings || {}),
    };
    room.spectators = []; // ผู้ชมเป็น socket สดๆ ไม่กู้คืนหลัง restart
    room.everPlayed = data.everPlayed ?? data.phase !== 'lobby';
    // socket หายหมดตอน restart → คนจริงออฟไลน์จนกว่าจะ reconnect; บอทออนไลน์เสมอ
    room.players.forEach((p) => {
      p.connected = !!p.isBot;
    });
    return room;
  }
}

function idToLabel(id: string): string {
  const c = cardFromId(id);
  return `${rankLabel(c.r)}${SUITS[c.s]}`;
}
