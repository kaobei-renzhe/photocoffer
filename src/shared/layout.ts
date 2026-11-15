/** 左中右三栏的自定义宽度（CSS 像素）；中间栏始终自适应 */
export interface LayoutSizes {
  sidebar: number
  detail: number
}

export const LAYOUT_DEFAULT: LayoutSizes = { sidebar: 236, detail: 320 }

export const LAYOUT_LIMITS = {
  sidebarMin: 180,
  sidebarMax: 400,
  detailMin: 280,
  detailMax: 520,
  /** 中间图片区至少留这么宽，拖到底也不能把网格挤没 */
  centerMin: 480
} as const

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 人像工作台瀑布流的卡片宽度（CSS 像素）；旧键保留做一次性迁移，@deprecated 用 PORTRAIT_COLUMNS */
export const PORTRAIT_THUMB = {
  default: 190,
  min: 140,
  max: 320,
  step: 10
} as const

export function normalizePortraitThumb(value: unknown): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : PORTRAIT_THUMB.default
  return clamp(num, PORTRAIT_THUMB.min, PORTRAIT_THUMB.max)
}

/** 人像工作台列数：2 / 3 / 4，默认 3 */
export const PORTRAIT_COLUMNS = { default: 3, min: 2, max: 4 } as const

export function normalizePortraitColumns(value: unknown): number {
  const num =
    typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : PORTRAIT_COLUMNS.default
  return clamp(num, PORTRAIT_COLUMNS.min, PORTRAIT_COLUMNS.max)
}

/** 旧 thumbSize 一次性映射成列数：<=180 → 4，<=240 → 3，>240 → 2 */
export function columnsFromThumbSize(size: number): number {
  const normalized = normalizePortraitThumb(size)
  return normalizePortraitColumns(normalized <= 180 ? 4 : normalized <= 240 ? 3 : 2)
}

/** 把存下来的宽度收进合法范围；配置文件被手改也不会把界面搞崩 */
export function normalizeLayout(input: Partial<LayoutSizes> | undefined): LayoutSizes {
  // 配置文件可能被手改成字符串或 NaN，先挡掉再取整
  const pick = (value: unknown, fallback: number, min: number, max: number): number => {
    const num = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
    return clamp(num, min, max)
  }
  return {
    sidebar: pick(input?.sidebar, LAYOUT_DEFAULT.sidebar, LAYOUT_LIMITS.sidebarMin, LAYOUT_LIMITS.sidebarMax),
    detail: pick(input?.detail, LAYOUT_DEFAULT.detail, LAYOUT_LIMITS.detailMin, LAYOUT_LIMITS.detailMax)
  }
}
