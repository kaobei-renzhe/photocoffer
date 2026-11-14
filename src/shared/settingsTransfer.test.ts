import { describe, expect, it } from 'vitest'
import { buildSettingsFile, parseSettingsFile } from './settingsTransfer'

const config = {
  theme: 'dark',
  skin: 'classic',
  useCase: 'manage',
  llm: { provider: 'openai-compatible', model: 'gpt-4o-mini' },
  autoBackup: { enabled: true, intervalDays: 3, lastRunAt: 123 },
  library: 'D:/photos',
  libraries: [{ id: 'a' }],
  libraryIndex: { x: 'y' },
  relocate: { lastDir: 'E:/' }
}

describe('buildSettingsFile', () => {
  it('只导出白名单字段，图库路径与上次备份时间不带走', () => {
    const { payload } = buildSettingsFile(config, [{ id: 'g1' }], 100)
    expect(payload.config.theme).toBe('dark')
    expect(payload.config.useCase).toBe('manage')
    expect(payload.config.library).toBeUndefined()
    expect(payload.config.libraries).toBeUndefined()
    expect(payload.config.libraryIndex).toBeUndefined()
    expect(payload.config.relocate).toBeUndefined()
    expect(payload.config.autoBackup).toEqual({ enabled: true, intervalDays: 3 })
    expect(payload.exportedAt).toBe(100)
  })

  it('发现疑似密钥就中止', () => {
    expect(() =>
      buildSettingsFile({ ...config, llm: { model: 'sk-abcdefgh12345678' } }, [])
    ).toThrow('疑似密钥')
  })
})

describe('parseSettingsFile', () => {
  it('拒绝不是存照的文件与未知版本', () => {
    expect(() => parseSettingsFile('not json')).toThrow('不是有效的 JSON')
    expect(() => parseSettingsFile(JSON.stringify({ app: 'other', format: 1 }))).toThrow(
      '不是存照的配置文件'
    )
    expect(() => parseSettingsFile(JSON.stringify({ app: 'lunaris', format: 9 }))).toThrow(
      '版本不支持'
    )
  })

  it('返回白名单字段，并把图库路径类字段记进 skipped', () => {
    const text = JSON.stringify({
      app: 'lunaris',
      format: 1,
      config: { ...config, unknownKey: 1 },
      gear: [{ id: 'g1' }]
    })
    const parsed = parseSettingsFile(text)
    expect(parsed.config.theme).toBe('dark')
    expect(parsed.config.unknownKey).toBeUndefined()
    expect(parsed.gear).toHaveLength(1)
    expect(parsed.skipped.sort()).toEqual(['libraries', 'library', 'libraryIndex', 'relocate'])
  })
})
