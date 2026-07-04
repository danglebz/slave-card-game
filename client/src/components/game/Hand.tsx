// Hand.tsx — hand cards (port renderHand + sortedHand) — select cards via store
// smart-select: when the pile is a pair/triple/quad, tapping one card → selects the whole same-rank set
import type { CardWithId, RoomState } from '@shared/types';
import { PlayingCard } from './PlayingCard';
import { sortedHand, smartPick, type HandSort } from '@/lib/gameLogic';
import { useStore } from '@/store';

// "same-rank" pile types → number of cards needed to complete the set when tapping 1 card
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

  // enable smart-select only during play + pile is a pair/triple/quad (leaves the card-exchange phase, which selects freely, alone)
  const groupSize = s.phase === 'playing' && s.pile ? (SAME_RANK_SIZE[s.pile.type] ?? 0) : 0;

  function onCardClick(c: CardWithId) {
    const pick = smartPick(s.hand, c, groupSize);
    if (pick) {
      // select the full same-rank set — if this group is already selected, tapping again = deselect
      const isSame = pick.length === selected.size && pick.every((id) => selected.has(id));
      if (isSame) clearSelected();
      else setSelected(pick);
      return;
    }
    // normal: toggle selection one card at a time
    toggleCard(c.id);
  }

  return (
    // key={dealId} → remount the whole hand at the start of a new round so the deal animation replays
    // (within a round dealId stays the same → no remount → card selection stays smooth without stutter)
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
