// ScoreboardModal.tsx — สถิติสะสมข้ามรอบ (leaderboard นับยศ + ประวัติรอบ)
import { Dialog, DialogContent, DialogClose } from '@/components/ui/dialog';
import { Icon } from '@/lib/icons';
import { t, displayName } from '@/lib/i18n';
import { useStore } from '@/store';
import type { Scoreboard, RankKey } from '@shared/types';

// ยศ → ไอคอน (ตรงกับที่ใช้ในชื่อยศ/ผลรอบ)
const RANK_ICON: Record<RankKey, string> = {
  king: 'trophy',
  queen: 'medal',
  commoner: 'smile',
  viceslave: 'meh',
  slave: 'frown',
};
const RANK_ORDER: RankKey[] = ['king', 'queen', 'commoner', 'viceslave', 'slave'];

export function ScoreboardModal({
  open,
  scoreboard,
  youName,
  onOpenChange,
}: {
  open: boolean;
  scoreboard: Scoreboard | undefined;
  youName: string | null;
  onOpenChange: (o: boolean) => void;
}) {
  const lang = useStore((s) => s.lang);
  const players = scoreboard?.players ?? [];
  const history = scoreboard?.history ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        open={open}
        id="scoreboard-modal"
        className="settings-box"
        ariaLabelledby="scoreboard-title"
      >
        <h2 id="scoreboard-title">
          <Icon name="bar-chart" /> <span>{t(lang, 'score.title')}</span>
        </h2>

        {players.length === 0 ? (
          <p className="score-empty">{t(lang, 'score.empty')}</p>
        ) : (
          <>
            <p className="settings-group-label">{t(lang, 'score.leaderboard')}</p>
            <table className="score-table">
              <thead>
                <tr>
                  <th className="score-th-name" />
                  {RANK_ORDER.map((k) => (
                    <th key={k}>
                      <Icon name={RANK_ICON[k]} />
                    </th>
                  ))}
                  <th className="score-th-rounds">{t(lang, 'score.rounds')}</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => (
                  <tr key={p.name} className={p.name === youName ? 'is-you' : undefined}>
                    <td className="score-name">{displayName(p.name, lang)}</td>
                    {RANK_ORDER.map((k) => (
                      <td key={k} className={p.tally[k] ? undefined : 'score-zero'}>
                        {p.tally[k] || '–'}
                      </td>
                    ))}
                    <td className="score-rounds">{p.rounds}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="settings-group-label">{t(lang, 'score.history')}</p>
            <ol className="score-history">
              {history
                .slice()
                .reverse()
                .map((rec, i) => (
                  <li key={history.length - i}>
                    <span className="score-round-n">#{history.length - i}</span>
                    {rec.order.map((e, j) => (
                      <span
                        className={'score-h-entry' + (e.name === youName ? ' is-you' : '')}
                        key={j}
                      >
                        <Icon name={RANK_ICON[e.title as RankKey] || 'smile'} />
                        {displayName(e.name, lang)}
                      </span>
                    ))}
                  </li>
                ))}
            </ol>
          </>
        )}

        <DialogClose asChild>
          <button id="scoreboard-close" className="primary" type="button">
            <Icon name="x" /> <span>{t(lang, 'dialog.close')}</span>
          </button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
