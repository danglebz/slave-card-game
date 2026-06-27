// dialog.tsx — thin shadcn-pattern wrapper รอบ Radix Dialog
// ใช้ Radix เพื่อ a11y (focus-trap, ESC, overlay-click) แต่คงคลาส .modal/.modal-box เดิม
// เพื่อให้ดีไซน์ + อนิเมชัน (.open) เหมือนต้นฉบับเป๊ะ
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/lib/icons';
import { useStore } from '@/store';
import { t } from '@/lib/i18n';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

interface DialogContentProps {
  open: boolean;
  className?: string; // เพิ่มคลาสบน .modal-box (เช่น rules-box / share-box)
  /** alertdialog = ไม่ปิดเมื่อคลิก overlay (ต้องเลือกปุ่มเอง) */
  alert?: boolean;
  id?: string;
  ariaLabelledby?: string;
  ariaDescribedby?: string;
  showClose?: boolean;
  children: ReactNode;
}

/**
 * เนื้อ dialog — .modal เป็น overlay เต็มจอ, .modal-box เป็นกล่อง
 * จัดการ class .open เองเพื่อให้ transition เข้า/ออกเล่นเหมือนเดิม (เปิด→reflow→add .open)
 */
export function DialogContent({
  open,
  className = '',
  alert = false,
  id,
  ariaLabelledby,
  ariaDescribedby,
  showClose = true,
  children,
}: DialogContentProps) {
  // mounted คุมการ render (รอ exit-animation จบก่อน unmount), shown คุมคลาส .open
  const lang = useStore((s) => s.lang);
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      setMounted(true);
      // reflow ให้ transition เข้าทำงาน
      requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    } else if (mounted) {
      setShown(false);
      closeTimer.current = setTimeout(() => setMounted(false), 200); // รอ exit animation
    }
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!mounted) return null;

  return (
    <DialogPrimitive.Portal forceMount>
      <DialogPrimitive.Content
        id={id}
        role={alert ? 'alertdialog' : 'dialog'}
        aria-labelledby={ariaLabelledby}
        aria-describedby={ariaDescribedby}
        // ปิด default outline + ให้คลาส .modal คุมสไตล์ overlay เอง
        className={`modal${shown ? ' open' : ''}`}
        onInteractOutside={(e) => {
          if (alert) e.preventDefault(); // alertdialog ไม่ปิดเมื่อคลิกนอก
        }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className={`modal-box ${className}`.trim()}>
          {showClose && (
            <DialogPrimitive.Close className="dialog-close" aria-label={t(lang, 'dialog.close')}>
              <Icon name="x" />
            </DialogPrimitive.Close>
          )}
          {children}
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
