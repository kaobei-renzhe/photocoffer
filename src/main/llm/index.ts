import sharp from 'sharp'
import type {
  LlmCapabilityId,
  LlmConfig,
  LlmModelEntry,
  LlmSettings,
  LlmStatus,
  LlmTestResult,
  PhotoQualityResult,
  PhotoQualitySaved
} from '../../shared/llm'
import { LLM_CAPABILITY_DEFAULTS } from '../../shared/llm'
import { createClient } from './client'
import { getLlmSettings, resolveModel, saveLlmSettings } from './config'
import {
  clearKey,
  encryptionAvailable,
  keyHint,
  migrateLegacyKey,
  readKey,
  saveKey
} from './keyring'
import { lastCall, recentCalls, recordCall } from './metrics'
import { checkQuota, consumeQuota, noteLlmFailure, noteLlmSuccess } from './quota'
import { countPhotosInInput } from '../../shared/quota'
import { getCapability, listCapabilities, registerCapability, type CapabilityContext } from './registry'
import { prepareImage, prepareRegionImage } from './image'
import { saveQualityScores } from '../repo'
import { LlmError, isLlmError, type LlmMessage } from './types'
import { qualityCapability } from './capabilities/quality'
import { adviceCapability } from './capabilities/advice'
import { smartFilterCapability } from './capabilities/smartFilter'
import { socraticCapability } from './capabilities/socratic'

// 能力在这里登记一次；新增能力只需实现接口 + 加一行
registerCapability(qualityCapability)
registerCapability(adviceCapability)
registerCapability(smartFilterCapability)
registerCapability(socraticCapability)

/** 现有四个能力都要读图；以后加纯文本能力时再放白名单 */
function needsVision(_capabilityId?: string): boolean {
  return true
}

/** 模型条目 → 请求层配置（client / providers 只关心这些字段） */
function requestConfig(model: LlmModelEntry): LlmConfig {
  return {
    provider: model.provider,
    baseUrl: model.baseUrl,
    model: model.model,
    temperature: model.temperature,
    maxTokens: model.maxOutputTokens,
    timeoutMs: model.timeoutMs,
    maxRetries: model.maxRetries,
    enabled: true,
    capabilities: { ...LLM_CAPABILITY_DEFAULTS }
  }
}

async function readyState(
  capabilityId?: LlmCapabilityId
): Promise<{ settings: LlmSettings; model: LlmModelEntry; key: string }> {
  const settings = getLlmSettings()
  if (!settings.enabled) throw new LlmError('not_configured', '大模型功能未启用，请先在设置里打开')
  if (capabilityId && settings.capabilities[capabilityId] === false) {
    const title = getCapability(capabilityId)?.title ?? capabilityId
    throw new LlmError('not_configured', `「${title}」已在设置里关闭`)
  }
  const model = resolveModel(settings, capabilityId)
  if (!model) throw new LlmError('not_configured', '还没有添加模型，请先在设置里添加')
  if (!model.model.trim()) throw new LlmError('not_configured', `模型「${model.name}」还没填写模型名称`)
  if (needsVision(capabilityId) && !model.vision) {
    throw new LlmError(
      'not_configured',
      `当前模型「${model.name}」看不了图，请在设置里换一个视觉模型`
    )
  }
  await migrateLegacyKey()
  const key = await readKey(model.id)
  if (!key) throw new LlmError('not_configured', `模型「${model.name}」还没有保存 API Key`)
  return { settings, model, key }
}

function toLlmError(error: unknown): LlmError {
  if (isLlmError(error)) return error
  return new LlmError('unknown', (error as Error)?.message || '未知错误')
}

