// bot.js — AI เติมคน (กลยุทธ์อย่างง่าย: เล็กสุดที่เล่นได้ ไม่เปลืองบอมบ์)
import { cardId, identifyCombo, canBeat } from './game.js';

// คู่ที่ value ต่ำสุดของแต่ละอันดับ (สองดอกต่ำสุด)
function pairsByRank(hand) {
  const byRank = {};
  for (const c of hand) (byRank[c.r] ||= []).push(c);
  const out = [];
  for (const r of Object.keys(byRank)) {
    const cs = byRank[r].slice().sort((a, b) => a.s - b.s);
    if (cs.length >= 2) out.push([cs[0], cs[1]]);
  }
  return out;
}

// เรียงดอกเดียวความยาว L ทั้งหมดจากมือ (ห้ามมีไพ่ 2 / r=15)
function flushStraightsOfLen(hand, L) {
  const out = [];
  const bySuit = {};
  for (const c of hand) if (c.r !== 15) (bySuit[c.s] ||= []).push(c);
  for (const s of Object.keys(bySuit)) {
    const cards = bySuit[s].slice().sort((a, b) => a.r - b.r);
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

/**
 * เลือกตาเดินของบอท
 * @param {{r:number,s:number}[]} hand ไพ่ในมือบอท
 * @param {object|null} pile กองปัจจุบัน (null = บอทเป็นคนนำ)
 * @returns {string[]|null} cardIds ที่จะลง หรือ null = ผ่าน
 */
export function botChoose(hand, pile) {
  const sorted = hand.slice().sort((a, b) => a.r - b.r || a.s - b.s);
  if (!sorted.length) return null;
  if (!pile) return [cardId(sorted[0])]; // นำกอง: ทิ้งไพ่เดี่ยวต่ำสุด

  let cands = [];
  if (pile.type === 'single') cands = sorted.map((c) => [c]);
  else if (pile.type === 'pair') cands = pairsByRank(sorted);
  else if (pile.type === 'straight') cands = flushStraightsOfLen(sorted, pile.len);
  // กองตอง/โฟร์/โหมดบอมบ์ → ต้องใช้บอมบ์แรงกว่า: บอทเลือกผ่าน (ไม่เปลืองบอมบ์)

  let best = null,
    bestVal = Infinity;
  for (const cards of cands) {
    const combo = identifyCombo(cards);
    if (combo && combo.type === pile.type && canBeat(pile, combo) && combo.value < bestVal) {
      bestVal = combo.value;
      best = cards;
    }
  }
  return best ? best.map(cardId) : null;
}
