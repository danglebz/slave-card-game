// rules.ts — กติกาแกน (ระบุชนิดชุด / เปรียบเทียบว่ากินกันได้ไหม / โหมดกอง) แบบ pure
//   ใช้ร่วมทั้ง server (ตัดสินเกม) และ client (auto-play เช็ก "ชุดสุดท้ายลงชนะได้ไหม")
//
// อันดับไพ่ (rank): 3 ต่ำสุด ... 2 สูงสุด | ดอก (suit) ตัดสินเมื่ออันดับเท่ากัน: ♣0 < ♦1 < ♥2 < ♠3
import type { Card, Combo } from './types';

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
