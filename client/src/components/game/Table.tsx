// Table.tsx — โต๊ะ 3×3: 8 ที่นั่งล้อมรอบ + กองไพ่กลาง (port renderPlayers/seatFor layout)
import type { RoomState } from '@shared/types';
import { PlayerChip } from './Seat';
import { Pile } from './Pile';
import { Icon } from '@/lib/icons';
import { seatFor } from '@/lib/gameLogic';

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

export function Table({ s }: { s: RoomState }) {
  // map seat-id → ผู้เล่นที่นั่งช่องนั้น
  const occupant: Record<string, (typeof s.players)[number]> = {};
  const n = s.players.length;
  const you = s.youIndex >= 0 ? s.youIndex : 0;
  s.players.forEach((p, i) => {
    const rel = (((i - you) % n) + n) % n; // 0 = คุณ, ไล่ตามลำดับรอบโต๊ะ
    occupant[seatFor(rel, n)] = p;
  });

  // วงกลมบอกทิศ (rotate icon) รอบไพ่ — ผังที่นั่งวน rel เพิ่ม = ทวนเข็ม → dir=+1 = ทวนเข็ม
  //   ทวนเข็ม (ccw): วงลอด "หลังไพ่" (z-index ใต้กองไพ่)
  //   ตามเข็ม (cw):  วงมา "หน้าไพ่" (z-index ทับบนกองไพ่)
  const ccw = s.dir === 1;

  const seat = (id: string) => (
    <div className="seat" id={id} key={id}>
      {occupant[id] && <PlayerChip p={occupant[id]} s={s} />}
    </div>
  );

  return (
    <div id="table">
      {s.phase === 'playing' && (
        <div className={'dir-ring ' + (ccw ? 'behind' : 'front')} aria-hidden="true">
          <Icon name={ccw ? 'rotate-ccw' : 'rotate-cw'} />
        </div>
      )}
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
