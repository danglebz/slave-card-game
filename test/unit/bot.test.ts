import { describe, it, expect } from 'vitest';
import { botChoose } from '../../server/bot';
import { cardFromId, identifyCombo } from '../../server/game';
import type { Card, Combo } from '../../shared/types';

// ช่วยสร้างไพ่จาก id "r.s"
const C = (id: string): Card => cardFromId(id);
const hand = (...ids: string[]): Card[] => ids.map(C);
const combo = (...ids: string[]): Combo => identifyCombo(ids.map(C))!;

describe('botChoose — นำกอง (lead)', () => {
  it('นำด้วยคู่ต่ำแทนที่จะลงเดี่ยวอย่างเดียว', () => {
    // มีคู่ 4 (ต่ำ) → ควรเลือกลงคู่ ไม่ใช่เดี่ยว 3
    const h = hand('3.0', '4.0', '4.1', '9.2', '13.3');
    const move = botChoose(h, null);
    expect(move).not.toBeNull();
    const c = identifyCombo(move!.map(C))!;
    expect(c.type).toBe('pair');
    expect(c.topRank).toBe(4);
  });

  it('เก็บตอง/โฟร์ไว้ ไม่นำด้วยบอมบ์ตอนต้นเกม', () => {
    // ตอง 5 เป็นบอมบ์ ควรถูกเก็บ → นำด้วยเดี่ยว/คู่อื่นแทน
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
    const h = hand('4.0', '4.1'); // เหลือคู่เดียว
    const move = botChoose(h, null);
    expect(new Set(move)).toEqual(new Set(['4.0', '4.1']));
  });
});

describe('botChoose — ตามกอง (follow)', () => {
  it('ลงคู่ที่ชนะคู่บนกองด้วย value ต่ำสุด', () => {
    const pile = combo('6.0', '6.1'); // คู่ 6
    const h = hand('3.0', '8.0', '8.1', '13.0', '13.1');
    const move = botChoose(h, pile);
    const c = identifyCombo(move!.map(C))!;
    expect(c.type).toBe('pair');
    expect(c.topRank).toBe(8); // คู่ 8 ต่ำกว่าคู่ K
  });

  it('ไม่ทุบคู่เพื่อชนะไพ่เดี่ยว ถ้ามีใบโดด', () => {
    const pile = combo('7.0'); // เดี่ยว 7
    const h = hand('9.0', '9.1', '10.3'); // มีคู่ 9 และ 10 โดด
    const move = botChoose(h, pile);
    expect(move).toEqual(['10.3']); // ใช้ 10 โดด ไม่ทุบคู่ 9
  });

  it('ไม่ทุ่มไพ่ 2 ชิงกองเดี่ยวก่อนเวลา → ผ่าน', () => {
    const pile = combo('14.0'); // เดี่ยว A
    // มือใหญ่ (ไม่ใช่ท้ายเกม), ชนะ A ได้แค่ไพ่ 2 → ควรเก็บไว้ ผ่าน
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
    const pile = combo('14.0'); // เดี่ยว A — ปกติแพ้
    const h = hand('5.0', '5.1', '5.2', '9.0'); // มีตอง 5 (บอมบ์กินเดี่ยว)
    const move = botChoose(h, pile, { minOppCards: 2 });
    const c = identifyCombo(move!.map(C))!;
    expect(c.type).toBe('triple');
  });

  it('ไม่ทุ่มบอมบ์ใส่กองเดี่ยวเล็ก ๆ ตอนยังไม่ถึงเวลา', () => {
    const pile = combo('14.0');
    const h = hand('5.0', '5.1', '5.2', '9.0', '10.0', '11.0', '12.0', '13.3');
    const move = botChoose(h, pile, { minOppCards: 9 });
    // เดี่ยวก็ชนะ A ไม่ได้ (ทุกใบต่ำกว่า A) และไม่ desperate → ควรผ่าน เก็บบอมบ์
    expect(move).toBeNull();
  });

  it('ผ่านกองโหมดบอมบ์เมื่อไม่มีบอมบ์แรงกว่า', () => {
    const pile = combo('10.0', '10.1', '10.2'); // ตอง 10 (โหมดบอมบ์)
    pile.mode = 'bomb';
    const h = hand('3.0', '4.0', '5.0');
    const move = botChoose(h, pile, { minOppCards: 5 });
    expect(move).toBeNull();
  });
});
