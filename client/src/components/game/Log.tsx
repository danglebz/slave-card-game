// Log.tsx — play history (port renderLog) — mini-cards + "pass", scroll to latest (far right)
import { useEffect, useRef } from 'react';
import type { RoomState } from '@shared/types';
import { MiniCard } from './PlayingCard';
import { useStore } from '@/store';
import { t } from '@/lib/i18n';

export function Log({ s }: { s: RoomState }) {
  const lang = useStore((st) => st.lang);
  const ref = useRef<HTMLDivElement>(null);
  // don't show events (start round / plays first, etc.)
  const hist = (s.history || []).filter((h) => !h.event);

  useEffect(() => {
    const el = ref.current;
    // scroll to latest (far right)
    if (el) el.scrollLeft = el.scrollWidth;
  }, [s.history]);

  return (
    <div id="log" ref={ref}>
      {hist.map((h, i) =>
        h.pass ? (
          <span className="log-item log-pass" key={i}>
            {t(lang, 'log.pass')}
          </span>
        ) : (
          <span className="log-item" key={i}>
            {(h.cards || []).map((c, j) => (
              <MiniCard key={j} card={c} />
            ))}
          </span>
        ),
      )}
    </div>
  );
}
