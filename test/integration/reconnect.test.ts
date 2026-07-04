// Integration: Room reconnection / seat-reclaim (drives the Room class directly, no sockets)
// A player who drops (PWA suspend / refresh / network blip) and comes back must reclaim the
// SAME seat by name and keep their hand — never become a "ghost" dropped from the room.
import { describe, it, expect, beforeEach } from 'vitest';
import { Room } from '../../server/room';
import { cardId } from '../../server/game';

// helper: 2-player room, game started (first game → beginPlay, no exchange)
function startedRoom() {
  const room = new Room('RECON');
  room.addPlayer('sock-a', 'Alice');
  room.addPlayer('sock-b', 'Bob');
  room.start();
  return room;
}

describe('Room: reconnect ยึดที่นั่งกลับกลางเกม', () => {
  let room;
  beforeEach(() => {
    room = startedRoom();
  });

  it('reconnect ด้วยชื่อเดิม → ได้ที่นั่งเดิม มือไพ่คงเดิม ไม่มีที่นั่งซ้ำ', () => {
    const handBefore = room.players[0].hand.map(cardId);
    // sanity: the seat really holds cards, so the "hand unchanged" checks below aren't trivially true
    expect(handBefore.length).toBeGreaterThan(0);
    const role = room.addPlayer('newSock', 'Alice');
    expect(role).toBe('player');
    // same seat, new socket id, marked connected again
    expect(room.players[0].id).toBe('newSock');
    expect(room.players[0].connected).toBe(true);
    // hand length + content unchanged
    expect(room.players[0].hand).toHaveLength(handBefore.length);
    expect(room.players[0].hand.map(cardId)).toEqual(handBefore);
    // still playing, no duplicate seat
    expect(room.phase).toBe('playing');
    expect(room.players).toHaveLength(2);
  });

  it('host ตามไปที่ socket ใหม่เมื่อ host คนเดิม reconnect', () => {
    // Alice joined first → is host
    expect(room.hostId).toBe('sock-a');
    room.addPlayer('newSock', 'Alice');
    expect(room.hostId).toBe('newSock');
  });

  it('refresh race: ยึดที่นั่งได้แม้ไม่ได้เรียก removePlayer ก่อน (socket เดิมยัง connected)', () => {
    // old socket has NOT dropped yet — still connected
    expect(room.players[0].connected).toBe(true);
    const role = room.addPlayer('raceSock', 'Alice');
    expect(role).toBe('player');
    // still exactly one Alice seat, now on the new socket
    expect(room.players).toHaveLength(2);
    const alices = room.players.filter((p) => p.name === 'Alice');
    expect(alices).toHaveLength(1);
    expect(alices[0].id).toBe('raceSock');
    expect(alices[0].connected).toBe(true);
  });
});

describe('Room: disconnect กลางเกม vs ในล็อบบี้', () => {
  it('disconnect กลางเกม → ที่นั่งยังอยู่ (connected=false) เฟสยังเป็น playing', () => {
    const room = startedRoom();
    room.removePlayer('sock-a');
    expect(room.players).toHaveLength(2);
    const alice = room.players.find((p) => p.name === 'Alice');
    expect(alice).toBeTruthy();
    expect(alice.connected).toBe(false);
    expect(room.phase).toBe('playing');
  });

  it('disconnect ในล็อบบี้ → ที่นั่งถูกลบทิ้ง', () => {
    const room = new Room('LOBBY');
    room.addPlayer('sock-a', 'Alice');
    room.addPlayer('sock-b', 'Bob');
    expect(room.phase).toBe('lobby');
    room.removePlayer('sock-a');
    expect(room.players).toHaveLength(1);
    expect(room.players.find((p) => p.name === 'Alice')).toBeUndefined();
  });
});

