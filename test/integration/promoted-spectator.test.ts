// Integration: player count changes between rounds (spectator promoted at "again")
// Regression: the carried ranking used to require prevOrder.length === players.length, so a
// promoted spectator silently reset round 2+ to first-game rules — no exchange, 3♣ holder
// leads and the first pile must include 3♣ — even though a King/Slave existed.
import { describe, it, expect, beforeEach } from 'vitest';
import { Room } from '../../server/room';
import { cardId, sortHand } from '../../server/game';

const totalCards = (room: Room) => room.players.reduce((sum, p) => sum + p.hand.length, 0);

describe('spectator promoted between rounds keeps the ranking', () => {
  let room: Room;
  beforeEach(() => {
    room = new Room('PRMO');
    ['p0', 'p1', 'p2'].forEach((id, i) => room.addPlayer(id, `P${i}`));
    room.hostId = 'p0';
    // simulate a finished first game: King=P0, commoner=P1, Slave=P2
    room.phase = 'finished';
    room.finishOrder = [0, 1, 2];
    // a friend joined mid-game → spectator
    expect(room.addPlayer('p3', 'Dave')).toBe('spectator');
    // host presses "again"
    room.resetToLobby();
    room.start();
  });

  it('ยังเข้าเฟสแลกไพ่ (คิง↔สลาฟ) แม้มีคนใหม่ถูกดันเข้ามา', () => {
    expect(room.players.map((p) => p.name)).toEqual(['P0', 'P1', 'P2', 'Dave']);
    expect(room.phase).toBe('exchange');
    // 3 ranked players → only King↔Slave exchange 2 cards
    expect(Object.keys(room.giveTasks!)).toEqual(['0']);
    expect(room.giveTasks![0]).toMatchObject({ to: 2, count: 2 });
    expect(totalCards(room)).toBe(52);
  });

  it('สลาฟ (ไม่ใช่คนถือ 3♣) ขึ้นก่อน และไม่ติดกฎ 3♣', () => {
    room.botGive(0);
    expect(room.phase).toBe('playing');
    // slave of the previous round leads
    expect(room.turn).toBe(2);
    // 3♣ rule must NOT apply in round 2+
    expect(room.everPlayed).toBe(true);
    const slave = room.players[2];
    sortHand(slave.hand);
    const non3c = slave.hand.find((c) => !(c.r === 3 && c.s === 0))!;
    expect(() => room._play(2, [cardId(non3c)])).not.toThrow();
  });

  it('คนใหม่ได้ไพ่และร่วมเล่นรอบนี้แบบไม่มียศ', () => {
    room.botGive(0);
    expect(room.players[3].hand.length).toBeGreaterThan(0);
    // dethrone tracking covers only the ranked players
    expect(room.roundOrder).toEqual([0, 1, 2]);
  });
});

describe('ranking remap edge cases', () => {
  it('ไม่มียศเดิม (เกมแรก) + spectator → ใช้กติกาเกมแรกตามปกติ', () => {
    const room = new Room('PRM2');
    ['p0', 'p1'].forEach((id, i) => room.addPlayer(id, `P${i}`));
    room.start();
    expect(room.phase).toBe('playing');
    expect(room.everPlayed).toBe(false);
    // leader is the 3♣ holder
    const holder = room.players.findIndex((p) => p.hand.some((c) => c.r === 3 && c.s === 0));
    expect(room.turn).toBe(holder);
  });

  it('4 คนมียศครบ + คนใหม่ 1 → แลกทั้งคิง↔สลาฟ และควีน↔รองสลาฟ', () => {
    const room = new Room('PRM3');
    ['p0', 'p1', 'p2', 'p3'].forEach((id, i) => room.addPlayer(id, `P${i}`));
    room.phase = 'finished';
    room.finishOrder = [0, 1, 2, 3];
    room.addPlayer('p4', 'Eve');
    room.resetToLobby();
    room.start();
    expect(room.phase).toBe('exchange');
    expect(Object.keys(room.giveTasks!).sort()).toEqual(['0', '1']);
    expect(room.giveTasks![0]).toMatchObject({ to: 3, count: 2 });
    expect(room.giveTasks![1]).toMatchObject({ to: 2, count: 1 });
    room.botGive(0);
    room.botGive(1);
    expect(room.phase).toBe('playing');
    expect(room.turn).toBe(3);
    expect(totalCards(room)).toBe(52);
  });
});
