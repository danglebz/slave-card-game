// push.ts — Web Push (notify even when the app is closed) server side
// VAPID keys must be set via env to enable it (unset = feature silently disabled entirely)
//   gen once: node -e "console.log(require('web-push').generateVAPIDKeys())"
//   VAPID_PUBLIC_KEY  — public (sent to the client to subscribe)
//   VAPID_PRIVATE_KEY — private (kept secret on the server only)
//   VAPID_SUBJECT     — mailto:you@example.com or an https URL (default is the repo's mailto)
import webpush from 'web-push';
import type { Phase, PushSubJSON, ResultEntry } from '../shared/types';
import type { Room } from './room';
import { captureError, logger } from './observability';

type Lang = 'th' | 'en';

// ----- VAPID setup (enabled when both public + private are present) -----
const PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:danglebz@hotmail.com';

export const pushEnabled = !!(PUBLIC && PRIVATE);
export const vapidPublicKey = PUBLIC;

if (pushEnabled) {
  try {
    webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
    logger.info('🔔 Web Push เปิดใช้งาน (VAPID ตั้งค่าแล้ว)');
  } catch (e) {
    captureError(e, { where: 'push.setVapidDetails' });
  }
}

// ----- Subscription store: key = `${code}::${name}` (a seat in a room), kept in memory -----
// Lives only while playing — not saved to disk (the client re-subscribes on reconnect anyway)
interface Entry {
  sub: PushSubJSON;
  lang: Lang;
}
const store = new Map<string, Entry>();
const keyOf = (code: string, name: string) => `${code}::${name}`;

export function saveSub(code: string, name: string, sub: PushSubJSON, lang: Lang): void {
  store.set(keyOf(code, name), { sub, lang });
}
export function dropSub(code: string, name: string): void {
  store.delete(keyOf(code, name));
}
/** Drop all subscriptions for a room (when the room is reaped) */
export function dropRoom(code: string): void {
  const prefix = `${code}::`;
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}

// ----- Notification text (localized per the language the client sent on subscribe) -----
const RANK_LABEL: Record<Lang, Record<string, string>> = {
  th: { king: 'คิง', queen: 'ควีน', commoner: 'สามัญชน', viceslave: 'รองสลาฟ', slave: 'สลาฟ' },
  en: {
    king: 'King',
    queen: 'Queen',
    commoner: 'Commoner',
    viceslave: 'Vice-Slave',
    slave: 'Slave',
  },
};
const TXT = {
  th: {
    turnTitle: '🔔 ถึงตาคุณแล้ว!',
    turnBody: 'แตะเพื่อกลับไปลงไพ่',
    startTitle: '🃏 เกมเริ่มแล้ว!',
    startBody: 'เข้าไปเล่นได้เลย',
    endTitle: '🎉 จบเกมแล้ว',
    join: (n: string) => `👋 ${n} เข้าห้องแล้ว`,
    leave: (n: string) => `🚪 ${n} ออกจากห้อง`,
  },
  en: {
    turnTitle: '🔔 Your turn!',
    turnBody: 'Tap to jump back in',
    startTitle: '🃏 Game started!',
    startBody: 'Jump in now',
    endTitle: '🎉 Game over',
    join: (n: string) => `👋 ${n} joined the room`,
    leave: (n: string) => `🚪 ${n} left the room`,
  },
} satisfies Record<Lang, unknown>;

// Short round summary: "King: A · Slave: B" (first/last of finishOrder)
function resultSummary(result: ResultEntry[] | null, lang: Lang): string {
  if (!result?.length) return '';
  const lbl = RANK_LABEL[lang];
  const top = result[0];
  const bottom = result[result.length - 1];
  const parts = [`${lbl[top.title] ?? top.title}: ${top.name}`];
  if (bottom !== top) parts.push(`${lbl[bottom.title] ?? bottom.title}: ${bottom.name}`);
  return parts.join(' · ');
}

interface Payload {
  title: string;
  body?: string;
  tag: string;
  url: string;
  ttl: number;
  urgent?: boolean;
}

