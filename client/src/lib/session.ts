// session.ts — auto-rejoin ห้องเดิมเมื่อ socket ต่อใหม่ / กลับมา foreground (แก้บั๊ก PWA หลุดห้อง)
//
// รากปัญหา: การ "เข้าห้อง" (emit 'join') ทำแค่ตอน React mount ครั้งเดียว ไม่ได้ผูกกับ socket reconnect
// หรือการกลับมา foreground → พอ PWA ถูกพัก/สลับแอปกลับมา socket ต่อใหม่ด้วย id ใหม่ แต่ client ไม่เคย
// re-emit 'join' → server ยังยิง state ไป socket id เก่า → กลายเป็น "ผี" หลุดห้อง (Android)
// ส่วน iOS purge แล้ว relaunch จาก start_url "/" → ?room หาย (เดิมเก็บรหัสห้องแค่ใน URL) → auto-join ไม่ทำงาน
//
// โมดูลนี้เป็น side-effect ล้วน (import ครั้งเดียวใน main.tsx) — แยกจาก App.tsx เพื่อไม่ชนงานอื่น
// server ยึดที่นั่งด้วย "ชื่อ" อยู่แล้ว (reclaim-by-name) → แค่ re-emit 'join' ก็ได้ที่นั่ง+ไพ่คืน ไม่ต้องแก้ server
import { socket } from './socket';
import { useStore } from '@/store';

const RKEY = 'room';

// ----- จำรหัสห้องแบบทนทาน (เดิมอยู่แค่ใน URL → หายตอน iOS relaunch จาก start_url) -----
socket.on('joined', ({ code }) => localStorage.setItem(RKEY, code)); // เข้าห้องสำเร็จ → จำห้องไว้
socket.on('left', () => localStorage.removeItem(RKEY)); // ตั้งใจกดออกเอง → ลืมห้อง (ไม่ auto-rejoin อีก)
socket.on('errorMsg', (e) => {
  // ห้องถูกลบไปแล้ว (background นานเกิน grace) → ล้างสถานะห้องค้าง + กลับล็อบบี้ให้เนียน
  if (e.key !== 'err.roomNotFound') return;
  localStorage.removeItem(RKEY);
  const url = new URL(location.href);
  url.searchParams.delete('room');
  history.replaceState(null, '', url);
  useStore.getState().goLobby();
});

// ตอนโหลด (รวม iOS relaunch จาก "/") ถ้า URL ไม่มี ?room แต่จำไว้ → เติมกลับเข้า URL ก่อน App auto-join จะอ่าน
// (โมดูลนี้ถูก import ก่อน render → รันก่อน useEffect ของ App)
(() => {
  const url = new URL(location.href);
  const saved = localStorage.getItem(RKEY);
  if (saved && !url.searchParams.get('room')) {
    url.searchParams.set('room', saved);
    history.replaceState(null, '', url);
  }
})();

// ----- rejoin เฉพาะเมื่อ "ตั้งใจอยู่ในห้อง" จริง (มีห้องที่จำไว้ + มีชื่อ) -----
function wanted(): { code: string; name: string; color?: string } | null {
  const code = localStorage.getItem(RKEY);
  const name = localStorage.getItem('name');
  if (!code || !name) return null; // กดออกไปแล้ว/ไม่เคยเข้าห้อง → ไม่ rejoin
  return { code: code.toUpperCase(), name, color: localStorage.getItem('color') || undefined };
}

let lastJoinAt = 0;
function rejoin(): void {
  const w = wanted();
  if (!w || !socket.connected) return; // ยังไม่ต่อ → ค่อย rejoin ตอน event 'connect'
  if (Date.now() - lastJoinAt < 1500) return; // กันยิงซ้ำถี่ (หลาย event มาพร้อมกันตอน resume เดียว)
  lastJoinAt = Date.now();
  socket.emit('join', w); // server ยึดที่นั่งเดิมด้วยชื่อ (idempotent) → ส่ง state คืน
}

// (a) socket ต่อกลับได้ (reconnect) → rejoin — ข้าม connect "ครั้งแรก" (App auto-join จัดการแล้ว กัน join ซ้ำ)
let firstConnect = true;
socket.on('connect', () => {
  if (firstConnect) {
    firstConnect = false;
    return;
  }
  rejoin();
});
socket.io.on('reconnect', () => rejoin());

// (b) กลับมา foreground → ถ้า socket หลุดให้ต่อใหม่ก่อน แล้ว rejoin ตามมา
function onResume(): void {
  if (document.visibilityState !== 'visible') return; // iOS: กัน 'visible' หลอก (WebKit bug 202399)
  if (!navigator.onLine) return; // ออฟไลน์อยู่ → รอ event 'online' ค่อยต่อ (กันกระตุก)
  if (!socket.connected)
    socket.connect(); // socket.io จะยิง 'connect' → rejoin() ตามมาเอง
  else rejoin(); // ต่ออยู่แต่เป็นผี → rejoin เลย
}
document.addEventListener('visibilitychange', onResume);
window.addEventListener('pageshow', onResume); // ครอบ bfcache restore
window.addEventListener('focus', onResume);
window.addEventListener('online', onResume); // เน็ตกลับมา → ต่อ + rejoin

// (c) แตะ push notification → service worker ส่ง { type:'join-room', code } มาให้เข้าห้องนั้น
// (เชื่อถือกว่า client.navigate() ที่ Android มัก reject → เดิมได้แค่ focus หน้าเดิม ไม่เข้าห้อง)
navigator.serviceWorker?.addEventListener('message', (e) => {
  const d = e.data as { type?: string; code?: string } | null;
  if (!d || d.type !== 'join-room') return;
  const code = String(d.code || '').toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(code)) return;
  localStorage.setItem(RKEY, code); // จำห้องนี้ (เผื่อ rejoin ตอน 'connect')
  const url = new URL(location.href);
  if (url.searchParams.get('room') !== code) {
    url.searchParams.set('room', code);
    history.replaceState(null, '', url);
  }
  if (!socket.connected) {
    socket.connect(); // 'connect' → rejoin() อ่าน room+name จาก localStorage เอง
  } else {
    lastJoinAt = 0; // เป็นการกดตั้งใจ → ข้าม throttle ของ rejoin
    rejoin();
  }
});
