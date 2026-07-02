// skeleton.tsx — shadcn Skeleton (animate-pulse placeholder)
// ใช้ในแอปเมื่ออยากได้ loading state แบบไม่มีข้อความ (ไม่ขึ้นกับภาษา)
// หมายเหตุ: loading ก่อน React mount อยู่ใน index.html (#root) เพราะเรนเดอร์ก่อน bundle นี้
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-accent', className)}
      {...props}
    />
  );
}

export { Skeleton };
