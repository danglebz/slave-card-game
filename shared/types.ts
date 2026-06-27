/**
 * Shared contract types — single source of truth สำหรับทั้ง server และ client
 *
 * ห้ามเปลี่ยนชื่อ event / field โดยไม่อัปเดตทั้งสองฝั่งพร้อมกัน
 * (Socket.IO contract ผูกกันแน่น — typo เดียว = client พัง)
 */

// ----- ไพ่ -----
/** suit 0=♣ 1=♦ 2=♥ 3=♠ ; rank 3..10, J=11, Q=12, K=13, A=14, 2=15 */
export interface Card {
  r: number;
  s: number;
}

/** ไพ่ที่ส่งให้ client พร้อม id ('rank.suit' เช่น '15.3') */
export interface CardWithId extends Card {
  id: string;
}

// ----- combo -----
export type ComboType = 'single' | 'pair' | 'triple' | 'quad' | 'straight';

export interface Combo {
  type: ComboType;
  len: number;
  value: number;
  topRank: number;
  /** กองตอนนี้เป็นโหมดระเบิดไหม (เซ็ตตอนเล่น triple/quad/straight) */
  mode?: 'bomb' | 'normal';
}

// ----- เฟส / ตั้งค่า -----
export type Phase = 'lobby' | 'playing' | 'exchange' | 'finished';

export interface Settings {
  timer: boolean;
  autoPass: boolean;
  turnSeconds: number;
  /** ผ่านอัตโนมัติเมื่อไม่มีไพ่ลงได้ (host ปิดได้) */
  autoPassStuck: boolean;
}

// ----- มุมมองผู้เล่นใน state -----
export interface PlayerView {
  name: string;
  connected: boolean;
  cardCount: number;
  finished: boolean;
  isYou: boolean;
  isHost: boolean;
  isTurn: boolean;
  isBot: boolean;
  color: string | null;
  /** ยศจากรอบก่อนเป็น i18n key ('king'|'queen'|'commoner'|'viceslave'|'slave') หรือ null */
  title: string | null;
}

export interface ResultEntry {
  name: string;
  /** ยศเป็น i18n key ('king'|'queen'|'commoner'|'viceslave'|'slave') */
  title: string;
}

// ----- Scoreboard สะสมข้ามรอบ (ทั้ง session ของห้อง) -----
export type RankKey = 'king' | 'queen' | 'commoner' | 'viceslave' | 'slave';
export type RankTally = Record<RankKey, number>;

export interface ScorePlayer {
  name: string;
  tally: RankTally;
  /** จำนวนรอบที่เล่นจบ */
  rounds: number;
}

/** ผลของหนึ่งรอบที่จบแล้ว (เรียงตามอันดับหมดมือ) */
export interface RoundRecord {
  order: ResultEntry[];
}

export interface Scoreboard {
  /** เรียงแล้ว (คิงมากสุด → สลาฟน้อยสุด) */
  players: ScorePlayer[];
  /** ประวัติรอบล่าสุด (ใหม่สุดอยู่ท้าย) — จำกัดจำนวนกันบวม */
  history: RoundRecord[];
}

/** รายการประวัติ — union แบบหลวม: เล่นไพ่ | ผ่าน | event ของเกม */
export interface HistoryEntry {
  name?: string;
  cards?: Card[];
  pass?: boolean;
  event?: string;
  auto?: boolean;
}

export interface ExchangeInfo {
  role: 'winner' | 'loser' | 'none';
  myCount: number;
  toName: string | null;
  myDone: boolean;
  fromName: string | null;
  gaveCount: number;
  waitingNames: string[];
}

export interface Notice {
  seq: number;
  /** i18n key + ตัวแปร (client แปลเอง) */
  key: string;
  vars?: Record<string, string | number>;
}

/** ข้อความ error จาก server — เป็น i18n key + ตัวแปร (client แปลเอง) */
export interface ErrorMsg {
  key: string;
  vars?: Record<string, string | number>;
}

/** payload ของ event 'state' — ผลลัพธ์ของ Room.stateFor() */
export interface RoomState {
  code: string;
  phase: Phase;
  hostId: string | null;
  youAreHost: boolean;
  youIndex: number;
  youAreSpectator: boolean;
  spectatorCount: number;
  turn: number;
  turnName: string | null;
  turnRemainingMs: number | null;
  turnMs: number;
  settings: Settings;
  dir: 1 | -1;
  pile: Combo | null;
  pileCards: CardWithId[] | null;
  players: PlayerView[];
  hand: CardWithId[];
  result: ResultEntry[] | null;
  log: string[];
  history: HistoryEntry[];
  exchange: ExchangeInfo | null;
  notice: Notice | null;
  /** สถิติสะสมข้ามรอบของห้อง (leaderboard + ประวัติ) */
  scoreboard: Scoreboard;
}

// ----- Socket.IO event maps -----
export interface ClientToServerEvents {
  create: (p: { name: string; color?: string }) => void;
  join: (p: { code: string; name: string; color?: string }) => void;
  start: () => void;
  settings: (patch: Partial<Settings>) => void;
  addBot: () => void;
  removeBot: () => void;
  shuffleSeats: () => void;
  setColor: (p: { color: string }) => void;
  play: (p: { cards: string[] }) => void;
  pass: () => void;
  give: (p: { cards: string[] }) => void;
  again: () => void;
  leave: () => void;
}

export interface ServerToClientEvents {
  state: (s: RoomState) => void;
  joined: (p: { code: string }) => void;
  errorMsg: (e: ErrorMsg) => void;
  left: () => void;
}
