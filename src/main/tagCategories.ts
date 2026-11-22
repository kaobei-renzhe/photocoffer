import type { AutoTagCategory, AutoTagCategoryRemoveResult } from '../shared/types'
import {
  normalizeTagCategoryName,
  TAG_CATEGORY_LIMIT
} from '../shared/tagCategories'
import { getDb } from './db'
import { CATEGORY_COLORS } from './tagCategoryDefaults'

/** 当前图库的类目表；排序跟着 sort_order，新增的永远排在最后 */
export function readCategories(): AutoTagCategory[] {
  return getDb()
    .prepare('SELECT name, color FROM tag_categories ORDER BY sort_order, created_at')
    .all() as AutoTagCategory[]
}

/** 某个类目下已有多少张照片的自动标注；删除前给界面提示用 */
export function countTagCategoryUsage(raw: string): number {
  const name = String(raw ?? '').trim()
  if (!name) return 0
  const row = getDb()
    .prepare('SELECT COUNT(*) AS c FROM auto_tags WHERE category = ?')
    .get(name) as { c: number }
  return row.c
}

function sameName(left: string, right: string): boolean {
  return left.toLocaleLowerCase() === right.toLocaleLowerCase()
}

function nextSortOrder(): number {
  const row = getDb()
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS max FROM tag_categories')
    .get() as { max: number }
  return row.max + 1
}

export function addTagCategory(raw: string): AutoTagCategory[] {
  const name = normalizeTagCategoryName(raw)
  const categories = readCategories()
  if (categories.length >= TAG_CATEGORY_LIMIT) {
    throw new Error(`分类类目最多 ${TAG_CATEGORY_LIMIT} 个`)
  }
  if (categories.some((item) => sameName(item.name, name))) {
    throw new Error('这个类目已经存在')
  }
  const existingTag = getDb()
    .prepare('SELECT facet_id AS facetId FROM tags WHERE name = ?')
    .get(name) as { facetId: string | null } | undefined
  // 人像维度标签有自己的归属，别把类目挂上去，否则删除类目会误删维度
  if (existingTag?.facetId) throw new Error('已有同名的人像分类标签，换个名字')
  const sortOrder = nextSortOrder()
  const color = CATEGORY_COLORS[sortOrder % CATEGORY_COLORS.length]
  const db = getDb()
  const now = Date.now()
  const tx = db.transaction(() => {
    db.prepare(
      'INSERT INTO tag_categories (name, color, sort_order, created_at) VALUES (?, ?, ?, ?)'
    ).run(name, color, sortOrder, now)
    // 类目也是标签；先建一个 0 张的标签，左侧栏立刻能看到
    db.prepare('INSERT OR IGNORE INTO tags (name, color, created_at) VALUES (?, ?, ?)').run(
      name,
      color,
      now
    )
  })
  tx()
  return readCategories()
}

export function renameTagCategory(fromRaw: string, toRaw: string): AutoTagCategory[] {
  const from = normalizeTagCategoryName(fromRaw)
  const to = normalizeTagCategoryName(toRaw)
  const categories = readCategories()
  if (!categories.some((item) => item.name === from)) {
    throw new Error('要改名的类目不存在')
  }
  if (from === to) return categories
  if (categories.some((item) => item.name !== from && sameName(item.name, to))) {
    throw new Error('这个类目已经存在')
  }

  const db = getDb()
  // 类目名同时是标签名；目标名被普通标签占用时拒绝，避免把两批照片混在一起
  if (db.prepare('SELECT 1 FROM tags WHERE name = ?').get(to)) {
    throw new Error('已经有同名标签，换个名字')
  }
  const tx = db.transaction(() => {
    // 两个坑都要一起处理：auto_tags 的历史标注与 tags 的可见标签
    db.prepare('UPDATE auto_tags SET category = ? WHERE category = ?').run(to, from)
    db.prepare('UPDATE tags SET name = ? WHERE name = ?').run(to, from)
    db.prepare('UPDATE tag_categories SET name = ? WHERE name = ?').run(to, from)
  })
  tx()
  return readCategories()
}

/** 只删类目配置；auto_tags 里的历史标注保留，照片会显示为未分类 */
export function removeTagCategory(raw: string): AutoTagCategoryRemoveResult {
  const name = normalizeTagCategoryName(raw)
  const categories = readCategories()
  if (!categories.some((item) => item.name === name)) {
    throw new Error('要删除的类目不存在')
  }
  if (categories.length <= 1) throw new Error('至少要保留一个类目')
  const removed = countTagCategoryUsage(name)
  const db = getDb()
  const tag = db.prepare('SELECT id, facet_id AS facetId FROM tags WHERE name = ?').get(name) as
    | { id: number; facetId: string | null }
    | undefined
  const tx = db.transaction(() => {
    // 只摘掉自动分类产生的关联；手动给这个标签打的照片保留
    if (tag?.facetId === null) {
      db.prepare(
        `DELETE FROM item_tags
          WHERE tag_id = ?
            AND item_id IN (SELECT item_id FROM auto_tags WHERE category = ?)`
      ).run(tag.id, name)
      const remaining = db.prepare('SELECT 1 FROM item_tags WHERE tag_id = ? LIMIT 1').get(tag.id)
      if (!remaining) db.prepare('DELETE FROM tags WHERE id = ?').run(tag.id)
    }
    // auto_tags 里的历史标注保留，照片在类目视图里显示为未分类
    db.prepare('DELETE FROM tag_categories WHERE name = ?').run(name)
  })
  tx()
  return { removed, categories: readCategories() }
}

/** 按传入顺序重写 sort_order；当前没有拖拽 UI，接口先留着 */
export function reorderTagCategories(names: string[]): AutoTagCategory[] {
  const db = getDb()
  const update = db.prepare('UPDATE tag_categories SET sort_order = ? WHERE name = ?')
  const tx = db.transaction(() => {
    names.forEach((name, index) => update.run(index, name))
  })
  tx()
  return readCategories()
}
