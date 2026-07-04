// Integration: Room + game.js working together through one full round (no socket)
// Set hands manually for determinism, then play through for real via play()/pass()
import { describe, it, expect, beforeEach } from 'vitest';
import { Room } from '../../server/room';
import { cardId } from '../../server/game';

// helper: create a 2-player room, start the game, then set custom hands
function twoPlayerRoom() {
  const room = new Room('TEST');
  room.addPlayer('sock-a', 'Alice');
  room.addPlayer('sock-b', 'Bob');
  // first game → beginPlay (no card exchange phase)
  room.start();
  return room;
}

describe('Room: เริ่มเกม', () => {
  let room;
  beforeEach(() => {
    room = twoPlayerRoom();
  });

  it('แจกครบ 26 ใบต่อคน และเข้าสู่เฟส playing', () => {
    expect(room.phase).toBe('playing');
    expect(room.players[0].hand).toHaveLength(26);
    expect(room.players[1].hand).toHaveLength(26);
  });

  it('คนถือ 3♣ เป็นคนเริ่ม', () => {
    const starter = room.players[room.turn];
    expect(starter.hand.some((c) => c.r === 3 && c.s === 0)).toBe(true);
  });

  it('เริ่มเกมด้วยผู้เล่นน้อยกว่า 2 คนไม่ได้', () => {
    const solo = new Room('SOLO');
    solo.addPlayer('x', 'X');
    expect(() => solo.start()).toThrow();
  });
});

describe('Room: ไล่เล่นกองแรก (deterministic)', () => {
  let room;
  beforeEach(() => {
    room = twoPlayerRoom();
    // set known hands: A holds 3♣ (starter), B holds higher cards
    room.players[0].hand = [
      { r: 3, s: 0 },
      { r: 5, s: 0 },
      { r: 7, s: 0 },
    ];
    room.players[1].hand = [
      { r: 6, s: 1 },
      { r: 9, s: 1 },
      { r: 12, s: 1 },
    ];
    room.turn = 0;
    room.everPlayed = false;
    room.pile = null;
    room.passed = new Set();
  });

  it('กองแรกต้องมี 3♣ ไม่งั้นโยน error', () => {
    expect(() => room.play('sock-a', ['5.0'])).toThrow();
  });

  it('ลง 3♣ ได้ กองเปลี่ยน และตาส่งต่อไป B', () => {
    room.play('sock-a', ['3.0']);
    expect(room.pile).toMatchObject({ type: 'single', topRank: 3 });
    expect(room.pileOwner).toBe(0);
    expect(room.turn).toBe(1);
    expect(room.players[0].hand).toHaveLength(2);
  });

  it('B กินด้วยไพ่สูงกว่า แล้ว A ลงไพ่ต่ำกว่าไม่ได้', () => {
    // A leads 3♣
    room.play('sock-a', ['3.0']);
    // B beats with 6
    room.play('sock-b', ['6.1']);
    expect(room.pileOwner).toBe(1);
    expect(room.turn).toBe(0);
    // A has 5,7 left — 5 is lower than 6, can't beat
    expect(() => room.play('sock-a', ['5.0'])).toThrow();
    // but 7 is higher than 6, can play
    room.play('sock-a', ['7.0']);
    expect(room.pile).toMatchObject({ topRank: 7 });
  });

  it('pass แล้วกองเคลียร์ คืนสิทธิ์นำให้เจ้าของกอง', () => {
    // A leads
    room.play('sock-a', ['3.0']);
    // B passes → everyone else has passed, pile clears
    room.pass('sock-b');
    // A owns the last pile → gets to lead the new pile (pile reset)
    expect(room.pile).toBeNull();
    expect(room.turn).toBe(0);
  });
});

describe('Room: จบรอบและจัดอันดับ', () => {
  it('คนหมดมือก่อนได้อันดับ 1 (คิง) เมื่อเหลือคนเดียวรอบจบ', () => {
    const room = twoPlayerRoom();
    // A has one card left, B has two — A empties hand → finished
    // 2♠ strong card
    room.players[0].hand = [{ r: 15, s: 3 }];
    room.players[1].hand = [
      { r: 4, s: 0 },
      { r: 8, s: 0 },
    ];
    room.turn = 0;
    // skip the 3♣ condition
    room.everPlayed = true;
    room.pile = null;
    room.passed = new Set();

    room.play('sock-a', [cardId({ r: 15, s: 3 })]);
    expect(room.players[0].finished).toBe(true);
    // A finishes first
    expect(room.finishOrder[0]).toBe(0);
  });
});

describe('Room: บอท', () => {
  it('เพิ่ม/ลบบอทได้เฉพาะในล็อบบี้ และจำกัด 6 คน', () => {
    const room = new Room('BOTS');
    room.addPlayer('h', 'Host');
    for (let i = 0; i < 5; i++) room.addBot();
    expect(room.players).toHaveLength(6);
    expect(room.hasBots()).toBe(true);
    // already full
    expect(() => room.addBot()).toThrow();
    room.removeBot();
    expect(room.players).toHaveLength(5);
  });
});
