import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LlmModelEntry, LlmRouting, LlmStoredSettings } from '../../shared/llm'

let stored: LlmStoredSettings | undefined
const updateConfig = vi.fn()

/** 测试里只关心差异字段，其余按一个合法模型补全 */
function model(id: string, patch: Partial<LlmModelEntry> = {}): LlmModelEntry {
  return {
    id,
    name: id,
    vendor: 'Test',
    provider: 'openai-compatible',
    baseUrl: 'https://example.com/v1',
    model: id,
    locality: 'external',
    vision: true,
    jsonMode: true,
    maxOutputTokens: null,
    contextTokens: null,
    temperature: null,
    maxRetries: 2,
    timeoutMs: 60_000,
    ...patch
  }
}

vi.mock('../settings', () => ({
  readConfig: () => ({ llm: stored }),
  updateConfig: (patch: unknown) => updateConfig(patch)
}))

const { getLlmSettings, normalizeLlmSettings, resolveModel, saveLlmSettings } = await import('./config')

beforeEach(() => {
  stored = undefined
  updateConfig.mockClear()
})

describe('normalizeLlmSettings', () => {
  it('老配置迁移成一条 m_legacy，默认可看图、支持 JSON', () => {
    const settings = normalizeLlmSettings({
      enabled: true,
      provider: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      model: 'legacy-model',
      temperature: 0.5,
      timeoutMs: 30_000,
      capabilities: {
        'photo.quality': true,
        'photo.advice': false,
        'photo.smartFilter': true,
        'photo.socratic': true,
        'photo.autoTag': true
      }
    })
    expect(settings.models).toHaveLength(1)
    expect(settings.models[0]).toMatchObject({
      id: 'm_legacy',
      model: 'legacy-model',
      vision: true,
      jsonMode: true,
      temperature: 0.5,
      timeoutMs: 30_000
    })
    expect(settings.defaultModelId).toBe('m_legacy')
    expect(settings.enabled).toBe(true)
    expect(settings.capabilities['photo.advice']).toBe(false)
    expect(settings.capabilities['photo.quality']).toBe(true)
  })

  it('老版本写进配置的默认温度/长度按留空处理', () => {
    const settings = normalizeLlmSettings({ model: 'x', temperature: 0.3, maxTokens: 1200 })
    expect(settings.models[0].temperature).toBeNull()
    expect(settings.models[0].maxOutputTokens).toBeNull()
  })

  it('新结构保留模型列表，显式空数组不再塞回老模型', () => {
    const withModels = normalizeLlmSettings({
      models: [
        model('a', {
          name: '视觉模型',
          vendor: 'OpenAI',
          baseUrl: 'https://a/v1',
          model: 'gpt-4o'
        })
      ],
      defaultModelId: 'a'
    })
    expect(withModels.models).toHaveLength(1)
    expect(withModels.defaultModelId).toBe('a')

    const empty = normalizeLlmSettings({ models: [] })
    expect(empty.models).toHaveLength(0)
    expect(empty.defaultModelId).toBe('')
  })

  it('路由只保留存在的模型与已知能力', () => {
    const settings = normalizeLlmSettings({
      models: [model('a'), model('b', { vision: false })],
      defaultModelId: 'missing',
      // unknown 是历史脏数据，运行时应该被过滤掉
      routing: { 'photo.quality': 'b', 'photo.advice': 'gone', unknown: 'a' } as LlmRouting
    })
    expect(settings.defaultModelId).toBe('a')
    expect(settings.routing['photo.quality']).toBe('b')
    expect(settings.routing['photo.advice']).toBeUndefined()
  })
})

describe('模型部署位置', () => {
  it('回环地址按本机处理，https 与局域网按外部处理', () => {
    const settings = normalizeLlmSettings({
      models: [
        model('a', { baseUrl: 'http://127.0.0.1:11434/v1' }),
        model('b', { baseUrl: 'http://localhost:11434/v1' }),
        model('c', { baseUrl: 'http://[::1]:11434/v1' }),
        model('d', { baseUrl: 'https://api.example.com/v1' }),
        model('e', { baseUrl: 'http://192.168.1.10:11434/v1' })
      ]
    })
    expect(settings.models.map((entry) => entry.locality)).toEqual([
      'local',
      'local',
      'local',
      'external',
      'external'
    ])
  })

  it('非回环 http 地址不再被静默改成 OpenAI 默认地址', () => {
    const settings = normalizeLlmSettings({
      models: [model('lan', { baseUrl: 'http://192.168.1.10:11434/v1' })]
    })
    expect(settings.models[0].baseUrl).toBe('http://192.168.1.10:11434/v1')
  })
})

describe('resolveModel', () => {
  it('路由优先，其次默认模型', () => {
    const settings = normalizeLlmSettings({
      models: [model('a'), model('b', { vision: false })],
      defaultModelId: 'a',
      routing: { 'photo.advice': 'b' }
    })
    expect(resolveModel(settings, 'photo.advice')?.id).toBe('b')
    expect(resolveModel(settings, 'photo.quality')?.id).toBe('a')
    expect(resolveModel(settings)?.id).toBe('a')
  })
})

describe('saveLlmSettings', () => {
  it('保存时镜像老结构字段，旧版本回滚仍能读到默认模型', () => {
    stored = {
      models: [
        model('a', {
          name: '主模型',
          vendor: 'OpenAI',
          provider: 'anthropic',
          baseUrl: 'https://api.anthropic.com/v1',
          model: 'claude-3-5-sonnet',
          jsonMode: false
        })
      ],
      defaultModelId: 'a'
    }
    saveLlmSettings({ enabled: true })
    const patch = updateConfig.mock.calls.at(-1)?.[0] as { llm: Record<string, unknown> }
    expect(patch.llm.provider).toBe('anthropic')
    expect(patch.llm.model).toBe('claude-3-5-sonnet')
    expect(patch.llm.enabled).toBe(true)
    expect(patch.llm.llmVersion).toBe(2)
    expect(patch.llm.models).toHaveLength(1)
  })
})

describe('getLlmSettings', () => {
  it('完全没有配置时迁移出一条空的老模型', () => {
    expect(getLlmSettings().models).toHaveLength(1)
    expect(getLlmSettings().models[0].id).toBe('m_legacy')
  })
})
