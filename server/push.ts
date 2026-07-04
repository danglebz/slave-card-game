// push.ts — Web Push (แจ้งเตือนแม้ปิดแอป) ฝั่ง server
// ต้องตั้ง VAPID keys ผ่าน env ถึงจะเปิดใช้ (ไม่ตั้ง = ปิดฟีเจอร์เงียบๆ ทั้งเส้น)
//   gen ครั้งเดียว: node -e "console.log(require('web-push').generateVAPIDKeys())"
//   VAPID_PUBLIC_KEY  — public (ส่งให้ client subscribe)
//   VAPID_PRIVATE_KEY — private (เก็บลับบน server เท่านั้น)
//   VAPID_SUBJECT     — mailto:you@example.com หรือ https URL (ดีฟอลต์ mailto ของ repo)
import webpush from 'web-push';
import type { Phase, PushSubJSON, ResultEntry } from '../shared/types';
import type { Room } from './room';
import { captureError, logger } from './observability';

type Lang = 'th' | 'en';

// ----- ตั้งค่า VAPID (เปิดใช้เมื่อครบทั้ง public + private) -----
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

// ----- คลัง subscription: key = `${code}::${name}` (ที่นั่งในห้อง), เก็บในหน่วยความจำ -----
// อายุแค่ช่วงที่ยังเล่นอยู่ — ไม่เซฟลงไฟล์ (client re-subscribe ตอน reconnect อยู่แล้ว)
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
/** ลบ subscription ทั้งห้อง (ตอนห้องถูกเก็บกวาด) */
export function dropRoom(code: string): void {
  const prefix = `${code}::`;
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}

// ----- ข้อความแจ้งเตือน (แปลตามภาษาที่ client ส่งมาตอน subscribe) -----
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

// สรุปผลรอบสั้นๆ: "คิง: A · สลาฟ: B" (คนแรก/คนสุดท้ายของ finishOrder)
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

// ยิง push ไปที่ที่นั่งเดียว (เงียบถ้าไม่มี subscription); endpoint ตาย (404/410) → ลบทิ้ง
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
      dropSub(code, name); // subscription หมดอายุ/ถูกยกเลิก → เลิกส่ง
    } else {
      captureError(e, { where: 'push.sendTo', status });
    }
  }
}

// ----- ตรวจจับ transition แล้วยิงแจ้งเตือน (เก็บ snapshot ก่อนหน้าไว้ต่อห้อง) -----
interface Memo {
  phase: Phase;
  turn: number;
  seats: Map<string, boolean>; // ชื่อคนจริง → connected (บอทไม่นับ)
}
const memos = new WeakMap<Room, Memo>();

function snapshot(room: Room): Memo {
  const seats = new Map<string, boolean>();
  for (const p of room.players) if (!p.isBot) seats.set(p.name, p.connected);
  return { phase: room.phase, turn: room.turn, seats };
}

// คนจริงที่ยังอยู่ในห้อง (ไว้เลือกเป้าหมายแจ้งเตือน) ยกเว้นชื่อที่ระบุ
function humanNames(room: Room, except?: string): string[] {
  return room.players.filter((p) => !p.isBot && p.name !== except).map((p) => p.name);
}

/**
 * เรียกทุกครั้งหลัง state เปลี่ยน (ใน broadcast) — diff กับ snapshot ก่อนหน้าแล้วยิง push
 * ตามเหตุการณ์: ถึงตาเล่น / เกมเริ่ม / จบเกม / มีคนเข้า-ออกห้อง
 * การแสดงผลจริงตัดสินใจที่ service worker (โฟกัสอยู่ = ไม่เด้ง) — server แค่ยิงหาเป้าหมาย
 */
export function notifyRoom(room: Room): void {
  if (!pushEnabled) return;
  const prev = memos.get(room);
  const cur = snapshot(room);
  memos.set(room, cur);
  if (!prev) return; // snapshot แรก = ตั้งฐาน ยังไม่แจ้งอะไร (กันเด้งตอนโหลด)

  const code = room.code;
  const t = (name: string, make: (x: (typeof TXT)[Lang]) => Payload) =>
    void sendTo(code, name, make);

  // 1) เกมเริ่ม: จากล็อบบี้/จบเกม → เข้าเล่น/แลกไพ่ (รอบใหม่)
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

  // 2) จบเกม
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

  // 3) ถึงตาเล่น (ยิงให้เฉพาะคนที่ถึงตา ถ้าเป็นคนจริงและยังไม่หมดมือ)
  //    ข้ามถ้าเพิ่งแจ้ง "เกมเริ่ม" ไปแล้วในรอบนี้ (กันเด้งซ้อน)
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

  // 4) เข้า/ออกห้อง (เทียบ seats) — แจ้งคนอื่นในห้อง
  for (const [name, connected] of cur.seats) {
    if (!prev.seats.has(name) && connected) {
      // ชื่อใหม่ = เข้าห้อง (ไม่นับ reconnect ที่ชื่อเดิม)
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
    // เคยออนไลน์ แล้วหลุด/หายไป (ล็อบบี้ = ลบที่นั่ง, กลางเกม = connected=false)
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
