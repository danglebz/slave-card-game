// game.ts — logic for the Slave card game (standard rules); pure, so server-side testing/validation works
//
// Card rank: 3 lowest ... 2 highest
//   3,4,5,6,7,8,9,10 = 3..10 | J=11 | Q=12 | K=13 | A=14 | 2=15
// Suit breaks ties when ranks are equal (single/pair/straight): ♣ < ♦ < ♥ < ♠
//   0=♣ 1=♦ 2=♥ 3=♠

import type { Card, Combo, ComboType, Settings } from '../shared/types';
// Core rules (identify/compare/mode) moved to shared/rules → client can share them; re-export so existing importers (room/bot/tests) don't need changes
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

// Build a 52-card deck
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (let r = 3; r <= 15; r++) {
    for (let s = 0; s <= 3; s++) {
      deck.push({ r, s });
    }
  }
  return deck;
}

// Shuffle the cards (Fisher–Yates)
export function shuffle(deck: Card[]): Card[] {
  const a = deck.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Deal cards round-robin to n players (52 cards → 2p=26/26, 3p=18/17/17, 4p=13/13/13/13)
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

// Find the index of the player holding 3♣ (lowest card) — used as the first player to start
export function findStarter(hands: Card[][]): number {
  for (let i = 0; i < hands.length; i++) {
    if (hands[i].some((c) => c.r === 3 && c.s === 0)) return i;
  }
  return 0;
}

/**
 * Is there any combo in hand that can be played on top of the current pile (including bomb, triple, quad, straight)
 * Used to decide whether to auto-pass — leading the pile (pile=null) = always playable
 */
export function anyLegalMove(hand: Card[], pile: Combo | null, disallowed?: Set<string>): boolean {
  if (!pile) return true;
  // combos the host disabled
  const off = (type: string) => !!disallowed?.has(type);
  const beats = (cards: Card[]): boolean => {
    const combo = identifyCombo(cards);
    return !!combo && !off(combo.type) && canBeat(pile, combo);
  };
  // Group by rank (single/pair/triple/quad)
  const groups = new Map<number, Card[]>();
  for (const c of hand) {
    const g = groups.get(c.r);
    if (g) g.push(c);
    else groups.set(c.r, [c]);
  }
  // single
  for (const c of hand) if (beats([c])) return true;
  for (const cs of groups.values()) {
    // highest suit first → max value of that rank
    const hi = cs.slice().sort((a, b) => b.s - a.s);
    if (hi.length >= 2 && beats(hi.slice(0, 2))) return true;
    if (hi.length >= 3 && beats(hi.slice(0, 3))) return true;
    if (hi.length >= 4 && beats(hi.slice(0, 4))) return true;
  }
  // Flush straight, length 3–6 (no 2 / r=15 allowed)
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

// house rules: special combos the host disabled → Set of combo.type that can't be played (singles/pairs always playable)
export function disallowedComboTypes(settings?: Partial<Settings> | null): Set<string> {
  const d = new Set<string>();
  if (settings?.allowTriple === false) d.add('triple');
  if (settings?.allowQuad === false) d.add('quad');
  if (settings?.allowStraight === false) d.add('straight');
  return d;
}

export type { ComboType };
