// bot.ts — AI seat-filler
// Strategy (smarter but still lightweight):
//   • Lead the pile: play pairs/straights to shed cards fast, not just singles; keep triples/quads to control the game
//   • Follow the pile: play the smallest winning combo; don't break up pairs or waste a 2 for nothing
//   • Bombs: drop them when worth it — an opponent is near empty-handed, it can finish the game, or it's your own endgame
import { cardId, identifyCombo, canBeat, bombPower } from './game';
import type { Card, Combo } from '../shared/types';

const THREE_CLUB = '3.0';

export interface BotContext {
  /** Fewest cards held by any opponent still in play — used to decide whether to drop a bomb */
  minOppCards?: number;
  /** First pile of the game: the leading combo must include 3♣ (id '3.0') */
  mustInclude3?: boolean;
  /** Combo types disabled by the host (combo.type not allowed) — the bot won't build these */
  disallowed?: Set<string>;
}

type Cand = { cards: Card[]; combo: Combo };

function cardVal(c: Card): number {
  return c.r * 4 + c.s;
}

function sortByRank(hand: Card[]): Card[] {
  return hand.slice().sort((a, b) => a.r - b.r || a.s - b.s);
}

// Group cards by rank (each group sorted by suit low→high)
function rankGroups(hand: Card[]): Map<number, Card[]> {
  const m = new Map<number, Card[]>();
  for (const c of hand) {
    const g = m.get(c.r);
    if (g) g.push(c);
    else m.set(c.r, [c]);
  }
  for (const g of m.values()) g.sort((a, b) => a.s - b.s);
  return m;
}

// ----- Generators for possible combos -----
// Lowest-value pair of each rank (the two lowest suits)
function pairsByRank(hand: Card[]): Card[][] {
  const out: Card[][] = [];
  for (const cs of rankGroups(hand).values()) {
    if (cs.length >= 2) out.push([cs[0], cs[1]]);
  }
  return out;
}

function triplesByRank(hand: Card[]): Card[][] {
  const out: Card[][] = [];
  for (const cs of rankGroups(hand).values()) {
    if (cs.length >= 3) out.push(cs.slice(0, 3));
  }
  return out;
}

function quadsByRank(hand: Card[]): Card[][] {
  const out: Card[][] = [];
  for (const cs of rankGroups(hand).values()) {
    if (cs.length === 4) out.push(cs.slice());
  }
  return out;
}

// All flush straights of length L from the hand (no 2 / r=15)
function flushStraightsOfLen(hand: Card[], L: number): Card[][] {
  const out: Card[][] = [];
  const bySuit: Record<number, Card[]> = {};
  for (const c of hand) if (c.r !== 15) (bySuit[c.s] ||= []).push(c);
  for (const s of Object.keys(bySuit)) {
    const cards = bySuit[+s].slice().sort((a, b) => a.r - b.r);
    for (let i = 0; i + L <= cards.length; i++) {
      let ok = true;
      for (let k = 1; k < L; k++) {
        if (cards[i + k].r !== cards[i + k - 1].r + 1) {
          ok = false;
          break;
        }
      }
      if (ok) out.push(cards.slice(i, i + L));
    }
  }
  return out;
}

function allStraights(hand: Card[], maxLen = 6): Card[][] {
  const out: Card[][] = [];
  for (let L = 3; L <= maxLen; L++) out.push(...flushStraightsOfLen(hand, L));
  return out;
}

// All bombs in the hand (triples/quads/straights) — used to gauge how bomb-heavy the hand is
function allBombs(hand: Card[]): Card[][] {
  return [...triplesByRank(hand), ...quadsByRank(hand), ...allStraights(hand)];
}

/**
 * Choose the bot's move
 * @param hand the bot's hand
 * @param pile the current pile (null = the bot is leading)
 * @param ctx  contextual info to aid the decision
 * @returns cardIds to play, or null = pass
 */
export function botChoose(hand: Card[], pile: Combo | null, ctx: BotContext = {}): string[] | null {
  const sorted = sortByRank(hand);
  if (!sorted.length) return null;
  return pile ? chooseFollow(sorted, pile, ctx) : chooseLead(sorted, ctx);
}

// Lead score: lower is better — play low-rank combos and prefer shedding many cards (bonus per card count)
function leadScore(c: Cand): number {
  return c.combo.topRank - 1.5 * (c.cards.length - 1);
}

