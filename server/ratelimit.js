// ratelimit.js — กันสแปม event ฝั่ง server (token bucket ต่อ socket)
// แนวคิด: ทุก socket มี "ถัง token" เติมเรื่อย ๆ ตามเวลา; ส่ง event = ใช้ 1 token
//   ถัง overall คุมทุก event (กัน flood), ถัง heavy คุม event แพง (create/join) เข้มกว่า

export class TokenBucket {
  /**
   * @param {number} capacity จำนวน token สูงสุด (เบิร์สต์ได้เท่านี้)
   * @param {number} refillPerSec เติม token กี่ใบต่อวินาที
   * @param {() => number} now ฟังก์ชันเวลา (ฉีดได้เพื่อเทส)
   */
  constructor(capacity, refillPerSec, now = () => Date.now()) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillPerSec = refillPerSec;
    this._now = now;
    this.last = now();
  }

  /** พยายามใช้ n token — คืน true ถ้าพอ (ผ่าน), false ถ้าหมด (ถูกตัด) */
  take(n = 1) {
    const t = this._now();
    this.tokens = Math.min(
      this.capacity,
      this.tokens + ((t - this.last) / 1000) * this.refillPerSec,
    );
    this.last = t;
    if (this.tokens >= n) {
      this.tokens -= n;
      return true;
    }
    return false;
  }
}

// event ที่สร้าง state ใหม่/แพง → จำกัดเข้มกว่า event ทั่วไป (play/pass/setColor ฯลฯ)
const HEAVY_EVENTS = new Set(['create', 'join', 'addBot', 'shuffleSeats']);

/**
 * สร้างตัวตรวจ rate-limit สำหรับ 1 socket
 * @returns {(event: string) => boolean} คืน true = อนุญาต, false = เกินลิมิต
 */
export function createSocketLimiter(now = () => Date.now()) {
  const overall = new TokenBucket(
    Number(process.env.RL_BURST) || 25, // เบิร์สต์รวม
    Number(process.env.RL_RATE) || 12, // เติม 12/วิ
    now,
  );
  const heavy = new TokenBucket(
    Number(process.env.RL_HEAVY_BURST) || 8,
    Number(process.env.RL_HEAVY_RATE) || 1.5,
    now,
  );
  return (event) => {
    if (!overall.take()) return false;
    if (HEAVY_EVENTS.has(event) && !heavy.take()) return false;
    return true;
  };
}
