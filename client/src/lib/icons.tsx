// icons.tsx — ไอคอน Lucide ส่วนกลางของเกม (port จาก icons.js → lucide-react)
// แทนที่ emoji เดิมทั้งหมดด้วย <svg> ของ Lucide (inherit สีจาก currentColor)
import {
  DoorOpen,
  BookOpen,
  Layers,
  Target,
  Bomb,
  RefreshCw,
  Play,
  Crown,
  Link,
  PartyPopper,
  Medal,
  Award,
  Smile,
  Trophy,
  Skull,
  CircleCheck,
  Gift,
  Hourglass,
  CircleDot,
  ListOrdered,
  WifiOff,
  RotateCcw,
  RotateCw,
  Check,
  X,
  CircleAlert,
  User,
  Plus,
  Hash,
  LogIn,
  LogOut,
  SkipForward,
  LoaderCircle,
  Copy,
  Settings,
  Timer,
  Bell,
  MessageCircle,
  Users,
  QrCode,
  Volume2,
  Clock,
  Bot,
  BotOff,
  Eye,
  Shuffle,
  Download,
  Palette,
  Languages,
  Vibrate,
  Frown,
  Meh,
  ArrowUp,
  ArrowDown,
  type LucideProps,
} from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';

// ชื่อไอคอน (kebab-case) → คอมโพเนนต์ lucide-react
const ICONS: Record<string, ComponentType<LucideProps>> = {
  'door-open': DoorOpen,
  'book-open': BookOpen,
  layers: Layers,
  target: Target,
  bomb: Bomb,
  'refresh-cw': RefreshCw,
  play: Play,
  crown: Crown,
  link: Link,
  'party-popper': PartyPopper,
  medal: Medal,
  award: Award,
  smile: Smile,
  trophy: Trophy,
  skull: Skull,
  'circle-check': CircleCheck,
  gift: Gift,
  hourglass: Hourglass,
  'circle-dot': CircleDot,
  'list-ordered': ListOrdered,
  'wifi-off': WifiOff,
  'rotate-ccw': RotateCcw,
  'rotate-cw': RotateCw,
  'arrow-up': ArrowUp,
  'arrow-down': ArrowDown,
  check: Check,
  x: X,
  'circle-alert': CircleAlert,
  user: User,
  plus: Plus,
  hash: Hash,
  'log-in': LogIn,
  'log-out': LogOut,
  'skip-forward': SkipForward,
  'loader-circle': LoaderCircle,
  copy: Copy,
  settings: Settings,
  timer: Timer,
  bell: Bell,
  'message-circle': MessageCircle,
  users: Users,
  'qr-code': QrCode,
  'volume-2': Volume2,
  clock: Clock,
  bot: Bot,
  'bot-off': BotOff,
  eye: Eye,
  shuffle: Shuffle,
  download: Download,
  palette: Palette,
  languages: Languages,
  vibrate: Vibrate,
  frown: Frown,
  meh: Meh,
};

// emoji → ชื่อไอคอน lucide (kebab-case) สำหรับข้อความที่ฝั่ง server ส่งมา
const EMOJI_ICON: Record<string, string> = {
  '🚪': 'door-open',
  '📖': 'book-open',
  '🎴': 'layers',
  '🎯': 'target',
  '💣': 'bomb',
  '🔄': 'refresh-cw',
  '▶️': 'play',
  '▶': 'play',
  '👑': 'crown',
  '⛓️': 'link',
  '⛓': 'link',
  '🎉': 'party-popper',
  '🥇': 'crown',
  '🥈': 'medal',
  '🥉': 'meh',
  '🙂': 'smile',
  '😩': 'frown',
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

/** ไอคอนเดี่ยวตามชื่อ (kebab-case) — แทน icon(name, cls) เดิม */
export function Icon({ name, className }: { name: string; className?: string }) {
  const C = ICONS[name];
  if (!C) return null;
  return <C className={className} />;
}

// เรียง emoji ยาว→สั้น เพื่อให้ตัวที่มี variation-selector (เช่น '⛓️') ถูกแมตช์ก่อน
const EMOJI_RE = new RegExp(
  Object.keys(EMOJI_ICON)
    .sort((a, b) => b.length - a.length)
    .map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|'),
  'g',
);

/**
 * แปลง emoji ที่รู้จักในสตริงให้กลายเป็น <Icon/> (ใช้กับ "ยศ"/ข้อความแจ้งเตือนจาก server)
 * คืน array ของ ReactNode (ข้อความ + ไอคอน) — ใช้ใน JSX ได้เลย
 */
export function iconize(text: string): ReactNode[] {
  const str = String(text);
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  EMOJI_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EMOJI_RE.exec(str)) !== null) {
    if (m.index > last) out.push(str.slice(last, m.index));
    out.push(<Icon key={`i${key++}`} name={EMOJI_ICON[m[0]]} />);
    last = m.index + m[0].length;
  }
  if (last < str.length) out.push(str.slice(last));
  return out;
}
