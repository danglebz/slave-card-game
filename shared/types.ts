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
  /** ยศจากรอบก่อน (emoji+ชื่อ) หรือ null */
  title: string | null;
}

export interface ResultEntry {
  name: string;
  title: string;
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
  text: string;
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
  errorMsg: (msg: string) => void;
  left: () => void;
}
