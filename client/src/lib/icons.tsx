// icons.tsx — the game's central Lucide icons (ported from icons.js → lucide-react)
// replaces all the old emoji with Lucide <svg> (inherits color from currentColor)
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
  UserX,
  Shield,
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
  BarChart3,
  type LucideProps,
} from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';

// icon name (kebab-case) → lucide-react component
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
  'user-x': UserX,
  shield: Shield,
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
  'bar-chart': BarChart3,
};

// emoji → lucide icon name (kebab-case) for messages sent from the server
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
  '🥇': 'trophy',
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

/** single icon by name (kebab-case) — replaces the old icon(name, cls) */
export function Icon({ name, className }: { name: string; className?: string }) {
  const C = ICONS[name];
  if (!C) return null;
  return <C className={className} />;
}

// sort emoji long→short so ones with a variation-selector (e.g. '⛓️') match first
const EMOJI_RE = new RegExp(
  Object.keys(EMOJI_ICON)
    .sort((a, b) => b.length - a.length)
    .map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|'),
  'g',
);

/**
 * convert known emoji in a string into <Icon/> (used for rank/notification messages from the server)
 * returns an array of ReactNode (text + icons) — usable directly in JSX
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
