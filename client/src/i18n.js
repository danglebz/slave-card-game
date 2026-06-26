// i18n.js — สลับภาษา TH/EN สำหรับ UI หลัก (lobby / settings / ปุ่ม / banner)
// หมายเหตุ: กติกาแบบเต็ม + ข้อความเกมจาก server ยังเป็นภาษาไทย (ขยายต่อได้)

const DICT = {
  th: {
    'lobby.sub': 'เกมเดียวที่หัวหน้ายอมเป็นสลาฟ',
    'lobby.name': 'ใส่ชื่อของคุณ',
    'lobby.create': 'สร้างห้องใหม่',
    'lobby.or': 'หรือเข้าห้องที่มีอยู่',
    'lobby.code': 'รหัสห้อง',
    'lobby.join': 'เข้าห้อง',
    'lobby.rules': 'กติกา / วิธีเล่น',
    'game.play': 'ลงไพ่',
    'game.pass': 'ผ่าน',
    'game.give': 'ส่งไพ่แลก',
    'game.start': 'เริ่มเกม',
    'game.again': 'เล่นรอบใหม่',
    'game.addBot': 'เพิ่มบอท',
    'game.removeBot': 'ลบบอท',
    'game.shuffle': 'สลับที่นั่ง',
    'game.sortRank': 'เรียงตามเลข',
    'game.sortBomb': 'ดันบอมไปขวา',
    'game.waitMore': 'รออีกอย่างน้อย 2 คน',
    'turn.yours': 'ตาคุณแล้ว!',
    'turn.other': 'ตาของ {name}',
    'set.title': 'ตั้งค่า',
    'set.room': 'ทั้งห้อง',
    'set.hostTag': 'หัวห้องปรับได้',
    'set.timer': 'จับเวลาต่อตา',
    'set.autopass': 'ผ่านอัตโนมัติเมื่อหมดเวลา',
    'set.turnsec': 'เวลาต่อตา',
    'set.personal': 'ส่วนตัว',
    'set.color': 'สีประจำตัว',
    'set.theme': 'ธีมสว่าง',
    'set.notif': 'แจ้งเตือนเมื่อถึงตา',
    'set.notifSub': '(เสียง / สั่น)',
    'set.sfx': 'เสียงเอฟเฟกต์',
    'set.sfxPlay': 'ลงไพ่ / เคลียร์กอง',
    'set.sfxBomb': 'บอมบ์',
    'set.sfxWin': 'ชนะ / แพ้',
    'set.lang': 'ภาษา',
    'set.chat': 'แชท',
    'set.soon': 'เร็วๆ นี้',
    'set.logout': 'ออกจากห้อง',
    'banner.spectator': 'คุณกำลังดูอยู่ — จะได้เข้าเล่นรอบถัดไป',
    'banner.conn': 'การเชื่อมต่อหลุด — กำลังเชื่อมต่อใหม่…',
    'result.title': 'จบรอบ!',
    'dialog.close': 'ปิด',
  },
  en: {
    'lobby.sub': 'The only game where the boss becomes a slave',
    'lobby.name': 'Enter your name',
    'lobby.create': 'Create room',
    'lobby.or': 'or join an existing room',
    'lobby.code': 'Room code',
    'lobby.join': 'Join',
    'lobby.rules': 'Rules / How to play',
    'game.play': 'Play',
    'game.pass': 'Pass',
    'game.give': 'Give cards',
    'game.start': 'Start game',
    'game.again': 'Play again',
    'game.addBot': 'Add bot',
    'game.removeBot': 'Remove bot',
    'game.shuffle': 'Shuffle seats',
    'game.sortRank': 'Sort by rank',
    'game.sortBomb': 'Bombs to the right',
    'game.waitMore': 'Need at least 2 players',
    'turn.yours': 'Your turn!',
    'turn.other': "{name}'s turn",
    'set.title': 'Settings',
    'set.room': 'Room',
    'set.hostTag': 'Host only',
    'set.timer': 'Turn timer',
    'set.autopass': 'Auto-pass on timeout',
    'set.turnsec': 'Time per turn',
    'set.personal': 'Personal',
    'set.color': 'Your color',
    'set.theme': 'Light theme',
    'set.notif': 'Notify on your turn',
    'set.notifSub': '(sound / vibrate)',
    'set.sfx': 'Sound effects',
    'set.sfxPlay': 'Play / clear pile',
    'set.sfxBomb': 'Bomb',
    'set.sfxWin': 'Win / lose',
    'set.lang': 'Language',
    'set.chat': 'Chat',
    'set.soon': 'soon',
    'set.logout': 'Leave room',
    'banner.spectator': "You're spectating — you'll join next round",
    'banner.conn': 'Connection lost — reconnecting…',
    'result.title': 'Round over!',
    'dialog.close': 'Close',
  },
};

let lang = localStorage.getItem('lang') === 'en' ? 'en' : 'th';

export function getLang() { return lang; }

// แปลคีย์ + แทนค่าตัวแปร {name}
export function t(key, vars) {
  let s = (DICT[lang] && DICT[lang][key]) ?? (DICT.th[key] ?? key);
  if (vars) for (const k of Object.keys(vars)) s = s.replace(`{${k}}`, vars[k]);
  return s;
}

// ใส่ข้อความตาม data-i18n / data-i18n-ph / data-i18n-title ทั้งหน้า
export function applyI18n() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
}

export function setLang(next) {
  lang = next === 'en' ? 'en' : 'th';
  localStorage.setItem('lang', lang);
  applyI18n();
}
