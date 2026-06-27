// TurnTimer.tsx — นาฬิกานับถอยหลังต่อตา (port renderTurnTimer)
import { useEffect, useRef, useState } from 'react';
import type { RoomState } from '@shared/types';
import { Icon } from '@/lib/icons';

export function TurnTimer({ s }: { s: RoomState }) {
  const [sec, setSec] = useState<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const active = s.phase === 'playing' && s.turnRemainingMs != null;
  const mine = s.turn === s.youIndex;

  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (!active) {
      setSec(null);
      return;
    }
    // sync กับเวลาที่ server บอก (กัน clock skew) แล้วเดินด้วยนาฬิกาเครื่องเรา
    const endsAt = Date.now() + (s.turnRemainingMs as number);
    const tick = () => {
      const ms = Math.max(0, endsAt - Date.now());
      setSec(Math.ceil(ms / 1000));
      if (ms <= 0 && tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
    tick();
    tickRef.current = setInterval(tick, 250);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
    // re-sync ทุกครั้งที่ state เปลี่ยน (turnRemainingMs/turn/phase)
  }, [active, s.turnRemainingMs, s.turn, s.phase, s.youIndex]);

  if (!active || sec == null) {
    return (
      <div id="turn-timer" className="turn-timer hidden" aria-hidden="true">
        <Icon name="timer" />
        <span id="turn-timer-sec" />
      </div>
    );
  }

  const cls = ['turn-timer'];
  if (mine) cls.push('mine');
  if (sec <= 5) cls.push('urgent'); // ใกล้หมด → แดงเต้น

  return (
    <div id="turn-timer" className={cls.join(' ')} aria-hidden="true">
      <Icon name="timer" />
      <span id="turn-timer-sec">{sec}</span>
    </div>
  );
}
