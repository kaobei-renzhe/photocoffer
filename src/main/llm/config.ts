import type {
  LlmCapabilityId,
  LlmCapabilitySwitch,
  LlmModelEntry,
  LlmProviderId,
  LlmRouting,
  LlmSettings,
  LlmStoredSettings
} from '../../shared/llm'
import { isLocalBaseUrl, LLM_CAPABILITY_DEFAULTS, LLM_CAPABILITY_IDS } from '../../shared/llm'
import { readConfig, updateConfig } from '../settings'
import { DEFAULT_BASE_URL } from './providers'

export const LLM_DEFAULTS: LlmSettings = {
  version: 3,
  enabled: false,
  models: [],
  defaultModelId: '',
  routing: {},
  capabilities: { ...LLM_CAPABILITY_DEFAULTS }
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, numeric))
}

function optionalClamp(value: unknown, min: number, max: number, round = false): number | null {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  const clamped = Math.min(max, Math.max(min, numeric))
  return round ? Math.round(clamped) : clamped
}

function normalizeProvider(value: unknown): LlmProviderId {
  return value === 'anthropic' ? 'anthropic' : 'openai-compatible'
}

/**
 * 保留用户填写的合法 http/https 地址，不再静默改道。
 * 外部 http 是否允许由 readyState 拒绝；这里悄悄换成别的服务商比报错更危险。
 */
function normalizeBaseUrl(value: unknown, provider: LlmProviderId): string {
  const raw = String(value ?? '').trim().replace(/\/+$/, '')
  if (!raw) return DEFAULT_BASE_URL[provider]
  try {
    const url = new URL(raw)
    if (url.protocol === 'https:' || url.protocol === 'http:') return raw
  } catch {
    /* 非法地址按未填写处理 */
  }
  return DEFAULT_BASE_URL[provider]
}

/** 只认明确写下来的 false，缺字段就按默认（开）处理，老配置也能平滑升级 */
function normalizeCapabilities(
  stored: Partial<Record<string, boolean>> | undefined
): LlmCapabilitySwitch {
  const next = { ...LLM_CAPABILITY_DEFAULTS }
  for (const id of LLM_CAPABILITY_IDS) {
    if (stored && stored[id] === false) next[id] = false
  }
  return next
}

function normalizeRouting(
  stored: Partial<Record<string, string>> | undefined,
  models: LlmModelEntry[]
): LlmRouting {
  const ids = new Set(models.map((model) => model.id))
  const next: LlmRouting = {}
  if (!stored) return next
  for (const capability of LLM_CAPABILITY_IDS) {
    const target = stored[capability]
    if (target && ids.has(target)) next[capability] = target
  }
  return next
}

function normalizeModel(raw: Partial<LlmModelEntry>, index: number): LlmModelEntry {
  const provider = normalizeProvider(raw.provider)
  const model = String(raw.model ?? '').trim()
  const baseUrl = normalizeBaseUrl(raw.baseUrl, provider)
  const id = String(raw.id ?? '').trim() || `m_${Date.now().toString(36)}_${index}`
  return {
    id,
    name: String(raw.name ?? '').trim() || model || `模型 ${index + 1}`,
    vendor: String(raw.vendor ?? '').trim() || '自定义',
    provider,
    baseUrl,
    model,
    locality: isLocalBaseUrl(baseUrl) ? 'local' : 'external',
    vision: raw.vision !== false,
    jsonMode: raw.jsonMode !== false,
    maxOutputTokens: optionalClamp(raw.maxOutputTokens, 16, 32_000, true),
    contextTokens: optionalClamp(raw.contextTokens, 1_000, 2_000_000, true),
    temperature: optionalClamp(raw.temperature, 0, 2),
    maxRetries: Math.round(clamp(raw.maxRetries ?? 2, 0, 5, 2)),
    timeoutMs: Math.round(clamp(raw.timeoutMs ?? 60_000, 5_000, 300_000, 60_000))
  }
}

