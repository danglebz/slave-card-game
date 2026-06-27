// LeaveModal.tsx — ยืนยันออกจากห้อง (AlertDialog) (port leave-modal)
import { Dialog, DialogContent, DialogClose } from '@/components/ui/dialog';
import { Icon } from '@/lib/icons';
import { socket } from '@/lib/socket';

export function LeaveModal({
  open,
  playing,
  onOpenChange,
}: {
  open: boolean;
  playing: boolean;
  onOpenChange: (o: boolean) => void;
}) {
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
          <Icon name="door-open" /> ออกจากห้อง?
        </h2>
        <p id="leave-desc" className="alert-desc">
          {playing
            ? 'เกมยังเล่นอยู่ — ที่นั่งของคุณจะถูกพักไว้ กลับเข้ามาด้วยชื่อเดิมได้'
            : 'คุณกำลังจะออกจากห้องนี้'}
        </p>
        <div className="alert-actions">
          <DialogClose asChild>
            <button className="btn-secondary" type="button">
              ยกเลิก
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
            ออกจากห้อง
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
