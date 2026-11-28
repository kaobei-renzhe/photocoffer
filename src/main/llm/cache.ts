import { createHash } from 'node:crypto'
import type { LlmCapabilityId } from '../../shared/llm'
import type { CacheStats } from '../../shared/llm'
import { getDb } from '../db'
import { log } from '../logger'

/**
 * 改了任何提示词 / 能力解析逻辑就 +1，让旧缓存整体失效。
 * payload 只存模型返回的对象，无法从结果反推当时用的提示词，只能靠版本号整体作废。
 */
const CACHE_SCHEMA_VERSION = 1

/** 条数上限；超出按 last_hit_at 淘汰最久未命中的 */
const MAX_ENTRIES = 500

/** 这几种能力不做结果缓存（对话式，question/history 每次不同） */
const NON_CACHEABLE = new Set<LlmCapabilityId>(['photo.socratic'])

/** 可缓存能力的结果必须是对象；null 才能安全地表示「未命中」 */
export function isCacheable(id: LlmCapabilityId): boolean {
  return !NON_CACHEABLE.has(id)
}

/**
 * 稳定序列化：对象键排序、数组保序。
 * 同一份输入换个键的书写顺序也必须命中同一条缓存，直接用 JSON.stringify 做不到。
 */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null'
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`
  }
  const record = value as Record<string, unknown>
  const body = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(',')
  return `{${body}}`
}

/** 从能力输入里收集要读图的 id；itemIds 允许嵌套数组，统一拍平去重 */
function collectItemIds(input: unknown): number[] {
  const ids = new Set<number>()

  const take = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const entry of value) take(entry)
      return
    }
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) ids.add(value)
  }

  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const entry of value) walk(entry)
      return
    }
    if (!value || typeof value !== 'object') return
    const record = value as Record<string, unknown>
    if ('itemId' in record) take(record.itemId)
    if ('itemIds' in record) take(record.itemIds)
  }

  walk(input)
  return [...ids]
}

/**
 * 把照片的文件修改时间一起算进 key：用户覆盖/重导了同一张图后，
 * 输入 id 没变但内容变了，必须让旧缓存自然失效。
 */
function fingerprintItems(itemIds: number[]): Array<[number, number]> {
  if (itemIds.length === 0) return []
  const placeholders = itemIds.map(() => '?').join(',')
  const rows = getDb()
    .prepare(`SELECT id, file_mtime FROM items WHERE id IN (${placeholders})`)
    .all(...itemIds) as Array<{ id: number; file_mtime: number | null }>
  return rows
    .map((row): [number, number] => [row.id, row.file_mtime ?? -1])
    .sort((a, b) => a[0] - b[0])
}

/** 缓存 key 只由版本、能力、模型、输入和照片指纹决定，换模型或改配置都不会串结果 */
export function makeCacheKey(
  capabilityId: LlmCapabilityId,
  model: { id: string; model: string; baseUrl: string },
  input: unknown
): string {
  const material = [
    String(CACHE_SCHEMA_VERSION),
    capabilityId ?? '',
    model.id,
    model.model,
    model.baseUrl,
    canonicalize(input),
    canonicalize(fingerprintItems(collectItemIds(input)))
  ].join('\u0001')
  return createHash('sha256').update(material).digest('hex')
}

/**
 * 返回 null 表示未命中；可缓存能力（quality / advice / smartFilter / autoTag）
 * 的成功结果都是对象，永远不会是 null，所以调用方可以放心用 null 判断要不要真正调模型。
 */
export function readCache(key: string): unknown | null {
  try {
    const db = getDb()
    const row = db
      .prepare('SELECT payload FROM llm_cache WHERE cache_key = ?')
      .get(key) as { payload: string } | undefined
    if (!row) return null
    db.prepare('UPDATE llm_cache SET hits = hits + 1, last_hit_at = ? WHERE cache_key = ?').run(
      Date.now(),
      key
    )
    return JSON.parse(row.payload) as unknown
  } catch (error) {
    // 缓存只是省钱优化：读失败（库锁、payload 损坏）就当没命中，不能让整次模型调用跟着失败
    void log.warn('llm-cache', '读取结果缓存失败，按未命中处理', {
      error: (error as Error).message
    })
    return null
  }
}

export function writeCache(
  key: string,
  capabilityId: LlmCapabilityId,
  modelId: string,
  input: unknown,
  result: unknown
): void {
  try {
    const db = getDb()
    const now = Date.now()
    db.prepare(
      `INSERT INTO llm_cache (cache_key, capability_id, model_id, item_ids, payload, created_at, last_hit_at, hits)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(cache_key) DO UPDATE SET
         payload = excluded.payload,
         created_at = excluded.created_at,
         last_hit_at = excluded.last_hit_at,
         hits = 0`
    ).run(
      key,
      capabilityId,
      modelId,
      JSON.stringify(collectItemIds(input)),
      JSON.stringify(result),
      now,
      now
    )

    // 覆盖写会把 last_hit_at 刷新到最新，所以超限时被淘汰的一定是最久没人用的条目
    db.prepare(
      `DELETE FROM llm_cache
       WHERE cache_key IN (
         SELECT cache_key FROM llm_cache ORDER BY last_hit_at DESC LIMIT -1 OFFSET ?
       )`
    ).run(MAX_ENTRIES)
  } catch (error) {
    // 模型已经成功返回，写缓存失败只影响下次是否复用，不能把这次结果变成异常
    void log.warn('llm-cache', '写入结果缓存失败', { error: (error as Error).message })
  }
}

/** 返回实际删除条数，便于设置页提示「已清理 N 条」 */
export function clearCache(capabilityId?: LlmCapabilityId): number {
  const db = getDb()
  const outcome = capabilityId
    ? db.prepare('DELETE FROM llm_cache WHERE capability_id = ?').run(capabilityId)
    : db.prepare('DELETE FROM llm_cache').run()
  return outcome.changes
}

export function cacheStats(): CacheStats {
  const db = getDb()
  const totals = db
    .prepare('SELECT COUNT(*) AS entries, COALESCE(SUM(hits), 0) AS hits FROM llm_cache')
    .get() as { entries: number; hits: number }
  const rows = db
    .prepare(
      `SELECT capability_id AS capabilityId, COUNT(*) AS entries, COALESCE(SUM(hits), 0) AS hits
       FROM llm_cache
       GROUP BY capability_id
       ORDER BY hits DESC`
    )
    .all() as Array<{ capabilityId: string; entries: number; hits: number }>
  return {
    entries: totals.entries,
    totalHits: totals.hits,
    byCapability: rows.map((row) => ({
      capabilityId: row.capabilityId,
      entries: row.entries,
      hits: row.hits
    }))
  }
}

export type { CacheStats }
