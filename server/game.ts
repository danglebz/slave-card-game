// game.ts — ตรรกะเกมส์ไพ่สลาฟ (กติกามาตรฐาน) แบบ pure ทดสอบ/ตรวจสอบฝั่ง server ได้
//
// อันดับไพ่ (rank): 3 ต่ำสุด ... 2 สูงสุด
//   3,4,5,6,7,8,9,10 = 3..10 | J=11 | Q=12 | K=13 | A=14 | 2=15
// ดอก (suit) ใช้ตัดสินเมื่ออันดับเท่ากัน (เดี่ยว/คู่/เรียง): ♣ < ♦ < ♥ < ♠
//   0=♣ 1=♦ 2=♥ 3=♠

import type { Card, Combo, ComboType, Settings } from '../shared/types';

export const SUITS: string[] = ['♣', '♦', '♥', '♠'];
export const SUIT_NAMES: string[] = ['ดอกจิก', 'ข้าวหลามตัด', 'โพแดง', 'โพดำ'];

export function rankLabel(r: number): string {
  if (r === 15) return '2';
  if (r === 14) return 'A';
  if (r === 13) return 'K';
  if (r === 12) return 'Q';
  if (r === 11) return 'J';
  return String(r);
}

export function cardId(c: Card): string {
  return `${c.r}.${c.s}`;
}

export function cardFromId(id: string): Card {
  const [r, s] = id.split('.').map(Number);
  return { r, s };
}

export function cardLabel(c: Card): string {
  return `${rankLabel(c.r)}${SUITS[c.s]}`;
}

// สร้างสำรับ 52 ใบ
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (let r = 3; r <= 15; r++) {
    for (let s = 0; s <= 3; s++) {
      deck.push({ r, s });
    }
  }
  return deck;
}

