import { describe, expect, it } from 'vitest'
import { isChromeVisible } from './chromeVisibility'

describe('isChromeVisible', () => {
  it('常规浏览恒可见', () => {
    expect(isChromeVisible({ immersive: false, peekBand: false, slideIdle: false })).toBe(true)
  })

  it('沉浸态只有指针进入上下 68px 唤回带才可见', () => {
    expect(isChromeVisible({ immersive: true, peekBand: false, slideIdle: false })).toBe(false)
    expect(isChromeVisible({ immersive: true, peekBand: true, slideIdle: false })).toBe(true)
  })

  it('幻灯片静止时隐藏，用户输入后恢复', () => {
    expect(isChromeVisible({ immersive: false, peekBand: false, slideIdle: true })).toBe(false)
    expect(isChromeVisible({ immersive: false, peekBand: false, slideIdle: false })).toBe(true)
  })

  it('键盘聚焦 / 框选 / 档案 / 二级面板期间强制常显', () => {
    for (const key of ['focusWithin', 'drawing', 'inspectorOpen', 'interacting'] as const) {
      expect(isChromeVisible({ immersive: true, peekBand: false, slideIdle: true, [key]: true })).toBe(
        true
      )
    }
  })

  it('沉浸态下交互结束后回到按唤回带判定', () => {
    const base = { immersive: true, peekBand: false, slideIdle: false, focusWithin: false }
    expect(isChromeVisible(base)).toBe(false)
    expect(isChromeVisible({ ...base, focusWithin: true })).toBe(true)
    expect(isChromeVisible({ ...base, focusWithin: false, peekBand: true })).toBe(true)
  })
})