// Send a push to a single seat (silent if there's no subscription); dead endpoint (404/410) → drop it
async function sendTo(code: string, name: string, make: (t: (typeof TXT)[Lang]) => Payload) {
  const entry = store.get(keyOf(code, name));
  if (!entry) return;
  const p = make(TXT[entry.lang]);
  try {
    await webpush.sendNotification(
      { endpoint: entry.sub.endpoint, keys: entry.sub.keys },
      JSON.stringify({ title: p.title, body: p.body, tag: p.tag, url: p.url }),
      { TTL: p.ttl, urgency: p.urgent ? 'high' : 'normal' },
    );
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      // subscription expired/revoked → stop sending
      dropSub(code, name);
    } else {
      captureError(e, { where: 'push.sendTo', status });
    }
  }
}

// ----- Detect transitions and fire notifications (keep the previous snapshot per room) -----
interface Memo {
  phase: Phase;
  turn: number;
  // real player name → connected (bots excluded)
  seats: Map<string, boolean>;
}
const memos = new WeakMap<Room, Memo>();

function snapshot(room: Room): Memo {
  const seats = new Map<string, boolean>();
  for (const p of room.players) if (!p.isBot) seats.set(p.name, p.connected);
  return { phase: room.phase, turn: room.turn, seats };
}

// Real players still in the room (for picking notification targets), except the given name
function humanNames(room: Room, except?: string): string[] {
  return room.players.filter((p) => !p.isBot && p.name !== except).map((p) => p.name);
}

/**
 * Called after every state change (in broadcast) — diffs against the previous snapshot and fires pushes
 * per event: your turn / game started / game over / someone joined or left the room
 * The actual display is decided in the service worker (focused = no popup) — the server just targets recipients
 */
export function notifyRoom(room: Room): void {
  if (!pushEnabled) return;
  const prev = memos.get(room);
  const cur = snapshot(room);
  memos.set(room, cur);
  // first snapshot = set the baseline, notify nothing yet (avoid popups on load)
  if (!prev) return;

  const code = room.code;
  const t = (name: string, make: (x: (typeof TXT)[Lang]) => Payload) =>
    void sendTo(code, name, make);

  // 1) Game started: from lobby/finished → playing/exchange (a new round)
  const wasIdle = prev.phase === 'lobby' || prev.phase === 'finished';
  const nowPlaying = cur.phase === 'playing' || cur.phase === 'exchange';
  const startedNow = wasIdle && nowPlaying;
  if (startedNow) {
    for (const name of humanNames(room)) {
      t(name, (x) => ({
        title: x.startTitle,
        body: x.startBody,
        tag: `start-${code}`,
        url: `/?room=${code}`,
        ttl: 300,
      }));
    }
  }

  // 2) Game over
  if (prev.phase !== 'finished' && cur.phase === 'finished') {
    for (const name of humanNames(room)) {
      t(name, (x) => ({
        title: x.endTitle,
        body: resultSummary(room.lastResult, langOf(code, name)),
        tag: `end-${code}`,
        url: `/?room=${code}`,
        ttl: 600,
      }));
    }
  }

  // 3) Your turn (only fired for the player whose turn it is, if a real player not yet finished)
  //    Skipped if "game started" was just notified this round (avoid stacked popups)
  const turnChanged = cur.turn !== prev.turn || prev.phase !== 'playing';
  if (!startedNow && cur.phase === 'playing' && turnChanged) {
    const cp = room.players[cur.turn];
    if (cp && !cp.isBot && !cp.finished) {
      t(cp.name, (x) => ({
        title: x.turnTitle,
        body: x.turnBody,
        tag: `turn-${code}`,
        url: `/?room=${code}`,
        ttl: 45,
        urgent: true,
      }));
    }
  }

  // 4) Join/leave the room (compare seats) — notify the others in the room
  for (const [name, connected] of cur.seats) {
    if (!prev.seats.has(name) && connected) {
      // New name = joined the room (not a reconnect under the same name)
      for (const other of humanNames(room, name)) {
        t(other, (x) => ({
          title: x.join(name),
          tag: `room-${code}`,
          url: `/?room=${code}`,
          ttl: 300,
        }));
      }
    }
  }
  for (const [name, wasConn] of prev.seats) {
    const nowConn = cur.seats.get(name);
    // Was online, then dropped/disappeared (lobby = seat removed, mid-game = connected=false)
    if (wasConn && (nowConn === undefined || nowConn === false)) {
      for (const other of humanNames(room, name)) {
        t(other, (x) => ({
          title: x.leave(name),
          tag: `room-${code}`,
          url: `/?room=${code}`,
          ttl: 300,
        }));
      }
    }
  }
}

function langOf(code: string, name: string): Lang {
  return store.get(keyOf(code, name))?.lang ?? 'th';
}
