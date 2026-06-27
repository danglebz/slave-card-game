// Seat.tsx — ชิปผู้เล่นหนึ่งคน (port chipHTML + chipStyle)
import type { PlayerView, RoomState } from '@shared/types';
import { Icon, iconize } from '@/lib/icons';
import { chipStyle } from '@/lib/gameLogic';
import { useStore } from '@/store';
import { t } from '@/lib/i18n';

export function PlayerChip({ p, s }: { p: PlayerView; s: RoomState }) {
  const lang = useStore((st) => st.lang);
  const cls = ['player-chip'];
  if (p.isTurn && s.phase === 'playing') cls.push('turn');
  if (p.finished) cls.push('finished');
  if (!p.connected) cls.push('offline');
  if (p.isYou) cls.push('you');

  const style = p.color ? chipStyle(p.color) : undefined;

  return (
    <div className={cls.join(' ')} style={style}>
      <span className="pname">
        {/* หัวห้อง = มงกุฎ, บอท = ไอคอนหุ่นยนต์ */}
        {p.isHost ? (
          <>
            <Icon name="crown" className="host-ico" />{' '}
          </>
        ) : p.isBot ? (
          <>
            <Icon name="bot" className="bot-ico" />{' '}
          </>
        ) : null}
        {p.name}
        {p.isYou ? ` ${t(lang, 'seat.you')}` : ''}
        {!p.connected && (
          <>
            {' '}
            <Icon name="wifi-off" className="off-ico" />
          </>
        )}
      </span>
      <span className="pcount">
        {p.finished ? (
          <>
            <Icon name="circle-check" /> {t(lang, 'seat.finished')}
          </>
        ) : (
          t(lang, 'seat.cards', { n: p.cardCount })
        )}
      </span>
      {p.title && <span className="ptitle">{iconize(t(lang, 'rank.' + p.title))}</span>}
    </div>
  );
}
