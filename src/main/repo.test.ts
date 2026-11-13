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
const { invalidateItemTotals, listItems } = await import('./repo')

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

  it('ai 排序用 quality_scores 的分数', () => {
    const db = getDb()
    db.prepare('INSERT INTO quality_scores(item_id, overall, updated_at) VALUES(?, ?, ?)').run(
      1,
      99,
      1
    )
    db.prepare('INSERT INTO quality_scores(item_id, overall, updated_at) VALUES(?, ?, ?)').run(
      2,
      90,
      1
    )
    invalidateItemTotals()
    const { items } = listItems({ sort: 'ai' }, 0, 5)
    expect(items[0].id).toBe(1)
    expect(items[1].id).toBe(2)
    expect(items[0].quality?.overall).toBe(99)
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
