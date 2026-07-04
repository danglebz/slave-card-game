/**
 * Shared contract types — single source of truth for both server and client
 *
 * Never rename an event / field without updating both sides at once
 * (the Socket.IO contract is tightly coupled — a single typo = broken client)
 */

// ----- Cards -----
/** suit 0=♣ 1=♦ 2=♥ 3=♠ ; rank 3..10, J=11, Q=12, K=13, A=14, 2=15 */
export interface Card {
  r: number;
  s: number;
}

/** A card sent to the client with an id ('rank.suit', e.g. '15.3') */
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
  /** Is the pile currently in bomb mode? (set when a triple/quad/straight is played) */
  mode?: 'bomb' | 'normal';
}

// ----- Phase / settings -----
export type Phase = 'lobby' | 'playing' | 'exchange' | 'finished';

export interface Settings {
  timer: boolean;
  autoPass: boolean;
  turnSeconds: number;
  /** Auto-pass when no card can be played (host can disable) */
  autoPassStuck: boolean;
  /** house rules: whether special combos are allowed (host can disable) — singles/pairs are always playable */
  // triple
  allowTriple: boolean;
  // quad (bomb)
  allowQuad: boolean;
  // straight
  allowStraight: boolean;
}

// ----- Player view within state -----
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
  /** Title from the previous round as an i18n key ('king'|'queen'|'commoner'|'viceslave'|'slave') or null */
  title: string | null;
}

export interface ResultEntry {
  name: string;
  /** Title as an i18n key ('king'|'queen'|'commoner'|'viceslave'|'slave') */
  title: string;
}

// ----- Scoreboard accumulated across rounds (the room's whole session) -----
export type RankKey = 'king' | 'queen' | 'commoner' | 'viceslave' | 'slave';
export type RankTally = Record<RankKey, number>;

export interface ScorePlayer {
  name: string;
  tally: RankTally;
  /** Number of rounds played to completion */
  rounds: number;
}

/** Result of one finished round (ordered by finishing rank) */
export interface RoundRecord {
  order: ResultEntry[];
}

export interface Scoreboard {
  /** Sorted (most Kings → fewest Slaves) */
  players: ScorePlayer[];
  /** Recent round history (newest at the end) — capped in count to prevent bloat */
  history: RoundRecord[];
}

/** A history entry — a loose union: play cards | pass | a game event */
export interface HistoryEntry {
  name?: string;
  cards?: Card[];
  pass?: boolean;
  event?: string;
  auto?: boolean;
}

/** Web Push subscription (the result of PushSubscription.toJSON() on the browser side) */
export interface PushSubJSON {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
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
  /** i18n key + variables (the client translates) */
  key: string;
  vars?: Record<string, string | number>;
}

/** Error message from the server — an i18n key + variables (the client translates) */
export interface ErrorMsg {
  key: string;
  vars?: Record<string, string | number>;
}

/** Payload of the 'state' event — the result of Room.stateFor() */
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
  /** The room's stats accumulated across rounds (leaderboard + history) */
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
  kick: (p: { name: string }) => void;
  shuffleSeats: () => void;
  setColor: (p: { color: string }) => void;
  play: (p: { cards: string[] }) => void;
  pass: () => void;
  give: (p: { cards: string[] }) => void;
  again: () => void;
  leave: () => void;
  /** Register for Web Push (notifications even when the app is closed) — bound to the seat in the current room */
  pushSubscribe: (p: { sub: PushSubJSON; lang: string }) => void;
  /** Unregister Web Push for the seat in the current room */
  pushUnsubscribe: () => void;
}

export interface ServerToClientEvents {
  state: (s: RoomState) => void;
  joined: (p: { code: string }) => void;
  errorMsg: (e: ErrorMsg) => void;
  left: () => void;
}