/** 老版本的单模型配置迁移成一条 m_legacy，并沿用旧温度/长度策略 */
function legacyModel(stored: LlmStoredSettings): LlmModelEntry {
  const provider = normalizeProvider(stored.provider)
  // 老版本把代码默认值 0.3 / 1200 原样写进了配置；它们不是用户的选择，升级后按留空处理
  const legacyVersion = stored.llmVersion !== 2
  const temperature =
    legacyVersion && stored.temperature === 0.3 ? null : optionalClamp(stored.temperature, 0, 2)
  const maxTokens =
    legacyVersion && stored.maxTokens === 1200
      ? null
      : optionalClamp(stored.maxTokens, 16, 32_000, true)
  const baseUrl = normalizeBaseUrl(stored.baseUrl, provider)
  return {
    id: 'm_legacy',
    name: '默认模型',
    vendor: '自定义',
    provider,
    baseUrl,
    model: String(stored.model ?? '').trim(),
    locality: isLocalBaseUrl(baseUrl) ? 'local' : 'external',
    // 老配置没有视觉标记，按可看图处理，避免升级后功能突然消失
    vision: true,
    jsonMode: true,
    maxOutputTokens: maxTokens,
    contextTokens: null,
    temperature,
    maxRetries: Math.round(clamp(stored.maxRetries ?? 2, 0, 5, 2)),
    timeoutMs: Math.round(clamp(stored.timeoutMs ?? 60_000, 5_000, 300_000, 60_000))
  }
}

export function normalizeLlmSettings(stored: LlmStoredSettings | undefined): LlmSettings {
  const raw = stored ?? {}
  // 新结构显式写了 models（哪怕是空数组）就别再塞回老模型；只有完全没有 models 字段才迁移
  const hasModels = Array.isArray(raw.models)
  const models = hasModels
    ? raw.models!.map((model, index) => normalizeModel(model, index))
    : [legacyModel(raw)]
  const ids = new Set(models.map((model) => model.id))
  const defaultModelId =
    raw.defaultModelId && ids.has(raw.defaultModelId)
      ? raw.defaultModelId
      : models[0]?.id ?? ''
  return {
    version: 3,
    enabled: Boolean(raw.enabled),
    models,
    defaultModelId,
    routing: normalizeRouting(raw.routing, models),
    capabilities: normalizeCapabilities(raw.capabilities)
  }
}

export function getLlmSettings(): LlmSettings {
  return normalizeLlmSettings(readConfig().llm)
}

export function saveLlmSettings(patch: Partial<LlmSettings>): LlmSettings {
  const current = getLlmSettings()
  const merged: LlmSettings = {
    version: 3,
    enabled: patch.enabled !== undefined ? Boolean(patch.enabled) : current.enabled,
    models: patch.models !== undefined ? patch.models : current.models,
    defaultModelId: patch.defaultModelId !== undefined ? patch.defaultModelId : current.defaultModelId,
    routing: patch.routing !== undefined ? patch.routing : current.routing,
    capabilities: { ...current.capabilities, ...(patch.capabilities ?? {}) }
  }
  const next = normalizeLlmSettings(merged)
  const fallback = next.models.find((model) => model.id === next.defaultModelId) ?? next.models[0]
  // 同时写一份老结构镜像：旧版本回滚时仍能读到默认模型，不会直接踢回未配置
  updateConfig({
    llm: {
      version: next.version,
      enabled: next.enabled,
      models: next.models,
      defaultModelId: next.defaultModelId,
      routing: next.routing,
      capabilities: next.capabilities,
      llmVersion: 2,
      provider: fallback?.provider ?? 'openai-compatible',
      baseUrl: fallback?.baseUrl ?? DEFAULT_BASE_URL['openai-compatible'],
      model: fallback?.model ?? '',
      temperature: fallback?.temperature ?? null,
      maxTokens: fallback?.maxOutputTokens ?? null,
      timeoutMs: fallback?.timeoutMs ?? 60_000,
      maxRetries: fallback?.maxRetries ?? 2
    }
  })
  return next
}

/** 按能力解析实际模型：路由覆盖 → 默认模型；都没有返回 null */
export function resolveModel(
  settings: LlmSettings,
  capabilityId?: LlmCapabilityId
): LlmModelEntry | null {
  const routed = capabilityId ? settings.routing[capabilityId] : undefined
  const byRoute = routed ? settings.models.find((model) => model.id === routed) : undefined
  if (byRoute) return byRoute
  const byDefault = settings.models.find((model) => model.id === settings.defaultModelId)
  return byDefault ?? settings.models[0] ?? null
}
