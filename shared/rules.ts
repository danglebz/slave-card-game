// rules.ts — core rules (identify combo type / compare whether one beats another / pile mode), pure
//   Shared by both server (adjudicates the game) and client (auto-play checks "can the last combo win?")
//
// Card rank: 3 lowest ... 2 highest | suit breaks ties at equal rank: ♣0 < ♦1 < ♥2 < ♠3
import type { Card, Combo } from './types';

// Value of a single card for comparison (suit folded in as the tiebreaker)
function cardValue(c: Card): number {
  return c.r * 4 + c.s;
}

// Identify the pile type: returns {type, len, value, topRank} or null if invalid
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

  // Straight: length >=3, same suit (flush), consecutive ranks, no 2 (r=15)
  if (n >= 3) {
    const allSameSuit = cs.every((c) => c.s === cs[0].s);
    // a straight is always single-suit
    if (!allSameSuit) return null;
    for (let i = 0; i < n; i++) {
      // 2 can't be in a straight
      if (cs[i].r === 15) return null;
      // must be consecutive & no duplicates
      if (i > 0 && cs[i].r !== cs[i - 1].r + 1) return null;
    }
    const top = cs[n - 1];
    return { type: 'straight', len: n, value: top.r * 4 + top.s, topRank: top.r };
  }

  return null;
}

// ----- Bomb system -----
// Bomb = a special combo that beats small piles (single/pair) regardless of value, with a cross-type strength order
// Beats small piles (by card count): "odd-count" combos (triple/straight3/straight5) beat singles · "even-count" combos (quad/straight4/straight6) beat pairs
//
// Strength order (weak→strong): straight3=1 < triple=2 < straight4=3 < straight5=4 < quad=5 < straight6=6 < straight7=7 …
//   → a quad beats straight3/4/5 + a triple, but still loses to "straight6 and up" (longer/rarer = stronger; a straight can be up to 12 cards)
// Returns 0 if not a bomb
export function bombPower(combo: Combo | null): number {
  if (!combo) return 0;
  if (combo.type === 'triple') return 2;
  // quad beats straight5 but is still below straight6
  if (combo.type === 'quad') return 5;
  if (combo.type === 'straight') {
    if (combo.len === 3) return 1;
    if (combo.len === 4) return 3;
    // straight5 is below quad
    if (combo.len === 5) return 4;
    // straight6+ = by card count (6,7,…,12) → always beats a quad; longer is stronger
    return combo.len;
  }
  return 0;
}

// Can candidate beat the current pile? current = null means it's the lead (anything goes)
export function canBeat(current: Combo | null, candidate: Combo | null): boolean {
  if (!candidate) return false;
  // leading the pile — any legal combo is fine
  if (!current) return true;

  const candBomb = bombPower(candidate);

  // Pile is in "bomb mode" → must use a stronger bomb (cross-type order); on a tie, compare value
  if (current.mode === 'bomb') {
    if (!candBomb) return false;
    const curBomb = bombPower(current);
    if (candBomb !== curBomb) return candBomb > curBomb;
    return candidate.value > current.value;
  }

  // Normal pile — bombs beat small piles by card count: odd-count combos (3,5) beat singles · even-count combos (4,6) beat pairs
  if (current.type === 'single') {
    if (candidate.type === 'single') return candidate.value > current.value;
    // odd-count combos beat singles
    return candBomb > 0 && candidate.len % 2 === 1;
  }
  if (current.type === 'pair') {
    if (candidate.type === 'pair') return candidate.value > current.value;
    // even-count combos beat pairs
    return candBomb > 0 && candidate.len % 2 === 0;
  }
  if (current.type === 'straight') {
    // A straight that "led": beat it with a higher straight of the same length
    // + a quad can beat a straight if the quad is stronger than that pile's straight (quad beats straight3/4/5 but loses to straight6)
    if (candidate.type === 'quad' && candBomb > bombPower(current)) return true;
    return (
      candidate.type === 'straight' &&
      candidate.len === current.len &&
      candidate.value > current.value
    );
  }
  // Fallback for other cases: compare same type
  if (candidate.type === current.type) return candidate.value > current.value;
  return false;
}

// The pile's mode after playing candidate (called after canBeat has passed)
//   'bomb'  = pile is in bomb mode (must override with a stronger bomb)
//   'normal'= normal pile (single/pair/straight)
export function playMode(current: Combo | null, candidate: Combo): 'bomb' | 'normal' {
  if (!current) {
    // Leading: triple/quad count as bombs; single/pair/straight are normal
    return candidate.type === 'triple' || candidate.type === 'quad' ? 'bomb' : 'normal';
  }
  if (current.mode === 'bomb') return 'bomb';
  if (current.type === 'single' || current.type === 'pair') {
    // Same type played = normal; a bomb played on top = bomb
    return candidate.type === current.type ? 'normal' : 'bomb';
  }
  if (current.type === 'straight') {
    // A straight overridden by a quad → pile enters bomb mode (next must be a higher quad); straight beating straight = still normal
    return candidate.type === 'straight' ? 'normal' : 'bomb';
  }
  return 'normal';
}
