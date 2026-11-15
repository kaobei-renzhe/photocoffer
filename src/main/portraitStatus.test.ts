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
const { portraitStatus } = await import('./portrait')

const MODEL_TAG = 'detr-resnet-50-int8-640'
let root = ''

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cunzhao-portrait-status-'))
  state.userData = join(root, 'userData')
  mkdirSync(state.userData, { recursive: true })
})

afterEach(() => {
  closeLibrary()
  rmSync(root, { recursive: true, force: true })
})

describe('portraitStatus 统计口径', () => {
  it('四项单列 + likely + unresolved 一次算清', () => {
    const library = join(root, 'Library')
    openLibrary(library)
    const db = getDb()
    for (let i = 1; i <= 5; i++) {
      db.prepare('INSERT INTO items(path, name, ext, added_at) VALUES (?, ?, ?, ?)').run(
        `C:\\photos\\${i}.jpg`,
        `${i}.jpg`,
        '.jpg',
        i
      )
    }
    const insertFlag = db.prepare(
      `INSERT INTO person_flags(item_id, has_person, score, model, updated_at, override, override_at, override_model)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    insertFlag.run(1, 1, 0.9, MODEL_TAG, 1, null, null, null)
    insertFlag.run(2, 1, 0.6, MODEL_TAG, 1, null, null, null)
    insertFlag.run(3, 1, 0.9, 'old-model', 1, 1, 1, 'old-model')
    insertFlag.run(5, 1, 0.9, MODEL_TAG, 1, 0, 1, MODEL_TAG)

    const status = portraitStatus()
    expect(status.total).toBe(5)
    expect(status.detected).toBe(3)
    expect(status.confirmedByModel).toBe(1)
    expect(status.confirmedByHuman).toBe(1)
    expect(status.excludedByHuman).toBe(1)
    expect(status.staleOverrides).toBe(1)
    expect(status.likely).toBe(1)
    expect(status.unresolved).toBe(1)
  })
})
