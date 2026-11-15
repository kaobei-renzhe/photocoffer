import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./renderer/src/styles.css', import.meta.url), 'utf8')
const darkRoot = css.slice(css.indexOf(':root {'), css.indexOf(":root[data-theme='light']"))

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? walk(path) : /\.(tsx?|css)$/.test(entry.name) ? [path] : []
  })
}

describe('样式 token 守卫', () => {
  it('G-neutral 定稿 token 存在', () => {
    expect(css).toMatch(/--bg:\s*#171818/)
    expect(css).toMatch(/--accent:\s*#FDC75D/)
    expect(css).toMatch(/--on-accent:\s*#141414/)
    expect(css).toMatch(/--lb-faint:\s*#A6A6A6/)
  })

  it('冷蓝不再出现在 UI token 中', () => {
    expect(css).not.toMatch(/5B9FE8|2F6CB8|82B4F2/i)
  })

  it('深色主题的三条阴影都是纯黑', () => {
    const shadows = [...darkRoot.matchAll(/--shadow-\d:\s*([^;]+);/g)].map((m) => m[1])
    expect(shadows).toHaveLength(3)
    for (const shadow of shadows) expect(shadow).toContain('rgba(0,0,0')
  })

  it('--danger 不得作为填充底', () => {
    const files = walk('src/renderer/src')
    const offenders = files.filter((file) => {
      const text = readFileSync(file, 'utf8')
      return /bg-\[var\(--danger\)\]|background(?:-color)?:\s*var\(--danger\)/.test(text)
    })
    expect(offenders).toEqual([])
  })

  it('danger token 名保留，红实底只用 --danger-fill', () => {
    expect(css).toMatch(/--danger-soft\s*:/)
    expect(css).toMatch(/--danger-border\s*:/)
    expect(css).toMatch(/--danger-fill:\s*#B33A2B/)
    expect(css).toMatch(/--danger-fill:\s*#A62A21/)
    expect(css).not.toMatch(/--danger-soft:\s*#2A1B17/)
  })
})
