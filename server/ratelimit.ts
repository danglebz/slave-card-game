// ratelimit.ts — server-side event anti-spam (token bucket per socket)
// Idea: every socket has a "token bucket" that refills over time; sending an event = uses 1 token
//   the overall bucket controls all events (flood protection), the heavy bucket controls expensive events (create/join) more strictly

type NowFn = () => number;

export class TokenBucket {
  capacity: number;
  tokens: number;
  refillPerSec: number;
  last: number;
  private _now: NowFn;

  /**
   * @param capacity max number of tokens (max burst)
   * @param refillPerSec how many tokens to refill per second
   * @param now time function (injectable for testing)
   */
  constructor(capacity: number, refillPerSec: number, now: NowFn = () => Date.now()) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillPerSec = refillPerSec;
    this._now = now;
    this.last = now();
  }

  /** Try to use n tokens — returns true if enough (pass), false if empty (dropped) */
  take(n = 1): boolean {
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

// events that create new state / are expensive → limited more strictly than regular events (play/pass/setColor, etc.)
const HEAVY_EVENTS = new Set(['create', 'join', 'addBot', 'shuffleSeats']);

/**
 * Create a rate-limit checker for one socket
 * @returns returns true = allowed, false = over the limit
 */
export function createSocketLimiter(now: NowFn = () => Date.now()): (event: string) => boolean {
  const overall = new TokenBucket(
    // overall burst
    Number(process.env.RL_BURST) || 25,
    // refill 12/sec
    Number(process.env.RL_RATE) || 12,
    now,
  );
  const heavy = new TokenBucket(
    Number(process.env.RL_HEAVY_BURST) || 8,
    Number(process.env.RL_HEAVY_RATE) || 1.5,
    now,
  );
  return (event: string): boolean => {
    if (!overall.take()) return false;
    if (HEAVY_EVENTS.has(event) && !heavy.take()) return false;
    return true;
  };
}
