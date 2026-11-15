import { describe, expect, it } from 'vitest'
import {
  clamp,
  columnsFromThumbSize,
  LAYOUT_DEFAULT,
  LAYOUT_LIMITS,
  normalizeLayout,
  normalizePortraitColumns,
  PORTRAIT_COLUMNS
} from './layout'

describe('clamp', () => {
  it('夹在上下界之间', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })
})

describe('normalizeLayout', () => {
  it('没存过就用默认值', () => {
    expect(normalizeLayout(undefined)).toEqual(LAYOUT_DEFAULT)
    expect(normalizeLayout({})).toEqual(LAYOUT_DEFAULT)
  })

  it('越界值收回合法范围', () => {
    expect(normalizeLayout({ sidebar: 10, detail: 9999 })).toEqual({
      sidebar: LAYOUT_LIMITS.sidebarMin,
      detail: LAYOUT_LIMITS.detailMax
    })
  })

  it('小数四舍五入成整数', () => {
    expect(normalizeLayout({ sidebar: 260.6, detail: 320.4 })).toEqual({ sidebar: 261, detail: 320 })
  })

  it('配置被手改成 NaN 或字符串时回落到默认值，不会把界面写坏', () => {
    const broken = { sidebar: Number.NaN, detail: '320' } as unknown as { sidebar: number; detail: number }
    expect(normalizeLayout(broken)).toEqual(LAYOUT_DEFAULT)
  })

  it('只坏一个字段时，另一个字段照常生效', () => {
    const broken = { sidebar: 300, detail: Number.POSITIVE_INFINITY } as unknown as {
      sidebar: number
      detail: number
    }
    expect(normalizeLayout(broken)).toEqual({ sidebar: 300, detail: LAYOUT_DEFAULT.detail })
  })
})

describe('人像列数', () => {
  it('旧 thumbSize 映射到 2/3/4 列', () => {
    expect(columnsFromThumbSize(140)).toBe(4)
    expect(columnsFromThumbSize(180)).toBe(4)
    expect(columnsFromThumbSize(190)).toBe(3)
    expect(columnsFromThumbSize(240)).toBe(3)
    expect(columnsFromThumbSize(241)).toBe(2)
    expect(columnsFromThumbSize(320)).toBe(2)
  })

  it('非法值落回默认 3 列，越界收进 2/4', () => {
    expect(normalizePortraitColumns('x')).toBe(PORTRAIT_COLUMNS.default)
    expect(normalizePortraitColumns(9)).toBe(4)
    expect(normalizePortraitColumns(1)).toBe(2)
  })
})
