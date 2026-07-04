// Pile.tsx — center pile on the table (port renderPile + animatePile) + turn-info + turn-timer
import { useEffect, useRef } from 'react';
import type { RoomState } from '@shared/types';
import { PlayingCard } from './PlayingCard';
import { TurnInfo } from './TurnInfo';
import { TurnTimer } from './TurnTimer';
import { useStore } from '@/store';
import { t } from '@/lib/i18n';
import { seatFor, seatOrigin } from '@/lib/gameLogic';

// distance cards slide into the pile (px) — a bit wider than tall to match the table's proportions
const SLIDE_X = 96;
const SLIDE_Y = 72;

// direction the current pile cards slide from = seat of the last player to play (find name from the history entry that has cards)
function pileSlide(s: RoomState): [number, number] {
  const last = [...s.history].reverse().find((h) => h.cards && h.cards.length && h.name);
  const n = s.players.length;
  const i = last?.name ? s.players.findIndex((p) => p.name === last.name) : -1;
  // unknown player → default (bounce down from the top)
  if (i < 0 || !n) return seatOrigin('');
  const you = s.youIndex >= 0 ? s.youIndex : 0;
  // 0 = you (bottom)
  const rel = (((i - you) % n) + n) % n;
  return seatOrigin(seatFor(rel, n));
}

export function Pile({ s }: { s: RoomState }) {
  const lang = useStore((st) => st.lang);
  const cardsRef = useRef<HTMLDivElement>(null);
  const animKey = useRef<string | null>(null);

  const pileCards = s.pileCards && s.pileCards.length ? s.pileCards : null;
  const label = !pileCards && s.phase === 'playing' ? t(lang, 'pile.empty') : t(lang, 'pile.label');

  // animate cards onto the pile (slide in from the player's direction + shake if it's a bomb) — play only when the pile actually changes
  useEffect(() => {
    const el = cardsRef.current;
    if (!el) return;
    const key = pileCards ? pileCards.map((c) => c.id).join(',') : '';
    if (key && key !== animKey.current) {
      const [ux, uy] = pileSlide(s);
      el.style.setProperty('--from-x', (ux * SLIDE_X).toFixed(1) + 'px');
      el.style.setProperty('--from-y', (uy * SLIDE_Y).toFixed(1) + 'px');
      el.classList.remove('deal', 'bomb-hit');
      // reflow so the animation can replay
      void el.offsetWidth;
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
