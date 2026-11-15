export type SkinId = 'classic' | 'night' | 'paper' | 'contrast'

export interface SkinDefinition {
  id: SkinId
  name: string
  hint: string
  /** 决定原生控件与窗口底色；classic 跟随系统设置 */
  mode: 'auto' | 'dark' | 'light'
  /** 首屏/窗口底色，避免加载时闪白 */
  base: string
  /** 设置面板里的三色预览（背景 / 面板 / 强调色） */
  swatches: [string, string, string]
}

export const SKINS: SkinDefinition[] = [
  {
    id: 'classic',
    name: '默认',
    hint: '跟随系统深浅 · 匣色',
    mode: 'auto',
    base: '#171818',
    swatches: ['#171818', '#242424', '#FDC75D']
  },
  {
    id: 'night',
    name: '深色',
    hint: '常驻深色 · 底板与匣壁',
    mode: 'dark',
    base: '#171818',
    swatches: ['#171818', '#242424', '#FDC75D']
  },
  {
    id: 'paper',
    name: '浅色',
    hint: '常驻浅色 · 暖纸感',
    mode: 'light',
    base: '#FAF6EE',
    swatches: ['#FAF6EE', '#F4EEE3', '#7A5200']
  },
  {
    id: 'contrast',
    name: '高对比',
    hint: '无障碍 · 高辨识度',
    mode: 'dark',
    base: '#0A0A0A',
    swatches: ['#0A0A0A', '#141414', '#FFD97A']
  }
]

export const DEFAULT_SKIN: SkinId = 'classic'

export function isSkinId(value: unknown): value is SkinId {
  return typeof value === 'string' && SKINS.some((skin) => skin.id === value)
}

export function findSkin(id: string): SkinDefinition {
  return SKINS.find((skin) => skin.id === id) ?? SKINS[0]
}
