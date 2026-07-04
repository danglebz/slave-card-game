// gameLogic.ts — client-side card logic (ported from app.js: rankLabel, sortedHand, detectCombos)
import type { Card, CardWithId, RoomState, Settings } from '@shared/types';
import { identifyCombo, canBeat } from '@shared/rules';
import { t, type Lang } from './i18n';

// auto-play the last combo: returns the card ids to auto-play (the whole hand as one winning
// combo), or null if auto-play must NOT fire. Pure so it can be exhaustively unit-tested.
// (mirrors the real rules from shared → covers single/pair/triple/quad/straight)
export function autoPlayIds(s: RoomState | null): string[] | null {
  if (!s || s.phase !== 'playing' || s.youAreSpectator) return null;
  // not our turn → no auto
  if (s.turn !== s.youIndex) return null;
  // is the entire remaining hand a single legal combo?
  const combo = identifyCombo(s.hand);
  // not a single combo (e.g. leftovers / mixed cards) → choose manually
  if (!combo) return null;
  // combo type disabled by the host → no auto
  if (disabledComboTypes(s.settings).has(combo.type)) return null;
  // can't beat the pile → must pass manually, no auto
  if (!canBeat(s.pile, combo)) return null;
  return s.hand.map((c) => c.id);
}

// house rules: special combos the host disabled → Set of combo.type that can't be played (matches server/game.ts)
export function disabledComboTypes(settings?: Partial<Settings> | null): Set<string> {
  const d = new Set<string>();
  if (settings?.allowTriple === false) d.add('triple');
  if (settings?.allowQuad === false) d.add('quad');
  if (settings?.allowStraight === false) d.add('straight');
  return d;
}

// ︎ = text-presentation selector: force suits to render as text (not emoji)
// so the CSS color (.red) actually applies on mobile
export const SUITS = ['♣︎', '♦︎', '♥︎', '♠︎'];
// diamonds, hearts = red
export const RED = new Set([1, 2]);

export function rankLabel(r: number): string {
  return (
    ({ 15: '2', 14: 'A', 13: 'K', 12: 'Q', 11: 'J' } as Record<number, string>)[r] || String(r)
  );
}

export function isRed(c: Card): boolean {
  return RED.has(c.s);
}

export type ComboHint = { label: string; ids: string[] };

// hand sort mode
export type HandSort = 'rank' | 'bomb';

export function initialHandSort(): HandSort {
  return localStorage.getItem('handSort') === 'bomb' ? 'bomb' : 'rank';
}

export function sortedHand(hand: CardWithId[] | undefined, handSort: HandSort): CardWithId[] {
  // always sort by rank first
  const arr = (hand || []).slice().sort((a, b) => a.r - b.r || a.s - b.s);
  if (handSort !== 'bomb') return arr;
  // bomb mode: push cards that form a bomb (triple/quad/flush straight) to the far right, keep the rest in rank order
  // bombs sharing a card get "linked" using the shared card as a bridge
  const blocks: string[][] = [];
  const idBlock = new Map<string, string[]>();
  for (const cb of detectCombos(arr)) {
    const shared = cb.ids.find((id) => idBlock.has(id));
    if (!shared) {
      const block = cb.ids.slice();
      blocks.push(block);
      block.forEach((id) => idBlock.set(id, block));
    } else {
      const block = idBlock.get(shared)!;
      block.splice(block.indexOf(shared), 1);
      block.push(shared);
      for (const id of cb.ids) {
        if (id === shared || idBlock.has(id)) continue;
        block.push(id);
        idBlock.set(id, block);
      }
    }
  }
  const bombIds = blocks.flat();
  if (!bombIds.length) return arr;
  const inBomb = new Set(bombIds);
  const byId = new Map(arr.map((c) => [c.id, c]));
  // not a bomb → normal rank order (left)
  const left = arr.filter((c) => !inBomb.has(c.id));
  // bomb → grouped + linked (right)
  const right = bombIds.map((id) => byId.get(id)!);
  return [...left, ...right];
}

// smart select: pile is a pair/triple/quad (groupSize=2/3/4) → tapping 1 card selects the full same-rank set
// the tapped card is always included + fill with the lowest remaining suits to complete the set (keep high suits for later)
// returns the list of ids to select, or null if conditions aren't met (groupSize<2 or not enough of that rank in hand → select one at a time as usual)
export function smartPick(
  hand: CardWithId[],
  tapped: CardWithId,
  groupSize: number,
): string[] | null {
  if (groupSize < 2) return null;
  const sameRank = hand.filter((x) => x.r === tapped.r);
  if (sameRank.length < groupSize) return null;
  const rest = sameRank
    .filter((x) => x.id !== tapped.id)
    .sort((a, b) => a.s - b.s)
    .slice(0, groupSize - 1)
    .map((x) => x.id);
  return [tapped.id, ...rest];
}

