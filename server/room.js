// room.js — สถานะห้องและรอบเล่นไพ่สลาฟ (server-authoritative)
import {
  deal,
  sortHand,
  identifyCombo,
  canBeat,
  playMode,
  findStarter,
  cardId,
  cardFromId,
} from './game.js';

const RANK_TITLES = {
  2: ['🥇 คิง', '⛓️ สลาฟ'],
  3: ['🥇 คิง', '🙂 สามัญชน', '⛓️ สลาฟ'],
  4: ['🥇 คิง', '🥈 ควีน', '🥉 รองสลาฟ', '⛓️ สลาฟ'],
};

let roomSeq = 0;

export class Room {
  constructor(code) {
    this.code = code;
    this.id = ++roomSeq;
    this.players = []; // { id(socket), name, connected, hand:[], finished:false }
    this.hostId = null;
    this.phase = 'lobby'; // lobby | playing | finished
    this.turn = 0; // index ใน players ของคนที่ถึงตา
    this.pile = null; // combo ปัจจุบันบนโต๊ะ {type,len,value,...}
    this.pileOwner = null; // index ผู้เล่นที่ลงกองล่าสุด
    this.passed = new Set(); // index คนที่ผ่านในกองนี้แล้ว → ข้ามจนกว่ากองจะเคลียร์
    this.dir = 1; // ทิศการวน: 1 = ขวา (ปกติ), -1 = ซ้าย (หลังสลับทิศ)
    this.finishOrder = []; // index เรียงตามคนหมดมือก่อน
    this.lastResult = null; // ผลรอบก่อน (ตำแหน่ง)
    this.log = []; // ประวัติย่อ (ข้อความ) — สำรอง
    this.history = []; // ประวัติแบบมีโครงสร้าง: {name,cards} | {name,pass} | {event}
    this.giveTasks = null; // เฟสแลกไพ่: { [playerIdx]: { to, count, cards|null } }
    this._prevOrder = null; // อันดับรอบก่อน (ใช้กำหนดสลาฟขึ้นก่อน + ทิศหนีคิง)
    this.roundOrder = null; // คิง/สลาฟ ของรอบปัจจุบัน (ใช้กฎคิงตกบัลลังก์)
    this.noticeSeq = 0; // ตัวนับแจ้งเตือนเด้ง (toast) ฝั่ง client
    this.noticeText = null;
  }

  addHistory(entry) {
    this.history.push(entry);
    if (this.history.length > 50) this.history = this.history.slice(-50);
  }

  addPlayer(socketId, name) {
    // reconnect / รีเฟรช: ชื่อซ้ำ → ยึดที่นั่งเดิม (ไม่สนว่า socket เก่า disconnect ทันหรือยัง)
    // กัน race ตอนรีเฟรชที่ socket ใหม่ต่อก่อน socket เก่าจะหลุด
    const existing = this.players.find((p) => p.name === name);
    if (existing) {
      const oldId = existing.id;
      existing.id = socketId;
      existing.connected = true;
      // ย้าย host ตามถ้าคนเดิมคือ host
      if (this.hostId === oldId) this.hostId = socketId;
      if (!this.players.some((p) => p.id === this.hostId && p.connected)) {
        this.hostId = socketId;
      }
      return existing;
    }
    if (this.phase !== 'lobby') {
      throw new Error('เกมเริ่มไปแล้ว เข้าร่วมระหว่างรอบไม่ได้');
    }
    if (this.players.length >= 4) throw new Error('ห้องเต็มแล้ว (สูงสุด 4 คน)');
    const player = { id: socketId, name, connected: true, hand: [], finished: false };
    this.players.push(player);
    if (!this.hostId) this.hostId = socketId;
    return player;
  }

  removePlayer(socketId) {
    const p = this.players.find((x) => x.id === socketId);
    if (!p) return;
    p.connected = false;
    if (this.phase === 'lobby') {
      this.players = this.players.filter((x) => x.id !== socketId);
    }
    // ย้าย host ถ้า host หลุด
    if (this.hostId === socketId) {
      const next = this.players.find((x) => x.connected);
      this.hostId = next ? next.id : null;
    }
  }

