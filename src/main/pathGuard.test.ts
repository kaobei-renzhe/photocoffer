import { describe, expect, it } from 'vitest'
import { isBlockedExecutable, isInside, isInsidePickedPath, isPickedPath, isSafeImagePath, rememberPickedPath } from './pathGuard'

describe('pathGuard', () => {
  it('目录包含判断能挡住 .. 穿越', () => {
    expect(isInside('C:\\library', 'C:\\library\\a\\b.jpg')).toBe(true)
    expect(isInside('C:\\library', 'C:\\library')).toBe(true)
    expect(isInside('C:\\library', 'C:\\library\\..\\Windows\\a.exe')).toBe(false)
    expect(isInside('C:\\library', 'D:\\library\\a.jpg')).toBe(false)
  })

  it('只放行图片与 RAW', () => {
    expect(isSafeImagePath('a.JPG')).toBe(true)
    expect(isSafeImagePath('a.nef')).toBe(true)
    expect(isSafeImagePath('a.exe')).toBe(false)
    expect(isSafeImagePath('a.lnk')).toBe(false)
    expect(isSafeImagePath('a.txt')).toBe(false)
    expect(isBlockedExecutable('a.ps1')).toBe(true)
    expect(isBlockedExecutable('a.jpg')).toBe(false)
  })

  it('弹窗登记路径可以精确命中，也能覆盖子文件', () => {
    rememberPickedPath('C:\\picked\\library')
    expect(isPickedPath('C:\\picked\\library')).toBe(true)
    expect(isPickedPath('C:\\picked\\library\\sub')).toBe(false)
    expect(isInsidePickedPath('C:\\picked\\library\\sub\\a.jpg')).toBe(true)
    expect(isInsidePickedPath('C:\\other\\a.jpg')).toBe(false)
  })
})
