// Hand.tsx — ไพ่ในมือ (port renderHand + sortedHand) — เลือกไพ่ผ่าน store.toggleCard
import type { RoomState } from '@shared/types';
import { PlayingCard } from './PlayingCard';
import { sortedHand, type HandSort } from '@/lib/gameLogic';
import { useStore } from '@/store';

export function Hand({
  s,
  handSort,
  dealId,
}: {
  s: RoomState;
  handSort: HandSort;
  dealId: number;
}) {
  const selected = useStore((st) => st.selected);
  const toggleCard = useStore((st) => st.toggleCard);

  return (
    // key={dealId} → remount ทั้งมือตอนเริ่มรอบใหม่ ให้ animation แจกไพ่เล่นซ้ำ
    // (ระหว่างรอบ dealId เดิม → ไม่ remount → เลือกไพ่ลื่นไม่กระตุก)
    <div id="hand" key={dealId} className="dealing">
      {sortedHand(s.hand, handSort).map((c, i) => (
        <PlayingCard
          key={c.id}
          card={c}
          selected={selected.has(c.id)}
          onClick={() => toggleCard(c.id)}
          style={{ ['--i' as string]: i }}
        />
      ))}
    </div>
  );
}
