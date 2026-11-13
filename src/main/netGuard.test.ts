import { describe, expect, it } from 'vitest'
import { assertPublicHttpUrl, isPrivateAddress, UnsafeUrlError } from './netGuard'

describe('isPrivateAddress', () => {
  it('识别私网、回环与保留段', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.10', '169.254.1.1', '0.0.0.0', '224.0.0.1', '100.64.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(true)
    }
    expect(isPrivateAddress('::1')).toBe(true)
    expect(isPrivateAddress('fe80::1')).toBe(true)
    expect(isPrivateAddress('fd00::1')).toBe(true)
    expect(isPrivateAddress('::ffff:192.168.1.1')).toBe(true)
  })

  it('公网地址放行', () => {
    expect(isPrivateAddress('8.8.8.8')).toBe(false)
    expect(isPrivateAddress('1.1.1.1')).toBe(false)
    expect(isPrivateAddress('2606:4700::1111')).toBe(false)
  })
})

describe('assertPublicHttpUrl', () => {
  it('只接受 http/https', async () => {
    await expect(assertPublicHttpUrl('ftp://example.com/a.jpg')).rejects.toBeInstanceOf(UnsafeUrlError)
    await expect(assertPublicHttpUrl('file:///C:/a.jpg')).rejects.toBeInstanceOf(UnsafeUrlError)
    await expect(assertPublicHttpUrl('not a url')).rejects.toBeInstanceOf(UnsafeUrlError)
  })

  it('拒绝回环与私网字面量', async () => {
    await expect(assertPublicHttpUrl('http://127.0.0.1/a.jpg')).rejects.toBeInstanceOf(UnsafeUrlError)
    await expect(assertPublicHttpUrl('http://localhost/a.jpg')).rejects.toBeInstanceOf(UnsafeUrlError)
    await expect(assertPublicHttpUrl('http://192.168.1.2/a.jpg')).rejects.toBeInstanceOf(UnsafeUrlError)
  })

  it('公网 IP 字面量直接放行，不做 DNS', async () => {
    const url = await assertPublicHttpUrl('https://8.8.8.8/a.jpg')
    expect(url.hostname).toBe('8.8.8.8')
  })
})
