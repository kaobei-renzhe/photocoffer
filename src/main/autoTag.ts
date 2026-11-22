import { getDb } from './db'
import { readConfig, updateConfig } from './settings'
import { createTag } from './repo'
import { activeModel, dot, embedText, resolveModelDir } from './clip/embedder'
import { beginTagging, endTagging, isIndexing } from './taskLock'
import type {
  AutoTagCategory,
  AutoTagProgress,
  AutoTagResult,
  AutoTagSettings,
  AutoTagStatus,
  EmbeddingModelId
} from '../shared/types'
import { readCategories } from './tagCategories'

/** 只让用户填类目名；三条 prompt 由名字派生，兼顾名词直搜与整句描述 */
function promptsOf(name: string): string[] {
  return [name, `一张${name}照片`, `${name}的照片`]
}

interface ThresholdProfile {
  min: number
  max: number
  fallback: number
  step: number
}

/**
 * 两个模型的余弦分布完全不同：Chinese-CLIP 正常匹配在 0.2–0.5，
 * SigLIP 2 只有 0.05–0.1，共用一个阈值会让自动分类直接全空。
 *
 * Chinese-CLIP 的实测（3 万张图库）：默认 14 个类目的分数全部挤在 0.35–0.49，
 * 类目平均分只差 0.026，区分度很低。默认阈值定在 0.40，
 * 只给相对有把握的照片打标，避免 99.7% 的图都被强行归类。
 */
const THRESHOLD_PROFILES: Record<EmbeddingModelId, ThresholdProfile> = {
  'chinese-clip': { min: 0.2, max: 0.5, fallback: 0.4, step: 0.01 },
  siglip2: { min: 0.02, max: 0.12, fallback: 0.06, step: 0.01 }
}

let running = false

export function listAutoTagCategories(): AutoTagCategory[] {
  return readCategories()
}

function profileFor(id: EmbeddingModelId): ThresholdProfile {
  return THRESHOLD_PROFILES[id]
}

function clampThreshold(value: number, profile: ThresholdProfile): number {
  if (!Number.isFinite(value)) return profile.fallback
  return Math.min(profile.max, Math.max(profile.min, Number(value.toFixed(2))))
}

export function getAutoTagSettings(): AutoTagSettings {
  const model = activeModel()
  const profile = profileFor(model.id)
  const stored = readConfig().autoTag ?? {}
  const all = readCategories().map((category) => category.name)
  const picked = Array.isArray(stored.categories)
    ? stored.categories.filter((name) => all.includes(name))
    : []
  // 老配置只有 threshold，按 Chinese-CLIP 的阈值沿用；SigLIP 2 用自己的默认值
  const saved = stored.thresholds?.[model.id]
  const legacy = model.id === 'chinese-clip' ? stored.threshold : undefined
  const value = typeof saved === 'number' ? saved : typeof legacy === 'number' ? legacy : profile.fallback
  return {
    threshold: clampThreshold(value, profile),
    categories: picked.length > 0 ? picked : all
  }
}

export function saveAutoTagSettings(patch: Partial<AutoTagSettings>): AutoTagSettings {
  const model = activeModel()
  const profile = profileFor(model.id)
  const current = getAutoTagSettings()
  const all = readCategories().map((category) => category.name)
  const categories = (patch.categories ?? current.categories).filter((name) => all.includes(name))
  if (categories.length === 0) throw new Error('至少要保留一个类目')
  const threshold = clampThreshold(patch.threshold ?? current.threshold, profile)
  const stored = readConfig().autoTag ?? {}
  const thresholds = { ...(stored.thresholds ?? {}) }
  // 老配置里的 threshold 属于 Chinese-CLIP；先收进 thresholds，避免被另一个模型的保存覆盖
  if (typeof stored.threshold === 'number' && thresholds['chinese-clip'] === undefined) {
    thresholds['chinese-clip'] = clampThreshold(
      stored.threshold,
      THRESHOLD_PROFILES['chinese-clip']
    )
  }
  thresholds[model.id] = threshold
  const next: AutoTagSettings = { threshold, categories }
  updateConfig({
    autoTag: {
      ...stored,
      // 老字段继续保留 Chinese-CLIP 的阈值，读旧配置的代码不会串
      threshold: thresholds['chinese-clip'] ?? threshold,
      thresholds,
      categories
    }
  })
  return next
}