  indexOf(socketId) {
    return this.players.findIndex((p) => p.id === socketId);
  }

  isEmpty() {
    return this.players.every((p) => !p.connected);
  }

  start() {
    if (this.players.length < 2) throw new Error('ต้องมีอย่างน้อย 2 คนถึงจะเริ่มได้');
    const prevOrder = Array.isArray(this.finishOrder) ? this.finishOrder.slice() : [];
    const hands = deal(this.players.length);
    this.players.forEach((p, i) => {
      p.hand = hands[i];
      p.finished = false;
    });
    this.phase = 'playing';
    this.pile = null;
    this.pileOwner = null;
    this.passed = new Set();
    this.dir = 1; // เริ่มทุกรอบด้วยการวนขวา
    this.everPlayed = false;
    this._lastPileCards = null;
    this.finishOrder = [];
    this.log = [];
    this.history = [];
    this.giveTasks = null;
    this._prevOrder = prevOrder.length === this.players.length ? prevOrder : null;
    this.addHistory({ event: '🆕 เริ่มรอบใหม่' });
    // ถ้ามีรอบก่อนครบทุกคน → เข้าเฟส "แลกไพ่" (เลือกเอง) ก่อนเริ่มเล่น
    if (this._prevOrder) {
      this.setupExchange(this._prevOrder);
    } else {
      this.beginPlay();
    }
  }

  // เริ่มเล่นจริง (หลังแลกไพ่เสร็จ หรือเกมแรกที่ไม่ต้องแลก)
  beginPlay() {
    this.phase = 'playing';
    this.giveTasks = null;
    const prev = this._prevOrder;
    if (prev && prev.length === this.players.length) {
      // รอบ 2+: สลาฟขึ้นก่อน, ไม่ต้องมี 3♣, ทิศ "หมุนหนีคิง"
      const n = this.players.length;
      const slave = prev[n - 1];
      const king = prev[0];
      this.turn = slave;
      this.everPlayed = true; // ข้ามเงื่อนไข "กองแรกต้องมี 3♣"
      // หมุนหนีคิง: เลือกทิศที่เดินออกจากคิง (คิงอยู่ปลายแถวที่สุด)
      const stepsCW = (king - slave + n) % n; // ก้าวไป +1 กี่ทีถึงคิง
      this.dir = stepsCW <= n / 2 ? -1 : 1; // ถ้าคิงใกล้ทาง +1 → วน -1 (หนี)
      this.log.push(`เริ่มรอบใหม่! ${this.players[slave].name} (สลาฟ) ขึ้นก่อน — หมุนหนีคิง`);
      this.addHistory({ event: `▶️ ${this.players[slave].name} (สลาฟ) ขึ้นก่อน` });
      this.roundOrder = prev.slice(); // ใช้เช็ค "คิงตกบัลลังก์" (สลาฟหมดก่อนคิง)
    } else {
      // เกมแรก: ถือ 3♣ ขึ้นก่อน + กองแรกต้องมี 3♣
      this.everPlayed = false;
      this.turn = findStarter(this.players.map((p) => p.hand));
      this.log.push(`เริ่มเกม! ${this.players[this.turn].name} ขึ้นก่อน (ถือ 3♣)`);
      this.addHistory({ event: `▶️ ${this.players[this.turn].name} ขึ้นก่อน` });
      this.roundOrder = null; // เกมแรกไม่มีคิง/สลาฟ → ไม่มีกฎคิงตกบัลลังก์
    }
    this._prevOrder = null;
  }

