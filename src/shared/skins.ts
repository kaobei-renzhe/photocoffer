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
    base: '#14161B',
    swatches: ['#14161B', '#2A2E36', '#5B9FE8']
  },
  {
    id: 'night',
    name: '深色',
    hint: '常驻深色 · 底板与匣壁',
    mode: 'dark',
    base: '#14161B',
    swatches: ['#14161B', '#1E2127', '#5B9FE8']
  },
  {
    id: 'paper',
    name: '浅色',
    hint: '常驻浅色 · 冷白纸感',
    mode: 'light',
    base: '#F0F3F7',
    swatches: ['#F0F3F7', '#E8EEF4', '#2F6CB8']
  },
  {
    id: 'contrast',
    name: '高对比',
    hint: '无障碍 · 高辨识度',
    mode: 'dark',
    base: '#0A0C0F',
    swatches: ['#0A0C0F', '#14171C', '#82B4F2']
  }
]

export const DEFAULT_SKIN: SkinId = 'classic'

export function isSkinId(value: unknown): value is SkinId {
  return typeof value === 'string' && SKINS.some((skin) => skin.id === value)
}

export function findSkin(id: string): SkinDefinition {
  return SKINS.find((skin) => skin.id === id) ?? SKINS[0]
}
