// Unit: token-bucket rate limiter (กันสแปม)
import { describe, it, expect } from 'vitest';
import { TokenBucket, createSocketLimiter } from '../../server/ratelimit';

describe('TokenBucket', () => {
  it('ใช้ token ได้จนหมด capacity แล้วถูกตัด', () => {
    const clock = 0;
    const b = new TokenBucket(3, 1, () => clock);
    expect(b.take()).toBe(true);
    expect(b.take()).toBe(true);
    expect(b.take()).toBe(true);
    expect(b.take()).toBe(false); // หมดแล้ว
  });

  it('เติม token ตามเวลาที่ผ่านไป', () => {
    let clock = 0;
    const b = new TokenBucket(3, 2, () => clock); // เติม 2/วิ
    b.take();
    b.take();
    b.take();
    expect(b.take()).toBe(false);
    clock = 1000; // +1 วิ → +2 token
    expect(b.take()).toBe(true);
    expect(b.take()).toBe(true);
    expect(b.take()).toBe(false);
  });

  it('ไม่เติมเกิน capacity', () => {
    let clock = 0;
    const b = new TokenBucket(2, 100, () => clock);
    b.take();
    b.take();
    clock = 10_000; // นานมาก แต่ไม่เกิน 2
    expect(b.take()).toBe(true);
    expect(b.take()).toBe(true);
    expect(b.take()).toBe(false);
  });
});

describe('createSocketLimiter', () => {
  it('flood event เดิมซ้ำ ๆ จะถูกตัดเมื่อเกินเบิร์สต์', () => {
    const clock = 0;
    const allow = createSocketLimiter(() => clock); // เวลาไม่เดิน → ไม่เติม
    let allowed = 0;
    for (let i = 0; i < 100; i++) if (allow('pass')) allowed++;
    expect(allowed).toBeLessThan(100); // ต้องโดนตัดบ้าง
    expect(allowed).toBeGreaterThan(0);
  });

  it('event แพง (create) ถูกจำกัดเข้มกว่า event ทั่วไป', () => {
    const clock = 0;
    const allow = createSocketLimiter(() => clock);
    let creates = 0;
    for (let i = 0; i < 100; i++) if (allow('create')) creates++;
    // heavy bucket เริ่มที่ 8 → create ผ่านได้ ≤ 8 ครั้งในเบิร์สต์
    expect(creates).toBeLessThanOrEqual(8);
  });
});
