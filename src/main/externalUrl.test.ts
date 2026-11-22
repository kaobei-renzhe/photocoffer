import { describe, expect, it } from 'vitest'
import { isSafeExternalUrl } from './externalUrl'

describe('isSafeExternalUrl', () => {
  it('只放行 https', () => {
    expect(isSafeExternalUrl('https://github.com/kaobei-renzhe/photocoffer')).toBe(true)
    expect(isSafeExternalUrl('  https://example.com/a  ')).toBe(true)
  })

  it('拒绝 http、file、javascript 与自定义协议', () => {
    expect(isSafeExternalUrl('http://example.com')).toBe(false)
    expect(isSafeExternalUrl('file:///C:/')).toBe(false)
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('photocoffer://help')).toBe(false)
    expect(isSafeExternalUrl('')).toBe(false)
    expect(isSafeExternalUrl(null)).toBe(false)
  })
})
