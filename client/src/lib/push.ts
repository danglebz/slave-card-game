// push.ts — Web Push ฝั่ง client (subscribe/unsubscribe + re-bind ตอน reconnect)
// ต้องมี VAPID public key จาก server (/push/vapidPublicKey) ถึงจะ subscribe ได้
// หมายเหตุ: SW ลงทะเบียนเฉพาะ PROD (main.tsx) → dev จะใช้ push ไม่ได้ (คืน state 'unavailable')
import { socket } from './socket';
import type { Lang } from './i18n';

const PREF_KEY = 'pushEnabled'; // ผู้ใช้เปิด push ไว้ไหม (ใช้ตัดสินใจ re-subscribe ตอน connect)

export function pushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export type PushState = 'unavailable' | 'denied' | 'off' | 'on';

/** สถานะปุ่ม push: ปิดใช้ไม่ได้ / ถูกบล็อก / ปิดอยู่ / เปิดอยู่ */
export function pushState(): PushState {
  if (!pushSupported()) return 'unavailable';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'granted' && localStorage.getItem(PREF_KEY) === '1') return 'on';
  return 'off';
}

// ----- helper: VAPID public key (base64url → Uint8Array สำหรับ applicationServerKey) -----
let vapidKey: string | null | undefined; // undefined=ยังไม่เช็ก, null=server ปิด push
async function getVapidKey(): Promise<string | null> {
  if (vapidKey !== undefined) return vapidKey;
  try {
    const res = await fetch('/push/vapidPublicKey');
    vapidKey = res.ok ? ((await res.json()).key as string) : null;
  } catch {
    vapidKey = null;
  }
  return vapidKey;
}
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

/** subscription ปัจจุบันของเบราว์เซอร์ (สร้างใหม่ถ้ายังไม่มี) — คืน null ถ้าทำไม่ได้ */
async function ensureSubscription(): Promise<PushSubscription | null> {
  const reg = await getRegistration();
  if (!reg) return null;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  const key = await getVapidKey();
  if (!key) return null;
  try {
    return await reg.pushManager.subscribe({
      userVisibleOnly: true, // จำเป็น (โดยเฉพาะ iOS/Chrome) — ทุก push ต้องโชว์ให้ผู้ใช้เห็น
      applicationServerKey: urlBase64ToUint8Array(key),
    });
  } catch {
    // key เปลี่ยน/subscription เก่าค้าง → ยกเลิกแล้วลองใหม่ครั้งเดียว
    await (await reg.pushManager.getSubscription())?.unsubscribe().catch(() => undefined);
    try {
      return await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
    } catch {
      return null;
    }
  }
}

function sendSub(sub: PushSubscription, lang: Lang): void {
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;
  socket.emit('pushSubscribe', {
    sub: { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
    lang,
  });
}

/**
 * เปิด push: ขอสิทธิ์ (ต้องเรียกจาก user gesture) → subscribe → ส่งให้ server
 * คืน state ผลลัพธ์ ('on' สำเร็จ, 'denied' ถูกบล็อก, 'unavailable' ทำไม่ได้)
 */
export async function enablePush(lang: Lang): Promise<PushState> {
  if (!pushSupported()) return 'unavailable';
  if ((await getVapidKey()) === null) return 'unavailable'; // server ไม่ได้เปิด push
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off';
  const sub = await ensureSubscription();
  if (!sub) return 'unavailable';
  sendSub(sub, lang);
  localStorage.setItem(PREF_KEY, '1');
  return 'on';
}

/** ปิด push: ยกเลิก subscription + แจ้ง server */
export async function disablePush(): Promise<void> {
  localStorage.setItem(PREF_KEY, '0');
  socket.emit('pushUnsubscribe');
  const reg = await getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  await sub?.unsubscribe().catch(() => undefined);
}

/**
 * ผูก subscription เข้ากับที่นั่งในห้องปัจจุบันอีกครั้ง — เรียกตอน connect/join สำเร็จ
 * (server เก็บ sub ตาม code::name; reconnect หรือเข้าห้องใหม่ต้อง re-bind)
 */
export async function syncPushSubscription(lang: Lang): Promise<void> {
  if (pushState() !== 'on') return; // ผู้ใช้ไม่ได้เปิด / ถูกบล็อก → ไม่ทำ
  const sub = await ensureSubscription();
  if (sub) sendSub(sub, lang);
}
