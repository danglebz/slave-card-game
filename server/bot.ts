// bot.ts — AI เติมคน
// กลยุทธ์ (ฉลาดขึ้นแต่ยังประหยัด):
//   • นำกอง: เล่นคู่/เรียงเพื่อรีบทิ้งไพ่ ไม่ใช่ลงเดี่ยวอย่างเดียว, เก็บตอง/โฟร์ไว้คุมเกม
//   • ตามกอง: ลงชุดเล็กสุดที่ชนะ, ไม่ทุบคู่/ทุ่มไพ่ 2 ทิ้งเปล่า ๆ
//   • บอมบ์: ทุ่มเมื่อคุ้ม — คู่แข่งใกล้หมดมือ, จบเกมได้, หรือช่วงท้ายเกมของตัวเอง
import { cardId, identifyCombo, canBeat, bombPower } from './game';
import type { Card, Combo } from '../shared/types';

const THREE_CLUB = '3.0';

export interface BotContext {
  /** จำนวนไพ่น้อยสุดของคู่แข่งที่ยังไม่หมดมือ — ใช้ตัดสินใจว่าจะทุ่มบอมบ์ไหม */
  minOppCards?: number;
  /** กองแรกของเกม: ชุดที่นำต้องมี 3♣ (id '3.0') ร่วมด้วย */
  mustInclude3?: boolean;
  /** ชุดที่หัวห้องปิด (combo.type ที่ห้ามลง) — บอทจะไม่สร้างชุดเหล่านี้ */
  disallowed?: Set<string>;
}

type Cand = { cards: Card[]; combo: Combo };

function cardVal(c: Card): number {
  return c.r * 4 + c.s;
}

function sortByRank(hand: Card[]): Card[] {
  return hand.slice().sort((a, b) => a.r - b.r || a.s - b.s);
}

// จัดกลุ่มไพ่ตามอันดับ (แต่ละกลุ่มเรียงดอกจากต่ำ→สูง)
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

// ----- ตัวสร้างชุดไพ่ที่เป็นไปได้ -----
// คู่ value ต่ำสุดของแต่ละอันดับ (สองดอกต่ำสุด)
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

// เรียงดอกเดียวความยาว L ทั้งหมดจากมือ (ห้ามมีไพ่ 2 / r=15)
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

// บอมบ์ทั้งหมดในมือ (ตอง/โฟร์/เรียง) — ใช้นับว่ามือบอมบ์เยอะไหม
function allBombs(hand: Card[]): Card[][] {
  return [...triplesByRank(hand), ...quadsByRank(hand), ...allStraights(hand)];
}

/**
 * เลือกตาเดินของบอท
 * @param hand ไพ่ในมือบอท
 * @param pile กองปัจจุบัน (null = บอทเป็นคนนำ)
 * @param ctx  ข้อมูลรอบข้างช่วยตัดสินใจ
 * @returns cardIds ที่จะลง หรือ null = ผ่าน
 */
export function botChoose(hand: Card[], pile: Combo | null, ctx: BotContext = {}): string[] | null {
  const sorted = sortByRank(hand);
  if (!sorted.length) return null;
  return pile ? chooseFollow(sorted, pile, ctx) : chooseLead(sorted, ctx);
}

