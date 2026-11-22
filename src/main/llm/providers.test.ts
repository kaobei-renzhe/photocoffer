import { describe, expect, it } from 'vitest'
import { buildRequest } from './providers'

const config = {
  baseUrl: 'http://127.0.0.1:11434/v1',
  model: 'llava',
  temperature: null,
  maxTokens: null
}

const messages = [{ role: 'user' as const, content: 'hi' }]

describe('buildRequest 鉴权头', () => {
  it('本机 OpenAI 兼容端点没有 Key 时不发 authorization', () => {
    const request = buildRequest('openai-compatible', config, '', messages, {})
    expect(request.headers.authorization).toBeUndefined()
  })

  it('本机 Anthropic 兼容端点没有 Key 时不发 x-api-key', () => {
    const request = buildRequest('anthropic', config, '', messages, {})
    expect(request.headers['x-api-key']).toBeUndefined()
  })

  it('有 Key 时照常发送 authorization', () => {
    const request = buildRequest('openai-compatible', config, 'sk-test', messages, {})
    expect(request.headers.authorization).toBe('Bearer sk-test')
  })
})
