// Pile.tsx — กองไพ่กลางโต๊ะ (port renderPile + animatePile) + turn-info + turn-timer
import { useEffect, useRef } from 'react';
import type { RoomState } from '@shared/types';
import { PlayingCard } from './PlayingCard';
import { TurnInfo } from './TurnInfo';
import { TurnTimer } from './TurnTimer';
import { useStore } from '@/store';
import { t } from '@/lib/i18n';
import { seatFor, seatOrigin } from '@/lib/gameLogic';

// ระยะที่ไพ่สไลด์เข้ากอง (px) — กว้างกว่าสูงนิดให้เข้ากับสัดส่วนโต๊ะ
const SLIDE_X = 96;
const SLIDE_Y = 72;

// ทิศที่ไพ่กองปัจจุบันสไลด์มา = ที่นั่งของคนลงไพ่ล่าสุด (หา name จาก history เอนทรีที่มีไพ่)
function pileSlide(s: RoomState): [number, number] {
  const last = [...s.history].reverse().find((h) => h.cards && h.cards.length && h.name);
  const n = s.players.length;
  const i = last?.name ? s.players.findIndex((p) => p.name === last.name) : -1;
  if (i < 0 || !n) return seatOrigin(''); // ไม่รู้คนลง → ของเดิม (เด้งลงจากบน)
  const you = s.youIndex >= 0 ? s.youIndex : 0;
  const rel = (((i - you) % n) + n) % n; // 0 = คุณ (ล่างสุด)
  return seatOrigin(seatFor(rel, n));
}

export function Pile({ s }: { s: RoomState }) {
  const lang = useStore((st) => st.lang);
  const cardsRef = useRef<HTMLDivElement>(null);
  const animKey = useRef<string | null>(null);

  const pileCards = s.pileCards && s.pileCards.length ? s.pileCards : null;
  const label = !pileCards && s.phase === 'playing' ? t(lang, 'pile.empty') : t(lang, 'pile.label');

  // อนิเมชันไพ่ลงกอง (สไลด์เข้าจากทิศคนลง + เขย่าถ้าเป็นบอมบ์) — เล่นเมื่อกองเปลี่ยนจริงเท่านั้น
  useEffect(() => {
    const el = cardsRef.current;
    if (!el) return;
    const key = pileCards ? pileCards.map((c) => c.id).join(',') : '';
    if (key && key !== animKey.current) {
      const [ux, uy] = pileSlide(s);
      el.style.setProperty('--from-x', (ux * SLIDE_X).toFixed(1) + 'px');
      el.style.setProperty('--from-y', (uy * SLIDE_Y).toFixed(1) + 'px');
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
