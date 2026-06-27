// PlayingCard.tsx — ไพ่หนึ่งใบ (port cardHTML) + MiniCard (port miniCardHTML)
import type { CardWithId } from '@shared/types';
import { SUITS, RED, rankLabel } from '@/lib/gameLogic';

interface PlayingCardProps {
  card: CardWithId;
  selected?: boolean;
  onClick?: () => void;
}

export function PlayingCard({ card, selected, onClick }: PlayingCardProps) {
  const red = RED.has(card.s) ? ' red' : '';
  const r = rankLabel(card.r);
  const suit = SUITS[card.s];
  return (
    <div
      className={`playing-card${red}${selected ? ' selected' : ''}`}
      data-id={card.id}
      onClick={onClick}
    >
      <span className="corner tl">
        {r}
        <br />
        {suit}
      </span>
      <span className="pip">{suit}</span>
      <span className="corner br">
        {r}
        <br />
        {suit}
      </span>
    </div>
  );
}

// มินิการ์ดสำหรับประวัติ (เล็ก แสดงเลข+ดอก)
export function MiniCard({ card }: { card: { r: number; s: number } }) {
  const red = RED.has(card.s) ? ' red' : '';
  return (
    <span className={`mini-card${red}`}>
      {rankLabel(card.r)}
      {SUITS[card.s]}
    </span>
  );
}
