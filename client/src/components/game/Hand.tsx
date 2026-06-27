// Hand.tsx — ไพ่ในมือ (port renderHand + sortedHand) — เลือกไพ่ผ่าน store.toggleCard
import type { RoomState } from '@shared/types';
import { PlayingCard } from './PlayingCard';
import { sortedHand, type HandSort } from '@/lib/gameLogic';
import { useStore } from '@/store';

export function Hand({ s, handSort }: { s: RoomState; handSort: HandSort }) {
  const selected = useStore((st) => st.selected);
  const toggleCard = useStore((st) => st.toggleCard);

  return (
    <div id="hand">
      {sortedHand(s.hand, handSort).map((c) => (
        <PlayingCard
          key={c.id}
          card={c}
          selected={selected.has(c.id)}
          onClick={() => toggleCard(c.id)}
        />
      ))}
    </div>
  );
}
