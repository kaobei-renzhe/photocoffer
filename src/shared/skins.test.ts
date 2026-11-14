import { describe, expect, it } from 'vitest'
import { DEFAULT_SKIN, findSkin, isSkinId, SKINS } from './skins'

describe('皮肤表', () => {
  it('id 唯一，且第一项就是默认皮肤', () => {
    const ids = SKINS.map((skin) => skin.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(SKINS[0].id).toBe(DEFAULT_SKIN)
  })

  it('每个皮肤都给出三色预览与合法底色', () => {
    for (const skin of SKINS) {
      expect(skin.swatches).toHaveLength(3)
      expect(skin.base).toMatch(/^#[0-9a-f]{6}$/i)
      expect(['auto', 'dark', 'light']).toContain(skin.mode)
    }
  })
})

describe('isSkinId', () => {
  it('只认表里有的 id', () => {
    expect(isSkinId('classic')).toBe(true)
    expect(isSkinId('night')).toBe(true)
    expect(isSkinId('nope')).toBe(false)
    expect(isSkinId(undefined)).toBe(false)
    expect(isSkinId(42)).toBe(false)
  })

  it('被砍掉的旧皮肤 id 不再合法，迁移依赖 findSkin 回落', () => {
    expect(isSkinId('eclipse')).toBe(false)
    expect(isSkinId('aurora')).toBe(false)
    expect(isSkinId('graphite')).toBe(false)
    expect(isSkinId('mist')).toBe(false)
    expect(findSkin('eclipse').id).toBe(DEFAULT_SKIN)
  })
})

describe('findSkin', () => {
  it('找到就返回对应皮肤', () => {
    expect(findSkin('paper').id).toBe('paper')
  })

  it('找不到退回默认皮肤，不返回空', () => {
    expect(findSkin('ghost').id).toBe(DEFAULT_SKIN)
  })
})
