// room.ts — room and round state for the Slave card game (server-authoritative)
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
// how many recent rounds to keep (prevent state bloat)
const MAX_HISTORY = 40;

// ----- internal structures -----
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

// each rank title is an i18n key (client renders 'King' + emoji itself)
const RANK_TITLES: Record<number, string[]> = {
  2: ['king', 'slave'],
  3: ['king', 'commoner', 'slave'],
  4: ['king', 'queen', 'viceslave', 'slave'],
  5: ['king', 'queen', 'commoner', 'viceslave', 'slave'],
  6: ['king', 'queen', 'commoner', 'commoner', 'viceslave', 'slave'],
};

let roomSeq = 0;

export class Room {
  // time per turn (ms) before auto-pass/auto-play
  static TURN_MS = Number(process.env.TURN_MS) || 30000;

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
  /** cumulative stats across rounds (key = player name) — counts each title for the whole session */
  sessionStats: Record<string, RankTally>;
  /** per-round results history (newest last) — capped at MAX_HISTORY */
  roundHistory: RoundRecord[];

  // internal fields (not declared in the public type — used within game/timer logic)
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
    // { id(socket), name, connected, hand:[], finished:false }
    this.players = [];
    this.hostId = null;
    // lobby | playing | finished
    this.phase = 'lobby';
    // index in players of whose turn it is
    this.turn = 0;
    // current combo on the table {type,len,value,...}
    this.pile = null;
    // index of the player who last played the pile
    this.pileOwner = null;
    // indices of players who passed this pile → skipped until the pile clears
    this.passed = new Set();
    // rotation direction: 1 = right (normal), -1 = left (after a reverse)
    this.dir = 1;
    // indices ordered by who finished first
    this.finishOrder = [];
    // previous round result (positions)
    this.lastResult = null;
    // short history (text) — backup
    this.log = [];
    // structured history: {name,cards} | {name,pass} | {event}
    this.history = [];
    // card-exchange phase: { [playerIdx]: { to, count, cards|null } }
    this.giveTasks = null;
    // previous round ranking (used to make the slave lead + rotate away from the King)
    this._prevOrder = null;
    // King/Slave of the current round (used for the King-dethroned rule)
    this.roundOrder = null;
    // counter for pop-up notifications (toast) on the client
    this.noticeSeq = 0;
    this.noticeKey = null;
    this.noticeVars = null;
    // timestamp(ms) when the current turn expires (set by server, not saved to file)
    this.turnDeadline = null;
    // spectators who joined mid-round: { id, name } — will play next round
    this.spectators = [];
    this.everPlayed = false;
    this._lastPileCards = null;
    // cumulative stats across rounds
    this.sessionStats = {};
    // per-round results history
    this.roundHistory = [];
    // timer to delete an abandoned room (set/cleared in index.js)
    this._cleanupTimer = null;
    // room settings (controlled by the host)
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

  // max players per room
  static MAX_PLAYERS = 6;
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

