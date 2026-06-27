// LeaveModal.tsx — ยืนยันออกจากห้อง (AlertDialog) (port leave-modal)
import { Dialog, DialogContent, DialogClose } from '@/components/ui/dialog';
import { Icon } from '@/lib/icons';
import { socket } from '@/lib/socket';
import { useStore } from '@/store';
import { t } from '@/lib/i18n';

export function LeaveModal({
  open,
  playing,
  onOpenChange,
}: {
  open: boolean;
  playing: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const lang = useStore((s) => s.lang);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        open={open}
        id="leave-modal"
        className="alert-box"
        alert
        showClose={false}
        ariaLabelledby="leave-title"
        ariaDescribedby="leave-desc"
      >
        <h2 id="leave-title">
          <Icon name="door-open" /> {t(lang, 'leave.title')}
        </h2>
        <p id="leave-desc" className="alert-desc">
          {playing ? t(lang, 'leave.descPlaying') : t(lang, 'leave.desc')}
        </p>
        <div className="alert-actions">
          <DialogClose asChild>
            <button className="btn-secondary" type="button">
              <Icon name="x" /> <span>{t(lang, 'leave.cancel')}</span>
            </button>
          </DialogClose>
          <button
            id="leave-confirm"
            className="btn-destructive"
            type="button"
            onClick={() => {
              onOpenChange(false);
              socket.emit('leave');
            }}
          >
            <Icon name="log-out" /> <span>{t(lang, 'leave.confirm')}</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
