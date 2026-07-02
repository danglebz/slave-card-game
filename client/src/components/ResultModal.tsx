// ResultModal.tsx — ผลรอบ (port showResult) — เปิดอัตโนมัติเมื่อ phase === 'finished'
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Icon, iconize } from '@/lib/icons';
import type { ResultEntry } from '@shared/types';
import { useStore } from '@/store';
import { t, displayName } from '@/lib/i18n';

export function ResultModal({
  open,
  result,
  onOpenChange,
}: {
  open: boolean;
  result: ResultEntry[] | null;
  onOpenChange: (o: boolean) => void;
}) {
  const lang = useStore((s) => s.lang);
  const list = result || [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent id="result-modal" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>
            <Icon name="party-popper" /> <span>{t(lang, 'result.title')}</span>
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <ol id="result-list">
            {list.map((r, i) => {
              const cls = i === 0 ? 'rank-0' : i === list.length - 1 ? 'rank-last' : '';
              return (
                <li className={cls} key={i}>
                  {iconize(t(lang, 'rank.' + r.title))} — {displayName(r.name, lang)}
                </li>
              );
            })}
          </ol>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <button id="result-close" className="primary" type="button">
              <Icon name="x" /> <span>{t(lang, 'dialog.close')}</span>
            </button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
