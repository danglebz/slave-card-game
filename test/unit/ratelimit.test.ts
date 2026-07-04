// Unit: token-bucket rate limiter (anti-spam)
import { describe, it, expect } from 'vitest';
import { TokenBucket, createSocketLimiter } from '../../server/ratelimit';

describe('TokenBucket', () => {
  it('ใช้ token ได้จนหมด capacity แล้วถูกตัด', () => {
    const clock = 0;
    const b = new TokenBucket(3, 1, () => clock);
    expect(b.take()).toBe(true);
    expect(b.take()).toBe(true);
    expect(b.take()).toBe(true);
    // exhausted
    expect(b.take()).toBe(false);
  });

  it('เติม token ตามเวลาที่ผ่านไป', () => {
    let clock = 0;
    // refill 2/sec
    const b = new TokenBucket(3, 2, () => clock);
    b.take();
    b.take();
    b.take();
    expect(b.take()).toBe(false);
    // +1 sec → +2 tokens
    clock = 1000;
    expect(b.take()).toBe(true);
    expect(b.take()).toBe(true);
    expect(b.take()).toBe(false);
  });

  it('ไม่เติมเกิน capacity', () => {
    let clock = 0;
    const b = new TokenBucket(2, 100, () => clock);
    b.take();
    b.take();
    // very long, but capped at 2
    clock = 10_000;
    expect(b.take()).toBe(true);
    expect(b.take()).toBe(true);
    expect(b.take()).toBe(false);
  });
});

describe('createSocketLimiter', () => {
  it('flood event เดิมซ้ำ ๆ จะถูกตัดเมื่อเกินเบิร์สต์', () => {
    const clock = 0;
    // time doesn't advance → no refill
    const allow = createSocketLimiter(() => clock);
    let allowed = 0;
    for (let i = 0; i < 100; i++) if (allow('pass')) allowed++;
    // must get throttled sometimes
    expect(allowed).toBeLessThan(100);
    expect(allowed).toBeGreaterThan(0);
  });

  it('event แพง (create) ถูกจำกัดเข้มกว่า event ทั่วไป', () => {
    const clock = 0;
    const allow = createSocketLimiter(() => clock);
    let creates = 0;
    for (let i = 0; i < 100; i++) if (allow('create')) creates++;
    // heavy bucket starts at 8 → create passes ≤ 8 times in the burst
    expect(creates).toBeLessThanOrEqual(8);
  });
});
