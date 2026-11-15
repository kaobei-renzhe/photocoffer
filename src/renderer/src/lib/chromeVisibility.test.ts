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
})
