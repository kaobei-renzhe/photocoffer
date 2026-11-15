import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./portrait.ts', import.meta.url), 'utf8')

describe('portrait upsert 源码守卫', () => {
  it('中文禁止注释必须存在', () => {
    expect(source).toContain('这三列永远不进 SET 清单')
  })

  it('ON CONFLICT 的 SET 段不含 override', () => {
    const sql = source.slice(
      source.indexOf('export const PORTRAIT_UPSERT_SQL'),
      source.indexOf('export function setPortraitOverride')
    )
    const set = sql.split('DO UPDATE SET')[1]
    expect(set).not.toMatch(/override/)
    expect(set).toMatch(/has_person/)
    expect(set).toMatch(/score/)
    expect(set).toMatch(/model/)
    expect(set).toMatch(/updated_at/)
  })
})
