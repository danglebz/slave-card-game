// gameLogic.test.ts — ตรรกะ client-lib แบบ pure (รันใน node ผ่าน alias @)
import { describe, it, expect } from 'vitest';
import type { CardWithId } from '@shared/types';
import {
  seatFor,
  seatOrigin,
  SEAT_LAYOUTS,
  detectCombos,
  sortedHand,
  disabledComboTypes,
  rankLabel,
  chipStyle,
} from '@/lib/gameLogic';

const c = (r: number, s: number): CardWithId => ({ r, s, id: `${r}.${s}` });

describe('seatFor', () => {
  it('rel 0 = ที่นั่งล่างสุด (คุณ) ทุกจำนวนผู้เล่น', () => {
    for (let n = 2; n <= 6; n++) expect(seatFor(0, n)).toBe(SEAT_LAYOUTS[n][0]);
    expect(seatFor(0, 2)).toBe('seat-bottom');
  });

  it('เกิน 6 คน → fallback ผัง 6 ที่นั่ง', () => {
    expect(seatFor(0, 8)).toBe(SEAT_LAYOUTS[6][0]);
  });

  it('rel เกินจำนวนที่นั่ง → fallback seat-top', () => {
    expect(seatFor(9, 2)).toBe('seat-top');
  });
});

describe('seatOrigin', () => {
  it('ล่าง = สไลด์ขึ้น (+y), บน = สไลด์ลง (-y)', () => {
    expect(seatOrigin('seat-bottom')).toEqual([0, 1]);
    expect(seatOrigin('seat-top')).toEqual([0, -1]);
  });

  it('มุม = เวกเตอร์ทแยง', () => {
    expect(seatOrigin('seat-tl')).toEqual([-0.72, -0.72]);
    expect(seatOrigin('seat-br')).toEqual([0.72, 0.72]);
  });

  it('ที่นั่งไม่รู้จัก → ค่า default (เด้งลงจากบนเล็กน้อย)', () => {
    expect(seatOrigin('')).toEqual([0, -0.26]);
    expect(seatOrigin('seat-unknown')).toEqual([0, -0.26]);
  });
});

describe('rankLabel', () => {
  it('แปลงเลขเป็นหน้าไพ่', () => {
    expect(rankLabel(15)).toBe('2');
    expect(rankLabel(14)).toBe('A');
    expect(rankLabel(13)).toBe('K');
    expect(rankLabel(5)).toBe('5');
  });
});

describe('detectCombos', () => {
  it('เจอตอง', () => {
    const hints = detectCombos([c(5, 0), c(5, 1), c(5, 2), c(9, 3)]);
    expect(hints.some((h) => h.ids.length === 3)).toBe(true);
  });

  it('เจอเรียงดอกเดียว (flush straight)', () => {
    const hints = detectCombos([c(5, 0), c(6, 0), c(7, 0), c(9, 3)]);
    expect(hints.some((h) => h.ids.length === 3)).toBe(true);
  });

  it('เคารพ disabled — ปิดตองแล้วไม่ใบ้ตอง', () => {
    const off = disabledComboTypes({ allowTriple: false });
    const hints = detectCombos([c(5, 0), c(5, 1), c(5, 2)], 'th', off);
    expect(hints).toHaveLength(0);
  });
});

describe('sortedHand', () => {
  it('โหมด rank → เรียงตามเลขจากน้อยไปมาก', () => {
    const sorted = sortedHand([c(9, 0), c(3, 1), c(15, 2)], 'rank');
    expect(sorted.map((x) => x.r)).toEqual([3, 9, 15]);
  });

  it('โหมด bomb → ดันไพ่ในบอมบ์ไปขวาสุด', () => {
    const sorted = sortedHand([c(7, 0), c(5, 0), c(5, 1), c(5, 2)], 'bomb');
    // ตอง 5 (สามใบ) ต้องอยู่ขวาสุด, ไพ่เดี่ยว 7 อยู่ซ้าย
    expect(sorted[0].r).toBe(7);
    expect(sorted.slice(1).every((x) => x.r === 5)).toBe(true);
  });
});

describe('chipStyle', () => {
  it('hex ไม่ถูกต้อง → undefined', () => {
    expect(chipStyle('nope')).toBeUndefined();
    expect(chipStyle('#fff')).toBeUndefined();
  });

  it('พื้นเข้ม → ตัวอักษรขาว', () => {
    const st = chipStyle('#101010')!;
    expect(st['--chip-fg' as keyof typeof st]).toBe('#ffffff');
  });

  it('พื้นสว่าง → ตัวอักษรดำ', () => {
    const st = chipStyle('#fefefe')!;
    expect(st['--chip-fg' as keyof typeof st]).toBe('#1c1c1f');
  });
});

describe('disabledComboTypes', () => {
  it('default (ไม่ส่ง) → ว่าง', () => {
    expect(disabledComboTypes().size).toBe(0);
    expect(disabledComboTypes(null).size).toBe(0);
  });

  it('ปิดหลายชนิดพร้อมกัน', () => {
    const d = disabledComboTypes({ allowTriple: false, allowQuad: false, allowStraight: false });
    expect([...d].sort()).toEqual(['quad', 'straight', 'triple']);
  });
});
