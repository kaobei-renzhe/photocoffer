import { describe, expect, it } from 'vitest'
import {
  CIRCUIT_COOLDOWN_MS,
  QUOTA_DEFAULTS,
  applyConsume,
  applyFailure,
  applySuccess,
  clampQuotaSettings,
  countPhotosInInput,
  dayKeyOf,
  evaluateQuota,
  normalizeQuotaState
} from './quota'

const NOW = new Date('2026-11-22T10:00:00').getTime()

function state(overrides: Partial<Parameters<typeof normalizeQuotaState>[0]> = {}) {
  return { dayKey: dayKeyOf(NOW), usedPhotos: 0, usedTokens: 0, pausedUntil: 0, consecutiveFailures: 0, ...overrides }
}

describe('dayKeyOf', () => {
  it('按本地自然日生成 YYYY-MM-DD', () => {
    expect(dayKeyOf(new Date('2026-11-22T00:00:01').getTime())).toBe('2026-11-22')
    expect(dayKeyOf(new Date('2026-11-22T23:59:59').getTime())).toBe('2026-11-22')
    expect(dayKeyOf(new Date('2026-11-23T00:00:01').getTime())).toBe('2026-11-23')
  })
})

describe('normalizeQuotaState', () => {
  it('同一天保留计数', () => {
    const next = normalizeQuotaState(state({ usedPhotos: 37, usedTokens: 1200 }), NOW)
    expect(next.usedPhotos).toBe(37)
    expect(next.usedTokens).toBe(1200)
  })

  it('跨天把张数与 token 归零', () => {
    const next = normalizeQuotaState(
      { dayKey: '2026-11-21', usedPhotos: 99, usedTokens: 9999, pausedUntil: 0, consecutiveFailures: 5 },
      NOW
    )
    expect(next.usedPhotos).toBe(0)
    expect(next.usedTokens).toBe(0)
    expect(next.consecutiveFailures).toBe(0)
  })

  it('跨天不清熔断（失败保护不该因过零点失效）', () => {
    const pausedUntil = NOW + 60000
    const next = normalizeQuotaState(
      { dayKey: '2026-11-21', usedPhotos: 0, usedTokens: 0, pausedUntil, consecutiveFailures: 3 },
      NOW
    )
    expect(next.pausedUntil).toBe(pausedUntil)
  })

  it('非法值兜底', () => {
    const next = normalizeQuotaState({ dayKey: dayKeyOf(NOW), usedPhotos: -5, usedTokens: NaN }, NOW)
    expect(next.usedPhotos).toBe(0)
    expect(next.usedTokens).toBe(0)
  })
})

describe('clampQuotaSettings', () => {
  it('缺省用默认值', () => {
    expect(clampQuotaSettings(undefined)).toEqual(QUOTA_DEFAULTS)
  })

  it('越界被夹到范围内', () => {
    const clamped = clampQuotaSettings({ softPerBatch: 999, softDaily: 1, hardDaily: 99999, enabled: true })
    expect(clamped.softPerBatch).toBe(50)
    expect(clamped.softDaily).toBe(20)
    expect(clamped.hardDaily).toBe(500)
  })

  it('enabled 只认 false', () => {
    expect(clampQuotaSettings({ enabled: false }).enabled).toBe(false)
    expect(clampQuotaSettings({ enabled: true }).enabled).toBe(true)
    expect(clampQuotaSettings({}).enabled).toBe(true)
  })
})

