import { describe, it, expect } from 'vitest';
import { botChoose } from '../../server/bot';
import { cardFromId, identifyCombo } from '../../server/game';
import type { Card, Combo } from '../../shared/types';

// helper to build a card from an id "r.s"
const C = (id: string): Card => cardFromId(id);
const hand = (...ids: string[]): Card[] => ids.map(C);
const combo = (...ids: string[]): Combo => identifyCombo(ids.map(C))!;

describe('botChoose — นำกอง (lead)', () => {
  it('นำด้วยคู่ต่ำแทนที่จะลงเดี่ยวอย่างเดียว', () => {
    // has a pair of 4s (low) → should play the pair, not a single 3
    const h = hand('3.0', '4.0', '4.1', '9.2', '13.3');
    const move = botChoose(h, null);
    expect(move).not.toBeNull();
    const c = identifyCombo(move!.map(C))!;
    expect(c.type).toBe('pair');
    expect(c.topRank).toBe(4);
  });

  it('เก็บตอง/โฟร์ไว้ ไม่นำด้วยบอมบ์ตอนต้นเกม', () => {
    // triple 5 is a bomb, should be kept → lead with another single/pair instead
    const h = hand('5.0', '5.1', '5.2', '7.0', '9.0', '11.0', '13.0', '14.0');
    const move = botChoose(h, null);
    const ids = new Set(move!);
    const usesTriple = ['5.0', '5.1', '5.2'].every((x) => ids.has(x));
    expect(usesTriple).toBe(false);
  });

  it('กองแรกของเกมต้องมี 3♣', () => {
    const h = hand('3.0', '4.0', '4.1', '9.2');
    const move = botChoose(h, null, { mustInclude3: true });
    expect(move).toContain('3.0');
  });

  it('ลงหมดมือได้ → ชนะทันที', () => {
    // only one pair left
    const h = hand('4.0', '4.1');
    const move = botChoose(h, null);
    expect(new Set(move)).toEqual(new Set(['4.0', '4.1']));
  });
});

describe('botChoose — ตามกอง (follow)', () => {
  it('ลงคู่ที่ชนะคู่บนกองด้วย value ต่ำสุด', () => {
    // pair of 6s
    const pile = combo('6.0', '6.1');
    const h = hand('3.0', '8.0', '8.1', '13.0', '13.1');
    const move = botChoose(h, pile);
    const c = identifyCombo(move!.map(C))!;
    expect(c.type).toBe('pair');
    // pair of 8s is lower than a pair of Ks
    expect(c.topRank).toBe(8);
  });

  it('ไม่ทุบคู่เพื่อชนะไพ่เดี่ยว ถ้ามีใบโดด', () => {
    // single 7
    const pile = combo('7.0');
    // has a pair of 9s and a lone 10
    const h = hand('9.0', '9.1', '10.3');
    const move = botChoose(h, pile);
    // use the lone 10, don't break the pair of 9s
    expect(move).toEqual(['10.3']);
  });

  it('ไม่ทุ่มไพ่ 2 ชิงกองเดี่ยวก่อนเวลา → ผ่าน', () => {
    // single A
    const pile = combo('14.0');
    // large hand (not endgame), only a 2 can beat A → should keep it, pass
    const h = hand('15.0', '4.0', '5.0', '6.0', '7.0', '8.0', '9.0', '10.0');
    const move = botChoose(h, pile, { minOppCards: 10 });
    expect(move).toBeNull();
  });

  it('ทุ่มไพ่ 2 เมื่อคู่แข่งใกล้หมดมือ', () => {
    const pile = combo('14.0');
    const h = hand('15.0', '5.0', '6.0');
    const move = botChoose(h, pile, { minOppCards: 1 });
    expect(move).toEqual(['15.0']);
  });

  it('ใช้บอมบ์ปิดเกมเมื่อคู่แข่งเหลือไพ่น้อย', () => {
    // single A — normally loses
    const pile = combo('14.0');
    // has triple 5 (bomb that beats a single)
    const h = hand('5.0', '5.1', '5.2', '9.0');
    const move = botChoose(h, pile, { minOppCards: 2 });
    const c = identifyCombo(move!.map(C))!;
    expect(c.type).toBe('triple');
  });

  it('ไม่ทุ่มบอมบ์ใส่กองเดี่ยวเล็ก ๆ ตอนยังไม่ถึงเวลา', () => {
    const pile = combo('14.0');
    const h = hand('5.0', '5.1', '5.2', '9.0', '10.0', '11.0', '12.0', '13.3');
    const move = botChoose(h, pile, { minOppCards: 9 });
    // no single can beat A (all lower than A) and not desperate → should pass, keep the bomb
    expect(move).toBeNull();
  });

  it('ผ่านกองโหมดบอมบ์เมื่อไม่มีบอมบ์แรงกว่า', () => {
    // triple 10 (bomb mode)
    const pile = combo('10.0', '10.1', '10.2');
    pile.mode = 'bomb';
    const h = hand('3.0', '4.0', '5.0');
    const move = botChoose(h, pile, { minOppCards: 5 });
    expect(move).toBeNull();
  });
});
