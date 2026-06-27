// observability.js — logging, metrics, และ Sentry (ออปชัน)
// - logger: log มีระดับ + timestamp (ตั้ง LOG_LEVEL=error|warn|info|debug)
// - metrics: ตัวนับสะสม + snapshot จำนวนห้อง/ผู้เล่นแบบเรียลไทม์
// - Sentry: เปิดเฉพาะเมื่อมี SENTRY_DSN (ต้องติดตั้ง @sentry/node เพิ่ม) — ไม่งั้น no-op

let Sentry = null;

// ----- logging -----
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const THRESHOLD = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

export function log(level, msg, meta) {
  if ((LEVELS[level] ?? LEVELS.info) > THRESHOLD) return;
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${msg}`;
  const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (meta !== undefined) out(line, meta);
  else out(line);
  // ส่งต่อเข้า Sentry Logs (ถ้าเปิดอยู่) — ข้าม debug เพื่อประหยัด quota
  if (Sentry?.logger && level !== 'debug') {
    const fn = Sentry.logger[level] || Sentry.logger.info;
    if (meta !== undefined) fn(msg, meta);
    else fn(msg);
  }
}

export const logger = {
  info: (m, meta) => log('info', m, meta),
  warn: (m, meta) => log('warn', m, meta),
  error: (m, meta) => log('error', m, meta),
  debug: (m, meta) => log('debug', m, meta),
};

/** log error + ส่งเข้า Sentry (ถ้าเปิดอยู่) */
export function captureError(err, context) {
  logger.error(err?.message || String(err), context);
  if (Sentry) Sentry.captureException(err, context ? { extra: context } : undefined);
}

// ----- Sentry (ออปชัน) -----
export async function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logger.info('Sentry: ปิดอยู่ (ไม่ได้ตั้ง SENTRY_DSN)');
    return;
  }
  try {
    // import แบบ dynamic → โหลด @sentry/node เฉพาะตอนเปิดใช้ (ไม่ถ่วง startup ถ้าไม่ใช้)
    const mod = await import('@sentry/node');
    mod.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      // performance tracing — ดีฟอลต์ 10% (ตั้ง SENTRY_TRACES_SAMPLE_RATE=0 เพื่อปิด)
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
      enableLogs: true, // เปิด Sentry Logs (รับ log จาก logger.* ด้านบน)
    });
    Sentry = mod;
    logger.info('Sentry: เปิดใช้งานแล้ว');
  } catch (e) {
    logger.warn(
      'Sentry: ตั้ง SENTRY_DSN ไว้ แต่ยังไม่ได้ติดตั้งแพ็กเกจ — รัน `pnpm add @sentry/node`',
      {
        err: e.message,
      },
    );
  }
}

// ----- metrics -----
export const metrics = {
  startedAt: Date.now(),
  roomsCreated: 0, // จำนวนห้องที่เคยถูกสร้าง (สะสม)
  gamesStarted: 0, // จำนวนรอบที่เริ่มเล่น (สะสม)
  connections: 0, // จำนวน socket ที่เคยต่อ (สะสม)
  rateLimited: 0, // จำนวน event ที่ถูกตัดเพราะเกินลิมิต (สะสม)
  peakConcurrent: 0, // ผู้เชื่อมต่อพร้อมกันสูงสุด
};

/** สรุปสถานะปัจจุบันจาก rooms Map (จำนวนห้อง/ผู้เล่น/ผู้ชม ฯลฯ) */
export function snapshot(rooms) {
  let players = 0;
  let bots = 0;
  let spectators = 0;
  let roomsPlaying = 0;
  for (const r of rooms.values()) {
    for (const p of r.players) p.isBot ? bots++ : players++;
    spectators += r.spectators.length;
    if (r.phase === 'playing' || r.phase === 'exchange') roomsPlaying++;
  }
  return {
    uptimeSec: Math.round((Date.now() - metrics.startedAt) / 1000),
    rooms: rooms.size,
    roomsPlaying,
    players,
    bots,
    spectators,
    roomsCreated: metrics.roomsCreated,
    gamesStarted: metrics.gamesStarted,
    connections: metrics.connections,
    rateLimited: metrics.rateLimited,
    peakConcurrent: metrics.peakConcurrent,
  };
}
