// ComboHints.tsx — บอมบ์ในมือ (port detectCombos + renderCombos)
// กดชิป = เลือกชุดนั้น, กดซ้ำ = ยกเลิก (ผ่าน store.setSelected / clearSelected)
import type { RoomState } from '@shared/types';
import { detectCombos } from '@/lib/gameLogic';
import { Icon } from '@/lib/icons';
import { useStore } from '@/store';
import { t } from '@/lib/i18n';

export function ComboHints({ s }: { s: RoomState }) {
  const selected = useStore((st) => st.selected);
  const setSelected = useStore((st) => st.setSelected);
  const clearSelected = useStore((st) => st.clearSelected);
  const lang = useStore((st) => st.lang);

  const combos =
    s.phase === 'playing' && s.hand && s.hand.length ? detectCombos(s.hand, lang) : [];

  if (!combos.length) {
    return <div id="combo-hints" className="hidden" />;
  }

  const isActive = (ids: string[]) =>
    selected.size === ids.length && ids.every((id) => selected.has(id));

  return (
    <div id="combo-hints">
      <span className="combo-hints-label">
        <Icon name="bomb" /> {t(lang, 'combo.hintsLabel')}
      </span>
      {combos.map((cb, i) => {
        const active = isActive(cb.ids);
        return (
          <button
            key={i}
            className={`combo-chip${active ? ' active' : ''}`}
            data-i={i}
            onClick={() => (active ? clearSelected() : setSelected(cb.ids))}
          >
            {cb.label}
          </button>
        );
      })}
    </div>
  );
}
