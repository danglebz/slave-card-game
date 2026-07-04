// Hand.tsx — ไพ่ในมือ (port renderHand + sortedHand) — เลือกไพ่ผ่าน store
// สมาร์ทซีเลกต์: ตอนกองเป็นคู่/ตอง/โฟร์ แตะไพ่ใบเดียว → เลือก rank เดียวกันให้ครบชุดเลย
import type { CardWithId, RoomState } from '@shared/types';
import { PlayingCard } from './PlayingCard';
import { sortedHand, smartPick, type HandSort } from '@/lib/gameLogic';
import { useStore } from '@/store';

// ชนิดกอง "อันดับเดียวกัน" → จำนวนใบที่ต้องเลือกให้ครบเมื่อแตะ 1 ใบ
const SAME_RANK_SIZE: Record<string, number> = { pair: 2, triple: 3, quad: 4 };

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
  const setSelected = useStore((st) => st.setSelected);
  const clearSelected = useStore((st) => st.clearSelected);

  // เปิดสมาร์ทซีเลกต์เฉพาะช่วงเล่น + กองเป็นคู่/ตอง/โฟร์ (ไม่ยุ่งกับเฟสแลกไพ่ที่เลือกเองอิสระ)
  const groupSize = s.phase === 'playing' && s.pile ? (SAME_RANK_SIZE[s.pile.type] ?? 0) : 0;

  function onCardClick(c: CardWithId) {
    const pick = smartPick(s.hand, c, groupSize);
    if (pick) {
      // เลือกครบชุด rank เดียวกัน — ถ้าเลือกกลุ่มนี้อยู่แล้ว แตะซ้ำ = ยกเลิก
      const isSame = pick.length === selected.size && pick.every((id) => selected.has(id));
      if (isSame) clearSelected();
      else setSelected(pick);
      return;
    }
    toggleCard(c.id); // ปกติ: สลับเลือกทีละใบ
  }

  return (
    // key={dealId} → remount ทั้งมือตอนเริ่มรอบใหม่ ให้ animation แจกไพ่เล่นซ้ำ
    // (ระหว่างรอบ dealId เดิม → ไม่ remount → เลือกไพ่ลื่นไม่กระตุก)
    <div id="hand" key={dealId} className="dealing">
      {sortedHand(s.hand, handSort).map((c, i) => (
        <PlayingCard
          key={c.id}
          card={c}
          selected={selected.has(c.id)}
          onClick={() => onCardClick(c)}
          style={{ ['--i' as string]: i }}
        />
      ))}
    </div>
  );
}
