import { AUTO_TAG_CATEGORIES } from '../../autoTag'
import type { LlmCapability } from '../registry'
import { LlmError } from '../types'
import { extractJson } from '../util'

/**
 * 大模型版自动分类：替代本地 CLIP 零样本。
 *
 * 与本地版的差别（见 docs/_internal/内嵌与自定义模型边界.md）：
 * - 本地零样本：免费、离线、固定 7 类、区分度低（实测 0.35–0.49）
 * - 本能力：按张收费、图片外发、同类目但判断更准
 *
 * 定位是「少量精选照片的精确标注」，不是全库替代：3 万张走这条路既贵又慢。
 */

/** 只认这些类目，模型自造的词一律丢弃 —— 否则筛选器的类目/配色映射会失效 */
const CATEGORY_NAMES = AUTO_TAG_CATEGORIES.map((item) => item.name)
const CATEGORY_LIST = CATEGORY_NAMES.join(' / ')

const SYSTEM = `你是摄影分类助手。请把这张照片归到下面最贴切的一个类目：
${CATEGORY_LIST}
只输出 JSON，不要任何解释，格式：
{"category":"类目名","confidence":0,"reason":""}
confidence 是 0-100 的整数，表示你的把握程度；reason 用 20 字以内说明依据。
如果这张照片不属于以上任何一类，category 填 "其他"。`

export interface LlmAutoTagItem {
  itemId: number
  category: string
  /** 0-100 */
  confidence: number
  reason: string
}

export interface LlmAutoTagResult {
  results: LlmAutoTagItem[]
  failed: Array<{ itemId: number; message: string }>
}

export const autoTagCapability: LlmCapability<{ itemIds: number[] }, LlmAutoTagResult> = {
  id: 'photo.autoTag',
  title: 'AI 自动分类（大模型）',
  description: '让大模型判断照片属于哪个类目。比本地零样本准，但会调用外部服务。',
  maxItems: 12,
  async run(ctx, input) {
    const ids = [...new Set((input.itemIds ?? []).filter((id) => Number.isInteger(id)))]
    if (ids.length === 0) throw new LlmError('bad_request', '没有选择要分类的照片')
    if (ids.length > 12) throw new LlmError('bad_request', '一次最多分 12 张，避免单次成本过高')

    const results: LlmAutoTagItem[] = []
    const failed: Array<{ itemId: number; message: string }> = []

    for (const itemId of ids) {
      try {
        const image = await ctx.image(itemId)
        const text = await ctx.chat(
          [
            { role: 'system', content: SYSTEM },
            {
              role: 'user',
              content: [{ type: 'text', text: `照片编号 ${itemId}，请分类。` }, image]
            }
          ],
          { json: true, maxTokens: 160, temperature: 0 }
        )
        const parsed = extractJson<Record<string, unknown>>(text)
        const raw = String(parsed.category ?? '').trim()
        if (!CATEGORY_NAMES.includes(raw)) {
          // 归不进已知类目就不写库，留给用户手动处理，避免污染筛选器
          failed.push({ itemId, message: raw === '其他' ? '不属于任何已知类目' : `模型返回了未知类目：${raw || '空'}` })
          continue
        }
        const confidence = Math.max(0, Math.min(100, Math.round(Number(parsed.confidence) || 0)))
        results.push({
          itemId,
          category: raw,
          confidence,
          reason: String(parsed.reason ?? '').slice(0, 60)
        })
      } catch (error) {
        failed.push({ itemId, message: (error as Error).message })
      }
    }

    return { results, failed }
  }
}
