// observability.ts — logging, metrics, and Sentry (optional)
// - logger: leveled logs + timestamp (set LOG_LEVEL=error|warn|info|debug)
// - metrics: cumulative counters + a real-time snapshot of room/player counts
// - Sentry: enabled only when SENTRY_DSN is set (requires installing @sentry/node) — otherwise a no-op

import type { Room } from './room';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

let Sentry: any = null;

// ----- logging -----
const LEVELS: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };
const THRESHOLD = LEVELS[process.env.LOG_LEVEL as LogLevel] ?? LEVELS.info;

export function log(level: LogLevel, msg: string, meta?: unknown): void {
  if ((LEVELS[level] ?? LEVELS.info) > THRESHOLD) return;
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${msg}`;
  const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (meta !== undefined) out(line, meta);
  else out(line);
  // Forward into Sentry Logs (if enabled) — skip debug to save quota
  if (Sentry?.logger && level !== 'debug') {
    const fn = Sentry.logger[level] || Sentry.logger.info;
    if (meta !== undefined) fn(msg, meta);
    else fn(msg);
  }
}

export const logger = {
  info: (m: string, meta?: unknown) => log('info', m, meta),
  warn: (m: string, meta?: unknown) => log('warn', m, meta),
  error: (m: string, meta?: unknown) => log('error', m, meta),
  debug: (m: string, meta?: unknown) => log('debug', m, meta),
};

/** log error + send to Sentry (if enabled) */
export function captureError(err: unknown, context?: Record<string, unknown>): void {
  logger.error((err as Error)?.message || String(err), context);
  if (Sentry) Sentry.captureException(err, context ? { extra: context } : undefined);
}

// ----- Sentry (optional) -----
export async function initSentry(): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logger.info('Sentry: ปิดอยู่ (ไม่ได้ตั้ง SENTRY_DSN)');
    return;
  }
  try {
    // dynamic import → load @sentry/node only when enabled (doesn't slow startup if unused)
    const mod = await import('@sentry/node');
    mod.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      // performance tracing — default 10% (set SENTRY_TRACES_SAMPLE_RATE=0 to disable)
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
      // enable Sentry Logs (receives logs from logger.* above)
      enableLogs: true,
    });
    Sentry = mod;
    logger.info('Sentry: เปิดใช้งานแล้ว');
  } catch (e) {
    logger.warn(
      'Sentry: ตั้ง SENTRY_DSN ไว้ แต่ยังไม่ได้ติดตั้งแพ็กเกจ — รัน `pnpm add @sentry/node`',
      {
        err: (e as Error).message,
      },
    );
  }
}

// ----- metrics -----
export const metrics = {
  startedAt: Date.now(),
  // number of rooms ever created (cumulative)
  roomsCreated: 0,
  // number of rounds started (cumulative)
  gamesStarted: 0,
  // number of sockets ever connected (cumulative)
  connections: 0,
  // number of events dropped for exceeding the limit (cumulative)
  rateLimited: 0,
  // peak concurrent connections
  peakConcurrent: 0,
};

/** Summarize the current state from the rooms Map (room/player/spectator counts, etc.) */
export function snapshot(rooms: Map<string, Room>) {
  let players = 0;
  let bots = 0;
  let spectators = 0;
  let roomsPlaying = 0;
  for (const r of rooms.values()) {
    for (const p of r.players) {
      if (p.isBot) bots++;
      else players++;
    }
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
