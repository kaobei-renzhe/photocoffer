/**
 * AI 用量配额的纯逻辑。
 *
 * 设计约束（来自产品决策 2026-11-22）：
 * - 只计量「外部服务商调用」；本地模型免费离线，不计量、不弹窗
 * - 按「照片张数」计量，不按 token —— 用户能理解"AI 看了 37 张"，看不懂 token
 * - 软提醒（可继续）与硬暂停（需确认）分开，避免用完就永久关掉
 * - 按自然日重置：跨天累计会让用户用了半个月后永远被卡
 *
 * 这里只放纯函数，不碰磁盘；读写落在 main/llm/quota.ts。
 */

export interface LlmQuotaSettings {
  /** 关掉后完全不拦（给不在乎成本的重度用户留口子） */
  enabled: boolean
  /** 单次操作超过这个张数就软提醒 */
  softPerBatch: number
  /** 今日累计超过这个张数就软提醒 */
  softDaily: number
  /** 今日累计超过这个张数就硬暂停 */
  hardDaily: number
}

export interface LlmQuotaState {
  /** 统计所属的自然日，格式 YYYY-MM-DD；与今天不一致时视为已重置 */
  dayKey: string
  usedPhotos: number
  usedTokens: number
  /** 熔断恢复时间戳；0 表示未熔断 */
  pausedUntil: number
  /** 连续失败次数，用于触发熔断 */
  consecutiveFailures: number
}

export const QUOTA_DEFAULTS: LlmQuotaSettings = {
  enabled: true,
  softPerBatch: 10,
  softDaily: 50,
  hardDaily: 100
}

/** 阈值可调范围，UI 与 clamp 共用 */
export const QUOTA_LIMITS = {
  softPerBatch: { min: 5, max: 50 },
  softDaily: { min: 20, max: 200 },
  hardDaily: { min: 50, max: 500 }
} as const

/** 连续失败多少次触发熔断 */
export const CIRCUIT_FAILURE_THRESHOLD = 3
/** 熔断持续时长 */
export const CIRCUIT_COOLDOWN_MS = 5 * 60 * 1000

export type QuotaLevel = 'ok' | 'soft' | 'hard' | 'circuit'

export interface QuotaVerdict {
  level: QuotaLevel
  /** 今日已用张数（已按跨天规则归零） */
  used: number
  limit: number
  remaining: number
  /** circuit 时还要等多久 */
  retryAfterMs?: number
  /** 面向用户的一句话，UI 直接显示 */
  message: string
}

