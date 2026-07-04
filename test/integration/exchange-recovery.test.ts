// Integration: the card-exchange phase must not stall when a "winner" who owes cards can't pick.
// Regression for the bug where a human winner who dropped/left mid-exchange froze the whole room
// forever (only bot winners were auto-resolved, and there is no turn timer in the 'exchange' phase).
import { describe, it, expect, beforeEach } from 'vitest';
import { Room } from '../../server/room';

const totalCards = (room: Room) => room.players.reduce((sum, p) => sum + p.hand.length, 0);

// 4-player room entering the exchange phase (previous round covered everyone).
// giveTasks: King=idx0 (returns 2), Queen=idx1 (returns 1); both start as connected humans.
function exchangeRoom(): Room {
  const room = new Room('EXCH');
  ['p0', 'p1', 'p2', 'p3'].forEach((id, i) => room.addPlayer(id, `P${i}`));
  room.finishOrder = [0, 1, 2, 3];
  room.start();
  return room;
}

describe('เฟสแลกไพ่: กันห้องค้างเมื่อผู้ชนะเลือกไพ่เองไม่ได้', () => {
  let room: Room;
  beforeEach(() => {
    room = exchangeRoom();
    expect(room.phase).toBe('exchange');
  });

  it('ผู้ชนะที่ยัง online อยู่ → ไม่ auto-give (รอให้เลือกเอง)', () => {
    // both winners are connected humans → the server must wait for them, not auto-resolve
    expect(room.pendingAutoGiver()).toBeNull();
  });

  it('ผู้ชนะที่หลุดการเชื่อมต่อ → pendingAutoGiver คืน index ของคนนั้น', () => {
    room.players[0].connected = false;
    expect(room.pendingAutoGiver()).toBe(0);
  });

  it('ผู้ชนะที่เป็นบอท → pendingAutoGiver คืน index (พฤติกรรมเดิมคงอยู่)', () => {
    room.players[1].isBot = true;
    // winner 0 is still a connected human → the FIRST auto-resolvable is the bot at 1
    expect(room.pendingAutoGiver()).toBe(1);
  });

  it('ผู้ชนะที่เลือกไปแล้ว ไม่ถูกหยิบมา auto-give ซ้ำ', () => {
    // resolve winner 0, then drop it — it already has cards, so it must not be picked again
    room.botGive(0);
    room.players[0].connected = false;
    expect(room.pendingAutoGiver()).toBeNull();
  });

  it('ผู้ชนะหลุดทั้งคู่ → auto-give จนเฟสแลกจบเข้า playing (ไม่ค้างถาวร)', () => {
    // simulate both winners dropping mid-exchange (the real stall scenario)
    room.players[0].connected = false;
    room.players[1].connected = false;
    // drive exactly what index.ts does on each broadcast: resolve one pending auto-giver at a time
    let guard = 0;
    let idx: number | null;
    while ((idx = room.pendingAutoGiver()) !== null) {
      room.botGive(idx);
      if (++guard > 10) throw new Error('exchange did not converge (still stalling)');
    }
    // the exchange completed → play begins, no cards lost
    expect(room.phase).toBe('playing');
    expect(totalCards(room)).toBe(52);
  });
});

describe('miyakoOchi: ล้าง _miyakoExchange ไม่ให้รั่วข้ามรอบ', () => {
  it('beginPlay ล้าง flag เสมอ (เผื่อ dethrone divert ไป first-game path เพราะจำนวนคนเปลี่ยน)', () => {
    const room = new Room('MIYA');
    room.addPlayer('a', 'A');
    room.addPlayer('b', 'B');
    // stale one-shot flag left over from a dethrone that fell back to beginPlay()
    room._miyakoExchange = true;
    room.beginPlay();
    expect(room._miyakoExchange).toBe(false);
  });
});
