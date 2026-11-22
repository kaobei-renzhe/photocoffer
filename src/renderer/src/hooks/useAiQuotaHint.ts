import { useEffect, useState } from 'react'
import type { LlmCapabilityId } from '@shared/llm'
import { quotaHintForCapability, type QuotaHint } from '../lib/aiQuota'

/** 读取某个能力当前的数据去向与额度提示；组件卸载后不再回写 */
export function useAiQuotaHint(
  capabilityId: LlmCapabilityId,
  count: number,
  kind = ''
): QuotaHint | null {
  const [hint, setHint] = useState<QuotaHint | null>(null)

  useEffect(() => {
    let alive = true
    void quotaHintForCapability(capabilityId, count, kind).then((next) => {
      if (alive) setHint(next)
    })
    return () => {
      alive = false
    }
  }, [capabilityId, count, kind])

  return hint
}