// คะแนนนำกอง: ยิ่งต่ำยิ่งดี — เล่นชุดอันดับต่ำ และชอบทิ้งหลายใบ (โบนัสตามจำนวนใบ)
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

  // เดี่ยว/คู่ จากอันดับที่ "ไม่ใช่บอมบ์" (เก็บตอง/โฟร์ไว้คุมเกม)
  for (const [r, cs] of groups) {
    if (bombRanks.has(r)) continue;
    add([cs[0]]);
    if (cs.length >= 2) add([cs[0], cs[1]]);
  }
  // เรียง: ปกติเล่นแค่ 3–4 ใบ, เก็บเรียงยาว (5–6 = บอมบ์แรง) ไว้ก่อน; ท้ายเกมปลดได้หมด
  for (const s of allStraights(hand, endgame ? 6 : 4)) add(s);

  // ช่วงท้ายเกม: ปลดบอมบ์/ตอง/โฟร์ เพื่อรีบจบ
  if (endgame) {
    for (const [r, cs] of groups) {
      if (!bombRanks.has(r)) continue;
      add([cs[0]]);
      if (cs.length >= 2) add([cs[0], cs[1]]);
    }
    for (const s of triplesByRank(hand)) add(s);
    for (const s of quadsByRank(hand)) add(s);
  }

  // กองแรกของเกมต้องมี 3♣
  let pool = ctx.mustInclude3
    ? cands.filter((c) => c.cards.some((x) => cardId(x) === THREE_CLUB))
    : cands;
  if (!pool.length) return [cardId(hand[0])]; // กันพลาด: ลงเดี่ยวต่ำสุด (กองแรก = 3♣ อยู่แล้ว)

  // ลงหมดมือได้ → ชนะทันที
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
  const desperate = (ctx.minOppCards ?? Infinity) <= 2; // คู่แข่งจะหมดมือ → ยอมทุ่ม

  // บอมบ์ที่ชนะกองนี้ได้ (อ่อนสุดก่อน) + เงื่อนไขว่าควรทุ่มไหม
  const bombs = beatingBombs(hand, pile, ctx.disallowed);
  const wantBomb = () =>
    bombs.length > 0 && (desperate || endgame || bombs[0].length === hand.length);

  // กองอยู่ในโหมดบอมบ์ (ตอง/โฟร์/เรียงทับ) → ต้องบอมบ์แรงกว่าเท่านั้น
  if (pile.mode === 'bomb') {
    return wantBomb() ? bombs[0].map(cardId) : null;
  }

  // กองปกติ: ชนะด้วยชุดชนิดเดียวกัน (ถูกสุด) ก่อน
  const same = beatSameType(hand, pile, endgame, desperate);
  if (same) return same.map(cardId);

  // ชนะชนิดเดียวกันไม่ได้ → ใช้บอมบ์ถ้าคุ้ม
  return wantBomb() ? bombs[0].map(cardId) : null;
}

// ชุดชนิดเดียวกับกองที่ value ต่ำสุดและชนะได้
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

// ไพ่เดี่ยวที่ชนะ: เลี่ยงทุบคู่ (ใช้ใบโดด ๆ ก่อน), ไม่ทุ่มไพ่ 2 ชิงกองจิ๋วก่อนเวลา
function bestBeatingSingle(
  hand: Card[],
  pile: Combo,
  endgame: boolean,
  desperate: boolean,
): Card[] | null {
  const groups = rankGroups(hand);
  const beats = hand.filter((c) => canBeat(pile, identifyCombo([c])));
  if (!beats.length) return null;
  // ใบโดด (อันดับมีใบเดียว) ก่อน แล้วค่อยเรียงตาม value ต่ำ→สูง
  beats.sort((a, b) => {
    const la = groups.get(a.r)!.length === 1 ? 0 : 1;
    const lb = groups.get(b.r)!.length === 1 ? 0 : 1;
    return la - lb || cardVal(a) - cardVal(b);
  });
  let pick = beats[0];
  // อย่าทุ่มไพ่ 2 (สูงสุด) ชิงกองเดี่ยวก่อนเวลา ถ้ายังมีทางอื่น
  if (pick.r === 15 && !endgame && !desperate && hand.length > 1) {
    const alt = beats.find((c) => c.r !== 15);
    if (!alt) return null; // มีแต่ไพ่ 2 → เก็บไว้ ผ่านดีกว่า
    pick = alt;
  }
  return [pick];
}

// บอมบ์ทั้งหมดที่ชนะกองนี้ เรียงจากอ่อนสุด→แรงสุด (ใช้บอมบ์ที่ถูกที่สุดก่อน)
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
