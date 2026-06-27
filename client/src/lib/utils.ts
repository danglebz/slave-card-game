import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** รวม class แบบ shadcn — clsx + tailwind-merge */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
