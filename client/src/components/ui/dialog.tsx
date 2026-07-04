// dialog.tsx — shadcn Dialog (Radix + Tailwind) with a scrollable body
// shadcn structure: Header pinned top, Footer pinned bottom, Body in the middle scrolls (max-h on the whole box)
// colors pulled from the token bridge in style.css (bg-background/border-border etc.) to keep the original look
import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { ComponentProps } from 'react';
import { Icon } from '@/lib/icons';
import { useStore } from '@/store';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

function DialogOverlay({ className, ...props }: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-[rgba(10,15,12,0.55)] backdrop-blur-[3px]',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
        'duration-200',
        className,
      )}
      {...props}
    />
  );
}

interface DialogContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
  /** show the X close button in the top-right corner (default: true) */
  showClose?: boolean;
}

/**
 * dialog content — a fixed box centered on screen, flex column + max-h so DialogBody can scroll
 * pass the box name (settings-box / rules-box …) via className to override max-width
 */
function DialogContent({ className, children, showClose = true, ...props }: DialogContentProps) {
  const lang = useStore((s) => s.lang);
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        onOpenAutoFocus={(e) => e.preventDefault()}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
          'flex w-[calc(100%-2.5rem)] max-w-[360px] max-h-[calc(100dvh-2.5rem)] flex-col',
          'rounded-[var(--radius)] border border-border bg-background p-[26px] text-center text-foreground',
          'shadow-[var(--shadow-lg)]',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          'duration-200',
          className,
        )}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close className="dialog-close" aria-label={t(lang, 'dialog.close')}>
            <Icon name="x" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

/** dialog header — pinned, doesn't scroll */
function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="dialog-header" className={cn('flex-none', className)} {...props} />;
}

/** middle content — scrolls when it exceeds the screen height (the part that fixes the scroll bug) */
function DialogBody({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-body"
      className={cn('min-h-0 flex-1 overflow-y-auto overflow-x-hidden', className)}
      {...props}
    />
  );
}

/** dialog footer (buttons) — pinned, doesn't scroll */
function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="dialog-footer" className={cn('flex-none', className)} {...props} />;
}

function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={className} {...props} />;
}

function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description data-slot="dialog-description" className={className} {...props} />
  );
}

export {
  DialogContent,
  DialogOverlay,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
