// TurnInfo.tsx — name of whose turn it is to play / card-exchange phase message (port turn-info in renderPile)
import type { RoomState } from '@shared/types';
import { Icon } from '@/lib/icons';
import { t, displayName } from '@/lib/i18n';
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
          <Icon name="gift" />{' '}
          {t(lang, 'exchange.pick', { n: ex.myCount, name: displayName(ex.toName ?? '', lang) })}
        </>
      );
      yourTurn = true;
    } else if (ex.role === 'loser') {
      content = (
        <>
          <Icon name="link" />{' '}
          {t(lang, 'exchange.gave', {
            n: ex.gaveCount,
            name: displayName(ex.fromName ?? '', lang),
          })}
        </>
      );
    } else {
      content = (
        <>
          <Icon name="hourglass" /> {t(lang, 'exchange.waiting')}
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
        <Icon name="hourglass" />{' '}
        {t(lang, 'turn.other', { name: displayName(s.turnName ?? '', lang) })}
      </>
    );
  }

  return (
    <div id="turn-info" className={yourTurn ? 'your-turn' : undefined}>
      {content}
    </div>
  );
}
