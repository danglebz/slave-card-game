// ProgressBar.tsx — top progress bar (shadcn) — subscribes from lib/progress
import { useEffect, useState } from 'react';
import { subscribeProgress } from '@/lib/progress';

export function ProgressBar() {
  const [st, setSt] = useState({ width: 0, active: false });
  useEffect(() => subscribeProgress(setSt), []);
  return (
    <div
      id="progress-bar"
      className={`progress-bar${st.active ? ' active' : ''}`}
      role="progressbar"
      aria-hidden="true"
      style={{ width: `${st.width}%` }}
    />
  );
}