export async function getStatus(): Promise<LlmStatus> {
  const settings = getLlmSettings()
  await migrateLegacyKey()
  const keyHints: Record<string, string | null> = {}
  for (const model of settings.models) {
    keyHints[model.id] = await keyHint(model.id)
  }
  const capabilities = listCapabilities().map((capability) => {
    const model = resolveModel(settings, capability.id)
    return {
      ...capability,
      enabled: settings.capabilities[capability.id] !== false,
      modelId: model?.id ?? null,
      modelName: model?.name ?? null,
      vision: Boolean(model?.vision)
    }
  })
  const defaultModel = resolveModel(settings)
  return {
    settings,
    keyHints,
    encryption: (await encryptionAvailable()) ? 'os' : 'unavailable',
    lastCall: lastCall(),
    recent: recentCalls(8),
    capabilities,
    ready: Boolean(
      settings.enabled && defaultModel && defaultModel.model.trim() && keyHints[defaultModel.id]
    )
  }
}

export async function updateConfig(patch: Partial<LlmSettings>): Promise<LlmStatus> {
  saveLlmSettings(patch)
  return getStatus()
}

function requireModel(settings: LlmSettings, modelId: string): LlmModelEntry {
  const model = settings.models.find((entry) => entry.id === modelId)
  if (!model) throw new LlmError('not_configured', '模型已不存在，刷新后再试')
  return model
}

export async function saveApiKey(modelId: string, key: string): Promise<LlmStatus> {
  requireModel(getLlmSettings(), modelId)
  await saveKey(modelId, key)
  return getStatus()
}

export async function removeApiKey(modelId: string): Promise<LlmStatus> {
  requireModel(getLlmSettings(), modelId)
  clearKey(modelId)
  return getStatus()
}

/** 32×32 纯色 PNG，用来验证模型是否真的能看图 */
let visionProbe: Promise<string> | null = null
function visionProbeBase64(): Promise<string> {
  if (!visionProbe) {
    visionProbe = sharp({
      create: { width: 32, height: 32, channels: 3, background: '#ff3b30' }
    })
      .png()
      .toBuffer()
      .then((buffer) => buffer.toString('base64'))
  }
  return visionProbe
}

/**
 * 设置页的"测试连接"：先发一条极短文本，再发一张 32×32 图片。
 * 文本失败 → 鉴权/网络问题；文本成功但图片被拒 → 模型看不了图。
 */
export async function testConnection(modelId?: string): Promise<LlmTestResult> {
  const startedAt = Date.now()
  try {
    const settings = getLlmSettings()
    if (!settings.enabled) throw new LlmError('not_configured', '大模型功能未启用，请先打开总开关')
    const model = modelId
      ? requireModel(settings, modelId)
      : resolveModel(settings)
    if (!model) throw new LlmError('not_configured', '还没有添加模型')
    if (!model.model.trim()) throw new LlmError('not_configured', `模型「${model.name}」还没填写模型名称`)
    await migrateLegacyKey()
    const key = await readKey(model.id)
    if (!key) throw new LlmError('not_configured', `模型「${model.name}」还没有保存 API Key`)

    // 测试只验链路，不能被用户填的全局长度/温度放大成本
    const client = createClient({
      config: { ...requestConfig(model), temperature: null, maxTokens: null },
      key
    })
    const text = await client.chat([{ role: 'user', content: '请只回复 ok' }], {
      maxTokens: 8,
      temperature: 0
    })
    recordCall({
      at: Date.now(),
      capabilityId: 'llm.test',
      ok: true,
      attempts: text.attempts,
      latencyMs: text.latencyMs,
      usage: text.reply.usage
    })

    const image = await visionProbeBase64()
    try {
      const seen = await client.chat(
        [
          {
            role: 'user',
            content: [
              { type: 'text', text: '这是什么颜色？只回复颜色词。' },
              { type: 'image', mime: 'image/png', base64: image }
            ]
          }
        ],
        { maxTokens: 24, temperature: 0 }
      )
      return {
        ok: true,
        vision: true,
        message: `连接成功，图片也能看：${seen.reply.text.trim().slice(0, 40) || '已返回内容'}`,
        latencyMs: Date.now() - startedAt,
        model: model.model
      }
    } catch (error) {
      const normalized = toLlmError(error)
      if (normalized.code === 'bad_request') {
        recordCall({
          at: Date.now(),
          capabilityId: 'llm.test.vision',
          ok: false,
          attempts: 1,
          latencyMs: Date.now() - startedAt,
          errorCode: normalized.code
        })
        return {
          ok: false,
          vision: false,
          message: `文本连接成功，但当前模型看不了图：${normalized.message}`,
          latencyMs: Date.now() - startedAt,
          model: model.model
        }
      }
      throw normalized
    }
  } catch (error) {
    const normalized = toLlmError(error)
    recordCall({
      at: Date.now(),
      capabilityId: 'llm.test',
      ok: false,
      attempts: 1,
      latencyMs: Date.now() - startedAt,
      errorCode: normalized.code
    })
    return { ok: false, message: normalized.message, latencyMs: Date.now() - startedAt }
  }
}

