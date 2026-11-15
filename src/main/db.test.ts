import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ userData: '' }))
vi.mock('electron', () => ({ app: { getPath: () => state.userData } }))
vi.mock('./logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

const { CURRENT_SCHEMA, closeLibrary, getDb, openLibrary } = await import('./db')

let root = ''

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lunaris-db-'))
  state.userData = join(root, 'userData')
  mkdirSync(state.userData, { recursive: true })
})

afterEach(() => {
  closeLibrary()
  rmSync(root, { recursive: true, force: true })
})

/** 造一个 0.1 时代的老库：没有数据安全列、没有文件夹层级、没有 FTS 内容 */
function createV0Library(dir: string): void {
  mkdirSync(dir, { recursive: true })
  const db = new Database(join(dir, 'library.db'))
  db.exec(`
    CREATE TABLE items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      ext TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      width INTEGER NOT NULL DEFAULT 0,
      height INTEGER NOT NULL DEFAULT 0,
      mtime INTEGER NOT NULL DEFAULT 0,
      added_at INTEGER NOT NULL,
      hash TEXT,
      dominant TEXT,
      color_family TEXT,
      palette TEXT,
      exif TEXT,
      rating INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      url TEXT,
      missing INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      color TEXT NOT NULL DEFAULT '#7aa2f7',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      created_at INTEGER NOT NULL
    );
    INSERT INTO items(path, name, ext, added_at, note)
      VALUES('C:\\old\\moonrise-01.jpg', 'moonrise-01.jpg', '.jpg', 1, '旧库照片');
  `)
  db.pragma('user_version = 0')
  db.close()
}

describe('openLibrary 迁移', () => {
  it('v0 老库能补齐结构、版本与 FTS', () => {
    const library = join(root, 'OldLibrary')
    createV0Library(library)

    openLibrary(library)
    const db = getDb()
    expect(db.pragma('user_version', { simple: true })).toBe(CURRENT_SCHEMA)

    const itemColumns = (db.prepare('PRAGMA table_info(items)').all() as Array<{ name: string }>).map(
      (column) => column.name
    )
    for (const column of ['trashed', 'file_mtime', 'reference', 'xmp_mtime', 'source_url']) {
      expect(itemColumns).toContain(column)
    }
    const folderColumns = (
      db.prepare('PRAGMA table_info(folders)').all() as Array<{ name: string }>
    ).map((column) => column.name)
    for (const column of ['parent_id', 'sort', 'cover_item_id', 'note']) {
      expect(folderColumns).toContain(column)
    }

    // 老库没有 FTS 内容，迁移后要能按长词搜到
    const hit = db
      .prepare(`SELECT rowid FROM items_fts WHERE items_fts MATCH '"moonrise"'`)
      .all() as Array<{ rowid: number }>
    expect(hit).toHaveLength(1)
  })

  it('重复打开同一代老库保持幂等', () => {
    const library = join(root, 'OldLibrary')
    createV0Library(library)
    openLibrary(library)
    closeLibrary()
    openLibrary(library)
    const db = getDb()
    expect(db.pragma('user_version', { simple: true })).toBe(CURRENT_SCHEMA)
    expect((db.prepare('SELECT COUNT(*) AS c FROM items').get() as { c: number }).c).toBe(1)
  })

  it('新库一次建到当前版本', () => {
    const library = join(root, 'NewLibrary')
    openLibrary(library)
    const db = getDb()
    expect(db.pragma('user_version', { simple: true })).toBe(CURRENT_SCHEMA)
    expect(
      (db.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE name = 'facets'").get() as {
        c: number
      }).c
    ).toBe(1)
  })

  it('新库 v5 带人工纠错三列与索引', () => {
    const library = join(root, 'V5Library')
    openLibrary(library)
    const db = getDb()
    expect(db.pragma('user_version', { simple: true })).toBe(5)
    const columns = (
      db.prepare('PRAGMA table_info(person_flags)').all() as Array<{ name: string }>
    ).map((column) => column.name)
    for (const column of ['override', 'override_at', 'override_model']) {
      expect(columns).toContain(column)
    }
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'index' AND name = 'idx_person_flags_override'"
        )
        .get() as { c: number }
    ).toEqual({ c: 1 })
  })

  it('v4 老库只追加 v5，不重跑前四步', () => {
    const library = join(root, 'V4Library')
    createV0Library(library)
    const raw = new Database(join(library, 'library.db'))
    raw.exec(`
      CREATE TABLE IF NOT EXISTS person_flags (
        item_id    INTEGER PRIMARY KEY,
        has_person INTEGER NOT NULL DEFAULT 0,
        score      REAL NOT NULL DEFAULT 0,
        model      TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_person_flags_model ON person_flags(model);
    `)
    raw.pragma('user_version = 4')
    raw.close()

    openLibrary(library)
    const db = getDb()
    expect(db.pragma('user_version', { simple: true })).toBe(5)
    const columns = (
      db.prepare('PRAGMA table_info(person_flags)').all() as Array<{ name: string }>
    ).map((column) => column.name)
    for (const column of ['override', 'override_at', 'override_model']) {
      expect(columns).toContain(column)
    }
  })
})
