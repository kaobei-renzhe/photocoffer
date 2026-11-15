import type { Facet } from '@shared/types'

export const FACET_ORDER = [
  'shot_size',
  'light',
  'angle',
  'tone',
  'emotion',
  'mood',
  'scene',
  'weather'
]

/** 只调整渲染顺序，不改 facets 数据的 sort 字段；未知维度排最后并保持原相对顺序 */
export function sortFacets(facets: Facet[]): Facet[] {
  const rank = (id: string): number => {
    const index = FACET_ORDER.indexOf(id)
    return index < 0 ? FACET_ORDER.length : index
  }
  return [...facets].sort((a, b) => rank(a.id) - rank(b.id))
}
