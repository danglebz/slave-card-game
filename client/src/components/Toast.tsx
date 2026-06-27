// Toast.tsx — แจ้งเตือนเด้ง (shadcn / Sonner) บน-กลางจอ — อ่าน toast จาก store, auto-dismiss
import { useEffect, useState } from 'react';
import { useStore } from '@/store';
import { Icon, iconize } from '@/lib/icons';

export function Toast() {
  const toast = useStore((s) => s.toast);
  const hideToast = useStore((s) => s.hideToast);
  const [show, setShow] = useState(false);

  // toast เปลี่ยน (id ใหม่) → โชว์ + ตั้งเวลาเก็บ
  useEffect(() => {
    if (!toast) {
      setShow(false);
      return;
    }
    setShow(true);
    const dur = toast.variant === 'error' ? 2500 : 1800;
    const showTimer = setTimeout(() => setShow(false), dur);
    const hideTimer = setTimeout(() => hideToast(), dur + 200); // รอ exit animation
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [toast, hideToast]);

  if (!toast) return <div id="toast" className="toast hidden" />;

  const variant = toast.variant;
  const cls = ['toast', 'top'];
  if (show) cls.push('show');
  else cls.push('hidden');
  if (variant === 'error') cls.push('error');
  if (variant === 'success') cls.push('success');

  return (
    <div id="toast" className={cls.join(' ')}>
      {variant === 'error' && <Icon name="circle-alert" className="toast-ico" />}
      {variant === 'success' && <Icon name="circle-check" className="toast-ico" />}
      <span className="toast-msg">{iconize(toast.msg)}</span>
    </div>
  );
}
