// audio.ts — เสียง/สั่น (port จาก app.js: primeAudio, beep, tone, sfx + sfxPref)
// singleton: AudioContext เดียวทั้งแอป, ปลดล็อก autoplay ด้วย gesture แรก
import { t, initialLang } from './i18n';

let audioCtx: AudioContext | null = null;

export function primeAudio() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    audioCtx = audioCtx || (Ctx ? new Ctx() : null);
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  } catch {
    /* ไม่รองรับ → เงียบ */
  }
}

// ปลดล็อก autoplay ด้วย gesture แรก (เรียกครั้งเดียวตอน import)
if (typeof document !== 'undefined') {
  document.addEventListener('click', primeAudio, { once: true });
}

export function beep() {
  if (!audioCtx) return;
  try {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    o.connect(g);
    g.connect(audioCtx.destination);
    const t = audioCtx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.start(t);
    o.stop(t + 0.3);
  } catch {
    /* ข้าม */
  }
}

// โน้ตเดี่ยว (สังเคราะห์สด ไม่ต้องโหลดไฟล์เสียง)
function tone(
  freq: number,
  delay: number,
  dur: number,
  { type = 'sine', gain = 0.2 }: { type?: OscillatorType; gain?: number } = {},
) {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.value = freq;
  o.connect(g);
  g.connect(audioCtx.destination);
  const t = audioCtx.currentTime + delay;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export type SfxKey = 'play' | 'bomb' | 'win';
export type SfxName = 'play' | 'bomb' | 'clear' | 'win' | 'lose';

// เสียงเอฟเฟกต์ = ส่วนตัว แยก 3 หมวด (เปิดเป็นค่าเริ่มต้น เว้นผู้ใช้ปิดเอง)
export const sfxPref: Record<SfxKey, boolean> = {
  play: localStorage.getItem('sfx.play') !== '0', // ลงไพ่ / เคลียร์กอง
  bomb: localStorage.getItem('sfx.bomb') !== '0', // บอมบ์
  win: localStorage.getItem('sfx.win') !== '0', // ชนะ / แพ้
};

export function setSfxPref(key: SfxKey, on: boolean) {
  sfxPref[key] = on;
  localStorage.setItem(`sfx.${key}`, on ? '1' : '0');
}

// เสียงเอฟเฟกต์ตามเหตุการณ์ (เคลียร์กอง=หมวดลงไพ่, แพ้=หมวดชนะ)
export function sfx(name: SfxName) {
  const cat: SfxKey = name === 'clear' ? 'play' : name === 'lose' ? 'win' : (name as SfxKey);
  if (!sfxPref[cat]) return;
  primeAudio();
  if (!audioCtx) return;
  try {
    switch (name) {
      case 'play': // ลงไพ่ — คลิกสั้นๆ สดใส
        tone(660, 0, 0.09, { type: 'triangle', gain: 0.18 });
        tone(990, 0.04, 0.08, { type: 'triangle', gain: 0.12 });
        break;
      case 'bomb': {
        // บอมบ์ — ทุ้มนุ่มแต่ได้ยินบนลำโพงเล็ก
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'triangle';
        const t = audioCtx.currentTime;
        o.frequency.setValueAtTime(300, t);
        o.frequency.exponentialRampToValueAtTime(110, t + 0.25);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start(t);
        o.stop(t + 0.38);
        tone(520, 0, 0.05, { type: 'triangle', gain: 0.12 }); // หัวเสียงคลิกสั้นๆ ให้มีจังหวะ
        break;
      }
      case 'clear': // เคลียร์กอง — สวูชเบาๆ
        tone(420, 0, 0.12, { type: 'sine', gain: 0.12 });
        tone(300, 0.06, 0.14, { type: 'sine', gain: 0.1 });
        break;
      case 'win': // ชนะ — อาร์เพจจิโอขึ้น
        [523, 659, 784, 1047].forEach((f, i) =>
          tone(f, i * 0.1, 0.18, { type: 'triangle', gain: 0.2 }),
        );
        break;
      case 'lose': // แพ้ — โน้ตลง
        [392, 330, 262].forEach((f, i) => tone(f, i * 0.12, 0.2, { type: 'sine', gain: 0.18 }));
        break;
    }
  } catch {
    /* ข้าม */
  }
}

// ---------- แจ้งเตือนถึงตา: prefs เสียง/สั่น (migrate จากคีย์เดิม 'notif') ----------
const _oldNotif = localStorage.getItem('notif');
export const notifPref = {
  sound: (localStorage.getItem('notifSound') ?? _oldNotif) === '1',
  vibrate: (localStorage.getItem('notifVibrate') ?? _oldNotif) === '1',
};
export function setNotifSound(on: boolean) {
  notifPref.sound = on;
  localStorage.setItem('notifSound', on ? '1' : '0');
}
export function setNotifVibrate(on: boolean) {
  notifPref.vibrate = on;
  localStorage.setItem('notifVibrate', on ? '1' : '0');
}

// ---------- แฟลช title ของแท็บเมื่อถึงตา (อยู่แท็บอื่น) ----------
const baseTitle = typeof document !== 'undefined' ? document.title : '';
let titleFlash: ReturnType<typeof setInterval> | null = null;
export function flashTitle() {
  if (titleFlash) return;
  let on = false;
  titleFlash = setInterval(() => {
    on = !on;
    document.title = on ? t(initialLang(), 'tab.yourTurn') : baseTitle;
  }, 800);
}
export function stopFlash() {
  if (titleFlash) clearInterval(titleFlash);
  titleFlash = null;
  document.title = baseTitle;
}
if (typeof window !== 'undefined') {
  window.addEventListener('focus', stopFlash);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) stopFlash();
  });
}
