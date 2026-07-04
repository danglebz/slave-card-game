// LeaveModal.tsx — confirm leaving the room (AlertDialog) (port leave-modal)
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
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
        id="leave-modal"
        className="alert-box"
        role="alertdialog"
        showClose={false}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            <Icon name="door-open" /> {t(lang, 'leave.title')}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription className="alert-desc">
            {playing ? t(lang, 'leave.descPlaying') : t(lang, 'leave.desc')}
          </DialogDescription>
        </DialogBody>
        <DialogFooter className="alert-actions">
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
