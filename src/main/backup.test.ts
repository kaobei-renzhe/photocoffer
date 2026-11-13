import { existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ userData: '' }))
vi.mock('electron', () => ({ app: { getPath: () => state.userData } }))
vi.mock('./logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

const { CURRENT_SCHEMA, closeLibrary, getDb, openLibrary } = await import('./db')
const { createBackup, restoreBackup } = await import('./backup')
const { ZipWriter } = await import('./zip')

let root = ''

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lunaris-backup-'))
  state.userData = join(root, 'userData')
  mkdirSync(state.userData, { recursive: true })
  openLibrary(join(root, 'Library'))
  getDb()
    .prepare('INSERT INTO items(path, name, ext, added_at) VALUES(?, ?, ?, ?)')
    .run('C:\\lib\\one.jpg', 'one.jpg', '.jpg', 1)
})

afterEach(() => {
  closeLibrary()
  rmSync(root, { recursive: true, force: true })
})

function makeZip(file: string, meta: unknown, dbBytes: Buffer): void {
  const writer = new ZipWriter(file)
  writer.addFile('library.db', dbBytes, true)
  writer.addFile('meta.json', Buffer.from(JSON.stringify(meta), 'utf8'), true)
  writer.finish()
}

describe('备份与恢复', () => {
  it('正常备份可以恢复出库文件与缩略图目录', async () => {
    const zip = join(root, 'backup.zip')
    await createBackup(zip, false)
    expect(existsSync(zip)).toBe(true)

    const target = join(root, 'Restored')
    const result = restoreBackup(zip, target)
    expect(result.files).toBeGreaterThan(0)
    expect(existsSync(join(target, 'library.db'))).toBe(true)
  })

  it('拒绝更新版本的备份', () => {
    const zip = join(root, 'future.zip')
    makeZip(zip, { app: 'lunaris', userVersion: CURRENT_SCHEMA + 1 }, Buffer.from('db'))
    expect(() => restoreBackup(zip, join(root, 'Future'))).toThrow(/更新版本/)
  })

  it('拒绝别的应用的备份', () => {
    const zip = join(root, 'other.zip')
    makeZip(zip, { app: 'other-app', userVersion: 1 }, Buffer.from('db'))
    expect(() => restoreBackup(zip, join(root, 'Other'))).toThrow(/不是月相的备份/)
  })

  it('兼容旧版 image-nest 标记', () => {
    const zip = join(root, 'legacy.zip')
    makeZip(zip, { app: 'image-nest', userVersion: 2 }, Buffer.from('db'))
    const result = restoreBackup(zip, join(root, 'Legacy'))
    expect(result.files).toBe(1)
  })
})