  // คิงตกบัลลังก์: สลาฟ(เดิม)หมดมือก่อนคิง(เดิม) → สลับคิง↔สลาฟ จบรอบ แจกใหม่ทันที
  miyakoOchi() {
    const n = this.roundOrder.length;
    const order = this.roundOrder.slice();
    [order[0], order[n - 1]] = [order[n - 1], order[0]]; // สลับคิง↔สลาฟ
    this.finishOrder = order;
    const titles = RANK_TITLES[n] || [];
    this.lastResult = order.map((pIdx, rank) => ({
      name: this.players[pIdx].name,
      title: titles[rank] || `อันดับ ${rank + 1}`,
    }));
    this.log.push(`👑→⛓️ สลาฟหมดมือก่อนคิง! ${this.players[order[n - 1]].name} (คิงเดิม) ตกเป็นสลาฟ — แจกไพ่ใหม่`);
    this.noticeSeq++;
    this.noticeText = `👑→⛓️ คิงตกบัลลังก์! ${this.players[order[n - 1]].name} ตกเป็นสลาฟ — แจกไพ่ใหม่`;
    this.start(); // อ่าน finishOrder เป็นอันดับใหม่ → แจก + เข้าเฟสแลกไพ่ทันที
    return { ok: true };
  }

  // ตั้งเฟสแลกไพ่:
  //   ผู้แพ้ (สลาฟ/รองสลาฟ) → ถูกบังคับให้ไพ่ "สูงสุด" อัตโนมัติทันที
  //   ผู้ชนะ (คิง/ควีน) → เลือกไพ่ "คืน" ให้เองในเฟสนี้
  setupExchange(order) {
    const n = order.length;
    const tiers = Math.floor(n / 2);
    this.giveTasks = {}; // เฉพาะผู้ชนะที่ต้องเลือก: { [winnerIdx]: { to, count, cards|null } }
    for (let i = 0; i < tiers; i++) {
      const count = tiers - i; // คู่สุดขั้วแลกมากสุด
      const w = order[i]; // ผู้ชนะ
      const l = order[n - 1 - i]; // ผู้แพ้
      // ผู้แพ้ส่งไพ่สูงสุดอัตโนมัติ → ผู้ชนะ
      const loser = this.players[l];
      sortHand(loser.hand);
      const highest = loser.hand.slice(-count); // ไพ่สูงสุด count ใบ
      const rm = new Set(highest.map(cardId));
      loser.hand = loser.hand.filter((c) => !rm.has(cardId(c)));
      this.players[w].hand.push(...highest.map((c) => ({ r: c.r, s: c.s })));
      sortHand(this.players[w].hand);
      this.addHistory({ event: `⛓️ ${loser.name} ส่งไพ่สูงสุด ${count} ใบ ให้ ${this.players[w].name}` });
      // ผู้ชนะต้องเลือก count ใบ คืนให้ผู้แพ้
      this.giveTasks[w] = { to: l, count, cards: null };
    }
    this.phase = 'exchange';
  }

  // ผู้ชนะส่งไพ่ที่เลือกคืนให้ผู้แพ้
  giveCards(socketId, cardIds) {
    if (this.phase !== 'exchange' || !this.giveTasks) throw new Error('ยังไม่ถึงช่วงแลกไพ่');
    const idx = this.indexOf(socketId);
    const task = this.giveTasks[idx];
    if (!task) throw new Error('คุณไม่ต้องเลือกไพ่ในรอบนี้');
    if (task.cards) throw new Error('คุณเลือกไพ่ไปแล้ว');
    if (!Array.isArray(cardIds) || cardIds.length !== task.count) {
      throw new Error(`ต้องเลือกไพ่ ${task.count} ใบ`);
    }
    const player = this.players[idx];
    const handIds = new Set(player.hand.map(cardId));
    for (const id of cardIds) if (!handIds.has(id)) throw new Error('คุณไม่มีไพ่ใบนั้น');
    if (new Set(cardIds).size !== cardIds.length) throw new Error('ไพ่ซ้ำ');

    task.cards = cardIds.slice();
    // ผู้ชนะเลือกครบทุกคนแล้ว → ย้ายไพ่คืน แล้วเริ่มเล่น
    if (Object.values(this.giveTasks).every((t) => t.cards)) {
      this.performExchange();
    }
    return { ok: true };
  }