export function autoTagStatus(): AutoTagStatus {
  const db = getDb()
  const model = activeModel()
  const tagged = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM auto_tags a
         JOIN items i ON i.id = a.item_id
         WHERE i.trashed = 0 AND i.missing = 0`
      )
      .get() as { c: number }
  ).c
  const indexed = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM embeddings e
         JOIN items i ON i.id = e.item_id
         WHERE e.model = ? AND i.trashed = 0 AND i.missing = 0`
      )
      .get(model.tag) as { c: number }
  ).c
  const total = (
    db.prepare('SELECT COUNT(*) AS c FROM items WHERE trashed = 0 AND missing = 0').get() as {
      c: number
    }
  ).c
  const profile = profileFor(model.id)
  return {
    tagged,
    indexed,
    total,
    modelId: model.id,
    modelLabel: model.label,
    thresholdMin: profile.min,
    thresholdMax: profile.max,
    thresholdStep: profile.step
  }
}

function normalize(vector: Float32Array): Float32Array {
  let length = 0
  for (let i = 0; i < vector.length; i++) length += vector[i] * vector[i]
  length = Math.sqrt(length) || 1
  const out = new Float32Array(vector.length)
  for (let i = 0; i < vector.length; i++) out[i] = vector[i] / length
  return out
}

function ensureTag(name: string, color: string, cache: Map<string, number>): number {
  const cached = cache.get(name)
  if (cached !== undefined) return cached
  const tag = createTag(name, color)
  cache.set(name, tag.id)
  return tag.id
}

function pruneEmptyTags(categories: AutoTagCategory[] = readCategories()): void {
  const db = getDb()
  const statement = db.prepare(
    `DELETE FROM tags WHERE name = ?
       AND NOT EXISTS (SELECT 1 FROM item_tags WHERE tag_id = tags.id)`
  )
  for (const category of categories) statement.run(category.name)
}

function syncTags(
  assignments: Map<number, { category: string; score: number }>,
  modelTag: string,
  categories: AutoTagCategory[]
): void {
  const db = getDb()
  const previous = db.prepare('SELECT item_id, category FROM auto_tags').all() as Array<{
    item_id: number
    category: string
  }>
  const colorByName = new Map(categories.map((item) => [item.name, item.color]))
  const tagCache = new Map<string, number>()
  const removeLink = db.prepare('DELETE FROM item_tags WHERE item_id = ? AND tag_id = ?')
  const addLink = db.prepare('INSERT OR IGNORE INTO item_tags(item_id, tag_id) VALUES(?, ?)')
  const upsert = db.prepare(
    `INSERT INTO auto_tags(item_id, category, score, model) VALUES(?, ?, ?, ?)
     ON CONFLICT(item_id) DO UPDATE SET
       category = excluded.category, score = excluded.score, model = excluded.model`
  )
  const dropRow = db.prepare('DELETE FROM auto_tags WHERE item_id = ?')

  const tx = db.transaction(() => {
    for (const row of previous) {
      const next = assignments.get(row.item_id)
      // 旧分类被改写、撤销或类目被删除时，先摘掉旧标签
      if (!next || next.category !== row.category) {
        const existing = db.prepare('SELECT id FROM tags WHERE name = ?').get(row.category) as
          | { id: number }
          | undefined
        if (existing) removeLink.run(row.item_id, existing.id)
      }
      if (!next) dropRow.run(row.item_id)
    }

    for (const [itemId, entry] of assignments) {
      const color = colorByName.get(entry.category) ?? '#7aa2f7'
      addLink.run(itemId, ensureTag(entry.category, color, tagCache))
      upsert.run(itemId, entry.category, entry.score, modelTag)
    }
    pruneEmptyTags(categories)
  })
  tx()
}

