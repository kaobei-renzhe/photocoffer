import Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '' } }))

const {
  personScoreFromLogits,
  verdictFromScore,
  flagsForScan,
  authoritativeHasPerson,
  PORTRAIT_UPSERT_SQL
} = await import('./portrait')

const CLASSES = 92
const PERSON = 1

function logitsOf(rows: Array<Record<number, number>>): Float32Array {
  const data = new Float32Array(rows.length * CLASSES)
  rows.forEach((row, q) => {
    for (const [cls, value] of Object.entries(row)) data[q * CLASSES + Number(cls)] = value
  })
  return data
}

describe('personScoreFromLogits', () => {
  it('只认 argmax 是 person 的 query', () => {
    const data = logitsOf([
      { [PERSON]: 4 },
      // person 分数不低，但 argmax 是猫，不能算人像
      { [PERSON]: 5, 17: 6 },
      { 91: 7 }
    ])
    expect(personScoreFromLogits(data, 3, CLASSES)).toBeCloseTo(0.982, 2)
  })

  it('没有 person query 时返回 0', () => {
    const data = logitsOf([{ 91: 8 }, { 3: 6 }])
    expect(personScoreFromLogits(data, 2, CLASSES)).toBe(0)
  })

  it('多个人像 query 取最高分', () => {
    const data = logitsOf([{ [PERSON]: 0.5 }, { [PERSON]: 3 }])
    expect(personScoreFromLogits(data, 2, CLASSES)).toBeCloseTo(0.953, 2)
  })
})

describe('verdictFromScore', () => {
  it('双阈值边界', () => {
    expect(verdictFromScore(0.4999)).toBe('no-person')
    expect(verdictFromScore(0.5)).toBe('likely')
    expect(verdictFromScore(0.7999)).toBe('likely')
    expect(verdictFromScore(0.8)).toBe('person')
    expect(verdictFromScore(1)).toBe('person')
  })

  it('检测成功但没人不是 unresolved', () => {
    expect(verdictFromScore(0)).toBe('no-person')
  })
})

describe('flagsForScan', () => {
  it('取不到源记为 unresolved + no-source', () => {
    expect(flagsForScan({ source: false })).toEqual({
      verdict: 'unresolved',
      reason: 'no-source',
      score: 0
    })
  })

  it('检测抛错记为 unresolved + error', () => {
    expect(flagsForScan({ source: true, error: true })).toEqual({
      verdict: 'unresolved',
      reason: 'error',
      score: 0
    })
  })

  it('有分数时按双阈值判', () => {
    expect(flagsForScan({ source: true, score: 0.6 }).verdict).toBe('likely')
    expect(flagsForScan({ source: true, score: 0.9 }).verdict).toBe('person')
  })
})

describe('authoritativeHasPerson', () => {
  it('人工结论优先于模型结论', () => {
    expect(authoritativeHasPerson({ verdict: 'person', override: 0 })).toBe(false)
    expect(authoritativeHasPerson({ verdict: 'no-person', override: 1 })).toBe(true)
    expect(authoritativeHasPerson({ verdict: 'unresolved', override: 1 })).toBe(true)
    expect(authoritativeHasPerson({ verdict: 'no-person', override: null })).toBe(false)
  })
})

describe('PORTRAIT_UPSERT_SQL', () => {
  it('SET 清单不含 override 三列，且模型四列都在', () => {
    const set = PORTRAIT_UPSERT_SQL.split('DO UPDATE SET')[1]
    expect(set).not.toMatch(/override/)
    for (const column of ['has_person', 'score', 'model', 'updated_at']) {
      expect(set).toContain(column)
    }
  })

  it('重扫不会覆盖人工结论', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE person_flags (
        item_id INTEGER PRIMARY KEY,
        has_person INTEGER NOT NULL DEFAULT 0,
        score REAL NOT NULL DEFAULT 0,
        model TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        override INTEGER,
        override_at INTEGER,
        override_model TEXT
      )
    `)
    db.prepare(
      'INSERT INTO person_flags(item_id, has_person, score, model, updated_at, override, override_at, override_model) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(1, 0, 0, 'old-model', 1, 0, 1, 'old-model')
    db.prepare(PORTRAIT_UPSERT_SQL).run(1, 1, 0.99, 'new-model', 2)
    const row = db
      .prepare('SELECT has_person, override, override_model FROM person_flags WHERE item_id = 1')
      .get() as { has_person: number; override: number; override_model: string }
    expect(row.has_person).toBe(1)
    expect(row.override).toBe(0)
    expect(row.override_model).toBe('old-model')
    db.close()
  })
})
