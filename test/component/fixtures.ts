// fixtures.ts — ตัวช่วยสร้าง RoomState / PlayerView / ไพ่ สำหรับ component test
// ค่า default = เกมกำลังเล่น 2 คน, "คุณ" คือคนแรก ถึงตา
import type { CardWithId, PlayerView, RoomState, Settings } from '@shared/types';

export function card(r: number, s: number): CardWithId {
  return { r, s, id: `${r}.${s}` };
}

export function settings(over: Partial<Settings> = {}): Settings {
  return {
    timer: false,
    autoPass: false,
    turnSeconds: 30,
    autoPassStuck: true,
    allowTriple: true,
    allowQuad: true,
    allowStraight: true,
    ...over,
  };
}

export function player(over: Partial<PlayerView> = {}): PlayerView {
  return {
    name: 'P',
    connected: true,
    cardCount: 13,
    finished: false,
    isYou: false,
    isHost: false,
    isTurn: false,
    isBot: false,
    color: null,
    title: null,
    ...over,
  };
}

export function roomState(over: Partial<RoomState> = {}): RoomState {
  const players: PlayerView[] = over.players ?? [
    player({ name: 'You', isYou: true, isHost: true, isTurn: true }),
    player({ name: 'Bot 1', isBot: true }),
  ];
  return {
    code: 'ABCD',
    phase: 'playing',
    hostId: null,
    youAreHost: true,
    youIndex: 0,
    youAreSpectator: false,
    spectatorCount: 0,
    turn: 0,
    turnName: 'You',
    turnRemainingMs: null,
    turnMs: 30_000,
    settings: settings(),
    dir: 1,
    pile: null,
    pileCards: null,
    players,
    hand: [],
    result: null,
    log: [],
    history: [],
    exchange: null,
    notice: null,
    scoreboard: { players: [], history: [] },
    ...over,
  };
}
