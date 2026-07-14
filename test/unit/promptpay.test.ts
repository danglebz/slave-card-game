// PromptPay payload — a wrong byte here sends money nowhere (or worse, somewhere else),
// so pin the receiver, the checksum, the field layout and the amount encoding.
import { describe, it, expect } from 'vitest';
import {
  crc16,
  promptPayPayload,
  formatPromptPayId,
  PROMPTPAY_ID,
} from '../../client/src/lib/promptpay';

// the receiver the donation QR actually pays
const PHONE = PROMPTPAY_ID;

describe('ผู้รับเงิน (PROMPTPAY_ID)', () => {
  it('เป็นเบอร์ที่ตั้งใจจะให้เงินเข้า — เลขผิดตัวเดียว = เงินไปเข้าคนอื่น', () => {
    expect(PROMPTPAY_ID).toBe('085-796-8525');
  });

  it('QR ที่แอปสร้างจริง เข้ารหัสเบอร์นี้ในรูปแบบสากล (0066 + เบอร์ไม่มี 0 นำ)', () => {
    expect(promptPayPayload(PROMPTPAY_ID)).toContain('0113' + '0066857968525');
  });
});

describe('crc16 (CRC-16/CCITT-FALSE)', () => {
  it('ตรงกับ check value มาตรฐานของอัลกอริทึม', () => {
    // the algorithm's published check value: CRC of "123456789" is 0x29B1
    expect(crc16('123456789')).toBe('29B1');
  });

  it('คืน 4 ตัวอักษร hex ตัวใหญ่เสมอ (zero-pad)', () => {
    for (const s of ['', 'A', 'promptpay', '000201']) {
      expect(crc16(s)).toMatch(/^[0-9A-F]{4}$/);
    }
  });
});

describe('promptPayPayload — ไม่ระบุจำนวนเงิน (static)', () => {
  const payload = promptPayPayload(PHONE);

  it('ขึ้นต้นด้วย payload format 01 + static flag 11', () => {
    expect(payload.startsWith('000201' + '010211')).toBe(true);
  });

  it('มี AID ของพร้อมเพย์ และเบอร์ในรูปแบบ 0066XXXXXXXXX', () => {
    // field 29, length 37 = AID (20 chars) + mobile (17 chars)
    expect(payload).toContain('2937' + '0016A000000677010111' + '0113' + '0066857968525');
  });

  it('มีประเทศ TH + สกุลเงิน THB (764) และไม่มี field จำนวนเงิน (54)', () => {
    expect(payload).toContain('5802TH');
    expect(payload).toContain('5303764');
    expect(payload).not.toMatch(/54\d{2}\d+\.\d{2}/);
  });

  it('ปิดท้ายด้วย CRC ที่คำนวณจากตัว payload เองได้ถูกต้อง', () => {
    const body = payload.slice(0, -4);
    expect(body.endsWith('6304')).toBe(true);
    expect(payload.slice(-4)).toBe(crc16(body));
  });
});

describe('promptPayPayload — ระบุจำนวนเงิน (dynamic)', () => {
  it('สลับเป็น flag 12 และฝังจำนวนเงินทศนิยม 2 ตำแหน่ง', () => {
    const payload = promptPayPayload(PHONE, 100);
    expect(payload.startsWith('000201' + '010212')).toBe(true);
    expect(payload).toContain('5406100.00');
    expect(payload.slice(-4)).toBe(crc16(payload.slice(0, -4)));
  });

  it('จำนวนเงินมีเศษสตางค์ → ความยาว field ตามจริง', () => {
    // "4.22" is 4 chars → 5404
    expect(promptPayPayload(PHONE, 4.22)).toContain('54044.22');
    // "20.00" is 5 chars → 5405
    expect(promptPayPayload(PHONE, 20)).toContain('540520.00');
  });

  it('จำนวนเงิน 0 / ลบ / undefined → ถือว่าไม่ระบุ (static)', () => {
    for (const amount of [0, -5, undefined, null]) {
      expect(promptPayPayload(PHONE, amount).startsWith('000201010211')).toBe(true);
    }
  });
});

describe('promptPayPayload — ชนิดผู้รับ', () => {
  it('เบอร์มือถือ (10 หลัก) → sub-field 01', () => {
    expect(promptPayPayload('0899999999')).toContain('0113' + '0066899999999');
  });

  it('เลขบัตรประชาชน (13 หลัก) → sub-field 02 ใช้เลขตรงๆ', () => {
    expect(promptPayPayload('1234567890123')).toContain('0213' + '1234567890123');
  });

  it('e-wallet (15 หลัก) → sub-field 03', () => {
    expect(promptPayPayload('123456789012345')).toContain('0315' + '123456789012345');
  });

  it('ตัวคั่นอย่าง - หรือช่องว่างไม่มีผลต่อผลลัพธ์', () => {
    expect(promptPayPayload('085-796-8525')).toBe(promptPayPayload('0857968525'));
    expect(promptPayPayload('085 796 8525')).toBe(promptPayPayload('0857968525'));
  });

  it('id ว่าง → error (กัน QR ที่ชี้ไปไม่ถึงใคร)', () => {
    expect(() => promptPayPayload('')).toThrow();
    expect(() => promptPayPayload('---')).toThrow();
  });
});

describe('formatPromptPayId', () => {
  it('จัดเบอร์ 10 หลักเป็น 085-796-8525', () => {
    expect(formatPromptPayId('0857968525')).toBe('085-796-8525');
  });

  it('id ชนิดอื่นแสดงตามเดิม', () => {
    expect(formatPromptPayId('1234567890123')).toBe('1234567890123');
  });
});