describe('Room: spectators (เข้ากลางเกม)', () => {
  it('เข้ากลางเกมด้วยชื่อใหม่ → spectator (players ไม่เพิ่ม)', () => {
    const room = startedRoom();
    const role = room.addPlayer('spec-1', 'Carol');
    expect(role).toBe('spectator');
    expect(room.spectators).toHaveLength(1);
    expect(room.players).toHaveLength(2);
  });

  it('เข้ากลางเกมด้วยชื่อใหม่ → spectator แม้ห้องเต็ม', () => {
    const room = new Room('FULL');
    for (let i = 0; i < Room.MAX_PLAYERS; i++) room.addPlayer(`s${i}`, `P${i}`);
    expect(room.players).toHaveLength(Room.MAX_PLAYERS);
    room.start();
    const role = room.addPlayer('spec-x', 'Zed');
    expect(role).toBe('spectator');
    expect(room.spectators).toHaveLength(1);
    expect(room.players).toHaveLength(Room.MAX_PLAYERS);
  });

  it('reconnect spectator ด้วยชื่อเดิม → spectator และอัปเดต id', () => {
    const room = startedRoom();
    room.addPlayer('spec-1', 'Carol');
    const role = room.addPlayer('spec-2', 'Carol');
    expect(role).toBe('spectator');
    expect(room.spectators).toHaveLength(1);
    expect(room.spectators[0].id).toBe('spec-2');
    expect(room.players).toHaveLength(2);
  });

  it('promoteSpectators: spectator กลายเป็นผู้เล่นตอนเริ่มรอบถัดไป', () => {
    const room = startedRoom();
    room.addPlayer('spec-1', 'Carol');
    expect(room.players).toHaveLength(2);
    // next round → spectator promoted into a seat
    room.start();
    expect(room.players).toHaveLength(3);
    expect(room.players.find((p) => p.name === 'Carol')).toBeTruthy();
    expect(room.spectators).toHaveLength(0);
  });

  it('promoteSpectators: เคารพ MAX_PLAYERS(6) — spectator ที่เกินยังคงรอ', () => {
    const room = new Room('CAP');
    for (let i = 0; i < Room.MAX_PLAYERS; i++) room.addPlayer(`s${i}`, `P${i}`);
    room.start();
    room.addPlayer('spec-x', 'Zed');
    // starting the next round can't seat Zed — room already at MAX
    room.start();
    expect(room.players).toHaveLength(Room.MAX_PLAYERS);
    expect(room.spectators).toHaveLength(1);
    expect(room.spectators[0].name).toBe('Zed');
  });
});

describe('Room: isEmpty (บอทไม่นับ)', () => {
  it('เหลือแต่บอท + คนที่ disconnected → ถือว่าว่าง', () => {
    const room = new Room('GHOST');
    room.addPlayer('sock-a', 'Alice');
    room.addBot();
    room.start();
    // Alice drops mid-game → seat kept but disconnected
    room.removePlayer('sock-a');
    // only a bot (connected) + a disconnected human remain
    expect(room.isEmpty()).toBe(true);
  });

  it('มีคนจริง connected อยู่ 1 คน → ไม่ว่าง', () => {
    const room = new Room('ALIVE');
    room.addPlayer('sock-a', 'Alice');
    room.addBot();
    room.start();
    expect(room.isEmpty()).toBe(false);
  });
});

describe('Room: host reassignment', () => {
  it('host หลุดกลางเกม → hostId ย้ายไปคนจริงที่ connected อยู่ (ไม่ใช่บอท)', () => {
    const room = new Room('HOST');
    room.addPlayer('sock-a', 'Alice'); // host
    room.addBot(); // sits between the humans to prove a bot is skipped
    room.addPlayer('sock-c', 'Carol');
    room.start();
    expect(room.hostId).toBe('sock-a');
    // sanity: the bot sits before Carol in seat order
    expect(room.players[1].isBot).toBe(true);
    room.removePlayer('sock-a');
    // host must move to a connected non-bot — Carol, never the bot
    expect(room.hostId).toBe('sock-c');
    const newHost = room.players.find((p) => p.id === room.hostId);
    expect(newHost.isBot).toBeFalsy();
  });
});
