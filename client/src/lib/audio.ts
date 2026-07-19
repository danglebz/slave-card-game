// audio.ts — sound/vibrate (ported from app.js: primeAudio, beep, tone, sfx + sfxPref)
// singleton: one AudioContext for the whole app, unlock autoplay on the first gesture
import { t, initialLang } from './i18n';

let audioCtx: AudioContext | null = null;

export function primeAudio() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    audioCtx = audioCtx || (Ctx ? new Ctx() : null);
    if (audioCtx && audioCtx.state === 'suspended') void audioCtx.resume();
  } catch {
    /* unsupported → stay silent */
  }
}

// iOS Safari: a single one-shot 'click' listener isn't enough — it can suspend the
// AudioContext again after backgrounding, and synthetic clicks aren't always fired for
// every gesture. Keep unlocking on any gesture/visibility change until it's truly running.
if (typeof document !== 'undefined') {
  const unlockEvents = ['click', 'touchend', 'pointerdown', 'keydown'] as const;
  const tryUnlock = () => {
    primeAudio();
    if (audioCtx && audioCtx.state === 'running') {
      unlockEvents.forEach((evt) => document.removeEventListener(evt, tryUnlock));
    }
  };
  unlockEvents.forEach((evt) => document.addEventListener(evt, tryUnlock, { passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) primeAudio();
  });
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
    /* skip */
  }
}

// single note (synthesized live, no audio file to load)
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

// sound effects = personal, split into 3 categories (on by default unless the user turns them off)
export const sfxPref: Record<SfxKey, boolean> = {
  // play card / clear pile
  play: localStorage.getItem('sfx.play') !== '0',
  // bomb
  bomb: localStorage.getItem('sfx.bomb') !== '0',
  // win / lose
  win: localStorage.getItem('sfx.win') !== '0',
};

export function setSfxPref(key: SfxKey, on: boolean) {
  sfxPref[key] = on;
  localStorage.setItem(`sfx.${key}`, on ? '1' : '0');
}

// event-based sound effects (clear pile = play category, lose = win category)
export function sfx(name: SfxName) {
  const cat: SfxKey = name === 'clear' ? 'play' : name === 'lose' ? 'win' : (name as SfxKey);
  if (!sfxPref[cat]) return;
  primeAudio();
  if (!audioCtx) return;
  try {
    switch (name) {
      // play card — short bright click
      case 'play':
        tone(660, 0, 0.09, { type: 'triangle', gain: 0.18 });
        tone(990, 0.04, 0.08, { type: 'triangle', gain: 0.12 });
        break;
      case 'bomb': {
        // bomb — soft low tone but audible on small speakers
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
        // short click transient for rhythm
        tone(520, 0, 0.05, { type: 'triangle', gain: 0.12 });
        break;
      }
      // clear pile — gentle swoosh
      case 'clear':
        tone(420, 0, 0.12, { type: 'sine', gain: 0.12 });
        tone(300, 0.06, 0.14, { type: 'sine', gain: 0.1 });
        break;
      // win — rising arpeggio
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) =>
          tone(f, i * 0.1, 0.18, { type: 'triangle', gain: 0.2 }),
        );
        break;
      // lose — descending notes
      case 'lose':
        [392, 330, 262].forEach((f, i) => tone(f, i * 0.12, 0.2, { type: 'sine', gain: 0.18 }));
        break;
    }
  } catch {
    /* skip */
  }
}

// ---------- your-turn notification: sound/vibrate prefs (migrated from old key 'notif') ----------
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

// ---------- flash the tab title on your turn (when on another tab) ----------
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
