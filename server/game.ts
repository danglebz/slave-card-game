// game.ts — ตรรกะเกมส์ไพ่สลาฟ (กติกามาตรฐาน) แบบ pure ทดสอบ/ตรวจสอบฝั่ง server ได้
//
// อันดับไพ่ (rank): 3 ต่ำสุด ... 2 สูงสุด
//   3,4,5,6,7,8,9,10 = 3..10 | J=11 | Q=12 | K=13 | A=14 | 2=15
// ดอก (suit) ใช้ตัดสินเมื่ออันดับเท่ากัน (เดี่ยว/คู่/เรียง): ♣ < ♦ < ♥ < ♠
//   0=♣ 1=♦ 2=♥ 3=♠

import type { Card, Combo, ComboType, Settings } from '../shared/types';
// กติกาแกน (identify/compare/mode) ย้ายไป shared/rules → client ใช้ร่วมได้; re-export ให้ importer เดิม (room/bot/tests) ไม่ต้องแก้
import { identifyCombo, bombPower, canBeat, playMode } from '../shared/rules';
export { identifyCombo, bombPower, canBeat, playMode };

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
