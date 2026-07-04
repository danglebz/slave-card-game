// push.ts — client-side Web Push (subscribe/unsubscribe + re-bind on reconnect)
// needs the VAPID public key from the server (/push/vapidPublicKey) before it can subscribe
// note: SW is only registered in PROD (main.tsx) → push won't work in dev (returns state 'unavailable')
import { socket } from './socket';
import type { Lang } from './i18n';

// did the user enable push? (used to decide whether to re-subscribe on connect)
const PREF_KEY = 'pushEnabled';

export function pushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export type PushState = 'unavailable' | 'denied' | 'off' | 'on';

/** push button state: unavailable / blocked / off / on */
export function pushState(): PushState {
  if (!pushSupported()) return 'unavailable';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'granted' && localStorage.getItem(PREF_KEY) === '1') return 'on';
  return 'off';
}

// ----- helper: VAPID public key (base64url → Uint8Array for applicationServerKey) -----
// undefined=not checked yet, null=server has push off
let vapidKey: string | null | undefined;
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

/** the browser's current subscription (create a new one if none) — returns null if not possible */
async function ensureSubscription(): Promise<PushSubscription | null> {
  const reg = await getRegistration();
  if (!reg) return null;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  const key = await getVapidKey();
  if (!key) return null;
  try {
    return await reg.pushManager.subscribe({
      // required (especially iOS/Chrome) — every push must be shown to the user
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
  } catch {
    // key changed / stale old subscription → unsubscribe and retry once
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
 * enable push: request permission (must be called from a user gesture) → subscribe → send to server
 * returns the resulting state ('on' success, 'denied' blocked, 'unavailable' not possible)
 */
export async function enablePush(lang: Lang): Promise<PushState> {
  if (!pushSupported()) return 'unavailable';
  // server doesn't have push enabled
  if ((await getVapidKey()) === null) return 'unavailable';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off';
  const sub = await ensureSubscription();
  if (!sub) return 'unavailable';
  sendSub(sub, lang);
  localStorage.setItem(PREF_KEY, '1');
  return 'on';
}

/** disable push: cancel the subscription + notify the server */
export async function disablePush(): Promise<void> {
  localStorage.setItem(PREF_KEY, '0');
  socket.emit('pushUnsubscribe');
  const reg = await getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  await sub?.unsubscribe().catch(() => undefined);
}

/**
 * re-bind the subscription to the seat in the current room — called on a successful connect/join
 * (server stores the sub by code::name; reconnect or joining a new room needs a re-bind)
 */
export async function syncPushSubscription(lang: Lang): Promise<void> {
  // user hasn't enabled it / blocked → do nothing
  if (pushState() !== 'on') return;
  const sub = await ensureSubscription();
  if (sub) sendSub(sub, lang);
}
