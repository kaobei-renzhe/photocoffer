/**
 * AI 用量配额的持久化与运行时状态。
 *
 * 纯判断逻辑在 shared/quota.ts（有单测）；这里只负责读写 AppConfig 与串起调用。
 * 只对外部服务商调用计量 —— 本地模型（语义检索/分类/人像）不经过这里。
 */
import { readConfig, updateConfig } from '../settings'
import {
  applyConsume,
  applyFailure,
  applySuccess,
  clampQuotaSettings,
  evaluateQuota,
  normalizeQuotaState,
  type LlmQuotaSettings,
  type LlmQuotaState,
  type QuotaVerdict
} from '../../shared/quota'

export function getQuotaSettings(): LlmQuotaSettings {
  return clampQuotaSettings(readConfig().llmQuota)
}

export function saveQuotaSettings(patch: Partial<LlmQuotaSettings>): LlmQuotaSettings {
  const merged = clampQuotaSettings({ ...getQuotaSettings(), ...patch })
  updateConfig({ llmQuota: merged })
  return merged
}

export function getQuotaState(): LlmQuotaState {
  return normalizeQuotaState(readConfig().llmQuotaState)
}

function writeState(state: LlmQuotaState): void {
  updateConfig({ llmQuotaState: state })
}

/** 发起调用前问一句：这次 count 张能做吗 */
export function checkQuota(count: number): QuotaVerdict {
  return evaluateQuota({ settings: getQuotaSettings(), state: getQuotaState(), count })
}

/** 调用成功后记账。失败不扣额度，避免服务商报错时用户被白扣 */
export function consumeQuota(count: number, tokens?: number): void {
  if (count <= 0) return
  writeState(applyConsume(getQuotaState(), count, tokens))
}

/** 调用失败：累计到 3 次就熔断 5 分钟 */
export function noteLlmFailure(): void {
  writeState(applyFailure(getQuotaState()))
}

/** 调用成功：清空失败计数 */
export function noteLlmSuccess(): void {
  writeState(applySuccess(getQuotaState()))
}

/** 手动重置今日用量（熔断一并解除） */
export function resetQuota(): LlmQuotaState {
  const state: LlmQuotaState = {
    ...normalizeQuotaState(undefined),
    usedPhotos: 0,
    usedTokens: 0,
    pausedUntil: 0,
    consecutiveFailures: 0
  }
  writeState(state)
  return state
}

export interface QuotaSnapshot {
  settings: LlmQuotaSettings
  state: LlmQuotaState
  verdict: QuotaVerdict
}

/** 给设置页和渲染层用的一份完整快照 */
export function quotaSnapshot(): QuotaSnapshot {
  const settings = getQuotaSettings()
  const state = getQuotaState()
  return {
    settings,
    state,
    verdict: evaluateQuota({ settings, state, count: 0 })
  }
}
