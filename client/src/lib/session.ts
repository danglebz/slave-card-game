// session.ts — auto-rejoin the same room when the socket reconnects / returns to foreground (fixes PWA dropping out of the room)
//
// root cause: "joining" (emit 'join') only happens once on React mount, not tied to socket reconnect
// or returning to foreground → once the PWA is suspended/switched back, the socket reconnects with a new id, but the client never
// re-emits 'join' → server keeps sending state to the old socket id → becomes a "ghost" dropped from the room (Android)
// on iOS, after purge it relaunches from start_url "/" → ?room is lost (room code used to be kept only in the URL) → auto-join doesn't work
//
// this module is pure side-effect (imported once in main.tsx) — kept separate from App.tsx to avoid clashing with other work
// server already claims the seat by "name" (reclaim-by-name) → just re-emit 'join' to get the seat + cards back, no server changes needed
import { socket } from './socket';
import { useStore } from '@/store';

const RKEY = 'room';

// ----- persist the room code durably (used to live only in the URL → lost on iOS relaunch from start_url) -----
// joined successfully → remember the room
socket.on('joined', ({ code }) => localStorage.setItem(RKEY, code));
// intentional leave → forget the room (no more auto-rejoin)
socket.on('left', () => localStorage.removeItem(RKEY));
socket.on('errorMsg', (e) => {
  // room was already deleted (backgrounded past the grace period) → clear stale room state + return to lobby smoothly
  if (e.key !== 'err.roomNotFound') return;
  const failed = String(e.vars?.code ?? '').toUpperCase();
  const st = useStore.getState();
  const current = (st.state?.code || st.roomCode || '').toUpperCase();
  // a stale / cross-room join failed (e.g. tapping a push for a since-deleted room) while we're
  // still validly seated elsewhere → ignore it, and repair any room pointer the tap left behind,
  // instead of yanking us out of the room we're actually in
  if (failed && current && failed !== current) {
    localStorage.setItem(RKEY, current);
    const url = new URL(location.href);
    url.searchParams.set('room', current);
    history.replaceState(null, '', url);
    return;
  }
  // our own room is gone → forget it + return to lobby
  localStorage.removeItem(RKEY);
  const url = new URL(location.href);
  url.searchParams.delete('room');
  history.replaceState(null, '', url);
  st.goLobby();
});

// on load (including iOS relaunch from "/") if the URL has no ?room but one is remembered → put it back in the URL before App's auto-join reads it
// (this module is imported before render → runs before App's useEffect)
(() => {
  const url = new URL(location.href);
  const saved = localStorage.getItem(RKEY);
  if (saved && !url.searchParams.get('room')) {
    url.searchParams.set('room', saved);
    history.replaceState(null, '', url);
  }
})();

// ----- rejoin only when we "really mean to be in a room" (a remembered room + a name) -----
function wanted(): { code: string; name: string; color?: string } | null {
  const code = localStorage.getItem(RKEY);
  const name = localStorage.getItem('name');
  // already left / never joined a room → don't rejoin
  if (!code || !name) return null;
  return { code: code.toUpperCase(), name, color: localStorage.getItem('color') || undefined };
}

let lastJoinAt = 0;
// force = a real (re)connect handed us a NEW socket id → we MUST rejoin; never let the throttle eat it
function rejoin(force = false): void {
  const w = wanted();
  // not connected yet → rejoin later on the 'connect' event
  if (!w || !socket.connected) return;
  // prevent rapid duplicate emits (several events arrive together on a single resume) — but a fresh
  // socket id always needs a join, so a forced rejoin skips the throttle (else we stay a ghost:
  // server keeps talking to the dead socket and our play/pass hit err.notInRoom)
  if (!force && Date.now() - lastJoinAt < 1500) return;
  lastJoinAt = Date.now();
  // server reclaims the old seat by name (idempotent) → sends state back
  socket.emit('join', w);
}

// (a) socket reconnects → rejoin — skip the "first" connect (App's auto-join already handles it, avoids double join)
let firstConnect = true;
socket.on('connect', () => {
  if (firstConnect) {
    firstConnect = false;
    return;
  }
  // a reconnect = a brand-new socket id → force past the throttle so we never end up a ghost
  rejoin(true);
});
socket.io.on('reconnect', () => rejoin(true));

// (b) return to foreground → if the socket dropped, reconnect first, then rejoin follows
function onResume(): void {
  // iOS: guard against a spurious 'visible' (WebKit bug 202399)
  if (document.visibilityState !== 'visible') return;
  // offline → wait for the 'online' event before connecting (avoids stutter)
  if (!navigator.onLine) return;
  if (!socket.connected)
    // socket.io will fire 'connect' → rejoin() follows on its own
    socket.connect();
  // connected but a ghost → rejoin immediately
  else rejoin();
}
document.addEventListener('visibilitychange', onResume);
// covers bfcache restore
window.addEventListener('pageshow', onResume);
window.addEventListener('focus', onResume);
// network is back → connect + rejoin
window.addEventListener('online', onResume);

// (c) tap a push notification → service worker sends { type:'join-room', code } to join that room
// (more reliable than client.navigate() which Android often rejects → it used to just focus the existing page, not join the room)
navigator.serviceWorker?.addEventListener('message', (e) => {
  const d = e.data as { type?: string; code?: string } | null;
  if (!d || d.type !== 'join-room') return;
  const code = String(d.code || '').toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(code)) return;
  // remember this room (in case of rejoin on 'connect')
  localStorage.setItem(RKEY, code);
  const url = new URL(location.href);
  if (url.searchParams.get('room') !== code) {
    url.searchParams.set('room', code);
    history.replaceState(null, '', url);
  }
  if (!socket.connected) {
    // 'connect' → rejoin() reads room+name from localStorage itself
    socket.connect();
  } else {
    // this is an intentional tap → skip rejoin's throttle
    lastJoinAt = 0;
    rejoin();
  }
});