  performExchange() {
    // ย้ายเฉพาะไพ่ที่ผู้ชนะเลือกคืนให้ผู้แพ้ (ผู้แพ้ให้สูงสุดไปแล้วตอน setup)
    for (const [from, t] of Object.entries(this.giveTasks)) {
      const rm = new Set(t.cards);
      this.players[+from].hand = this.players[+from].hand.filter((c) => !rm.has(cardId(c)));
      for (const id of t.cards) this.players[t.to].hand.push(cardFromId(id));
    }
    this.players.forEach((p) => sortHand(p.hand));
    this.addHistory({ event: '🎁 แลกไพ่เสร็จแล้ว' });
    this.beginPlay();
  }

  activeCount() {
    return this.players.filter((p) => !p.finished).length;
  }

  // หา index คนต่อไปที่ยังไม่หมดมือ (ตามทิศการวน)
  nextActive(from) {
    const n = this.players.length;
    for (let step = 1; step <= n; step++) {
      const idx = ((from + step * this.dir) % n + n) % n;
      if (!this.players[idx].finished) return idx;
    }
    return from;
  }

  play(socketId, cardIds) {
    const idx = this.indexOf(socketId);
    if (this.phase !== 'playing') throw new Error('ยังไม่ถึงเวลาเล่น');
    if (idx !== this.turn) throw new Error('ยังไม่ถึงตาของคุณ');
    const player = this.players[idx];

    const cards = cardIds.map(cardFromId);
    // ตรวจว่าไพ่ที่ลงอยู่ในมือจริง
    const handIds = new Set(player.hand.map(cardId));
    for (const id of cardIds) {
      if (!handIds.has(id)) throw new Error('คุณไม่มีไพ่ใบนั้น');
    }
    if (new Set(cardIds).size !== cardIds.length) throw new Error('ไพ่ซ้ำ');

    const combo = identifyCombo(cards);
    if (!combo) throw new Error('ชุดไพ่ไม่ถูกกติกา');

    // ไพ่แรกสุดของเกมต้องมี 3♣ (ดอกจิก) ร่วมด้วย
    if (!this.everPlayed && !cardIds.includes('3.0')) {
      throw new Error('กองแรกต้องมี 3♣ (ดอกจิก) ร่วมด้วย');
    }

    if (!canBeat(this.pile, combo)) {
      throw new Error(this.pile ? 'ชุดนี้กินกองบนโต๊ะไม่ได้' : 'ลงชุดนี้ไม่ได้');
    }
    combo.mode = playMode(this.pile, combo);

    // เอาไพ่ออกจากมือ
    const removeSet = new Set(cardIds);
    player.hand = player.hand.filter((c) => !removeSet.has(cardId(c)));
    sortHand(player.hand);

    this.pile = combo;
    this.pileOwner = idx;
    this.everPlayed = true;
    this._lastPileCards = cardIds.map((id) => ({ ...cardFromId(id), id }));
    this.log.push(`${player.name} ลง ${cardIds.map(idToLabel).join(' ')}`);
    this.addHistory({ name: player.name, cards: cardIds.map(cardFromId) });

    if (player.hand.length === 0) {
      player.finished = true;
      this.finishOrder.push(idx);
      this.log.push(`🏆 ${player.name} หมดมือแล้ว!`);
      this.addHistory({ event: `🏆 ${player.name} หมดมือ!` });

      // คิงตกบัลลังก์: สลาฟ(เดิม)หมดมือก่อนคิง(เดิม) → จบรอบ แจกใหม่ทันที
      if (this.roundOrder) {
        const king = this.roundOrder[0];
        const slave = this.roundOrder[this.roundOrder.length - 1];
        if (idx === slave && !this.players[king].finished) {
          return this.miyakoOchi();
        }
      }
    }

    // เหลือคนเดียวที่ยังไม่หมดมือ → จบรอบ
    if (this.activeCount() <= 1) {
      const last = this.players.findIndex((p) => !p.finished);
      if (last >= 0) this.finishOrder.push(last);
      return this.endRound();
    }

    this.advanceTurn();
    return { ok: true };
  }

