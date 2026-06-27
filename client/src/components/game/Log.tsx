// Log.tsx — ประวัติการลงไพ่ (port renderLog) — มินิการ์ด + "ผ่าน", เลื่อนไปล่าสุด (ขวาสุด)
import { useEffect, useRef } from 'react';
import type { RoomState } from '@shared/types';
import { MiniCard } from './PlayingCard';
import { useStore } from '@/store';
import { t } from '@/lib/i18n';

export function Log({ s }: { s: RoomState }) {
  const lang = useStore((st) => st.lang);
  const ref = useRef<HTMLDivElement>(null);
  const hist = (s.history || []).filter((h) => !h.event); // ไม่โชว์ event (เริ่มรอบ/ขึ้นก่อน ฯลฯ)

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = el.scrollWidth; // เลื่อนไปล่าสุด (ขวาสุด)
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