export async function runAutoTag(
  onProgress: (progress: AutoTagProgress) => void
): Promise<AutoTagResult> {
  if (running) throw new Error('自动分类正在执行')
  if (isIndexing()) throw new Error('正在建立语义索引，等它跑完再分类')
  const model = activeModel()
  if (!resolveModelDir(model.id)) throw new Error(`${model.label} 模型还没下载，先在上面下载模型`)

  const status = autoTagStatus()
  if (status.indexed === 0) throw new Error('还没有语义索引，先点「语义索引」建好再分类')

  const settings = getAutoTagSettings()
  // 类目列表在函数开头读一次；内层逐张比对时不再查库
  const categories = readCategories()
  const active = categories.filter((category) => settings.categories.includes(category.name))
  const db = getDb()

  running = true
  beginTagging()
  try {
    // 1. 把每个类目的多条提示词合成一个类向量
    const vectors = new Map<string, Float32Array>()
    const promptTotal = active.reduce((sum, category) => sum + promptsOf(category.name).length, 0)
    let prepared = 0
    for (const category of active) {
      const sum = new Float32Array(model.dim)
      for (const prompt of promptsOf(category.name)) {
        const vector = await embedText(prompt, model.id)
        for (let i = 0; i < sum.length; i++) sum[i] += vector[i] ?? 0
        prepared++
        onProgress({ phase: 'prepare', done: prepared, total: promptTotal, current: category.name })
      }
      vectors.set(category.name, normalize(sum))
    }

    // 2. 逐张比对已存好的图片向量
    const rows = db
      .prepare(
        `SELECT e.item_id, e.vec FROM embeddings e
         JOIN items i ON i.id = e.item_id
         WHERE e.model = ? AND i.trashed = 0 AND i.missing = 0`
      )
      .all(model.tag) as Array<{ item_id: number; vec: Buffer }>

    const assignments = new Map<number, { category: string; score: number }>()
    const counts: Record<string, number> = {}
    let done = 0
    for (const row of rows) {
      const vector = new Float32Array(row.vec.byteLength / 4)
      Buffer.from(vector.buffer).set(row.vec)
      let bestName = ''
      let bestScore = -1
      for (const [name, categoryVector] of vectors) {
        const score = dot(vector, categoryVector)
        if (score > bestScore) {
          bestScore = score
          bestName = name
        }
      }
      if (bestName && bestScore >= settings.threshold) {
        assignments.set(row.item_id, { category: bestName, score: bestScore })
        counts[bestName] = (counts[bestName] ?? 0) + 1
      }
      done++
      if (done % 20 === 0 || done === rows.length) {
        onProgress({ phase: 'scan', done, total: rows.length, current: '' })
      }
    }

    // 3. 同步成普通标签（自动打的标签也能直接筛选）
    syncTags(assignments, model.tag, categories)

    return { total: rows.length, assigned: assignments.size, counts }
  } finally {
    running = false
    endTagging()
  }
}

export function clearAutoTags(): { removed: number } {
  const db = getDb()
  const rows = db.prepare('SELECT item_id, category FROM auto_tags').all() as Array<{
    item_id: number
    category: string
  }>
  const removeLink = db.prepare(
    'DELETE FROM item_tags WHERE item_id = ? AND tag_id = (SELECT id FROM tags WHERE name = ?)'
  )
  const tx = db.transaction(() => {
    for (const row of rows) removeLink.run(row.item_id, row.category)
    db.prepare('DELETE FROM auto_tags').run()
    pruneEmptyTags()
  })
  tx()
  return { removed: rows.length }
}