  pass(socketId) {
    const idx = this.indexOf(socketId);
    if (this.phase !== 'playing') throw new Error('ยังไม่ถึงเวลาเล่น');
    if (idx !== this.turn) throw new Error('ยังไม่ถึงตาของคุณ');
    if (!this.pile) throw new Error('คุณเป็นคนนำกอง ต้องลงไพ่ (pass ไม่ได้)');

    // ผ่านแล้ว = ออกจากกองนี้ ถูกข้ามจนกว่ากองจะเคลียร์
    this.passed.add(idx);
    this.log.push(`${this.players[idx].name} ผ่าน`);
    this.addHistory({ name: this.players[idx].name, pass: true });
    this.advanceTurn();
    return { ok: true };
  }

  // หาคนถัดไปที่ยังเล่นกองนี้อยู่ (ยังไม่หมดมือ และยังไม่ผ่าน, ตามทิศการวน) — คืน null ถ้าไม่มีใครเหลือ
  nextInTrick(from) {
    const n = this.players.length;
    for (let step = 1; step <= n; step++) {
      const idx = ((from + step * this.dir) % n + n) % n;
      if (this.players[idx].finished) continue;
      if (this.passed.has(idx)) continue;
      return idx;
    }
    return null;
  }

  advanceTurn() {
    const next = this.nextInTrick(this.turn);
    // ไม่มีใครเหลือ หรือวนกลับมาถึงเจ้าของกอง → ทุกคนอื่นผ่าน/หมดมือ → เจ้าของกองชนะกอง เคลียร์นำใหม่
    if (next === null || next === this.pileOwner) {
      this.pile = null;
      this._lastPileCards = null;
      this.passed = new Set();
      this.history = []; // เคลียร์กอง = ขึ้นกองใหม่ → ล้างประวัติให้เหลือแค่กองปัจจุบัน
      if (this.pileOwner != null && !this.players[this.pileOwner].finished) {
        // เจ้าของกองยังอยู่ → นำกองใหม่เอง (ทิศเดิม)
        this.turn = this.pileOwner;
        this.log.push(`— เคลียร์กอง ${this.players[this.turn].name} นำใหม่ —`);
      } else {
        // เจ้าของกองหมดมือ + ไม่มีใครกินกองได้ → สลับทิศ แล้วคนถัดไป(ทิศใหม่)นำ
        this.dir = -this.dir;
        this.turn = this.nextActive(this.pileOwner == null ? this.turn : this.pileOwner);
        this.log.push(`🔄 สลับทิศ! เคลียร์กอง ${this.players[this.turn].name} นำใหม่ (วน${this.dir === 1 ? 'ขวา' : 'ซ้าย'})`);
      }
      this.pileOwner = null;
    } else {
      this.turn = next;
    }
  }

  endRound() {
    this.phase = 'finished';
    const n = this.players.length;
    const titles = RANK_TITLES[n] || [];
    this.lastResult = this.finishOrder.map((pIdx, rank) => ({
      name: this.players[pIdx].name,
      title: titles[rank] || `อันดับ ${rank + 1}`,
    }));
    this.log.push('🎉 จบรอบ! ' + this.lastResult.map((r) => `${r.title}: ${r.name}`).join(', '));
    this.addHistory({ event: '🎉 จบรอบ! ' + this.lastResult.map((r) => `${r.title}:${r.name}`).join(' · ') });
    return { ok: true, finished: true };
  }

  resetToLobby() {
    this.phase = 'lobby';
    this.pile = null;
    this.pileOwner = null;
    this.passed = new Set();
    this.giveTasks = null;
    this.everPlayed = false;
    this.players.forEach((p) => {
      p.hand = [];
      p.finished = false;
    });
  }