describe('evaluateQuota', () => {
  const settings = QUOTA_DEFAULTS // 10 / 50 / 100

  it('正常量放行', () => {
    const v = evaluateQuota({ settings, state: state({ usedPhotos: 5 }), count: 3, now: NOW })
    expect(v.level).toBe('ok')
    expect(v.remaining).toBe(95)
  })

  it('单次超软线触发 soft', () => {
    const v = evaluateQuota({ settings, state: state(), count: 11, now: NOW })
    expect(v.level).toBe('soft')
    expect(v.message).toContain('11 张')
  })

  it('日累计超过软线触发 soft', () => {
    const v = evaluateQuota({ settings, state: state({ usedPhotos: 48 }), count: 5, now: NOW })
    expect(v.level).toBe('soft')
    expect(v.message).toContain('48')
  })

  it('超过硬线触发 hard', () => {
    const v = evaluateQuota({ settings, state: state({ usedPhotos: 95 }), count: 6, now: NOW })
    expect(v.level).toBe('hard')
    expect(v.remaining).toBe(5)
    expect(v.message).toContain('95 / 100')
  })

  it('恰好用满不拦（等于上限放行）', () => {
    const v = evaluateQuota({ settings, state: state({ usedPhotos: 90 }), count: 10, now: NOW })
    // 90+10=100 未「超过」100，但 10 张正好等于软线不触发，日累计 100 超过软线 50 → soft
    expect(v.level).toBe('soft')
  })

  it('熔断优先于一切', () => {
    const v = evaluateQuota({
      settings,
      state: state({ usedPhotos: 0, pausedUntil: NOW + 120000 }),
      count: 1,
      now: NOW
    })
    expect(v.level).toBe('circuit')
    expect(v.retryAfterMs).toBe(120000)
    expect(v.message).toContain('2 分钟')
  })

  it('关闭配额后完全放行', () => {
    const v = evaluateQuota({
      settings: { ...settings, enabled: false },
      state: state({ usedPhotos: 9999 }),
      count: 500,
      now: NOW
    })
    expect(v.level).toBe('ok')
    expect(v.remaining).toBe(Infinity)
  })

  it('跨天已用量自动归零后放行', () => {
    const v = evaluateQuota({
      settings,
      state: { dayKey: '2026-11-21', usedPhotos: 100, usedTokens: 0, pausedUntil: 0, consecutiveFailures: 0 },
      count: 5,
      now: NOW
    })
    expect(v.level).toBe('ok')
  })
})

describe('applyConsume', () => {
  it('累加张数与 token', () => {
    const next = applyConsume(state({ usedPhotos: 3, usedTokens: 100 }), 4, 250, NOW)
    expect(next.usedPhotos).toBe(7)
    expect(next.usedTokens).toBe(350)
  })

  it('跨天先归零再累加', () => {
    const next = applyConsume(
      { dayKey: '2026-11-21', usedPhotos: 99, usedTokens: 9, pausedUntil: 0, consecutiveFailures: 0 },
      2,
      10,
      NOW
    )
    expect(next.usedPhotos).toBe(2)
    expect(next.usedTokens).toBe(10)
  })
})

describe('熔断', () => {
  it('连续 3 次失败触发熔断', () => {
    let s = state()
    s = applyFailure(s, NOW)
    s = applyFailure(s, NOW)
    expect(s.pausedUntil).toBe(0)
    s = applyFailure(s, NOW)
    expect(s.pausedUntil).toBe(NOW + CIRCUIT_COOLDOWN_MS)
    expect(s.consecutiveFailures).toBe(3)
  })

  it('成功清空失败计数', () => {
    let s = state({ consecutiveFailures: 2 })
    s = applySuccess(s, NOW)
    expect(s.consecutiveFailures).toBe(0)
  })
})

describe('countPhotosInInput', () => {
  it('批量按去重后的 id 数', () => {
    expect(countPhotosInInput({ itemIds: [1, 2, 2, 3] })).toBe(3)
    expect(countPhotosInInput({ rule: '海边的', itemIds: [7] })).toBe(1)
  })

  it('单张算 1', () => {
    expect(countPhotosInInput({ itemId: 42 })).toBe(1)
    expect(countPhotosInInput({ itemId: 42, question: '构图如何' })).toBe(1)
  })

  it('无有效输入算 0', () => {
    expect(countPhotosInInput({})).toBe(0)
    expect(countPhotosInInput(null)).toBe(0)
    expect(countPhotosInInput({ itemIds: ['x', 1.5] })).toBe(0)
    expect(countPhotosInInput({ itemId: 'abc' })).toBe(0)
  })
})
