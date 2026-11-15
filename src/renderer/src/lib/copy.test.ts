import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const files: string[] = []
function walk(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path)
    else if (entry.name.endsWith('.tsx')) files.push(path)
  }
}
walk('src/renderer/src')

const text = files.map((file) => readFileSync(file, 'utf8')).join('\n')

describe('界面文案守卫', () => {
  it('工程师语“读取中…”归零', () => {
    expect(text).not.toContain('读取中…')
  })

  it('自我否定的“当前筛选下”归零', () => {
    expect(text).not.toContain('当前筛选下')
  })

  it('启动文案不再说“正在唤醒存照”', () => {
    expect(text).not.toContain('正在唤醒存照')
  })

  it('加载态不再用“加载中…”', () => {
    expect(text).not.toContain('加载中…')
  })
})
