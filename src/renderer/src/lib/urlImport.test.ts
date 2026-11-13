import { describe, expect, it } from 'vitest'
import { pickHttpUrl } from './urlImport'

describe('pickHttpUrl', () => {
  it('跳过注释行，取第一个网址', () => {
    expect(pickHttpUrl('# 来自浏览器\nhttps://example.com/a.jpg\nhttps://example.com/b.jpg')).toBe(
      'https://example.com/a.jpg'
    )
  })

  it('纯文本里夹着说明也能挑出来', () => {
    expect(pickHttpUrl('这张图不错：http://example.com/pic.png 你看看')).toBe(
      'http://example.com/pic.png'
    )
  })

  it('只认 http/https，file 与 javascript 都拒绝', () => {
    expect(pickHttpUrl('file:///C:/pic.png\njavascript:alert(1)')).toBeNull()
  })

  it('兼容 url() 包裹与首尾空白', () => {
    expect(pickHttpUrl('  url( https://example.com/a.webp )  ')).toBe(
      'https://example.com/a.webp'
    )
  })

  it('保留查询串', () => {
    expect(pickHttpUrl('https://example.com/a.jpg?w=1200&h=800')).toBe(
      'https://example.com/a.jpg?w=1200&h=800'
    )
  })
})
