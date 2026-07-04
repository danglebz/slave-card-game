// Table.tsx — 3×3 table: 8 seats around the edge + center pile (port renderPlayers/seatFor layout)
import type { RoomState } from '@shared/types';
import { PlayerChip } from './Seat';
import { Pile } from './Pile';
import { Icon } from '@/lib/icons';
import { seatFor } from '@/lib/gameLogic';

const SEAT_IDS = ['seat-tl', 'seat-top', 'seat-tr', 'seat-bl', 'seat-bottom', 'seat-br'] as const;

export function Table({ s }: { s: RoomState }) {
  // map seat-id → the player sitting in that slot
  const occupant: Record<string, (typeof s.players)[number]> = {};
  const n = s.players.length;
  const you = s.youIndex >= 0 ? s.youIndex : 0;
  s.players.forEach((p, i) => {
    // 0 = you, then in order around the table
    const rel = (((i - you) % n) + n) % n;
    occupant[seatFor(rel, n)] = p;
  });

  // direction ring (rotate icon) around the cards — seat layout with increasing rel = counter-clockwise → dir=+1 = counter-clockwise
  //   counter-clockwise (ccw): ring passes "behind the cards" (z-index below the pile)
  //   clockwise (cw):          ring comes "in front of the cards" (z-index above the pile)
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
      <Pile s={s} />
      {seat('seat-bl')}
      {seat('seat-bottom')}
      {seat('seat-br')}
    </div>
  );
}

export { SEAT_IDS };
