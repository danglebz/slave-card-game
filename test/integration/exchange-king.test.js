// Integration: เฟสแลกไพ่ + กฎ "คิงตกบัลลังก์" (miyakoOchi)
// กติกาซับซ้อนที่ข้าม Room หลายเมธอด — เทสกันพังตอนแก้
import { describe, it, expect, beforeEach } from 'vitest';
import { Room } from '../../server/room';
import { cardId } from '../../server/game';

const totalCards = (room) => room.players.reduce((sum, p) => sum + p.hand.length, 0);

describe('เฟสแลกไพ่ (4 คน, รอบ 2+)', () => {
  let room;
  beforeEach(() => {
    room = new Room('EXCH');
    ['p0', 'p1', 'p2', 'p3'].forEach((id, i) => room.addPlayer(id, `P${i}`));
    // จำลองอันดับรอบก่อน: คิง=0, ควีน=1, รองสลาฟ=2, สลาฟ=3
    room.finishOrder = [0, 1, 2, 3];
    room.start(); // มี prevOrder ครบ → เข้าเฟสแลกไพ่
  });

  it('เข้าเฟส exchange และมี giveTasks เฉพาะผู้ชนะ (คิง+ควีน)', () => {
    expect(room.phase).toBe('exchange');
    expect(Object.keys(room.giveTasks).sort()).toEqual(['0', '1']);
    expect(room.giveTasks[0]).toMatchObject({ to: 3, count: 2 }); // คิง↔สลาฟ แลก 2
    expect(room.giveTasks[1]).toMatchObject({ to: 2, count: 1 }); // ควีน↔รองสลาฟ แลก 1
  });

  it('ผู้แพ้ถูกดึงไพ่สูงสุดอัตโนมัติ → ผู้ชนะมือใหญ่ขึ้นชั่วคราว', () => {
    expect(room.players[0].hand.length).toBe(15); // คิง +2
    expect(room.players[3].hand.length).toBe(11); // สลาฟ -2
    expect(room.players[1].hand.length).toBe(14); // ควีน +1
    expect(room.players[2].hand.length).toBe(12); // รองสลาฟ -1
    expect(totalCards(room)).toBe(52);
  });

  it('สลาฟส่ง "ไพ่สูงสุด" จริง (ใบที่สูงกว่าไปอยู่กับคิง)', () => {
    // ไพ่ที่คิงเพิ่งได้รับ ต้องสูงกว่าหรือเท่ากับไพ่สูงสุดที่สลาฟเหลือ
    const slaveTop = Math.max(...room.players[3].hand.map((c) => c.r));
    const kingHasHigher = room.players[0].hand.some((c) => c.r >= slaveTop);
    expect(kingHasHigher).toBe(true);
  });

  it('ผู้ชนะเลือกไพ่คืน → performExchange → เริ่มเล่น, สลาฟขึ้นก่อน', () => {
    // คิงเลือกไพ่ต่ำสุด 2 ใบคืน, ควีนเลือก 1 ใบคืน
    const kingGive = room.players[0].hand.slice(0, 2).map(cardId);
    const queenGive = room.players[1].hand.slice(0, 1).map(cardId);
    room.giveCards('p0', kingGive);
    expect(room.phase).toBe('exchange'); // ยังไม่ครบ
    room.giveCards('p1', queenGive);

    expect(room.phase).toBe('playing');
    expect(room.players.every((p) => p.hand.length === 13)).toBe(true);
    expect(totalCards(room)).toBe(52);
    expect(room.turn).toBe(3); // สลาฟ (อันดับสุดท้ายรอบก่อน) ขึ้นก่อน
  });

  it('เลือกไพ่จำนวนผิด → error', () => {
    expect(() => room.giveCards('p0', room.players[0].hand.slice(0, 1).map(cardId))).toThrow();
  });

  it('บอทผู้ชนะเลือกไพ่ต่ำสุดคืนอัตโนมัติได้', () => {
    room.botGive(0);
    room.botGive(1);
    expect(room.phase).toBe('playing');
    expect(totalCards(room)).toBe(52);
  });
});

describe('คิงตกบัลลังก์ (miyakoOchi)', () => {
  it('สลาฟหมดมือก่อนคิง → สลับคิง↔สลาฟ แล้วแจกใหม่เข้าเฟสแลกไพ่', () => {
    const room = new Room('MIYA');
    room.addPlayer('king', 'KingP'); // index 0
    room.addPlayer('slave', 'SlaveP'); // index 1
    room.start(); // เกมแรก
    // จัดฉากเป็น "รอบ 2+": กำหนด roundOrder = [คิง=0, สลาฟ=1]
    room.roundOrder = [0, 1];
    room.phase = 'playing';
    room.everPlayed = true;
    room.turn = 1; // ตาสลาฟ
    room.pile = null;
    room.passed = new Set();
    room.players[0].hand = [
      { r: 9, s: 0 },
      { r: 11, s: 0 },
    ]; // คิงยังมีไพ่
    room.players[1].hand = [{ r: 5, s: 3 }]; // สลาฟเหลือใบเดียว

    room.play('slave', [cardId({ r: 5, s: 3 })]); // สลาฟลงหมดมือก่อนคิง

    // สลับขั้ว: SlaveP กลายเป็นคิง, KingP ตกเป็นสลาฟ
    expect(room.noticeText).toMatch(/คิงตกบัลลังก์/);
    expect(room.lastResult[0].name).toBe('SlaveP');
    expect(room.lastResult[0].title).toMatch(/คิง/);
    expect(room.lastResult[1].name).toBe('KingP');
    // แจกใหม่ + เข้าเฟสแลกไพ่ทันที (เฉพาะคู่คิง↔สลาฟ)
    expect(room.phase).toBe('exchange');
    expect(Object.keys(room.giveTasks)).toEqual(['1']); // คิงใหม่ (index 1) เป็นผู้เลือก
    expect(room._miyakoExchange).toBe(false); // ใช้แล้วถูกรีเซ็ต
  });

  it('สลาฟหมดมือ "หลัง" คิง = ไม่ตกบัลลังก์ (จบรอบปกติ)', () => {
    const room = new Room('NORM');
    room.addPlayer('king', 'KingP');
    room.addPlayer('slave', 'SlaveP');
    room.start();
    room.roundOrder = [0, 1];
    room.phase = 'playing';
    room.everPlayed = true;
    room.turn = 0; // ตาคิง
    room.pile = null;
    room.passed = new Set();
    room.players[0].finished = false;
    room.players[0].hand = [{ r: 9, s: 0 }]; // คิงเหลือใบเดียว
    room.players[1].hand = [
      { r: 5, s: 3 },
      { r: 6, s: 3 },
    ];

    room.play('king', [cardId({ r: 9, s: 0 })]); // คิงหมดมือก่อน → จบรอบปกติ

    expect(room.phase).toBe('finished');
    expect(room.lastResult[0].name).toBe('KingP'); // คิงยังเป็นที่ 1
  });
});
