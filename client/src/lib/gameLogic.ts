// gameLogic.ts — ตรรกะการ์ดฝั่ง client (port จาก app.js: rankLabel, sortedHand, detectCombos)
import type { Card, CardWithId, Settings } from '@shared/types';
import { t, type Lang } from './i18n';

// house rules: ชุดพิเศษที่หัวห้องปิด → Set ของ combo.type ที่ห้ามลง (ตรงกับ server/game.ts)
export function disabledComboTypes(settings?: Partial<Settings> | null): Set<string> {
  const d = new Set<string>();
  if (settings?.allowTriple === false) d.add('triple');
  if (settings?.allowQuad === false) d.add('quad');
  if (settings?.allowStraight === false) d.add('straight');
  return d;
}

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

// สมาร์ทซีเลกต์: กองเป็นคู่/ตอง/โฟร์ (groupSize=2/3/4) → แตะไพ่ 1 ใบ ได้ชุด rank เดียวกันครบเลย
// ใบที่แตะติดเสมอ + เติม "ดอกต่ำสุด" ที่เหลือให้ครบชุด (เก็บดอกสูงไว้ใช้ทีหลัง)
// คืนรายการ id ที่ควรเลือก หรือ null ถ้าไม่เข้าเงื่อนไข (groupSize<2 หรือ rank ในมือไม่พอ → เลือกทีละใบตามปกติ)
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

// ตรวจหา "บอมบ์" ที่ทำได้จากไพ่ในมือ: ตอง, โฟร์, เรียงดอกเดียว (ยาว >=3)
export function detectCombos(
  hand: CardWithId[],
  lang: Lang = 'th',
  disabled?: Set<string>,
): ComboHint[] {
  const out: ComboHint[] = [];
  const off = (type: string) => !!disabled?.has(type); // ชุดที่หัวห้องปิด → ไม่แสดงเป็นใบ้

  // ตอง / โฟร์ — จัดกลุ่มตามอันดับ
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

  // เรียงดอกเดียว (flush straight) — จัดกลุ่มตามดอก, ห้ามมีไพ่ 2 (r=15)
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

// ----- ตำแหน่งที่นั่งบนตาราง 3×3 (ใช้ร่วมกัน Table + Pile) — rel 0 = "คุณ" ที่ล่างสุด -----
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

// ทิศที่ไพ่ "สไลด์เข้า" กองกลาง = เวกเตอร์หน่วยจากที่นั่งของคนลงไพ่ → กลางโต๊ะ
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
  return SEAT_ORIGIN[seatId] || [0, -0.26]; // ไม่รู้ที่นั่ง → เด้งลงจากบนเล็กน้อย (ของเดิม)
}

// พื้นชิป = สีเต็ม + เลือกสีตัวอักษร (ขาว/ดำ) ตามความสว่างของสี ให้อ่านออกเสมอ
export function chipStyle(hex: string): React.CSSProperties | undefined {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return undefined;
  const ch = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  const lum = (0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5)) / 255; // ความสว่างสัมพัทธ์
  const dark = lum < 0.6; // พื้นเข้ม → ตัวอักษรขาว
  const fg = dark ? '#ffffff' : '#1c1c1f';
  const soft = dark ? 'rgba(255,255,255,0.82)' : 'rgba(0,0,0,0.58)';
  const d = (i: number) => Math.round(ch(i) * 0.78); // เฉดเข้ม = สีเดียวกันแต่เข้มกว่า ~22% (ขอบ + ปลาย gradient)
  const l = (i: number) => Math.round(ch(i) + (255 - ch(i)) * 0.16); // เฉดอ่อน = ผสมขาว ~16% (ต้น gradient)
  const dark3 = `rgb(${d(1)},${d(3)},${d(5)})`;
  const light3 = `rgb(${l(1)},${l(3)},${l(5)})`;
  // ไล่เฉดอ่อน→สีเดิม→เข้ม ให้ป้ายดูมีมิติ (ยังอิงสีประจำตัวเดิม)
  const gradient = `linear-gradient(160deg, ${light3} 0%, ${hex} 48%, ${dark3} 100%)`;
  return {
    background: gradient,
    borderColor: dark3,
    ['--chip-fg' as string]: fg,
    ['--chip-fg-soft' as string]: soft,
  };
}
