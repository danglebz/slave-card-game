import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** merge classes shadcn-style — clsx + tailwind-merge */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
