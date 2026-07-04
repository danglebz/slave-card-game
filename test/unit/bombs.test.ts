// Unit: bomb system — the "what beats what" matrix (the most complex logic in the game)
// bomb = special combo that beats a smaller pile regardless of value + has a cross-type power ordering
import { describe, it, expect } from 'vitest';
import { identifyCombo, bombPower, canBeat, playMode } from '../../server/game';

// helpers to build combos from short specs
const single = (r, s = 0) => identifyCombo([{ r, s }]);
const pair = (r) =>
  identifyCombo([
    { r, s: 0 },
    { r, s: 1 },
  ]);
const triple = (r) =>
  identifyCombo([
    { r, s: 0 },
    { r, s: 1 },
    { r, s: 2 },
  ]);
const quad = (r) =>
  identifyCombo([
    { r, s: 0 },
    { r, s: 1 },
    { r, s: 2 },
    { r, s: 3 },
  ]);
const straight = (lowR, len, s = 0) =>
  identifyCombo(Array.from({ length: len }, (_, i) => ({ r: lowR + i, s })));

describe('bombPower: ลำดับความแรง (อ่อน→แรง) — เรียง6 แรงสุด, โฟร์เหนือเรียง5', () => {
  it('เรียง3=1 < ตอง=2 < เรียง4=3 < เรียง5=4 < โฟร์=5 < เรียง6=6', () => {
    expect(bombPower(straight(4, 3))).toBe(1);
    expect(bombPower(triple(6))).toBe(2);
    expect(bombPower(straight(4, 4))).toBe(3);
    expect(bombPower(straight(4, 5))).toBe(4);
    expect(bombPower(quad(6))).toBe(5);
    expect(bombPower(straight(4, 6))).toBe(6);
  });

  it('เดี่ยว/คู่ ไม่ใช่บอมบ์ (power 0)', () => {
    expect(bombPower(single(15))).toBe(0);
    expect(bombPower(pair(15))).toBe(0);
  });
});

describe('canBeat: บอมบ์กินกองเล็ก', () => {
  // beats a single = "odd-count" bombs (triple / straight3 / straight5)
  it.each([
    ['ตอง', triple(4)],
    ['เรียง3', straight(7, 3)],
    ['เรียง5', straight(7, 5)],
  ])('%s กินไพ่เดี่ยวได้ไม่สนแต้ม', (_name, bomb) => {
    // even a 2♣ single (strongest) gets beaten
    expect(canBeat(single(15), bomb)).toBe(true);
  });

  it('เรียง4 / โฟร์ "ไม่" กินไพ่เดี่ยว (เป็น pair-killer ไม่ใช่ single-killer)', () => {
    expect(canBeat(single(15), straight(7, 4))).toBe(false);
    expect(canBeat(single(15), quad(4))).toBe(false);
  });

  // beats a pair = "even-count" bombs (quad / straight4 / straight6)
  it.each([
    ['โฟร์', quad(4)],
    ['เรียง4', straight(7, 4)],
    ['เรียง6', straight(7, 6)],
  ])('%s กินคู่ได้ไม่สนแต้ม', (_name, bomb) => {
    expect(canBeat(pair(15), bomb)).toBe(true);
  });

  it('ตอง / เรียง3 "ไม่" กินคู่ (เป็น single-killer)', () => {
    expect(canBeat(pair(15), triple(4))).toBe(false);
    expect(canBeat(pair(15), straight(7, 3))).toBe(false);
  });
});

describe('canBeat: โหมดบอมบ์ (bomb-vs-bomb)', () => {
  it('บอมบ์แรงกว่าทับบอมบ์อ่อนกว่าได้ (ข้ามชนิด)', () => {
    // power 2
    const cur = { ...triple(4), mode: 'bomb' };
    // quad (power 5) > triple (power 2)
    expect(canBeat(cur, quad(4))).toBe(true);
    // straight3 (power 1) < triple (power 2)
    expect(canBeat(cur, straight(7, 3))).toBe(false);
  });

  it('บอมบ์ power เท่ากัน → ตัดสินด้วยแต้ม (value)', () => {
    // quad 6
    const cur = { ...quad(6), mode: 'bomb' };
    // quad 9 has higher value
    expect(canBeat(cur, quad(9))).toBe(true);
    // quad 4 has lower value
    expect(canBeat(cur, quad(4))).toBe(false);
  });

  it('ในโหมดบอมบ์ ลงไพ่ปกติ (ไม่ใช่บอมบ์) ไม่ได้', () => {
    const cur = { ...triple(4), mode: 'bomb' };
    expect(canBeat(cur, single(15))).toBe(false);
    expect(canBeat(cur, pair(15))).toBe(false);
  });
});