// สับไพ่ (Fisher–Yates)
export function shuffle(deck: Card[]): Card[] {
  const a = deck.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// แจกไพ่แบบวนรอบ ให้ผู้เล่น n คน (52 ใบ → 2คน=26/26, 3คน=18/17/17, 4คน=13/13/13/13)
export function deal(numPlayers: number): Card[][] {
  const deck = shuffle(createDeck());
  const hands: Card[][] = Array.from({ length: numPlayers }, () => []);
  deck.forEach((card, i) => hands[i % numPlayers].push(card));
  hands.forEach(sortHand);
  return hands;
}

export function sortHand(hand: Card[]): Card[] {
  hand.sort((a, b) => a.r - b.r || a.s - b.s);
  return hand;
}

// ค่าของไพ่ใบเดียวสำหรับเทียบ (รวมดอกเป็นตัวตัดสิน)
function cardValue(c: Card): number {
  return c.r * 4 + c.s;
}

// ระบุประเภทกอง: คืน {type, len, value, topRank} หรือ null ถ้าไม่ถูกกติกา
// type: 'single' | 'pair' | 'triple' | 'quad' | 'straight'
export function identifyCombo(cards: Card[]): Combo | null {
  if (!Array.isArray(cards) || cards.length === 0) return null;
  const cs = cards.slice().sort((a, b) => a.r - b.r || a.s - b.s);
  const n = cs.length;
  const allSameRank = cs.every((c) => c.r === cs[0].r);

  if (n === 1) {
    return { type: 'single', len: 1, value: cardValue(cs[0]), topRank: cs[0].r };
  }
  if (n === 2 && allSameRank) {
    const top = cs[n - 1];
    return { type: 'pair', len: 2, value: top.r * 4 + top.s, topRank: top.r };
  }
  if (n === 3 && allSameRank) {
    return { type: 'triple', len: 3, value: cs[0].r, topRank: cs[0].r };
  }
  if (n === 4 && allSameRank) {
    return { type: 'quad', len: 4, value: cs[0].r, topRank: cs[0].r };
  }

  // เรียง (straight): ยาว >=3, ดอกเดียวกัน (flush), อันดับต่อเนื่อง, ห้ามมีไพ่ 2 (r=15)
  if (n >= 3) {
    const allSameSuit = cs.every((c) => c.s === cs[0].s);
    if (!allSameSuit) return null; // เรียงต้องดอกเดียวเสมอ
    for (let i = 0; i < n; i++) {
      if (cs[i].r === 15) return null; // 2 ห้ามอยู่ในเรียง
      if (i > 0 && cs[i].r !== cs[i - 1].r + 1) return null; // ต้องต่อเนื่อง & ไม่ซ้ำ
    }
    const top = cs[n - 1];
    return { type: 'straight', len: n, value: top.r * 4 + top.s, topRank: top.r };
  }

  return null;
}

// ----- ระบบบอมบ์ -----
// บอมบ์ = คอมโบพิเศษที่กินกองเล็ก (เดี่ยว/คู่) ได้โดยไม่สนแต้ม และมีลำดับความแรงข้ามชนิด
// กินกองเล็ก (ตามจำนวนใบ): ชุด "ใบคี่" (ตอง/เรียง3/เรียง5) กินเดี่ยว · ชุด "ใบคู่" (โฟร์/เรียง4/เรียง6) กินคู่
//
// ลำดับความแรง (อ่อน→แรง): เรียง3=1 < ตอง=2 < เรียง4=3 < เรียง5=4 < โฟร์=5 < เรียง6=6 < เรียง7=7 …
//   → โฟร์กินเรียง3/4/5 + ตอง ได้ แต่ยังแพ้ "เรียง6 ขึ้นไป" (ยิ่งยาว/หายาก ยิ่งแรง; เรียงยาวได้ถึง 12 ใบ)
// คืน 0 ถ้าไม่ใช่บอมบ์
export function bombPower(combo: Combo | null): number {
  if (!combo) return 0;
  if (combo.type === 'triple') return 2;
  if (combo.type === 'quad') return 5; // โฟร์เหนือเรียง5 แต่ยังต่ำกว่าเรียง6
  if (combo.type === 'straight') {
    if (combo.len === 3) return 1;
    if (combo.len === 4) return 3;
    if (combo.len === 5) return 4; // เรียง5 ต่ำกว่าโฟร์
    return combo.len; // เรียง6+ = ตามจำนวนใบ (6,7,…,12) → เหนือโฟร์เสมอ; ยิ่งยาวยิ่งแรง
  }
  return 0;
}

// candidate กินกอง current ได้ไหม? current = null หมายถึงเป็นคนนำ (ลงอะไรก็ได้)
export function canBeat(current: Combo | null, candidate: Combo | null): boolean {
  if (!candidate) return false;
  if (!current) return true; // คนนำกอง ลงคอมโบที่ถูกกติกาได้เลย

  const candBomb = bombPower(candidate);

  // กองอยู่ใน "โหมดบอมบ์" → ต้องใช้บอมบ์ที่แรงกว่า (ลำดับข้ามชนิด); เท่ากันเทียบแต้ม
  if (current.mode === 'bomb') {
    if (!candBomb) return false;
    const curBomb = bombPower(current);
    if (candBomb !== curBomb) return candBomb > curBomb;
    return candidate.value > current.value;
  }

  // กองปกติ — บอมบ์กินกองเล็กตามจำนวนใบ: ชุดใบคี่ (3,5) กินเดี่ยว · ชุดใบคู่ (4,6) กินคู่
  if (current.type === 'single') {
    if (candidate.type === 'single') return candidate.value > current.value;
    return candBomb > 0 && candidate.len % 2 === 1; // ชุดใบคี่กินไพ่เดี่ยว
  }
  if (current.type === 'pair') {
    if (candidate.type === 'pair') return candidate.value > current.value;
    return candBomb > 0 && candidate.len % 2 === 0; // ชุดใบคู่กินคู่
  }
  if (current.type === 'straight') {
    // เรียงที่ "นำลง": ชนะด้วยเรียงยาวเท่ากันที่สูงกว่า
    // + โฟร์กินเรียงได้ถ้าโฟร์แรงกว่าเรียงกองนั้น (โฟร์กินเรียง3/4/5 แต่แพ้เรียง6)
    if (candidate.type === 'quad' && candBomb > bombPower(current)) return true;
    return (
      candidate.type === 'straight' &&
      candidate.len === current.len &&
      candidate.value > current.value
    );
  }
  // เผื่อกรณีอื่น: เทียบชนิดเดียวกัน
  if (candidate.type === current.type) return candidate.value > current.value;
  return false;
}

// โหมดของกองหลังลง candidate (เรียกหลัง canBeat ผ่านแล้ว)
//   'bomb'  = กองอยู่ในโหมดบอมบ์ (ต้องใช้บอมบ์แรงกว่ามาทับ)
//   'normal'= กองปกติ (เดี่ยว/คู่/เรียง)
export function playMode(current: Combo | null, candidate: Combo): 'bomb' | 'normal' {
  if (!current) {
    // นำกอง: ตอง/โฟร์ ถือเป็นบอมบ์; เดี่ยว/คู่/เรียง เป็นปกติ
    return candidate.type === 'triple' || candidate.type === 'quad' ? 'bomb' : 'normal';
  }
  if (current.mode === 'bomb') return 'bomb';
  if (current.type === 'single' || current.type === 'pair') {
    // ถ้าลงชนิดเดียวกัน = ปกติ; ถ้าลงบอมบ์ทับ = บอมบ์
    return candidate.type === current.type ? 'normal' : 'bomb';
  }
  if (current.type === 'straight') {
    // เรียงโดนโฟร์ทับ → กองเข้าโหมดบอมบ์ (ต่อไปต้องโฟร์สูงกว่ามาทับ); เรียงชนะเรียง = ยังปกติ
    return candidate.type === 'straight' ? 'normal' : 'bomb';
  }
  return 'normal';
}

// หา index ผู้เล่นที่ถือไพ่ 3♣ (ใบต่ำสุด) — ใช้เป็นคนเริ่มเกมแรก
export function findStarter(hands: Card[][]): number {
  for (let i = 0; i < hands.length; i++) {
    if (hands[i].some((c) => c.r === 3 && c.s === 0)) return i;
  }
  return 0;
}

/**
 * มีชุดไพ่ใด ๆ ในมือที่ลงทับกองปัจจุบันได้ไหม (รวมบอมบ์ ตอง โฟร์ เรียง)
 * ใช้ตัดสินว่าควร auto-pass ไหม — นำกอง (pile=null) = ลงได้เสมอ
 */
export function anyLegalMove(hand: Card[], pile: Combo | null, disallowed?: Set<string>): boolean {
  if (!pile) return true;
  const off = (type: string) => !!disallowed?.has(type); // ชุดที่หัวห้องปิด
  const beats = (cards: Card[]): boolean => {
    const combo = identifyCombo(cards);
    return !!combo && !off(combo.type) && canBeat(pile, combo);
  };
  // จัดกลุ่มตามอันดับ (เดี่ยว/คู่/ตอง/โฟร์)
  const groups = new Map<number, Card[]>();
  for (const c of hand) {
    const g = groups.get(c.r);
    if (g) g.push(c);
    else groups.set(c.r, [c]);
  }
  for (const c of hand) if (beats([c])) return true; // เดี่ยว
  for (const cs of groups.values()) {
    const hi = cs.slice().sort((a, b) => b.s - a.s); // ดอกสูงสุดก่อน → value มากสุดของอันดับนั้น
    if (hi.length >= 2 && beats(hi.slice(0, 2))) return true;
    if (hi.length >= 3 && beats(hi.slice(0, 3))) return true;
    if (hi.length >= 4 && beats(hi.slice(0, 4))) return true;
  }
  // เรียงดอกเดียว ยาว 3–6 (ห้ามมีไพ่ 2 / r=15)
  const bySuit = new Map<number, number[]>();
  for (const c of hand) {
    if (c.r >= 15) continue;
    const g = bySuit.get(c.s);
    if (g) g.push(c.r);
    else bySuit.set(c.s, [c.r]);
  }
  for (const [s, ranks] of bySuit) {
    const uniq = [...new Set(ranks)].sort((a, b) => a - b);
    for (let i = 0; i < uniq.length; i++) {
      let run = 1;
      while (i + run < uniq.length && uniq[i + run] === uniq[i + run - 1] + 1) run++;
      for (let L = 3; L <= run; L++) {
        const cards: Card[] = [];
        for (let k = 0; k < L; k++) cards.push({ r: uniq[i + k], s });
        if (beats(cards)) return true;
      }
    }
  }
  return false;
}

// house rules: ชุดพิเศษที่หัวห้องปิด → Set ของ combo.type ที่ห้ามลง (singles/pairs ลงได้เสมอ)
export function disallowedComboTypes(settings?: Partial<Settings> | null): Set<string> {
  const d = new Set<string>();
  if (settings?.allowTriple === false) d.add('triple');
  if (settings?.allowQuad === false) d.add('quad');
  if (settings?.allowStraight === false) d.add('straight');
  return d;
}

export type { ComboType };
