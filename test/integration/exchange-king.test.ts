// Integration: card exchange phase + "King dethroned" rule (miyakoOchi)
// Complex rules spanning multiple Room methods — tests to guard against regressions
import { describe, it, expect, beforeEach } from 'vitest';
import { Room } from '../../server/room';
import { cardId } from '../../server/game';

const totalCards = (room) => room.players.reduce((sum, p) => sum + p.hand.length, 0);

describe('เฟสแลกไพ่ (4 คน, รอบ 2+)', () => {
  let room;
  beforeEach(() => {
    room = new Room('EXCH');
    ['p0', 'p1', 'p2', 'p3'].forEach((id, i) => room.addPlayer(id, `P${i}`));
    // Simulate previous round order: King=0, Queen=1, Vice-slave=2, Slave=3
    room.finishOrder = [0, 1, 2, 3];
    // full prevOrder present → enter the card exchange phase
    room.start();
  });

  it('เข้าเฟส exchange และมี giveTasks เฉพาะผู้ชนะ (คิง+ควีน)', () => {
    expect(room.phase).toBe('exchange');
    expect(Object.keys(room.giveTasks).sort()).toEqual(['0', '1']);
    // King↔Slave exchange 2
    expect(room.giveTasks[0]).toMatchObject({ to: 3, count: 2 });
    // Queen↔Vice-slave exchange 1
    expect(room.giveTasks[1]).toMatchObject({ to: 2, count: 1 });
  });

  it('ผู้แพ้ถูกดึงไพ่สูงสุดอัตโนมัติ → ผู้ชนะมือใหญ่ขึ้นชั่วคราว', () => {
    // King +2
    expect(room.players[0].hand.length).toBe(15);
    // Slave -2
    expect(room.players[3].hand.length).toBe(11);
    // Queen +1
    expect(room.players[1].hand.length).toBe(14);
    // Vice-slave -1
    expect(room.players[2].hand.length).toBe(12);
    expect(totalCards(room)).toBe(52);
  });

  it('สลาฟส่ง "ไพ่สูงสุด" จริง (ใบที่สูงกว่าไปอยู่กับคิง)', () => {
    // the card the King just received must be >= the highest card the Slave has left
    const slaveTop = Math.max(...room.players[3].hand.map((c) => c.r));
    const kingHasHigher = room.players[0].hand.some((c) => c.r >= slaveTop);
    expect(kingHasHigher).toBe(true);
  });

  it('ผู้ชนะเลือกไพ่คืน → performExchange → เริ่มเล่น, สลาฟขึ้นก่อน', () => {
    // King returns the 2 lowest cards, Queen returns 1 card
    const kingGive = room.players[0].hand.slice(0, 2).map(cardId);
    const queenGive = room.players[1].hand.slice(0, 1).map(cardId);
    room.giveCards('p0', kingGive);
    // not complete yet
    expect(room.phase).toBe('exchange');
    room.giveCards('p1', queenGive);

    expect(room.phase).toBe('playing');
    expect(room.players.every((p) => p.hand.length === 13)).toBe(true);
    expect(totalCards(room)).toBe(52);
    // Slave (last place last round) leads first
    expect(room.turn).toBe(3);
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
    // index 0
    room.addPlayer('king', 'KingP');
    // index 1
    room.addPlayer('slave', 'SlaveP');
    // first game
    room.start();
    // Set up as "round 2+": set roundOrder = [King=0, Slave=1]
    room.roundOrder = [0, 1];
    room.phase = 'playing';
    room.everPlayed = true;
    // Slave's turn
    room.turn = 1;
    room.pile = null;
    room.passed = new Set();
    // King still has cards
    room.players[0].hand = [
      { r: 9, s: 0 },
      { r: 11, s: 0 },
    ];
    // Slave has one card left
    room.players[1].hand = [{ r: 5, s: 3 }];

    // Slave empties hand before the King
    room.play('slave', [cardId({ r: 5, s: 3 })]);

    // Swap poles: SlaveP becomes King, KingP drops to Slave
    expect(room.noticeKey).toBe('notice.dethrone');
    expect(room.lastResult[0].name).toBe('SlaveP');
    expect(room.lastResult[0].title).toBe('king');
    expect(room.lastResult[1].name).toBe('KingP');
    // Re-deal + enter card exchange phase immediately (only the King↔Slave pair)
    expect(room.phase).toBe('exchange');
    // new King (index 1) is the chooser
    expect(Object.keys(room.giveTasks)).toEqual(['1']);
    // reset after use
    expect(room._miyakoExchange).toBe(false);
  });

  it('สลาฟหมดมือ "หลัง" คิง = ไม่ตกบัลลังก์ (จบรอบปกติ)', () => {
    const room = new Room('NORM');
    room.addPlayer('king', 'KingP');
    room.addPlayer('slave', 'SlaveP');
    room.start();
    room.roundOrder = [0, 1];
    room.phase = 'playing';
    room.everPlayed = true;
    // King's turn
    room.turn = 0;
    room.pile = null;
    room.passed = new Set();
    room.players[0].finished = false;
    // King has one card left
    room.players[0].hand = [{ r: 9, s: 0 }];
    room.players[1].hand = [
      { r: 5, s: 3 },
      { r: 6, s: 3 },
    ];

    // King empties hand first → normal round end
    room.play('king', [cardId({ r: 9, s: 0 })]);

    expect(room.phase).toBe('finished');
    // King is still 1st
    expect(room.lastResult[0].name).toBe('KingP');
  });
});
