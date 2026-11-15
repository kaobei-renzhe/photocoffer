import type { ComponentProps } from 'react'
import type { LucideIcon } from 'lucide-react'

type Size = 'deco' | 'inline' | 'control' | 'tool' | 'hero'

const PX: Record<Size, number> = {
  deco: 12,
  inline: 14,
  control: 16,
  tool: 18,
  hero: 24
}

/** 统一图标入口：新代码禁止自写 size / strokeWidth 数字 */
export function Icon({
  as: C,
  size = 'control',
  ...rest
}: { as: LucideIcon; size?: Size } & Omit<ComponentProps<LucideIcon>, 'size'>) {
  const px = PX[size]
  return <C size={px} strokeWidth={px <= 16 ? 1.75 : 1.5} {...rest} />
}
