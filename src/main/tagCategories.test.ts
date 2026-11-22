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
const {
  addTagCategory,
  countTagCategoryUsage,
  readCategories,
  removeTagCategory,
  renameTagCategory
} = await import('./tagCategories')

let root = ''

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'photocoffer-categories-'))
  state.userData = join(root, 'userData')
  mkdirSync(state.userData, { recursive: true })
})

afterEach(() => {
  closeLibrary()
  rmSync(root, { recursive: true, force: true })
})

function open(name = 'Library'): void {
  openLibrary(join(root, name))
}

describe('分类类目', () => {
  it('新库种入默认 14 类，顺序与颜色沿用旧版', () => {
    open()
    const categories = readCategories()
    expect(categories).toHaveLength(14)
    expect(categories[0]).toEqual({ name: '风景', color: '#6fcf97' })
    expect(categories.at(-1)).toEqual({ name: '运动', color: '#4ecdc4' })
    const tagNames = (getDb().prepare('SELECT name FROM tags').all() as Array<{ name: string }>).map(
      (row) => row.name
    )
    expect(tagNames).toEqual(expect.arrayContaining(categories.map((item) => item.name)))
    expect(
      getDb()
        .prepare(
          "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'index' AND name = 'idx_auto_tags_category'"
        )
        .get()
    ).toEqual({ c: 1 })
  })

  it('新增去空格、拒绝重名与非法字符，最多 30 个', () => {
    open()
    expect(addTagCategory('  宠物  ').at(-1)?.name).toBe('宠物')
    expect(getDb().prepare("SELECT name FROM tags WHERE name = '宠物'").get()).toEqual({
      name: '宠物'
    })
    expect(() => addTagCategory('宠物')).toThrow(/已经存在/)
    expect(() => addTagCategory('')).toThrow(/不能为空/)
    expect(() => addTagCategory('一二三四五六七八九十一二三')).toThrow(/最多 12 个字/)
    expect(() => addTagCategory('宠物,猫')).toThrow(/换行或逗号/)
    expect(() => addTagCategory('Pet')).not.toThrow()
    expect(() => addTagCategory('pet')).toThrow(/已经存在/)

    for (let index = 0; index < 14; index++) addTagCategory(`补充类目${index}`)
    expect(readCategories()).toHaveLength(30)
    expect(() => addTagCategory('第三十一个')).toThrow(/最多 30 个/)
  })

  it('改名同步 auto_tags 与 tags 两张表', () => {
    open()
    const db = getDb()
    db.prepare(
      "INSERT INTO auto_tags(item_id, category, score, model) VALUES(1, '风景', 0.8, 'test')"
    ).run()

    renameTagCategory('风景', '风光')

    expect(db.prepare('SELECT category FROM auto_tags WHERE item_id = 1').get()).toEqual({
      category: '风光'
    })
    expect(db.prepare("SELECT name FROM tags WHERE name = '风光'").get()).toEqual({
      name: '风光'
    })
    expect(readCategories().some((item) => item.name === '风光')).toBe(true)
    expect(readCategories().some((item) => item.name === '风景')).toBe(false)

    db.prepare("INSERT INTO tags(name, color, created_at) VALUES('已有标签', '#7aa2f7', 2)").run()
    expect(() => renameTagCategory('风光', '已有标签')).toThrow(/同名标签/)
  })

  it('删除只删类目配置，保留 auto_tags 历史标注并返回数量', () => {
    open()
    const db = getDb()
    const insert = db.prepare(
      'INSERT INTO auto_tags(item_id, category, score, model) VALUES(?, ?, 0.8, ?)'
    )
    insert.run(1, '人像', 'test')
    insert.run(2, '人像', 'test')
    expect(countTagCategoryUsage('人像')).toBe(2)

    const result = removeTagCategory('人像')

    expect(result.removed).toBe(2)
    expect(result.categories.some((item) => item.name === '人像')).toBe(false)
    expect(db.prepare("SELECT name FROM tags WHERE name = '人像'").get()).toBeUndefined()
    expect(
      db.prepare("SELECT COUNT(*) AS c FROM auto_tags WHERE category = '人像'").get()
    ).toEqual({ c: 2 })
  })

  it('删除类目只摘自动关联，手动标签关联保留', () => {
    open()
    const db = getDb()
    db.prepare(
      "INSERT INTO auto_tags(item_id, category, score, model) VALUES(1, '人像', 0.8, 'test')"
    ).run()
    const tag = db.prepare("SELECT id FROM tags WHERE name = '人像'").get() as { id: number }
    db.prepare('INSERT INTO item_tags(item_id, tag_id) VALUES(1, ?), (3, ?)').run(tag.id, tag.id)

    removeTagCategory('人像')

    expect(
      db.prepare('SELECT item_id FROM item_tags WHERE tag_id = ? ORDER BY item_id').all(tag.id)
    ).toEqual([{ item_id: 3 }])
    expect(db.prepare('SELECT name FROM tags WHERE id = ?').get(tag.id)).toEqual({ name: '人像' })
    expect(
      db.prepare("SELECT COUNT(*) AS c FROM auto_tags WHERE category = '人像'").get()
    ).toEqual({ c: 1 })
  })

  it('至少保留一个类目', () => {
    open()
    const names = readCategories().map((item) => item.name)
    names.slice(1).forEach((name) => removeTagCategory(name))
    expect(readCategories()).toHaveLength(1)
    expect(() => removeTagCategory(names[0])).toThrow(/至少/)
  })

  it('v6 老库升级后补 14 类，已有标注不丢', () => {
    open('Old')
    const db = getDb()
    db.prepare(
      "INSERT INTO auto_tags(item_id, category, score, model) VALUES(1, '风景', 0.8, 'test')"
    ).run()
    // 模拟还没有 tag_categories 的老库
    db.exec('DROP TABLE tag_categories')
    db.pragma('user_version = 6')
    closeLibrary()

    open('Old')
    expect(readCategories()).toHaveLength(14)
    expect(
      getDb().prepare("SELECT COUNT(*) AS c FROM auto_tags WHERE category = '风景'").get()
    ).toEqual({ c: 1 })
  })

  it('类目按图库隔离', () => {
    open('A')
    addTagCategory('宠物')
    expect(readCategories()).toHaveLength(15)

    open('B')
    expect(readCategories()).toHaveLength(14)
    expect(readCategories().some((item) => item.name === '宠物')).toBe(false)

    open('A')
    expect(readCategories().some((item) => item.name === '宠物')).toBe(true)
  })
})
