/**
 * 3 万条规模下的查询基准：对比修复前的写法与修复后的写法。
 * 只跑 SQL 层，不依赖 Electron；用来验证：
 *  - 深分页不再每页重算 COUNT
 *  - ai 排序从相关子查询改成 LEFT JOIN
 *  - 堆叠计数从 N 次查询改成一次 GROUP BY
 */
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'

const ROWS = 30_000
const STACKS = 30
const root = mkdtempSync(join(tmpdir(), 'lunaris-bench-'))
const file = join(root, 'bench.db')
const db = new Database(file)
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')

db.exec(`
  CREATE TABLE items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    ext TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    added_at INTEGER NOT NULL,
    mtime INTEGER NOT NULL DEFAULT 0,
    rating INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    url TEXT,
    trashed INTEGER NOT NULL DEFAULT 0,
    missing INTEGER NOT NULL DEFAULT 0,
    pair_key TEXT,
    pair_cover INTEGER NOT NULL DEFAULT 0,
    burst_key TEXT,
    burst_cover INTEGER NOT NULL DEFAULT 0,
    stack_id INTEGER,
    stack_cover INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_items_added ON items(added_at DESC);
  CREATE INDEX idx_items_pair ON items(pair_key);
  CREATE INDEX idx_items_burst ON items(burst_key);
  CREATE INDEX idx_items_stack ON items(stack_id);
  CREATE TABLE tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL);
  CREATE TABLE item_tags (
    item_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (item_id, tag_id)
  );
  CREATE INDEX idx_item_tags_tag ON item_tags(tag_id);
  CREATE TABLE quality_scores (
    item_id INTEGER PRIMARY KEY,
    overall INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX idx_quality_overall ON quality_scores(overall DESC);
  CREATE VIRTUAL TABLE items_fts USING fts5(
    name, note, url,
    content='items',
    content_rowid='id',
    tokenize='trigram'
  );
`)

const insert = db.prepare(
  `INSERT INTO items(path, name, ext, size, added_at, mtime, rating, note, stack_id, stack_cover)
   VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
)
const score = db.prepare('INSERT INTO quality_scores(item_id, overall, updated_at) VALUES(?, ?, ?)')
const link = db.prepare('INSERT INTO item_tags(item_id, tag_id) VALUES(?, ?)')

db.transaction(() => {
  for (let i = 0; i < 20; i++) db.prepare('INSERT INTO tags(name) VALUES(?)').run(`标签${i}`)
  for (let i = 1; i <= ROWS; i++) {
    const stack = i <= STACKS * 100 ? Math.floor((i - 1) / 100) + 1 : null
    insert.run(
      `C:\\bench\\photo-${i}.jpg`,
      `photo-${i}.jpg`,
      '.jpg',
      2_000_000 + i,
      i,
      1_700_000_000_000 + i * 1000,
      i % 6,
      `第 ${i} 张`,
      stack,
      stack && i % 100 === 1 ? 1 : 0
    )
    score.run(i, i % 101, 1)
    link.run(i, (i % 20) + 1)
    if (i % 3 === 0) link.run(i, ((i + 7) % 20) + 1)
  }
})()
db.exec("INSERT INTO items_fts(items_fts) VALUES('rebuild')")

const WHERE = `i.trashed = 0 AND i.missing = 0
  AND (i.pair_key IS NULL OR i.pair_cover = 1)
  AND (i.burst_key IS NULL OR i.burst_cover = 1)
  AND (i.stack_id IS NULL OR i.stack_cover = 1)
  AND EXISTS (SELECT 1 FROM item_tags it WHERE it.item_id = i.id AND it.tag_id IN (1, 2))`

function measure(fn, runs = 5) {
  const times = []
  for (let i = 0; i < runs; i++) {
    const started = performance.now()
    fn()
    times.push(performance.now() - started)
  }
  times.sort((a, b) => a - b)
  return {
    median: times[Math.floor(times.length / 2)],
    p95: times[Math.min(times.length - 1, Math.floor(times.length * 0.95))]
  }
}

const pageQuery = db.prepare(`SELECT i.* FROM items i WHERE ${WHERE} ORDER BY i.added_at DESC LIMIT 200 OFFSET ?`)
const countQuery = db.prepare(`SELECT COUNT(*) AS c FROM items i WHERE ${WHERE}`)
const aiOld = db.prepare(
  `SELECT i.* FROM items i WHERE ${WHERE}
   ORDER BY coalesce((SELECT qs.overall FROM quality_scores qs WHERE qs.item_id = i.id), -1) DESC,
            i.added_at DESC
   LIMIT 200`
)
const aiNew = db.prepare(
  `SELECT i.* FROM items i LEFT JOIN quality_scores qs ON qs.item_id = i.id
   WHERE ${WHERE}
   ORDER BY coalesce(qs.overall, -1) DESC, i.added_at DESC
   LIMIT 200`
)
const stackOld = db.prepare(
  'SELECT COUNT(*) AS c FROM items WHERE trashed = 0 AND missing = 0 AND stack_id = ?'
)
const stackNew = db.prepare(
  `SELECT stack_id, COUNT(*) AS c FROM items
   WHERE trashed = 0 AND missing = 0 AND stack_id IN (${Array.from({ length: STACKS }, () => '?').join(',')})
   GROUP BY stack_id`
)

const countOnce = measure(() => countQuery.get())
const shallowOld = measure(() => {
  countQuery.get()
  pageQuery.all(0)
})
const shallowNew = measure(() => {
  countQuery.get()
  pageQuery.all(0)
})
const deepOld = measure(() => {
  countQuery.get()
  pageQuery.all(29_800)
})
const deepNew = measure(() => {
  pageQuery.all(29_800)
})
const aiOldResult = measure(() => aiOld.all())
const aiNewResult = measure(() => aiNew.all())
const stackIds = Array.from({ length: STACKS }, (_, i) => i + 1)
const stackOldResult = measure(() => {
  for (const id of stackIds) stackOld.get(id)
})
const stackNewResult = measure(() => {
  stackNew.all(...stackIds)
})

const fmt = (result) => `P50 ${result.median.toFixed(2)}ms / P95 ${result.p95.toFixed(2)}ms`
const rows = [
  ['COUNT(*)', fmt(countOnce)],
  ['首页（COUNT + 200 条）', fmt(shallowNew)],
  ['深页 offset 29800（旧：每页 COUNT）', fmt(deepOld)],
  ['深页 offset 29800（新：复用总数）', fmt(deepNew)],
  ['ai 排序（旧：相关子查询）', fmt(aiOldResult)],
  ['ai 排序（新：LEFT JOIN）', fmt(aiNewResult)],
  [`堆叠计数 ${STACKS} 组（旧：逐组查询）`, fmt(stackOldResult)],
  [`堆叠计数 ${STACKS} 组（新：一次 GROUP BY）`, fmt(stackNewResult)]
]

console.log(`图库规模：${ROWS} 张，标签关系 ${ROWS + Math.floor(ROWS / 3)} 条\n`)
for (const [name, value] of rows) console.log(`${name.padEnd(38)} ${value}`)
console.log(`\nai 排序提升：${(aiOldResult.median / Math.max(0.01, aiNewResult.median)).toFixed(1)}×`)
console.log(`深页提升：${(deepOld.median / Math.max(0.01, deepNew.median)).toFixed(1)}×`)
console.log(
  `堆叠计数提升：${(stackOldResult.median / Math.max(0.01, stackNewResult.median)).toFixed(1)}×`
)

db.close()
rmSync(root, { recursive: true, force: true })
