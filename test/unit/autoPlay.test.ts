// Unit: autoPlayIds — auto-play the last combo (regression guard for commit b402a47)
// The old inline code only auto-played single/pair; triple/quad/straight silently never fired.
// autoPlayIds now delegates to the real shared rules (identifyCombo + canBeat) → every type works.
import { describe, it, expect } from 'vitest';
import { autoPlayIds } from '@/lib/gameLogic';
import { identifyCombo } from '@shared/rules';
import type { Card, CardWithId, RoomState, Settings } from '@shared/types';

// build a CardWithId from "r.s" (id = 'rank.suit', e.g. '5.0')
const C = (r: number, s: number): CardWithId => ({ r, s, id: `${r}.${s}` });
// build a pile Combo from raw cards using the REAL rules (so comparisons are authentic)
const pileOf = (...cards: Card[]): RoomState['pile'] => identifyCombo(cards);

const allowAll: Settings = {
  timer: false,
  autoPass: false,
  turnSeconds: 30,
  autoPassStuck: false,
  allowTriple: true,
  allowQuad: true,
  allowStraight: true,
};

// minimal RoomState skeleton; override per case
function makeState(over: Partial<RoomState>): RoomState {
  return {
    phase: 'playing',
    youAreSpectator: false,
    turn: 0,
    youIndex: 0,
    settings: allowAll,
    pile: null,
    hand: [],
    ...over,
  } as RoomState;
}

describe('autoPlayIds — นำกอง (pile=null) เล่นทั้งมือเป็นคอมโบเดียว', () => {
  it('เดี่ยว: คืน id เดียว', () => {
    const hand = [C(9, 2)];
    expect(autoPlayIds(makeState({ hand }))).toEqual(['9.2']);
  });

  it('คู่ (สองใบแรงเท่ากัน): คืนสอง id', () => {
    const hand = [C(9, 0), C(9, 2)];
    expect(autoPlayIds(makeState({ hand }))).toEqual(['9.0', '9.2']);
  });

  it('ตอง (triple): คืนสาม id ← พิสูจน์ regression', () => {
    const hand = [C(9, 0), C(9, 1), C(9, 2)];
    expect(autoPlayIds(makeState({ hand }))).toEqual(['9.0', '9.1', '9.2']);
  });

  it('โฟร์ (quad): คืนสี่ id ← พิสูจน์ regression', () => {
    const hand = [C(9, 0), C(9, 1), C(9, 2), C(9, 3)];
    expect(autoPlayIds(makeState({ hand }))).toEqual(['9.0', '9.1', '9.2', '9.3']);
  });

  it('เรียง (straight ดอกเดียว เรียงต่อ 4♣5♣6♣): คืน id ทั้งหมด ← พิสูจน์ regression', () => {
    const hand = [C(4, 0), C(5, 0), C(6, 0)];
    expect(autoPlayIds(makeState({ hand }))).toEqual(['4.0', '5.0', '6.0']);
  });
});

describe('autoPlayIds — ตามกอง (following the pile)', () => {
  it('ตามเดี่ยวที่ต่ำกว่าด้วยเดี่ยวที่สูงกว่า → เล่นอัตโนมัติ', () => {
    const pile = pileOf({ r: 5, s: 0 });
    const hand = [C(9, 2)];
    expect(autoPlayIds(makeState({ pile, hand }))).toEqual(['9.2']);
  });

  it('ตามเดี่ยวด้วยเดี่ยวที่ต่ำกว่า → null (ทับไม่ได้)', () => {
    const pile = pileOf({ r: 9, s: 2 });
    const hand = [C(5, 0)];
    expect(autoPlayIds(makeState({ pile, hand }))).toBeNull();
  });

  it('ตามกองเดี่ยวด้วยตอง (บอมบ์คู่คี่) → เล่นอัตโนมัติ ← พิสูจน์ regression', () => {
    const pile = pileOf({ r: 15, s: 3 }); // pile = single '2' (highest single)
    const hand = [C(4, 0), C(4, 1), C(4, 2)]; // triple beats a single by parity
    expect(autoPlayIds(makeState({ pile, hand }))).toEqual(['4.0', '4.1', '4.2']);
  });

  it('ตามกองคู่ด้วยโฟร์ (บอมบ์คู่คู่) → เล่นอัตโนมัติ', () => {
    const pile = pileOf({ r: 15, s: 2 }, { r: 15, s: 3 }); // pile = pair of '2'
    const hand = [C(4, 0), C(4, 1), C(4, 2), C(4, 3)]; // quad beats a pair by parity
    expect(autoPlayIds(makeState({ pile, hand }))).toEqual(['4.0', '4.1', '4.2', '4.3']);
  });
});

describe('autoPlayIds — ไม่ใช่คอมโบเดียว → null', () => {
  it('สองใบคนละแรง → null', () => {
    const hand = [C(9, 0), C(10, 1)];
    expect(autoPlayIds(makeState({ hand }))).toBeNull();
  });

  it('สามใบที่ไม่เป็นคอมโบใดๆ → null', () => {
    const hand = [C(4, 0), C(9, 1), C(13, 2)];
    expect(autoPlayIds(makeState({ hand }))).toBeNull();
  });
});

describe('autoPlayIds — เจ้าของห้องปิดชนิดคอมโบ / เงื่อนไขห้ามเล่นอัตโนมัติ', () => {
  it('มือเป็นเรียงแต่ settings.allowStraight=false → null (host ปิด)', () => {
    const settings: Settings = { ...allowAll, allowStraight: false };
    const hand = [C(4, 0), C(5, 0), C(6, 0)];
    expect(autoPlayIds(makeState({ settings, hand }))).toBeNull();
  });

  it('ไม่ใช่ตาเรา (turn !== youIndex) → null', () => {
    const hand = [C(9, 2)];
    expect(autoPlayIds(makeState({ turn: 1, youIndex: 0, hand }))).toBeNull();
  });

  it('เป็นผู้ชม (youAreSpectator=true) → null', () => {
    const hand = [C(9, 2)];
    expect(autoPlayIds(makeState({ youAreSpectator: true, hand }))).toBeNull();
  });

  it("phase 'exchange' / 'finished' / 'lobby' → null", () => {
    const hand = [C(9, 2)];
    for (const phase of ['exchange', 'finished', 'lobby'] as const) {
      expect(autoPlayIds(makeState({ phase, hand }))).toBeNull();
    }
  });

  it('ทับกองไม่ได้ (เดี่ยวเราต่ำกว่าเดี่ยวในกอง) → null', () => {
    const pile = pileOf({ r: 15, s: 3 });
    const hand = [C(5, 0)];
    expect(autoPlayIds(makeState({ pile, hand }))).toBeNull();
  });

  it('state เป็น null → null', () => {
    expect(autoPlayIds(null)).toBeNull();
  });
});
