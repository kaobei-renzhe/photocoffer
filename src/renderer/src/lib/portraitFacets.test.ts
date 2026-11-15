import { describe, expect, it } from 'vitest'
import type { Facet } from '@shared/types'
import { sortFacets } from './portraitFacets'

const facet = (id: string): Facet => ({ id, name: id, multi: true, values: [], sort: 0 }) as Facet

describe('sortFacets', () => {
  it('按固定维度顺序排列，未知维度排最后并保持原顺序', () => {
    const ordered = sortFacets([facet('scene'), facet('custom-a'), facet('shot_size'), facet('light'), facet('custom-b')])
    expect(ordered.map((entry) => entry.id)).toEqual([
      'shot_size',
      'light',
      'scene',
      'custom-a',
      'custom-b'
    ])
  })
})
