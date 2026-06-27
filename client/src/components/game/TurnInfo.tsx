// TurnInfo.tsx — ชื่อคนที่ต้องลงไพ่ / ข้อความเฟสแลกไพ่ (port turn-info ใน renderPile)
import type { RoomState } from '@shared/types';
import { Icon } from '@/lib/icons';
import { t } from '@/lib/i18n';
import { useStore } from '@/store';

export function TurnInfo({ s }: { s: RoomState }) {
  const lang = useStore((st) => st.lang);

  let content: React.ReactNode = '';
  let yourTurn = false;

  if (s.phase === 'exchange' && s.exchange) {
    const ex = s.exchange;
    if (ex.role === 'winner' && !ex.myDone) {
      content = (
        <>
          <Icon name="gift" /> เลือกไพ่ {ex.myCount} ใบ คืนให้ {ex.toName}
        </>
      );
      yourTurn = true;
    } else if (ex.role === 'loser') {
      content = (
        <>
          <Icon name="link" /> ส่งไพ่สูงสุด {ex.gaveCount} ใบ ให้ {ex.fromName} แล้ว · รอรับไพ่คืน...
        </>
      );
    } else {
      content = (
        <>
          <Icon name="hourglass" /> รอผู้เล่นอื่นเลือกไพ่...
        </>
      );
    }
  } else if (s.phase === 'playing') {
    yourTurn = s.turn === s.youIndex;
    content = yourTurn ? (
      <>
        <Icon name="circle-dot" /> {t(lang, 'turn.yours')}
      </>
    ) : (
      <>
        <Icon name="hourglass" /> {t(lang, 'turn.other', { name: s.turnName ?? '' })}
      </>
    );
  }

  return (
    <div id="turn-info" className={yourTurn ? 'your-turn' : undefined}>
      {content}
    </div>
  );
}