describe('playMode: กองเข้าสู่โหมดบอมบ์เมื่อไหร่', () => {
  it('นำกองด้วยตอง/โฟร์ = เข้าโหมดบอมบ์ทันที', () => {
    expect(playMode(null, triple(6))).toBe('bomb');
    expect(playMode(null, quad(6))).toBe('bomb');
  });

  it('นำกองด้วยเดี่ยว/คู่/เรียง = ปกติ', () => {
    expect(playMode(null, single(6))).toBe('normal');
    expect(playMode(null, pair(6))).toBe('normal');
    expect(playMode(null, straight(4, 3))).toBe('normal');
  });

  it('ลงบอมบ์ทับกองเดี่ยว/คู่ = กองกลายเป็นโหมดบอมบ์', () => {
    expect(playMode(single(7), triple(4))).toBe('bomb');
    expect(playMode(pair(7), quad(4))).toBe('bomb');
  });

  it('กองที่อยู่ในโหมดบอมบ์แล้ว ยังเป็นบอมบ์ต่อ', () => {
    const cur = { ...triple(4), mode: 'bomb' };
    expect(playMode(cur, quad(4))).toBe('bomb');
  });
});

describe('canBeat: โฟร์กินเรียง — โฟร์เหนือเรียง3/4/5 แต่แพ้เรียง6', () => {
  it('โฟร์กินเรียงที่นำลง (เรียง3/4/5)', () => {
    // quad over straight3
    expect(canBeat(straight(4, 3), quad(9))).toBe(true);
    // quad over straight4
    expect(canBeat(straight(4, 4), quad(9))).toBe(true);
    // quad over straight5
    expect(canBeat(straight(4, 5), quad(9))).toBe(true);
  });

  it('โฟร์ "ไม่" กินเรียง6 ที่นำลง (เรียง6 ดอกเดียว 6 ใบ = หายากสุด = แรงสุด)', () => {
    expect(canBeat(straight(4, 6), quad(9))).toBe(false);
  });

  it('ตอง / เรียงต่างขนาด "ไม่" กินเรียงที่นำลง', () => {
    // triple doesn't beat a straight
    expect(canBeat(straight(4, 4), triple(9))).toBe(false);
    // straight5 doesn't cross over to beat straight4
    expect(canBeat(straight(4, 4), straight(4, 5))).toBe(false);
  });

  it('โหมดบอมบ์: เรียง6 กินโฟร์ได้ แต่เรียง5 กินไม่ได้', () => {
    // quad (power 5)
    const cur = { ...quad(6), mode: 'bomb' };
    // straight6 (power 6) > quad
    expect(canBeat(cur, straight(7, 6))).toBe(true);
    // straight5 (power 4) < quad
    expect(canBeat(cur, straight(7, 5))).toBe(false);
    // quad 9 > quad 6 (value)
    expect(canBeat(cur, quad(9))).toBe(true);
  });

  it('ลงโฟร์ทับเรียงที่นำลง → กองเข้าโหมดบอมบ์', () => {
    expect(playMode(straight(4, 4), quad(9))).toBe('bomb');
  });

  it('เรียงยาว 7+ ใบ = บอมบ์ตามจำนวนใบ (เหนือโฟร์) ไม่ใช่ power 0', () => {
    // straight7 (3–9 single suit)
    expect(bombPower(straight(3, 7))).toBe(7);
    // quad can't beat a led straight7 (power 7 > quad 5)
    expect(canBeat(straight(3, 7), quad(11))).toBe(false);
    // straight7 (odd count) beats a single by parity
    expect(canBeat(single(15), straight(3, 7))).toBe(true);
  });
});
