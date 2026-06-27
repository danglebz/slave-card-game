// Pile.tsx — กองไพ่กลางโต๊ะ (port renderPile + animatePile) + turn-info + turn-timer
import { useEffect, useRef } from 'react';
import type { RoomState } from '@shared/types';
import { PlayingCard } from './PlayingCard';
import { TurnInfo } from './TurnInfo';
import { TurnTimer } from './TurnTimer';

export function Pile({ s }: { s: RoomState }) {
  const cardsRef = useRef<HTMLDivElement>(null);
  const animKey = useRef<string | null>(null);

  const pileCards = s.pileCards && s.pileCards.length ? s.pileCards : null;
  const label = pileCards
    ? 'กองบนโต๊ะ'
    : s.phase === 'playing'
      ? 'โต๊ะว่าง — ลงไพ่ได้เลย'
      : 'กองบนโต๊ะ';

  // อนิเมชันไพ่ลงกอง (เด้งเข้า + เขย่าถ้าเป็นบอมบ์) — เล่นเมื่อกองเปลี่ยนจริงเท่านั้น
  useEffect(() => {
    const el = cardsRef.current;
    if (!el) return;
    const key = pileCards ? pileCards.map((c) => c.id).join(',') : '';
    if (key && key !== animKey.current) {
      el.classList.remove('deal', 'bomb-hit');
      void el.offsetWidth; // reflow ให้ animation เล่นซ้ำได้
      el.classList.add('deal');
      if (s.pile && s.pile.mode === 'bomb') el.classList.add('bomb-hit');
    } else if (!key) {
      el.classList.remove('deal', 'bomb-hit');
    }
    animKey.current = key;
  });

  return (
    <div className="pile-center">
      <div id="pile-label">{label}</div>
      <div id="pile-cards" ref={cardsRef}>
        {pileCards && pileCards.map((c) => <PlayingCard key={c.id} card={c} />)}
      </div>
      <TurnInfo s={s} />
      <TurnTimer s={s} />
    </div>
  );
}