/**
 * 评分并落库：能力返回的成功结果写进 quality_scores，失败的图保持原样。
 * 同步在渲染层刷新后，卡片与详情面板就能直接读到分数。
 */
export async function scorePhotos(itemIds: number[]): Promise<PhotoQualitySaved> {
  const result = (await runCapability('photo.quality', { itemIds })) as PhotoQualityResult
  const model = resolveModel(getLlmSettings(), 'photo.quality')
  const persisted = saveQualityScores(result.results, model?.model ?? '')
  return { ...result, persisted }
}

/**
 * 执行一个能力：统一做配置校验、图片准备、调用统计与错误归一。
 * 能力实现只拿到 chat / image 两个原语，不接触密钥与 HTTP。
 */
export async function runCapability(capabilityId: string, input: unknown): Promise<unknown> {
  const capability = getCapability(capabilityId)
  if (!capability) throw new LlmError('bad_request', `未知能力：${capabilityId}`)

  // 用量闸门：只拦硬暂停与熔断；软提醒交给渲染层弹确认（后端不知道用户是否已确认）
  const photoCount = countPhotosInInput(input)
  const verdict = checkQuota(photoCount)
  if (verdict.level === 'hard' || verdict.level === 'circuit') {
    throw new LlmError('quota_exceeded', verdict.message)
  }

  const { model, key } = await readyState(capability.id as LlmCapabilityId)
  const client = createClient({ config: requestConfig(model), key })
  const startedAt = Date.now()
  let attempts = 0
  /** 累计本次调用的 token，成功后一并记账 */
  let totalTokens = 0

  const context: CapabilityContext = {
    chat: async (messages, options) => {
      const outcome = await client.chat(messages as LlmMessage[], {
        ...options,
        // 模型不支持 JSON 模式时，别把 response_format 发过去
        json: Boolean(options?.json && model.jsonMode)
      })
      attempts += outcome.attempts
      totalTokens += outcome.reply.usage?.totalTokens ?? 0
      recordCall({
        at: Date.now(),
        capabilityId,
        ok: true,
        attempts: outcome.attempts,
        latencyMs: outcome.latencyMs,
        usage: outcome.reply.usage
      })
      return outcome.reply.text
    },
    image: async (itemId) => (await prepareImage(itemId)).part,
    regionImage: async (itemId, region, maxEdge) => (await prepareRegionImage(itemId, region, maxEdge)).part
  }

  try {
    const result = await capability.run(context as never, input as never)
    // 只有成功才记账：服务商报错时不该扣用户额度
    consumeQuota(photoCount, totalTokens)
    noteLlmSuccess()
    return result
  } catch (error) {
    noteLlmFailure()
    const normalized = toLlmError(error)
    recordCall({
      at: Date.now(),
      capabilityId,
      ok: false,
      attempts: Math.max(1, attempts),
      latencyMs: Date.now() - startedAt,
      errorCode: normalized.code
    })
    throw normalized
  }
}
