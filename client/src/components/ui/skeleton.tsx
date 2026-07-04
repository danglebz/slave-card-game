// skeleton.tsx — shadcn Skeleton (animate-pulse placeholder)
// used in the app when you want a text-less loading state (language-independent)
// note: the loading state before React mount lives in index.html (#root) because it renders before this bundle
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
