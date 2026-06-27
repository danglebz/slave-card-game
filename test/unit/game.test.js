import { describe, it, expect } from 'vitest';
import {
  createDeck,
  deal,
  cardId,
  cardFromId,
  sortHand,
  identifyCombo,
  bombPower,
  canBeat,
  playMode,
  findStarter,
} from '../../server/game.js';

describe('createDeck', () => {
  it('สร้างสำรับ 52 ใบไม่ซ้ำ', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map(cardId)).size).toBe(52);
  });
});

describe('cardId / cardFromId', () => {
  it('แปลงไป-กลับได้ค่าเดิม', () => {
    const c = { r: 14, s: 2 };
    expect(cardFromId(cardId(c))).toEqual(c);
  });
});

describe('deal', () => {
  it('แจกครบ 52 ใบ และเรียงมือแล้ว', () => {
    const hands = deal(4);
    expect(hands).toHaveLength(4);
    expect(hands.flat()).toHaveLength(52);
    expect(hands.every((h) => h.length === 13)).toBe(true);
    for (const h of hands) {
      expect(h).toEqual(sortHand(h.slice()));
    }
  });

  it('2 คน = 26/26', () => {
    const hands = deal(2);
    expect(hands.map((h) => h.length)).toEqual([26, 26]);
  });
});

describe('identifyCombo', () => {
  it('ระบุไพ่เดี่ยว', () => {
    expect(identifyCombo([{ r: 7, s: 1 }])).toMatchObject({ type: 'single', len: 1, topRank: 7 });
  });

  it('ระบุคู่ (rank เท่ากัน)', () => {
    expect(
      identifyCombo([
        { r: 9, s: 0 },
        { r: 9, s: 3 },
      ]),
    ).toMatchObject({ type: 'pair', topRank: 9 });
  });

  it('คู่ rank ต่างกัน = ไม่ถูกกติกา', () => {
    expect(
      identifyCombo([
        { r: 9, s: 0 },
        { r: 10, s: 0 },
      ]),
    ).toBeNull();
  });

  it('ตอง (triple)', () => {
    expect(
      identifyCombo([
        { r: 5, s: 0 },
        { r: 5, s: 1 },
        { r: 5, s: 2 },
      ]),
    ).toMatchObject({
      type: 'triple',
    });
  });

  it('เรียงดอกเดียวต่อเนื่อง', () => {
    const straight = [
      { r: 4, s: 1 },
      { r: 5, s: 1 },
      { r: 6, s: 1 },
    ];
    expect(identifyCombo(straight)).toMatchObject({ type: 'straight', len: 3, topRank: 6 });
  });

  it('เรียงคนละดอก = ไม่ถูกกติกา', () => {
    expect(
      identifyCombo([
        { r: 4, s: 1 },
        { r: 5, s: 2 },
        { r: 6, s: 1 },
      ]),
    ).toBeNull();
  });

  it('เรียงที่มีไพ่ 2 (r=15) = ไม่ถูกกติกา', () => {
    expect(
      identifyCombo([
        { r: 13, s: 0 },
        { r: 14, s: 0 },
        { r: 15, s: 0 },
      ]),
    ).toBeNull();
  });

  it('คืน null เมื่อ input ไม่ใช่ array หรือว่าง', () => {
    expect(identifyCombo([])).toBeNull();
    expect(identifyCombo(null)).toBeNull();
  });
});

describe('canBeat', () => {
  const single = (r, s = 0) => identifyCombo([{ r, s }]);

  it('คนนำกอง (current=null) ลงอะไรก็ได้', () => {
    expect(canBeat(null, single(3))).toBe(true);
  });

  it('เดี่ยวแต้มสูงกว่ากินเดี่ยวแต้มต่ำกว่า', () => {
    expect(canBeat(single(7), single(10))).toBe(true);
    expect(canBeat(single(10), single(7))).toBe(false);
  });

  it('ตอง (bomb) กินไพ่เดี่ยวได้ไม่สนแต้ม', () => {
    const triple = identifyCombo([
      { r: 4, s: 0 },
      { r: 4, s: 1 },
      { r: 4, s: 2 },
    ]);
    expect(canBeat(single(15), triple)).toBe(true);
  });

  it('candidate ว่าง = กินไม่ได้', () => {
    expect(canBeat(single(5), null)).toBe(false);
  });
});

describe('bombPower', () => {
  it('จัดลำดับความแรงข้ามชนิดถูกต้อง', () => {
    const straight = (len) =>
      identifyCombo(Array.from({ length: len }, (_, i) => ({ r: 4 + i, s: 0 })));
    const triple = identifyCombo([
      { r: 6, s: 0 },
      { r: 6, s: 1 },
      { r: 6, s: 2 },
    ]);
    const quad = identifyCombo([
      { r: 6, s: 0 },
      { r: 6, s: 1 },
      { r: 6, s: 2 },
      { r: 6, s: 3 },
    ]);
    expect(bombPower(straight(3))).toBe(1);
    expect(bombPower(triple)).toBe(2);
    expect(bombPower(straight(4))).toBe(3);
    expect(bombPower(quad)).toBe(4);
    expect(bombPower(straight(5))).toBe(5);
    expect(bombPower(single({ r: 7, s: 0 }))).toBe(0);
  });

  function single(c) {
    return identifyCombo([c]);
  }
});

describe('playMode', () => {
  it('นำกองด้วยตอง = โหมดบอมบ์', () => {
    const triple = identifyCombo([
      { r: 6, s: 0 },
      { r: 6, s: 1 },
      { r: 6, s: 2 },
    ]);
    expect(playMode(null, triple)).toBe('bomb');
  });

  it('นำกองด้วยเดี่ยว = โหมดปกติ', () => {
    expect(playMode(null, identifyCombo([{ r: 6, s: 0 }]))).toBe('normal');
  });
});

describe('findStarter', () => {
  it('คืน index ผู้ถือ 3♣', () => {
    const hands = [[{ r: 5, s: 0 }], [{ r: 3, s: 0 }], [{ r: 9, s: 2 }]];
    expect(findStarter(hands)).toBe(1);
  });

  it('ไม่มีใครถือ 3♣ → คืน 0', () => {
    expect(findStarter([[{ r: 5, s: 0 }]])).toBe(0);
  });
});
