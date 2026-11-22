import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = new Database(':memory:')
let categories = [{ name: '人像', color: '#e8b45a' }]

vi.mock('electron', () => ({ app: { getPath: () => '' } }))
vi.mock('./db', () => ({ getDb: () => db }))
vi.mock('./tagCategories', () => ({ readCategories: () => categories }))
vi.mock('./repo', () => ({ getItemFile: () => null, thumbPathFor: () => '' }))
vi.mock('./logger', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const { portraitFlags } = await import('./portrait')

beforeEach(() => {
  categories = [{ name: '人像', color: '#e8b45a' }]
  db.exec(`
    DROP TABLE IF EXISTS items;
    DROP TABLE IF EXISTS person_flags;
    DROP TABLE IF EXISTS auto_tags;
    CREATE TABLE items (id INTEGER PRIMARY KEY);
    CREATE TABLE person_flags (
      item_id INTEGER PRIMARY KEY,
      has_person INTEGER NOT NULL DEFAULT 0,
      score REAL NOT NULL DEFAULT 0,
      model TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      override INTEGER,
      override_at INTEGER,
      override_model TEXT
    );
    CREATE TABLE auto_tags (
      item_id INTEGER PRIMARY KEY,
      category TEXT NOT NULL,
      score REAL NOT NULL,
      model TEXT NOT NULL
    );
    INSERT INTO items(id) VALUES (1), (2), (3), (4), (5), (6), (7);
  `)
})

describe('portraitFlags 降级链', () => {
  it('override > 模型 has_person > 自动分类「人像」', () => {
    const personFlag = db.prepare(
      'INSERT INTO person_flags(item_id, has_person, score, model, updated_at, override) VALUES (?, ?, ?, ?, 1, ?)'
    )
    const autoTag = db.prepare(
      "INSERT INTO auto_tags(item_id, category, score, model) VALUES (?, '人像', 0.4, 'clip')"
    )
    personFlag.run(1, 1, 0.9, 'detr', 0) // 人工排除，压过模型与自动分类
    personFlag.run(2, 1, 0.9, 'detr', null) // 模型确认
    autoTag.run(3)
    personFlag.run(5, 0, 0, '', 1) // 只有人工确认
    personFlag.run(6, 0, 0, 'detr', null) // 模型明确排除，压过自动分类
    autoTag.run(6)

    const flags = new Map(portraitFlags([1, 2, 3, 4, 5, 6, 7]).map((flag) => [flag.id, flag]))
    expect(flags.get(1)).toMatchObject({ verdict: 'no-person', source: 'human', override: 0 })
    expect(flags.get(2)).toMatchObject({ verdict: 'person', source: 'model' })
    expect(flags.get(3)).toMatchObject({ verdict: 'likely', source: 'autoTag' })
    expect(flags.has(4)).toBe(false)
    expect(flags.get(5)).toMatchObject({ verdict: 'person', source: 'human', override: 1 })
    expect(flags.get(6)).toMatchObject({ verdict: 'no-person', source: 'model' })
    expect(flags.has(7)).toBe(false)
  })

  it('「人像」类目被改名后，退化为包含「人像」的类目', () => {
    categories = [{ name: '人像摄影', color: '#e8b45a' }]
    db.prepare(
      "INSERT INTO auto_tags(item_id, category, score, model) VALUES (7, '人像摄影', 0.4, 'clip')"
    ).run()

    expect(portraitFlags([7])[0]).toMatchObject({ verdict: 'likely', source: 'autoTag' })
  })
})
