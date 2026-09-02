import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * 合并 class 名（clsx + tailwind-merge）。
 * shadcn/ui 约定的工具函数。
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
