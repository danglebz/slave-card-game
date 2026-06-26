// icons.js — ไอคอน Lucide ส่วนกลางของเกม
// แทนที่ emoji เดิมทั้งหมดด้วย SVG ของ Lucide (inherit สีจาก currentColor)
import {
  createIcons,
  DoorOpen, BookOpen, Layers, Target, Bomb, RefreshCw, Play, Crown, Link,
  PartyPopper, Medal, Award, Smile, Trophy, Skull, CircleCheck, Gift, Hourglass,
  CircleDot, ListOrdered, WifiOff, RotateCcw, RotateCw, Check, X, CircleAlert,
  User, Plus, Hash, LogIn, SkipForward, LoaderCircle, Copy,
  Settings, Timer, Bell, MessageCircle, Users, QrCode, Volume2, Clock, Bot, BotOff, Eye,
} from 'lucide';

// ชุดไอคอนที่ใช้จริง (ให้ createIcons รู้จัก — tree-shake เฉพาะที่ import)
const ICON_SET = {
  DoorOpen, BookOpen, Layers, Target, Bomb, RefreshCw, Play, Crown, Link,
  PartyPopper, Medal, Award, Smile, Trophy, Skull, CircleCheck, Gift, Hourglass,
  CircleDot, ListOrdered, WifiOff, RotateCcw, RotateCw, Check, X, CircleAlert,
  User, Plus, Hash, LogIn, SkipForward, LoaderCircle, Copy,
  Settings, Timer, Bell, MessageCircle, Users, QrCode, Volume2, Clock, Bot, BotOff, Eye,
};

// emoji → ชื่อไอคอน lucide (kebab-case) สำหรับข้อความที่ฝั่ง server ส่งมา
const EMOJI_ICON = {
  '🚪': 'door-open',
  '📖': 'book-open',
  '🎴': 'layers',
  '🎯': 'target',
  '💣': 'bomb',
  '🔄': 'refresh-cw',
  '▶️': 'play', '▶': 'play',
  '👑': 'crown',
  '⛓️': 'link', '⛓': 'link',
  '🎉': 'party-popper',
  '🥇': 'crown',
  '🥈': 'medal',
  '🥉': 'award',
  '🙂': 'smile',
  '🏆': 'trophy',
  '💀': 'skull',
  '✅': 'circle-check',
  '✓': 'check',
  '🎁': 'gift',
  '⏳': 'hourglass',
  '🟢': 'circle-dot',
  '🔢': 'list-ordered',
  '📴': 'wifi-off',
  '↺': 'rotate-ccw',
  '↻': 'rotate-cw',
};

// markup ไอคอนเดี่ยว — createIcons() จะแปลง <i data-lucide> นี้เป็น <svg> ภายหลัง
export function icon(name, cls = '') {
  return `<i data-lucide="${name}"${cls ? ` class="${cls}"` : ''}></i>`;
}

// เรียง emoji ยาว→สั้น เพื่อให้ตัวที่มี variation-selector (เช่น '⛓️') ถูกแมตช์ก่อน
const EMOJI_RE = new RegExp(
  Object.keys(EMOJI_ICON)
    .sort((a, b) => b.length - a.length)
    .map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|'),
  'g',
);

// แปลง emoji ที่รู้จักในสตริงให้กลายเป็นไอคอน (ใช้กับ "ยศ" / ข้อความแจ้งเตือนจาก server)
export function iconize(text) {
  return String(text).replace(EMOJI_RE, (m) => icon(EMOJI_ICON[m]));
}

// แปลง <i data-lucide> ที่อยู่ใน DOM ทั้งหมดให้เป็น <svg> — เรียกหลัง render ทุกครั้ง
export function refreshIcons() {
  createIcons({ icons: ICON_SET });
}