  // set the player's own color (self only) — accepts any hex #rrggbb (validated to prevent injection)
  setColor(socketId: string, color?: string): void {
    const p = this.players.find((x) => x.id === socketId);
    if (p && typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color))
      p.color = color.toLowerCase();
  }

  // update room settings (only known/valid values)
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

  // time per turn in ms (per room settings)
  turnMs(): number {
    return (this.settings?.turnSeconds || Math.round(Room.TURN_MS / 1000)) * 1000;
  }

  addHistory(entry: HistoryEntry): void {
    this.history.push(entry);
    if (this.history.length > 50) this.history = this.history.slice(-50);
  }

  // ----- bots (AI to fill seats) -----
  addBot(): void {
    if (this.phase !== 'lobby') gerr('err.botLobbyOnly');
    if (this.players.length >= Room.MAX_PLAYERS) gerr('err.roomFull', { max: Room.MAX_PLAYERS });
    // find the lowest free bot number so names don't collide
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

  // host kicks a player (lobby only) — referenced by name; returns the kicked socket id (for index.ts to notify/remove)
  kick(name: string): string | null {
    if (this.phase !== 'lobby') gerr('err.kickLobbyOnly');
    const idx = this.players.findIndex((p) => p.name === name);
    if (idx < 0) gerr('err.noSuchPlayer');
    if (this.players[idx].id === this.hostId) gerr('err.cantKickSelf');
    const [removed] = this.players.splice(idx, 1);
    return removed.id;
  }

  // shuffle seat order (change rotation order) — lobby only
  shuffleSeats(): void {
    if (this.phase !== 'lobby') gerr('err.shuffleLobbyOnly');
    if (this.players.length < 2) gerr('err.needTwo');
    for (let i = this.players.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.players[i], this.players[j]] = [this.players[j], this.players[i]];
    }
  }

  // join room → returns 'player' or 'spectator'
  addPlayer(socketId: string, name: string): 'player' | 'spectator' {
    // reconnect / refresh: duplicate name → reclaim the existing seat (regardless of whether the old socket has disconnected yet)
    // guard against the refresh race where the new socket connects before the old one drops (bots excluded)
    const existing = this.players.find((p) => p.name === name && !p.isBot);
    if (existing) {
      const oldId = existing.id;
      existing.id = socketId;
      existing.connected = true;
      // move host along if this player was the host
      if (this.hostId === oldId) this.hostId = socketId;
      if (!this.players.some((p) => p.id === this.hostId && p.connected && !p.isBot)) {
        this.hostId = socketId;
      }
      return 'player';
    }
    // reconnect a lingering spectator
    const spec = this.spectators.find((s) => s.name === name);
    if (spec) {
      spec.id = socketId;
      return 'spectator';
    }
    // joining fresh during lobby = player
    if (this.phase === 'lobby') {
      if (this.players.length >= Room.MAX_PLAYERS) gerr('err.roomFull', { max: Room.MAX_PLAYERS });
      const player: Player = { id: socketId, name, connected: true, hand: [], finished: false };
      this.players.push(player);
      if (!this.hostId) this.hostId = socketId;
      return 'player';
    }
    // joining mid-game = spectator (watch first, play next round) — allowed even if the room is full
    this.spectators.push({ id: socketId, name });
    return 'spectator';
  }

  removeSpectator(socketId: string): boolean {
    const n = this.spectators.length;
    this.spectators = this.spectators.filter((s) => s.id !== socketId);
    return this.spectators.length !== n;
  }

  // promote spectators to players (at the start of a new round) as far as seats allow
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
    // move host if the host drops (don't let a bot be host)
    if (this.hostId === socketId) {
      const next = this.players.find((x) => x.connected && !x.isBot);
      this.hostId = next ? next.id : null;
    }
  }

  indexOf(socketId: string): number {
    return this.players.findIndex((p) => p.id === socketId);
  }

  isEmpty(): boolean {
    // empty room = no "real people" online (bots don't count, otherwise the room never gets reaped)
    return this.players.every((p) => p.isBot || !p.connected);
  }

  start(): void {
    // capture last round's ranking as NAMES before seats change (spectator promotion appends,
    // players may have left) — remapped to fresh indices below so the ranking survives a
    // different player count instead of silently resetting the round to first-game rules
    const prevNames = (Array.isArray(this.finishOrder) ? this.finishOrder : [])
      .map((i) => this.players[i]?.name)
      .filter((n): n is string => typeof n === 'string');
    // promote waiting spectators into this round
    this.promoteSpectators();
    if (this.players.length < 2) gerr('err.needTwoStart');
    const prevOrder = prevNames
      .map((name) => this.players.findIndex((p) => p.name === name))
      .filter((i) => i >= 0);
    const hands = deal(this.players.length);
    this.players.forEach((p, i) => {
      p.hand = hands[i];
      p.finished = false;
    });
    this.phase = 'playing';
    this.pile = null;
    this.pileOwner = null;
    this.passed = new Set();
    // every round starts rotating right
    this.dir = 1;
    this.everPlayed = false;
    this._lastPileCards = null;
    this.finishOrder = [];
    this.log = [];
    this.history = [];
    this.giveTasks = null;
    // needs at least King + Slave still seated; newcomers simply play this round untitled
    this._prevOrder = prevOrder.length >= 2 ? prevOrder : null;
    this.addHistory({ event: '🆕 เริ่มรอบใหม่' });
    // if a previous round produced a ranking → enter the "card exchange" phase (manual pick) before play starts
    if (this._prevOrder) {
      this.setupExchange(this._prevOrder);
    } else {
      this.beginPlay();
    }
  }

  // begin actual play (after the exchange finishes, or the first game with no exchange)
  beginPlay(): void {
    this.phase = 'playing';
    this.giveTasks = null;
    // one-shot flag: clear it here too, so a dethrone re-deal that falls back to the first-game
    // path (fewer than 2 ranked players left after remapping) can't leak it into a later round
    this._miyakoExchange = false;
    const prev = this._prevOrder;
    if (prev && prev.length >= 2) {
      // round 2+: slave leads, no 3♣ required, direction "rotates away from the King"
      // (prev may be shorter than players — promoted spectators play this round untitled)
      const n = this.players.length;
      const slave = prev[prev.length - 1];
      const king = prev[0];
      this.turn = slave;
      // skip the "first pile must contain 3♣" condition
      this.everPlayed = true;
      // rotate away from the King: pick the direction leading away from the King (the King is at the far end)
      // how many +1 steps to reach the King
      const stepsCW = (king - slave + n) % n;
      // if the King is near the +1 side → rotate -1 (flee)
      this.dir = stepsCW <= n / 2 ? -1 : 1;
      this.log.push(`เริ่มรอบใหม่! ${this.players[slave].name} (สลาฟ) ขึ้นก่อน — หมุนหนีคิง`);
      this.addHistory({ event: `▶️ ${this.players[slave].name} (สลาฟ) ขึ้นก่อน` });
      // used to check "King dethroned" (slave finishes before the King)
      this.roundOrder = prev.slice();
    } else {
      // first game: holder of 3♣ leads + first pile must contain 3♣
      this.everPlayed = false;
      this.turn = findStarter(this.players.map((p) => p.hand));
      this.log.push(`เริ่มเกม! ${this.players[this.turn].name} ขึ้นก่อน (ถือ 3♣)`);
      this.addHistory({ event: `▶️ ${this.players[this.turn].name} ขึ้นก่อน` });
      // first game has no King/Slave → no King-dethroned rule
      this.roundOrder = null;
    }
    this._prevOrder = null;
  }

  // King dethroned: the (former) slave empties their hand before the (former) King → swap King↔Slave, end round, redeal immediately
  miyakoOchi(): { ok: true } {
    const n = this.roundOrder!.length;
    const order = this.roundOrder!.slice();
    // swap King↔Slave
    [order[0], order[n - 1]] = [order[n - 1], order[0]];
    this.finishOrder = order;
    const titles = RANK_TITLES[n] || [];
    this.lastResult = order.map((pIdx, rank) => ({
      name: this.players[pIdx].name,
      title: titles[rank] || 'slave',
    }));
    // ← accumulate stats (a dethrone also counts as ending a round)
    this.recordRound(this.lastResult);
    this.log.push(`dethrone: ${this.players[order[n - 1]].name} (was king) becomes slave — redeal`);
    this.noticeSeq++;
    this.noticeKey = 'notice.dethrone';
    this.noticeVars = { name: this.players[order[n - 1]].name };
    // King dethroned → exchange only King↔Slave (Queen/Vice-slave don't exchange)
    this._miyakoExchange = true;
    // read finishOrder as the new ranking → deal + enter the exchange phase immediately
    this.start();
    return { ok: true };
  }

  // set up the card-exchange phase:
  //   losers (slave/vice-slave) → forced to hand over their "highest" cards automatically right away
  //   winners (king/queen) → pick which cards to "return" themselves in this phase
  setupExchange(order: number[]): void {
    const n = order.length;
    const tiers = Math.floor(n / 2);
    // King dethroned → exchange only the extreme pair (King↔Slave)
    const onlyKingSlave = this._miyakoExchange;
    this._miyakoExchange = false;
    // normally only "titled" pairs exchange: king/queen ↔ slave/vice-slave — commoners don't exchange (e.g. with 6 players the middle pair doesn't)
    const RANKED_TIERS = 2;
    const maxTier = onlyKingSlave ? 1 : Math.min(tiers, RANKED_TIERS);
    // only winners who must pick: { [winnerIdx]: { to, count, cards|null } }
    this.giveTasks = {};
    for (let i = 0; i < maxTier; i++) {
      // per convention: King↔Slave 2 cards, Queen↔Vice-slave 1 card (fixed for any player count)
      const count = RANKED_TIERS - i;
      // winner
      const w = order[i];
      // loser
      const l = order[n - 1 - i];
      // loser sends their highest cards automatically → winner
      const loser = this.players[l];
      sortHand(loser.hand);
      // the highest `count` cards
      const highest = loser.hand.slice(-count);
      const rm = new Set(highest.map(cardId));
      loser.hand = loser.hand.filter((c) => !rm.has(cardId(c)));
      this.players[w].hand.push(...highest.map((c) => ({ r: c.r, s: c.s })));
      sortHand(this.players[w].hand);
      this.addHistory({
        event: `⛓️ ${loser.name} ส่งไพ่สูงสุด ${count} ใบ ให้ ${this.players[w].name}`,
      });
      // winner must pick `count` cards to return to the loser
      this.giveTasks[w] = { to: l, count, cards: null };
    }
    this.phase = 'exchange';
  }

  // winner sends the chosen cards back to the loser
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
    // all winners have picked → move the returned cards, then start play
    if (Object.values(this.giveTasks).every((t) => t.cards)) {
      this.performExchange();
    }
    return { ok: true };
  }

  performExchange(): void {
    // move only the cards winners chose to return to losers (losers already gave their highest during setup)
    for (const [from, t] of Object.entries(this.giveTasks!)) {
      const rm = new Set(t.cards!);
      this.players[+from].hand = this.players[+from].hand.filter((c) => !rm.has(cardId(c)));
      for (const id of t.cards!) this.players[t.to].hand.push(cardFromId(id));
    }
    this.players.forEach((p) => sortHand(p.hand));
    this.addHistory({ event: '🎁 แลกไพ่เสร็จแล้ว' });
    this.beginPlay();
  }

  // a bot that is a winner → automatically returns its "lowest" cards to the loser
  botGive(idx: number): boolean {
    const task = this.giveTasks && this.giveTasks[idx];
    if (!task || task.cards) return false;
    sortHand(this.players[idx].hand);
    const ids = this.players[idx].hand.slice(0, task.count).map(cardId);
    this._give(idx, ids);
    return true;
  }

  // a winner still owing exchange cards who can't pick for themselves (a bot, or a disconnected
  // human) → index.ts auto-resolves via botGive so an AFK/dropped winner can't stall the exchange
  // phase forever (there is no turn timer in 'exchange' — see armTurnTimer)
  pendingAutoGiver(): number | null {
    if (this.phase !== 'exchange' || !this.giveTasks) return null;
    for (const key of Object.keys(this.giveTasks)) {
      const i = +key;
      const p = this.players[i];
      if (!this.giveTasks[i].cards && (p?.isBot || !p?.connected)) return i;
    }
    return null;
  }

  activeCount(): number {
    return this.players.filter((p) => !p.finished).length;
  }

  // find the index of the next player who hasn't finished (following rotation direction)
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
    // verify the played cards are actually in hand
    const handIds = new Set(player.hand.map(cardId));
    for (const id of cardIds) {
      if (!handIds.has(id)) gerr('err.noSuchCard');
    }
    if (new Set(cardIds).size !== cardIds.length) gerr('err.dupCard');

    const combo = identifyCombo(cards);
    if (!combo) gerr('err.invalidCombo');

    // house rules: special combos the host disabled → can't be played
    if (disallowedComboTypes(this.settings).has(combo!.type))
      gerr('err.comboDisabled', { type: combo!.type });

    // the very first play of the game must include 3♣ (three of clubs)
    if (!this.everPlayed && !cardIds.includes('3.0')) {
      gerr('err.first3');
    }

    if (!canBeat(this.pile, combo!)) {
      if (!this.pile) gerr('err.cannotPlay');
      // same type/count as the pile? (if so = just too small / if not = wrong type)
      const sameShape =
        combo!.type === this.pile.type &&
        (combo!.type !== 'straight' || combo!.len === this.pile.len);
      // err.mustBeat sends the pile's type/len/mode → client builds the combo name + bomb hint by context itself
      if (sameShape) gerr('err.tooSmall');
      else
        gerr('err.mustBeat', {
          type: this.pile.type,
          len: this.pile.len,
          mode: this.pile.mode === 'bomb' ? 'bomb' : 'normal',
        });
    }
    combo.mode = playMode(this.pile, combo);

    // remove the cards from hand
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

      // King dethroned: the (former) slave empties their hand before the (former) King → end round, redeal immediately
      if (this.roundOrder) {
        const king = this.roundOrder[0];
        const slave = this.roundOrder[this.roundOrder.length - 1];
        if (idx === slave && !this.players[king].finished) {
          return this.miyakoOchi();
        }
      }
    }

    // only one player left who hasn't finished → end the round
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

    // passed = out of this pile, skipped until the pile clears
    this.passed.add(idx);
    this.log.push(`${this.players[idx].name} ผ่าน${auto ? ` (${reason})` : ''}`);
    this.addHistory({ name: this.players[idx].name, pass: true, auto });
    this.advanceTurn();
    return { ok: true };
  }

  // turn timed out → act automatically: pile present = pass, leading = play the lowest card
  autoAct(): boolean {
    if (this.phase !== 'playing') return false;
    const idx = this.turn;
    const player = this.players[idx];
    if (!player || player.finished) return false;
    if (this.pile) {
      this._pass(idx, true);
    } else {
      sortHand(player.hand);
      // lowest card (in the first game this is 3♣ anyway → passes the 3♣ condition)
      const lowest = player.hand[0];
      if (!lowest) return false;
      this._play(idx, [cardId(lowest)], true);
    }
    return true;
  }

  // bot plays its turn (called when it's a bot's turn) — picks a legal move or passes
  botAct(): boolean {
    if (this.phase !== 'playing') return false;
    const idx = this.turn;
    const bot = this.players[idx];
    if (!bot || !bot.isBot || bot.finished) return false;
    // context helps the bot decide: fewest cards any opponent has left + whether the first pile needs 3♣
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
      // leading must play (prevent a stall)
      else this._play(idx, [cardId(sortHand(bot.hand)[0])]);
    } catch {
      // prevent a stall: if the bot's chosen move is illegal for any reason → pass, or play the lowest single
      if (this.pile) this._pass(idx);
      else this._play(idx, [cardId(sortHand(bot.hand)[0])]);
    }
    return true;
  }

  // find the next player still in this pile (not finished and not passed, following rotation) — returns null if none remain
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
    // none left, or rotation returned to the pile owner → everyone else passed/finished → pile owner wins the pile, clear and lead anew
    if (next === null || next === this.pileOwner) {
      this.pile = null;
      this._lastPileCards = null;
      this.passed = new Set();
      // clearing the pile = starting a new pile → wipe history down to the current pile only
      this.history = [];
      if (this.pileOwner != null && !this.players[this.pileOwner].finished) {
        // pile owner is still in → they lead the new pile (same direction)
        this.turn = this.pileOwner;
        this.log.push(`— เคลียร์กอง ${this.players[this.turn].name} นำใหม่ —`);
      } else {
        // pile owner finished + nobody could beat the pile → reverse direction, then the next player (new direction) leads
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

  // record the round result into cumulative stats + history (called when a round truly ends: endRound / miyakoOchi)
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

  // build the scoreboard (sorted leaderboard + history) to send to the client
  buildScoreboard(): Scoreboard {
    const players: ScorePlayer[] = Object.entries(this.sessionStats).map(([name, tally]) => ({
      name,
      tally,
      rounds: RANK_KEYS.reduce((s, k) => s + tally[k], 0),
    }));
    // sort: most kings → fewest slaves → most queens → fewest vice-slaves → name
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
    // ← accumulate stats
    this.recordRound(this.lastResult);
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

  // the view sent to each player (sees only their own hand)
  stateFor(socketId: string): RoomState {
    const meIdx = this.indexOf(socketId);
    const isSpectator = meIdx < 0 && this.spectators.some((s) => s.id === socketId);
    // titles from the previous round
    const titleByName: Record<string, string> = {};
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

  // card-exchange phase info for this player
  exchangeFor(meIdx: number): ExchangeInfo | null {
    if (this.phase !== 'exchange' || !this.giveTasks) return null;
    // winner (must pick cards to return)
    const my = this.giveTasks[meIdx];
    // loser waiting to receive cards back: there's a task whose to === us
    const incoming = Object.entries(this.giveTasks).find(([, t]) => t.to === meIdx);
    const waiting = Object.entries(this.giveTasks)
      .filter(([, t]) => !t.cards)
      .map(([i]) => this.players[+i]?.name)
      .filter(Boolean);
    return {
      role: my ? 'winner' : incoming ? 'loser' : 'none',
      myCount: my ? my.count : 0,
      toName: my ? (this.players[my.to]?.name ?? null) : null,
      // winner: whether they've picked yet; others = waiting
      myDone: my ? !!my.cards : true,
      fromName: incoming ? (this.players[+incoming[0]]?.name ?? null) : null,
      gaveCount: incoming ? incoming[1].count : 0,
      waitingNames: waiting,
    };
  }

  // ----- save/load state to file (so rooms survive a server restart) -----
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
    // spectators are live sockets, not restored after restart
    room.spectators = [];
    room.everPlayed = data.everPlayed ?? data.phase !== 'lobby';
    // all sockets are gone on restart → real people are offline until they reconnect; bots are always online
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
