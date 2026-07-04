// TurnTimer.tsx — per-turn countdown clock (port renderTurnTimer)
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
    // sync with the time the server reports (guard against clock skew) then run off our local clock
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
    // re-sync every time state changes (turnRemainingMs/turn/phase)
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
  // almost out → pulsing red
  if (sec <= 5) cls.push('urgent');

  return (
    <div id="turn-timer" className={cls.join(' ')} aria-hidden="true">
      <Icon name="timer" />
      <span id="turn-timer-sec">{sec}</span>
    </div>
  );
}