export function dayKeyOf(now: number = Date.now()): string {
  const d = new Date(now)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function clampQuotaSettings(input: Partial<LlmQuotaSettings> | undefined): LlmQuotaSettings {
  const pick = (value: unknown, key: keyof typeof QUOTA_LIMITS, fallback: number): number => {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return fallback
    const { min, max } = QUOTA_LIMITS[key]
    return Math.min(max, Math.max(min, Math.round(numeric)))
  }
  return {
    enabled: input?.enabled !== false,
    softPerBatch: pick(input?.softPerBatch, 'softPerBatch', QUOTA_DEFAULTS.softPerBatch),
    softDaily: pick(input?.softDaily, 'softDaily', QUOTA_DEFAULTS.softDaily),
    hardDaily: pick(input?.hardDaily, 'hardDaily', QUOTA_DEFAULTS.hardDaily)
  }
}

/** 跨天清零；同时把非法值兜回默认 */
export function normalizeQuotaState(
  input: Partial<LlmQuotaState> | undefined,
  now: number = Date.now()
): LlmQuotaState {
  const today = dayKeyOf(now)
  const sameDay = input?.dayKey === today
  const num = (value: unknown): number => {
    const numeric = Number(value)
    return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0
  }
  return {
    dayKey: today,
    usedPhotos: sameDay ? num(input?.usedPhotos) : 0,
    usedTokens: sameDay ? num(input?.usedTokens) : 0,
    // 熔断跨天也保留：它是失败保护，不该因为过了零点就放开
    pausedUntil: num(input?.pausedUntil),
    consecutiveFailures: sameDay ? num(input?.consecutiveFailures) : 0
  }
}

/**
 * 判断这次操作能不能做。
 * 顺序：熔断 > 硬暂停 > 软提醒 > 放行。
 */
export function evaluateQuota(input: {
  settings: LlmQuotaSettings
  state: LlmQuotaState
  count: number
  now?: number
}): QuotaVerdict {
  const now = input.now ?? Date.now()
  const state = normalizeQuotaState(input.state, now)
  const settings = clampQuotaSettings(input.settings)
  const count = Math.max(0, Math.floor(Number(input.count) || 0))

  const base = {
    used: state.usedPhotos,
    limit: settings.hardDaily,
    remaining: Math.max(0, settings.hardDaily - state.usedPhotos)
  }

  if (!settings.enabled) {
    return { ...base, level: 'ok', limit: Infinity, remaining: Infinity, message: '' }
  }

  if (state.pausedUntil > now) {
    const waitMs = state.pausedUntil - now
    const minutes = Math.max(1, Math.ceil(waitMs / 60000))
    return {
      ...base,
      level: 'circuit',
      retryAfterMs: waitMs,
      message: `连续调用失败，已暂停 ${minutes} 分钟。稍后再试。`
    }
  }

  if (state.usedPhotos + count > settings.hardDaily) {
    return {
      ...base,
      level: 'hard',
      message: `今日 AI 额度已用完（${state.usedPhotos} / ${settings.hardDaily} 张）。明天自动恢复。`
    }
  }

  if (count > settings.softPerBatch) {
    return {
      ...base,
      level: 'soft',
      message: `这次要处理 ${count} 张，超过单次提醒线（${settings.softPerBatch} 张），会调用外部 AI。`
    }
  }

  if (state.usedPhotos + count > settings.softDaily) {
    return {
      ...base,
      level: 'soft',
      message: `今日已用 ${state.usedPhotos} 张，这次再加 ${count} 张会超过 ${settings.softDaily} 张。`
    }
  }

  return { ...base, level: 'ok', message: '' }
}

/** 消费成功后推进状态 */
export function applyConsume(
  state: LlmQuotaState,
  count: number,
  tokens: number | undefined,
  now: number = Date.now()
): LlmQuotaState {
  const normalized = normalizeQuotaState(state, now)
  return {
    ...normalized,
    usedPhotos: normalized.usedPhotos + Math.max(0, Math.floor(Number(count) || 0)),
    usedTokens: normalized.usedTokens + Math.max(0, Math.floor(Number(tokens) || 0))
  }
}

/** 记一次失败：连续够数就熔断 */
export function applyFailure(state: LlmQuotaState, now: number = Date.now()): LlmQuotaState {
  const normalized = normalizeQuotaState(state, now)
  const failures = normalized.consecutiveFailures + 1
  return {
    ...normalized,
    consecutiveFailures: failures,
    pausedUntil: failures >= CIRCUIT_FAILURE_THRESHOLD ? now + CIRCUIT_COOLDOWN_MS : normalized.pausedUntil
  }
}

/** 成功就清零失败计数 */
export function applySuccess(state: LlmQuotaState, now: number = Date.now()): LlmQuotaState {
  const normalized = normalizeQuotaState(state, now)
  if (normalized.consecutiveFailures === 0 && normalized.pausedUntil === 0) return normalized
  return { ...normalized, consecutiveFailures: 0 }
}

/** 从能力输入里数出这次要处理几张照片 */
export function countPhotosInInput(input: unknown): number {
  if (!input || typeof input !== 'object') return 0
  const obj = input as Record<string, unknown>
  if (Array.isArray(obj.itemIds)) {
    const unique = new Set(obj.itemIds.filter((id) => Number.isInteger(id)))
    return unique.size
  }
  const single = Number(obj.itemId)
  return Number.isInteger(single) ? 1 : 0
}
