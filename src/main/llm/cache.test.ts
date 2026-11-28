import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ userData: '' }))
vi.mock('electron', () => ({ app: { getPath: () => state.userData } }))
vi.mock('../logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

const { closeLibrary, getDb, openLibrary } = await import('../db')
const cache = await import('./cache')

const MODEL = { id: 'model-a', model: 'gpt-4o-mini', baseUrl: 'https://api.example.com' }

let root = ''

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lunaris-llm-cache-'))
  state.userData = join(root, 'userData')
  mkdirSync(state.userData, { recursive: true })
  openLibrary(join(root, 'Library'))
})

afterEach(() => {
  closeLibrary()
  rmSync(root, { recursive: true, force: true })
})

/** 造一张图并返回它的 id；file_mtime 参与缓存 key，用来模拟照片内容变化 */
function insertItem(fileMtime: number): number {
  const info = getDb()
    .prepare("INSERT INTO items(path, name, ext, file_mtime, added_at) VALUES (?, ?, '.jpg', ?, ?)")
    .run('C:\\test\\a.jpg', 'a.jpg', fileMtime, Date.now())
  return Number(info.lastInsertRowid)
}

function countRows(): number {
  return (getDb().prepare('SELECT COUNT(*) AS c FROM llm_cache').get() as { c: number }).c
}

describe('makeCacheKey', () => {
  it('对象键的书写顺序不影响 key', () => {
    const id = insertItem(1000)
    const first = cache.makeCacheKey('photo.advice', MODEL, {
      itemId: id,
      extra: { b: 1, a: 2 }
    })
    const second = cache.makeCacheKey('photo.advice', MODEL, {
      extra: { a: 2, b: 1 },
      itemId: id
    })
    expect(first).toBe(second)
  })

  it('同样的输入与模型每次算出同一个 key', () => {
    const id = insertItem(1000)
    const first = cache.makeCacheKey('photo.advice', MODEL, { itemId: id, tone: '简洁' })
    const second = cache.makeCacheKey('photo.advice', MODEL, { itemId: id, tone: '简洁' })
    expect(first).toBe(second)
  })

  it('换模型后 key 失效：model / baseUrl / id 任一变化都会变', () => {
    const id = insertItem(1000)
    const input = { itemId: id }
    const base = cache.makeCacheKey('photo.advice', MODEL, input)

    expect(cache.makeCacheKey('photo.advice', { ...MODEL, model: 'gpt-4o' }, input)).not.toBe(base)
    expect(cache.makeCacheKey('photo.advice', { ...MODEL, baseUrl: 'https://other.example.com' }, input)).not.toBe(base)
    expect(cache.makeCacheKey('photo.advice', { ...MODEL, id: 'model-b' }, input)).not.toBe(base)
  })

  it('同一张图被覆盖（file_mtime 变化）后 key 失效', () => {
    const id = insertItem(1000)
    const input = { itemId: id }
    const before = cache.makeCacheKey('photo.advice', MODEL, input)

    getDb().prepare('UPDATE items SET file_mtime = 2000 WHERE id = ?').run(id)

    const after = cache.makeCacheKey('photo.advice', MODEL, input)
    expect(after).not.toBe(before)
  })
})

describe('readCache / writeCache', () => {
  it('未命中返回 null，写入后能读回同一份结果并累计命中次数', () => {
    const id = insertItem(1000)
    const input = { itemId: id }
    const key = cache.makeCacheKey('photo.advice', MODEL, input)
    const result = { overall: 80, notes: ['构图稳'] }

    expect(cache.readCache(key)).toBeNull()

    cache.writeCache(key, 'photo.advice', MODEL.id, input, result)
    expect(cache.readCache(key)).toEqual(result)

    const afterFirstHit = cache.cacheStats()
    expect(afterFirstHit.totalHits).toBe(1)
    expect(afterFirstHit.byCapability.find((row) => row.capabilityId === 'photo.advice')?.hits).toBe(1)

    expect(cache.readCache(key)).toEqual(result)
    const afterSecondHit = cache.cacheStats()
    expect(afterSecondHit.totalHits).toBe(2)
    expect(afterSecondHit.byCapability.find((row) => row.capabilityId === 'photo.advice')?.hits).toBe(2)
  })

  it('覆盖写同一条 key 时命中次数归零', () => {
    const input = { itemId: insertItem(1000) }
    const key = cache.makeCacheKey('photo.advice', MODEL, input)

    cache.writeCache(key, 'photo.advice', MODEL.id, input, { version: 1 })
    cache.readCache(key)

    cache.writeCache(key, 'photo.advice', MODEL.id, input, { version: 2 })

    const row = getDb()
      .prepare('SELECT hits, payload FROM llm_cache WHERE cache_key = ?')
      .get(key) as { hits: number; payload: string }
    const payload: unknown = JSON.parse(row.payload)
    expect(row.hits).toBe(0)
    expect(payload).toEqual({ version: 2 })
  })
})

describe('clearCache', () => {
  it('按能力清除只删对应条目，不带参数时清空全表', () => {
    const adviceKey = cache.makeCacheKey('photo.advice', MODEL, { itemId: 1 })
    const qualityKey = cache.makeCacheKey('photo.quality', MODEL, { itemId: 1 })
    cache.writeCache(adviceKey, 'photo.advice', MODEL.id, { itemId: 1 }, { ok: true })
    cache.writeCache(qualityKey, 'photo.quality', MODEL.id, { itemId: 1 }, { ok: true })

    expect(cache.clearCache('photo.advice')).toBe(1)
    expect(getDb().prepare('SELECT capability_id FROM llm_cache').all()).toEqual([
      { capability_id: 'photo.quality' }
    ])

    expect(cache.clearCache()).toBe(1)
    expect(countRows()).toBe(0)
  })
})

describe('LRU 淘汰', () => {
  it('超过 500 条时按 last_hit_at 删掉最久未命中的条目', () => {
    const db = getDb()
    const insert = db.prepare(
      `INSERT INTO llm_cache (cache_key, capability_id, model_id, item_ids, payload, created_at, last_hit_at, hits)
       VALUES (?, 'photo.advice', 'm', '[]', '{}', ?, ?, 0)`
    )
    for (let i = 0; i < 600; i += 1) {
      insert.run(`k-${String(i).padStart(3, '0')}`, i, i)
    }

    cache.writeCache('newest', 'photo.advice', 'm', {}, { ok: true })

    const exists = (key: string): boolean =>
      (
        db.prepare('SELECT COUNT(*) AS c FROM llm_cache WHERE cache_key = ?').get(key) as {
          c: number
        }
      ).c === 1

    expect(countRows()).toBe(500)
    expect(exists('k-000')).toBe(false)
    expect(exists('k-100')).toBe(false)
    expect(exists('k-101')).toBe(true)
    expect(exists('newest')).toBe(true)
  })
})

describe('isCacheable', () => {
  it('socratic 是对话式能力，不参与缓存；其余四个可缓存', () => {
    expect(cache.isCacheable('photo.socratic')).toBe(false)
    expect(cache.isCacheable('photo.quality')).toBe(true)
    expect(cache.isCacheable('photo.advice')).toBe(true)
    expect(cache.isCacheable('photo.smartFilter')).toBe(true)
    expect(cache.isCacheable('photo.autoTag')).toBe(true)
  })
})
