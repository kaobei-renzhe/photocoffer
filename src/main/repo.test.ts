import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ userData: '' }))
vi.mock('electron', () => ({ app: { getPath: () => state.userData } }))
vi.mock('./logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

const { closeLibrary, getDb, openLibrary } = await import('./db')
const { invalidateItemTotals, listItems, saveQualityScores } = await import('./repo')

let root = ''

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lunaris-repo-'))
  state.userData = join(root, 'userData')
  mkdirSync(state.userData, { recursive: true })
  openLibrary(join(root, 'Library'))
  const insert = getDb().prepare(
    'INSERT INTO items(path, name, ext, size, added_at, mtime, note) VALUES(?, ?, ?, ?, ?, ?, ?)'
  )
  for (let index = 1; index <= 300; index++) {
    insert.run(`C:\\lib\\photo-${index}.jpg`, `photo-${index}.jpg`, '.jpg', 1000 + index, index, index, '')
  }
  invalidateItemTotals()
})

afterEach(() => {
  closeLibrary()
  rmSync(root, { recursive: true, force: true })
})

describe('listItems', () => {
  it('分页返回正确总数，翻页复用缓存', () => {
    const first = listItems({ sort: 'added' }, 0, 100)
    expect(first.total).toBe(300)
    expect(first.items).toHaveLength(100)

    // 缓存命中期间新增数据不应改变翻页总数；写操作后主动失效才刷新
    getDb()
      .prepare('INSERT INTO items(path, name, ext, added_at) VALUES(?, ?, ?, ?)')
      .run('C:\\lib\\photo-new.jpg', 'photo-new.jpg', '.jpg', 999)
    const second = listItems({ sort: 'added' }, 100, 100)
    expect(second.total).toBe(300)

    invalidateItemTotals()
    const third = listItems({ sort: 'added' }, 100, 100)
    expect(third.total).toBe(301)
  })

  it('ai 排序用 quality_scores 的分数，并同步写入 items.ai_score', () => {
    const db = getDb()
    saveQualityScores(
      [
        { itemId: 1, composition: 90, exposure: 90, color: 90, sharpness: 90, overall: 99, comment: '' },
        { itemId: 2, composition: 80, exposure: 80, color: 80, sharpness: 80, overall: 90, comment: '' }
      ],
      'test-model'
    )
    const synced = db.prepare('SELECT id, ai_score FROM items WHERE id IN (1, 2) ORDER BY id').all()
    expect(synced).toEqual([
      { id: 1, ai_score: 99 },
      { id: 2, ai_score: 90 }
    ])

    invalidateItemTotals()
    const { items } = listItems({ sort: 'ai' }, 0, 5)
    expect(items[0].id).toBe(1)
    expect(items[1].id).toBe(2)
    expect(items[0].quality?.overall).toBe(99)
    // 未评分的排在最后
    expect(items[items.length - 1].quality).toBeNull()
  })

  it('ai 分数过滤与未评分过滤走物化列', () => {
    saveQualityScores(
      [{ itemId: 3, composition: 70, exposure: 70, color: 70, sharpness: 70, overall: 70, comment: '' }],
      'test-model'
    )
    invalidateItemTotals()
    expect(listItems({ minAiScore: 60 }, 0, 10).items.map((item) => item.id)).toEqual([3])
    const unscored = listItems({ unscored: true }, 0, 10)
    expect(unscored.total).toBe(299)
    expect(unscored.items.some((item) => item.id === 3)).toBe(false)
  })

  it('堆叠数量一次批量算对', () => {
    getDb()
      .prepare(
        `UPDATE items SET stack_id = 7,
           stack_cover = CASE WHEN id = 1 THEN 1 ELSE 0 END
         WHERE id IN (1, 2, 3)`
      )
      .run()
    invalidateItemTotals()
    const { items } = listItems({ sort: 'added', onlyIds: [1, 2, 3] }, 0, 10)
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe(1)
    expect(items[0].groupCount).toBe(3)
  })
})
