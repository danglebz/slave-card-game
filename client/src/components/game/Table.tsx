// Table.tsx — โต๊ะ 3×3: 8 ที่นั่งล้อมรอบ + กองไพ่กลาง (port renderPlayers/seatFor layout)
import type { ReactNode } from 'react';
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

  // ลูกศรทิศทางในช่องกลางซ้าย(4)/ขวา(6) ของตาราง 3×3 — โชว์เฉพาะตอนเล่น
  // ผังที่นั่งวน rel เพิ่ม = ทวนเข็ม ดังนั้น dir=+1 = ทวนเข็ม:
  //   ฝั่งขวา flow ขึ้น (br→tr) = arrow-up ; ฝั่งซ้าย flow ลง (tl→bl) = arrow-down
  //   dir=-1 (ตามเข็ม) สลับด้าน
  const ccw = s.dir === 1;
  const dirArrow = (side: 'left' | 'right'): ReactNode => {
    if (s.phase !== 'playing') return null;
    const up = side === 'right' ? ccw : !ccw;
    return <Icon name={up ? 'arrow-up' : 'arrow-down'} className="dir-arrow" />;
  };

  const seat = (id: string) => {
    const occ = occupant[id];
    const side = id === 'seat-left' ? 'left' : id === 'seat-right' ? 'right' : null;
    return (
      <div className="seat" id={id} key={id}>
        {occ ? <PlayerChip p={occ} s={s} /> : side ? dirArrow(side) : null}
      </div>
    );
  };

  return (
    <div id="table">
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
