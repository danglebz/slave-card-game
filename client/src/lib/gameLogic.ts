// gameLogic.ts — ตรรกะการ์ดฝั่ง client (port จาก app.js: rankLabel, sortedHand, detectCombos)
import type { Card, CardWithId } from '@shared/types';

// ︎ = text-presentation selector: บังคับให้ดอกแสดงเป็นตัวอักษร (ไม่ใช่ emoji)
// เพื่อให้สี CSS (.red) มีผลจริงบนมือถือ
export const SUITS = ['♣︎', '♦︎', '♥︎', '♠︎'];
export const RED = new Set([1, 2]); // ข้าวหลามตัด, โพแดง = สีแดง

export function rankLabel(r: number): string {
  return (
    ({ 15: '2', 14: 'A', 13: 'K', 12: 'Q', 11: 'J' } as Record<number, string>)[r] || String(r)
  );
}

export function isRed(c: Card): boolean {
  return RED.has(c.s);
}

export type ComboHint = { label: string; ids: string[] };

// โหมดเรียงไพ่ในมือ
export type HandSort = 'rank' | 'bomb';

export function initialHandSort(): HandSort {
  return localStorage.getItem('handSort') === 'bomb' ? 'bomb' : 'rank';
}

export function sortedHand(hand: CardWithId[] | undefined, handSort: HandSort): CardWithId[] {
  const arr = (hand || []).slice().sort((a, b) => a.r - b.r || a.s - b.s); // เรียงตามเลขก่อนเสมอ
  if (handSort !== 'bomb') return arr;
  // โหมดบอม: ดันไพ่ที่อยู่ในบอม (ตอง/โฟร์/เรียงดอกเดียว) ไปไว้ขวาสุด ที่เหลือคงเรียงเลขเดิม
  // บอมบ์ที่ใช้ไพ่ร่วมกันจะ "เชื่อมต่อกัน" โดยใช้ไพ่ร่วมเป็นสะพาน
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
  const left = arr.filter((c) => !inBomb.has(c.id)); // ไม่ใช่บอม → เรียงเลขปกติ (ซ้าย)
  const right = bombIds.map((id) => byId.get(id)!); // บอม → กลุ่ม+เชื่อมต่อ (ขวา)
  return [...left, ...right];
}

// ตรวจหา "บอมบ์" ที่ทำได้จากไพ่ในมือ: ตอง, โฟร์, เรียงดอกเดียว (ยาว >=3)
export function detectCombos(hand: CardWithId[]): ComboHint[] {
  const out: ComboHint[] = [];

  // ตอง / โฟร์ — จัดกลุ่มตามอันดับ
  const byRank: Record<number, CardWithId[]> = {};
  for (const c of hand) (byRank[c.r] ||= []).push(c);
  Object.keys(byRank)
    .map(Number)
    .sort((a, b) => a - b)
    .forEach((r) => {
      const cards = byRank[r];
      if (cards.length === 4) {
        out.push({ label: `โฟร์ ${rankLabel(r)}`, ids: cards.map((c) => c.id) });
      } else if (cards.length === 3) {
        out.push({ label: `ตอง ${rankLabel(r)}`, ids: cards.map((c) => c.id) });
      }
    });

  // เรียงดอกเดียว (flush straight) — จัดกลุ่มตามดอก, ห้ามมีไพ่ 2 (r=15)
  const bySuit: Record<number, CardWithId[]> = {};
  for (const c of hand) if (c.r !== 15) (bySuit[c.s] ||= []).push(c);
  Object.keys(bySuit)
    .map(Number)
    .forEach((s) => {
      const cards = bySuit[s].slice().sort((a, b) => a.r - b.r);
      let run: CardWithId[] = [cards[0]];
      const flush = (rn: CardWithId[]) => {
        if (rn.length >= 3) {
          out.push({
            label: `เรียง${SUITS[s]} ${rankLabel(rn[0].r)}-${rankLabel(rn[rn.length - 1].r)} (${rn.length})`,
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

// พื้นชิป = สีเต็ม + เลือกสีตัวอักษร (ขาว/ดำ) ตามความสว่างของสี ให้อ่านออกเสมอ
export function chipStyle(hex: string): React.CSSProperties | undefined {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return undefined;
  const ch = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  const lum = (0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5)) / 255; // ความสว่างสัมพัทธ์
  const dark = lum < 0.6; // พื้นเข้ม → ตัวอักษรขาว
  const fg = dark ? '#ffffff' : '#1c1c1f';
  const soft = dark ? 'rgba(255,255,255,0.82)' : 'rgba(0,0,0,0.58)';
  const d = (i: number) => Math.round(ch(i) * 0.78); // ขอบ = สีเดียวกันแต่เข้มกว่า ~22%
  const border = `rgb(${d(1)},${d(3)},${d(5)})`;
  return {
    background: hex,
    borderColor: border,
    ['--chip-fg' as string]: fg,
    ['--chip-fg-soft' as string]: soft,
  };
}
