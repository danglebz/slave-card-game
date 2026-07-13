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
  Coffee,
  Star,
  Share2,
  Bug,
  ChevronDown,
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
  coffee: Coffee,
  star: Star,
  'share-2': Share2,
  bug: Bug,
  'chevron-down': ChevronDown,
};

/** GitHub's mark — not in lucide (it's a brand logo), so it lives here as raw SVG for both the lobby and the support section */
export function GithubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      fill="currentColor"
      className={className}
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

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