function chooseLead(hand: Card[], ctx: BotContext): string[] {
  const endgame = hand.length <= 5;
  const groups = rankGroups(hand);
  const bombRanks = new Set<number>();
  for (const [r, cs] of groups) if (cs.length >= 3) bombRanks.add(r);

  const cands: Cand[] = [];
  const add = (cards: Card[]) => {
    const combo = identifyCombo(cards);
    if (combo && !ctx.disallowed?.has(combo.type)) cands.push({ cards, combo });
  };

  // Singles/pairs from "non-bomb" ranks (keep triples/quads to control the game)
  for (const [r, cs] of groups) {
    if (bombRanks.has(r)) continue;
    add([cs[0]]);
    if (cs.length >= 2) add([cs[0], cs[1]]);
  }
  // Straights: normally play only 3–4 cards, hold long straights (5–6 = strong bombs) for now; release all in the endgame
  for (const s of allStraights(hand, endgame ? 6 : 4)) add(s);

  // Endgame: release bombs/triples/quads to finish quickly
  if (endgame) {
    for (const [r, cs] of groups) {
      if (!bombRanks.has(r)) continue;
      add([cs[0]]);
      if (cs.length >= 2) add([cs[0], cs[1]]);
    }
    for (const s of triplesByRank(hand)) add(s);
    for (const s of quadsByRank(hand)) add(s);
  }

  // The first pile of the game must include 3♣
  let pool = ctx.mustInclude3
    ? cands.filter((c) => c.cards.some((x) => cardId(x) === THREE_CLUB))
    : cands;
  // safety net: play the lowest single (first pile = 3♣ already)
  if (!pool.length) return [cardId(hand[0])];

  // Can empty the whole hand → win immediately
  const winNow = pool.find((c) => c.cards.length === hand.length);
  if (winNow) return winNow.cards.map(cardId);

  pool = pool
    .slice()
    .sort(
      (a, b) =>
        leadScore(a) - leadScore(b) ||
        b.cards.length - a.cards.length ||
        a.combo.value - b.combo.value,
    );
  return pool[0].cards.map(cardId);
}

function chooseFollow(hand: Card[], pile: Combo, ctx: BotContext): string[] | null {
  const endgame = hand.length <= 5;
  // an opponent is about to empty their hand → willing to go all-in
  const desperate = (ctx.minOppCards ?? Infinity) <= 2;

  // Bombs that can beat this pile (weakest first) + condition on whether to commit
  const bombs = beatingBombs(hand, pile, ctx.disallowed);
  const wantBomb = () =>
    bombs.length > 0 && (desperate || endgame || bombs[0].length === hand.length);

  // Pile is in bomb mode (triple/quad/straight override) → only a stronger bomb works
  if (pile.mode === 'bomb') {
    return wantBomb() ? bombs[0].map(cardId) : null;
  }

  // Normal pile: beat it with the same combo type (cheapest) first
  const same = beatSameType(hand, pile, endgame, desperate);
  if (same) return same.map(cardId);

  // Can't beat with the same type → use a bomb if worth it
  return wantBomb() ? bombs[0].map(cardId) : null;
}

// Same-type combo as the pile with the lowest value that still wins
function beatSameType(
  hand: Card[],
  pile: Combo,
  endgame: boolean,
  desperate: boolean,
): Card[] | null {
  if (pile.type === 'single') return bestBeatingSingle(hand, pile, endgame, desperate);
  if (pile.type === 'pair') return lowestBeating(pairsByRank(hand), pile);
  if (pile.type === 'straight') return lowestBeating(flushStraightsOfLen(hand, pile.len), pile);
  return null;
}

function lowestBeating(sets: Card[][], pile: Combo): Card[] | null {
  let best: Card[] | null = null;
  let bestVal = Infinity;
  for (const cs of sets) {
    const combo = identifyCombo(cs);
    if (combo && combo.type === pile.type && canBeat(pile, combo) && combo.value < bestVal) {
      bestVal = combo.value;
      best = cs;
    }
  }
  return best;
}

// Winning single: avoid breaking pairs (use lone cards first), don't waste a 2 grabbing a tiny pile too early
function bestBeatingSingle(
  hand: Card[],
  pile: Combo,
  endgame: boolean,
  desperate: boolean,
): Card[] | null {
  const groups = rankGroups(hand);
  const beats = hand.filter((c) => canBeat(pile, identifyCombo([c])));
  if (!beats.length) return null;
  // Lone cards (ranks with a single card) first, then sort by value low→high
  beats.sort((a, b) => {
    const la = groups.get(a.r)!.length === 1 ? 0 : 1;
    const lb = groups.get(b.r)!.length === 1 ? 0 : 1;
    return la - lb || cardVal(a) - cardVal(b);
  });
  let pick = beats[0];
  // Don't waste a 2 (highest) grabbing a single-card pile too early if there's another option
  if (pick.r === 15 && !endgame && !desperate && hand.length > 1) {
    const alt = beats.find((c) => c.r !== 15);
    // only 2s left → keep them, better to pass
    if (!alt) return null;
    pick = alt;
  }
  return [pick];
}

// All bombs that beat this pile, sorted weakest→strongest (use the cheapest bomb first)
function beatingBombs(hand: Card[], pile: Combo, disallowed?: Set<string>): Card[][] {
  const ok: { cs: Card[]; combo: Combo }[] = [];
  for (const cs of allBombs(hand)) {
    const combo = identifyCombo(cs);
    if (combo && !disallowed?.has(combo.type) && bombPower(combo) > 0 && canBeat(pile, combo))
      ok.push({ cs, combo });
  }
  ok.sort((a, b) => bombPower(a.combo) - bombPower(b.combo) || a.combo.value - b.combo.value);
  return ok.map((x) => x.cs);
}
