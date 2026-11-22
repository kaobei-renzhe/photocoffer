/**
 * 把配额状态翻译成一句能放进确认弹窗的话。
 *
 * 设计取舍：
 * - 软提醒不做独立弹窗，而是**并进现有的「量大先打招呼」确认框**（aiCost.ts 那套），
 *   避免用户在一次操作里被连问两遍。
 * - 硬暂停不在这里拦：主进程 runCapability 会直接抛 quota_exceeded，
 *   错误文案本身就是给用户看的（"今日 AI 额度已用完（95 / 100 张）"）。
 * - 单张操作（后期建议、研读反问）不计入提醒，但后端照样累计到日额度。
 */

export interface QuotaHint {
  /** ok = 未触及提醒线；soft = 建议告知；hard = 已用完（后端会拒） */
  level: 'ok' | 'soft' | 'hard' | 'unknown'
  /** 直接可拼进确认弹窗的一句话；unknown 时为空串 */
  line: string
}

/**
 * @param count 本次准备处理的照片张数
 * @param kind  面向用户的动作名，写进文案里更具体（"评分" / "筛选"）
 */
export async function quotaHintFor(count: number, kind = ''): Promise<QuotaHint> {
  try {
    const snap = await window.api.llmQuota()
    const { settings, state } = snap
    const used = state.usedPhotos
    const limit = settings.hardDaily
    const action = kind ? `这次要${kind} ${count} 张，` : `这次要处理 ${count} 张，`

    if (snap.verdict.level === 'hard') {
      return {
        level: 'hard',
        line: `今日 AI 额度已用完（${used} / ${limit} 张），明天自动恢复。`
      }
    }

    if (count > settings.softPerBatch || used + count > settings.softDaily) {
      return {
        level: 'soft',
        line: `${action}今日已用 ${used} / ${limit} 张，会调用外部 AI。`
      }
    }

    return {
      level: 'ok',
      line: `今日已用 ${used} / ${limit} 张。`
    }
  } catch {
    // 读不到配额不该阻断主流程（比如主进程刚重启）
    return { level: 'unknown', line: '' }
  }
}