// detect "bombs" possible from the hand: triple, quad, flush straight (length >=3)
export function detectCombos(
  hand: CardWithId[],
  lang: Lang = 'th',
  disabled?: Set<string>,
): ComboHint[] {
  const out: ComboHint[] = [];
  // combos the host disabled → don't show as a hint
  const off = (type: string) => !!disabled?.has(type);

  // triple / quad — group by rank
  const byRank: Record<number, CardWithId[]> = {};
  for (const c of hand) (byRank[c.r] ||= []).push(c);
  Object.keys(byRank)
    .map(Number)
    .sort((a, b) => a - b)
    .forEach((r) => {
      const cards = byRank[r];
      if (cards.length === 4 && !off('quad')) {
        out.push({
          label: `${t(lang, 'combo.quad')} ${rankLabel(r)}`,
          ids: cards.map((c) => c.id),
        });
      } else if (cards.length === 3 && !off('triple')) {
        out.push({
          label: `${t(lang, 'combo.triple')} ${rankLabel(r)}`,
          ids: cards.map((c) => c.id),
        });
      }
    });

  // flush straight — group by suit, no 2s allowed (r=15)
  const bySuit: Record<number, CardWithId[]> = {};
  for (const c of hand) if (c.r !== 15) (bySuit[c.s] ||= []).push(c);
  Object.keys(bySuit)
    .map(Number)
    .forEach((s) => {
      const cards = bySuit[s].slice().sort((a, b) => a.r - b.r);
      let run: CardWithId[] = [cards[0]];
      const flush = (rn: CardWithId[]) => {
        if (rn.length >= 3 && !off('straight')) {
          out.push({
            label: `${t(lang, 'combo.straightWord')} ${SUITS[s]} ${rankLabel(rn[0].r)}-${rankLabel(rn[rn.length - 1].r)} (${rn.length})`,
            ids: rn.map((c) => c.id),
          });
        }
      };
      for (let i = 1; i < cards.length; i++) {
        if (cards[i].r === cards[i - 1].r + 1) run.push(cards[i]);
        else {
          flush(run);
          run = [cards[i]];
        }
      }
      flush(run);
    });

  return out;
}

// ----- seat positions on the 3×3 grid (shared by Table + Pile) — rel 0 = "you" at the bottom -----
export const SEAT_LAYOUTS: Record<number, string[]> = {
  2: ['seat-bottom', 'seat-top'],
  3: ['seat-bottom', 'seat-tr', 'seat-tl'],
  4: ['seat-bl', 'seat-br', 'seat-tr', 'seat-tl'],
  5: ['seat-bottom', 'seat-br', 'seat-tr', 'seat-tl', 'seat-bl'],
  6: ['seat-bottom', 'seat-br', 'seat-tr', 'seat-top', 'seat-tl', 'seat-bl'],
};

export function seatFor(rel: number, n: number): string {
  const layout = SEAT_LAYOUTS[n] || SEAT_LAYOUTS[6];
  return layout[rel] || 'seat-top';
}

// direction cards "slide into" the center pile = unit vector from the player's seat → center of the table
const SEAT_ORIGIN: Record<string, [number, number]> = {
  'seat-bottom': [0, 1],
  'seat-top': [0, -1],
  'seat-left': [-1, 0],
  'seat-right': [1, 0],
  'seat-tl': [-0.72, -0.72],
  'seat-tr': [0.72, -0.72],
  'seat-bl': [-0.72, 0.72],
  'seat-br': [0.72, 0.72],
};

export function seatOrigin(seatId: string): [number, number] {
  // unknown seat → drop down slightly from the top (original behavior)
  return SEAT_ORIGIN[seatId] || [0, -0.26];
}

// chip background = full color + pick text color (white/black) by luminance so it's always readable
export function chipStyle(hex: string): React.CSSProperties | undefined {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return undefined;
  const ch = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  // relative luminance
  const lum = (0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5)) / 255;
  // dark background → white text
  const dark = lum < 0.6;
  const fg = dark ? '#ffffff' : '#1c1c1f';
  const soft = dark ? 'rgba(255,255,255,0.82)' : 'rgba(0,0,0,0.58)';
  // dark shade = same color but ~22% darker (border + gradient end)
  const d = (i: number) => Math.round(ch(i) * 0.78);
  // light shade = mixed with ~16% white (gradient start)
  const l = (i: number) => Math.round(ch(i) + (255 - ch(i)) * 0.16);
  const dark3 = `rgb(${d(1)},${d(3)},${d(5)})`;
  const light3 = `rgb(${l(1)},${l(3)},${l(5)})`;
  // gradient light→original→dark to give the label depth (still based on the player's color)
  const gradient = `linear-gradient(160deg, ${light3} 0%, ${hex} 48%, ${dark3} 100%)`;
  return {
    background: gradient,
    borderColor: dark3,
    ['--chip-fg' as string]: fg,
    ['--chip-fg-soft' as string]: soft,
  };
}