  // มุมมองที่ส่งให้ผู้เล่นแต่ละคน (เห็นไพ่ตัวเองเท่านั้น)
  stateFor(socketId) {
    const meIdx = this.indexOf(socketId);
    const titleByName = {}; // ยศจากรอบก่อน
    for (const r of this.lastResult || []) titleByName[r.name] = r.title;
    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      youAreHost: this.hostId === socketId,
      youIndex: meIdx,
      turn: this.turn,
      turnName: this.players[this.turn]?.name ?? null,
      dir: this.dir,
      pile: this.pile,
      pileCards: this._lastPileCards || null,
      players: this.players.map((p, i) => ({
        name: p.name,
        connected: p.connected,
        cardCount: p.hand.length,
        finished: p.finished,
        isYou: i === meIdx,
        isHost: p.id === this.hostId,
        isTurn: i === this.turn,
        title: titleByName[p.name] || null,
      })),
      hand: meIdx >= 0 ? this.players[meIdx].hand.map((c) => ({ ...c, id: cardId(c) })) : [],
      result: this.lastResult,
      log: this.log.slice(-12),
      history: (this.history || []).slice(-16),
      exchange: this.exchangeFor(meIdx),
      notice: this.noticeText ? { seq: this.noticeSeq, text: this.noticeText } : null,
    };
  }

  // ข้อมูลเฟสแลกไพ่สำหรับผู้เล่นคนนี้
  exchangeFor(meIdx) {
    if (this.phase !== 'exchange' || !this.giveTasks) return null;
    const my = this.giveTasks[meIdx]; // ผู้ชนะ (ต้องเลือกไพ่คืน)
    // ผู้แพ้ที่รอรับไพ่คืน: มี task ที่ to === เรา
    const incoming = Object.entries(this.giveTasks).find(([, t]) => t.to === meIdx);
    const waiting = Object.entries(this.giveTasks)
      .filter(([, t]) => !t.cards)
      .map(([i]) => this.players[i]?.name)
      .filter(Boolean);
    return {
      role: my ? 'winner' : incoming ? 'loser' : 'none',
      myCount: my ? my.count : 0,
      toName: my ? this.players[my.to]?.name ?? null : null,
      myDone: my ? !!my.cards : true, // ผู้ชนะ: เลือกแล้วหรือยัง; คนอื่น = รอ
      fromName: incoming ? this.players[+incoming[0]]?.name ?? null : null,
      gaveCount: incoming ? incoming[1].count : 0,
      waitingNames: waiting,
    };
  }

  // ----- เซฟ/โหลดสถานะลงไฟล์ (กัน server restart แล้วห้องหาย) -----
  toState() {
    return {
      code: this.code,
      players: this.players.map((p) => ({
        id: p.id, name: p.name, connected: p.connected, hand: p.hand, finished: p.finished,
      })),
      hostId: this.hostId,
      phase: this.phase,
      turn: this.turn,
      pile: this.pile,
      pileOwner: this.pileOwner,
      passed: [...this.passed],
      dir: this.dir,
      everPlayed: this.everPlayed,
      _lastPileCards: this._lastPileCards,
      finishOrder: this.finishOrder,
      lastResult: this.lastResult,
      log: this.log,
      history: this.history,
      giveTasks: this.giveTasks,
      _prevOrder: this._prevOrder,
      roundOrder: this.roundOrder,
    };
  }

  static fromState(data) {
    const room = new Room(data.code);
    Object.assign(room, data);
    room.passed = new Set(data.passed || []);
    room.history = data.history || [];
    room.giveTasks = data.giveTasks || null;
    room._prevOrder = data._prevOrder || null;
    room.roundOrder = data.roundOrder || null;
    room.everPlayed = data.everPlayed ?? (data.phase !== 'lobby');
    // socket หายหมดตอน restart → ทุกคนออฟไลน์จนกว่าจะ reconnect ด้วยชื่อเดิม
    room.players.forEach((p) => { p.connected = false; });
    return room;
  }
}

function idToLabel(id) {
  const c = cardFromId(id);
  const { rankLabel, SUITS } = labelHelpers;
  return `${rankLabel(c.r)}${SUITS[c.s]}`;
}

// import แบบ lazy เพื่อเลี่ยง circular ใน build บางตัว
import { rankLabel, SUITS } from './game.js';
const labelHelpers = { rankLabel, SUITS };
