// Table.tsx — โต๊ะ 3×3: 8 ที่นั่งล้อมรอบ + กองไพ่กลาง (port renderPlayers/seatFor layout)
import type { RoomState } from '@shared/types';
import { PlayerChip } from './Seat';
import { Pile } from './Pile';
import { Icon } from '@/lib/icons';

const SEAT_IDS = [
  'seat-tl',
  'seat-top',
  'seat-tr',
  'seat-left',
  'seat-right',
  'seat-bl',
  'seat-bottom',
  'seat-br',
] as const;

// ที่นั่งบนตาราง 3×3 ตามตำแหน่งสัมพัทธ์จาก "คุณ" (rel 0 = คุณ) — รองรับ 2–6 คน
const SEAT_LAYOUTS: Record<number, string[]> = {
  2: ['seat-bottom', 'seat-top'],
  3: ['seat-bottom', 'seat-tr', 'seat-tl'],
  4: ['seat-bl', 'seat-br', 'seat-tr', 'seat-tl'],
  5: ['seat-bottom', 'seat-br', 'seat-tr', 'seat-tl', 'seat-bl'],
  6: ['seat-bottom', 'seat-br', 'seat-tr', 'seat-top', 'seat-tl', 'seat-bl'],
};

function seatFor(rel: number, n: number): string {
  const layout = SEAT_LAYOUTS[n] || SEAT_LAYOUTS[6];
  return layout[rel] || 'seat-top';
}

export function Table({ s }: { s: RoomState }) {
  // map seat-id → ผู้เล่นที่นั่งช่องนั้น
  const occupant: Record<string, (typeof s.players)[number]> = {};
  const n = s.players.length;
  const you = s.youIndex >= 0 ? s.youIndex : 0;
  s.players.forEach((p, i) => {
    const rel = (((i - you) % n) + n) % n; // 0 = คุณ, ไล่ตามลำดับรอบโต๊ะ
    occupant[seatFor(rel, n)] = p;
  });

  const seat = (id: string) => (
    <div className="seat" id={id} key={id}>
      {occupant[id] && <PlayerChip p={occupant[id]} s={s} />}
    </div>
  );

  return (
    <div id="table">
      <div id="dir-indicator">
        {/* ลายน้ำทิศทาง (หลังไพ่) — โชว์เฉพาะตอนเล่น */}
        {s.phase === 'playing' && <Icon name={s.dir === -1 ? 'rotate-ccw' : 'rotate-cw'} />}
      </div>
      {seat('seat-tl')}
      {seat('seat-top')}
      {seat('seat-tr')}
      {seat('seat-left')}
      <Pile s={s} />
      {seat('seat-right')}
      {seat('seat-bl')}
      {seat('seat-bottom')}
      {seat('seat-br')}
    </div>
  );
}

export { SEAT_IDS };
