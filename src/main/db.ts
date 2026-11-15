import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, unlinkSync } from 'node:fs'
import Database from 'better-sqlite3'
import { log } from './logger'
import { getIndexDirFor } from './settings'

let db: Database.Database | null = null
let libraryPath = ''
let indexPath = ''

/**
 * 结构化 schema 版本，存在 SQLite 的 `PRAGMA user_version` 里。
 * 1 = 基础表；2 = 数据安全与配对/堆叠基础；3 = 文件夹层级与后续批次；4 = 人像检测缓存；
 * 5 = 人像人工纠错（override 三列）。
 * 以后每次加表 / 加列都必须 +1 并在 MIGRATION_STEPS 里补一步。
 */
export const CURRENT_SCHEMA = 5

/** 迁移步骤必须幂等：老库可能从任意版本开始，补齐缺失的表与列即可收敛 */
const SCHEMA = /* sql */ `
CREATE TABLE IF NOT EXISTS items (
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
CREATE INDEX IF NOT EXISTS idx_items_added ON items(added_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_hash ON items(hash);
CREATE INDEX IF NOT EXISTS idx_items_family ON items(color_family);
CREATE INDEX IF NOT EXISTS idx_items_rating ON items(rating);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  color TEXT NOT NULL DEFAULT '#7aa2f7',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS item_tags (
  item_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (item_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_item_tags_tag ON item_tags(tag_id);

CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL,
  parent_id INTEGER,
  sort INTEGER NOT NULL DEFAULT 0,
  cover_item_id INTEGER,
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS item_folders (
  item_id INTEGER NOT NULL,
  folder_id INTEGER NOT NULL,
  PRIMARY KEY (item_id, folder_id)
);

CREATE TABLE IF NOT EXISTS smart_folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  filter TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT UNIQUE NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
  name, note, url,
  content='items',
  content_rowid='id',
  tokenize='trigram'
);

CREATE TRIGGER IF NOT EXISTS items_ai AFTER INSERT ON items BEGIN
  INSERT INTO items_fts(rowid, name, note, url)
  VALUES (new.id, new.name, new.note, coalesce(new.url, ''));
END;

CREATE TRIGGER IF NOT EXISTS items_ad AFTER DELETE ON items BEGIN
  INSERT INTO items_fts(items_fts, rowid, name, note, url)
  VALUES ('delete', old.id, old.name, old.note, coalesce(old.url, ''));
END;

CREATE TRIGGER IF NOT EXISTS items_au AFTER UPDATE ON items BEGIN
  INSERT INTO items_fts(items_fts, rowid, name, note, url)
  VALUES ('delete', old.id, old.name, old.note, coalesce(old.url, ''));
  INSERT INTO items_fts(rowid, name, note, url)
  VALUES (new.id, new.name, new.note, coalesce(new.url, ''));
END;

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
`

function ensureColumn(
  db: Database.Database,
  table: string,
  column: string,
  definition: string
): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`)
  }
}

/** v1：基础表与索引 */
function migrationV1(db: Database.Database): void {
  db.exec(SCHEMA)
  // 老库里的行从没进过 FTS 索引；后面的 UPDATE 会触发 FTS 的 delete，
  // 找不到索引行时 SQLite 会报 database disk image is malformed，所以先按内容表重建一次
  try {
    db.prepare("INSERT INTO items_fts(items_fts) VALUES('rebuild')").run()
  } catch (error) {
    throw new Error(`FTS 索引重建失败：${(error as Error).message}`)
  }
}

/** v2：数据安全、配对/连拍/堆叠、语义索引、自动分类与 AI 评分 */
function migrationV2(db: Database.Database): void {
  ensureColumn(db, 'items', 'trashed', 'trashed INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'sources', 'recursive', 'recursive INTEGER NOT NULL DEFAULT 1')
  ensureColumn(db, 'items', 'flag', 'flag INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'items', 'is_raw', 'is_raw INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'items', 'pair_key', 'pair_key TEXT')
  ensureColumn(db, 'items', 'pair_cover', 'pair_cover INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'items', 'burst_key', 'burst_key TEXT')
  ensureColumn(db, 'items', 'burst_cover', 'burst_cover INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'items', 'stack_id', 'stack_id INTEGER')
  ensureColumn(db, 'items', 'stack_cover', 'stack_cover INTEGER NOT NULL DEFAULT 0')
  // 源文件所在目录（用于按原文件夹结构展示）与导入失败原因
  ensureColumn(db, 'items', 'dir', 'dir TEXT')
  ensureColumn(db, 'items', 'error', 'error TEXT')
  // 文件本身的修改时间（mtime 列存的是拍摄时间），用于「刷新图库」识别被覆盖修改的照片
  ensureColumn(db, 'items', 'file_mtime', 'file_mtime INTEGER NOT NULL DEFAULT 0')

  db.exec(`
    CREATE TABLE IF NOT EXISTS stacks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      created_at INTEGER NOT NULL
    );
    -- 每张图每个模型一条向量：换模型时旧索引保留，重建不会互相覆盖
    CREATE TABLE IF NOT EXISTS embeddings (
      item_id INTEGER NOT NULL,
      model TEXT NOT NULL,
      dim INTEGER NOT NULL,
      vec BLOB NOT NULL,
      PRIMARY KEY (item_id, model)
    );
    CREATE TABLE IF NOT EXISTS auto_tags (
      item_id INTEGER PRIMARY KEY,
      category TEXT NOT NULL,
      score REAL NOT NULL,
      model TEXT NOT NULL
    );
    -- 大模型评分结果：与 items 分表，避免每次加能力都 ALTER 主表
    CREATE TABLE IF NOT EXISTS quality_scores (
      item_id INTEGER PRIMARY KEY,
      composition INTEGER NOT NULL DEFAULT 0,
      exposure INTEGER NOT NULL DEFAULT 0,
      color INTEGER NOT NULL DEFAULT 0,
      sharpness INTEGER NOT NULL DEFAULT 0,
      overall INTEGER NOT NULL DEFAULT 0,
      comment TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_quality_overall ON quality_scores(overall DESC);
    CREATE INDEX IF NOT EXISTS idx_items_flag ON items(flag);
    CREATE INDEX IF NOT EXISTS idx_items_pair ON items(pair_key);
    CREATE INDEX IF NOT EXISTS idx_items_burst ON items(burst_key);
    CREATE INDEX IF NOT EXISTS idx_items_stack ON items(stack_id);
    CREATE INDEX IF NOT EXISTS idx_items_dir ON items(dir);
    CREATE INDEX IF NOT EXISTS idx_items_size ON items(size);
  `)
}

/** 迁移步骤内的分段执行：报错时能指出是哪一段，方便定位坏库 */
function subStep(name: string, run: () => void): void {
  try {
    run()
  } catch (error) {
    throw new Error(`${name}：${(error as Error).message}`)
  }
}

/** v3：文件夹层级、人像维度、研读笔记、选片会话 */
function migrationV3(db: Database.Database): void {
  subStep('补标签/文件夹列', () => {
    // 人像维度的标签归属；NULL 表示普通标签，老数据零迁移
    ensureColumn(db, 'tags', 'facet_id', 'facet_id TEXT')
    // 标签的多级树：NULL 表示顶层标签
    ensureColumn(db, 'tags', 'parent_id', 'parent_id INTEGER')
    // 文件夹层级：父子关系、同级排序、封面与备注
    ensureColumn(db, 'folders', 'parent_id', 'parent_id INTEGER')
    ensureColumn(db, 'folders', 'sort', 'sort INTEGER NOT NULL DEFAULT 0')
    ensureColumn(db, 'folders', 'cover_item_id', 'cover_item_id INTEGER')
    ensureColumn(db, 'folders', 'note', "note TEXT NOT NULL DEFAULT ''")
  })

  subStep('补 items 的研读/侧车列', () => {
    // 参考片标记：1 = 收藏的参考作品（走研读流程），0 = 自己拍的（走复盘流程）
    ensureColumn(db, 'items', 'reference', 'reference INTEGER NOT NULL DEFAULT 0')
    // 上次写入/读取 XMP 侧车时记录的 mtime，用来发现外部软件改过
    ensureColumn(db, 'items', 'xmp_mtime', 'xmp_mtime INTEGER NOT NULL DEFAULT 0')
    // 从网址拖进来的照片记下来源，方便以后追溯；普通导入为 NULL
    ensureColumn(db, 'items', 'source_url', 'source_url TEXT')
  })

  subStep('建人像/研读/选片表', () => {
    db.exec(`
    -- 人像工作台的维度定义：加维度不用改代码
    CREATE TABLE IF NOT EXISTS facets (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      multi       INTEGER NOT NULL DEFAULT 1,
      auto_source TEXT,
      sort        INTEGER NOT NULL DEFAULT 0,
      builtin     INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_tags_facet ON tags(facet_id);
    CREATE INDEX IF NOT EXISTS idx_tags_parent ON tags(parent_id);

    -- 照片研读笔记：圈选区域锚定 + 追问线程 + 研读/复盘双模式
    -- region 存归一化坐标（0-1），换缩略图/大图/导出图都不用换算
    CREATE TABLE IF NOT EXISTS photo_notes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id    INTEGER NOT NULL,
      parent_id  INTEGER,
      kind       TEXT NOT NULL,
      mode       TEXT NOT NULL DEFAULT 'study',
      body       TEXT NOT NULL,
      region     TEXT,
      author     TEXT NOT NULL,
      tags       TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_photo_notes_item ON photo_notes(item_id, id);
    CREATE INDEX IF NOT EXISTS idx_photo_notes_parent ON photo_notes(parent_id);

    -- 客户选片：一次导出 = 一个会话；序号 ↔ 照片的映射在导出时写入
    CREATE TABLE IF NOT EXISTS pick_sessions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      token        TEXT UNIQUE,
      title        TEXT NOT NULL,
      client       TEXT NOT NULL DEFAULT '',
      photo_count  INTEGER NOT NULL DEFAULT 0,
      watermark    TEXT NOT NULL DEFAULT '',
      file_path    TEXT,
      client_note  TEXT NOT NULL DEFAULT '',
      reply_count  INTEGER NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL DEFAULT 0,
      sent_at      INTEGER,
      received_at  INTEGER
    );
    CREATE TABLE IF NOT EXISTS pick_items (
      session_id INTEGER NOT NULL,
      seq        INTEGER NOT NULL,
      item_id    INTEGER NOT NULL,
      action     TEXT,
      note       TEXT,
      PRIMARY KEY (session_id, seq)
    );
    CREATE INDEX IF NOT EXISTS idx_pick_items_item ON pick_items(item_id);
    CREATE INDEX IF NOT EXISTS idx_pick_sessions_received ON pick_sessions(received_at);
  `)
  })

  subStep('补选片会话列', () => {
    // 选片会话导出的 HTML 路径：老会话没有记录，历史里只是不能打开文件夹
    ensureColumn(db, 'pick_sessions', 'file_path', 'file_path TEXT')
    ensureColumn(db, 'pick_sessions', 'client_note', "client_note TEXT NOT NULL DEFAULT ''")
    ensureColumn(db, 'pick_sessions', 'reply_count', 'reply_count INTEGER NOT NULL DEFAULT 0')
    // 草稿最后改动时间：用来让刚编辑过的草稿排在待交付最前面
    ensureColumn(db, 'pick_sessions', 'updated_at', 'updated_at INTEGER NOT NULL DEFAULT 0')
    db.prepare(
      `UPDATE pick_sessions
       SET updated_at = COALESCE(received_at, sent_at, created_at)
       WHERE updated_at = 0`
    ).run()
  })

  subStep('种入人像维度', () => seedFacets(db))
  subStep('回填照片目录', () => backfillDirs(db))
  subStep('升级向量表主键', () => migrateEmbeddings(db))
}

interface MigrationStep {
  version: number
  up: (db: Database.Database) => void
}

/** v4：人像检测结果缓存（has_person=0 也要存，避免每次重扫） */
function migrationV4(db: Database.Database): void {
  subStep('建人像检测表', () => {
    db.exec(`
    CREATE TABLE IF NOT EXISTS person_flags (
      item_id    INTEGER PRIMARY KEY,
      has_person INTEGER NOT NULL DEFAULT 0,
      score      REAL NOT NULL DEFAULT 0,
      model      TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_person_flags_model ON person_flags(model);
    `)
  })
}

/** v5：人像人工纠错（override 三列）——人工结论永久优先，重扫不覆盖 */
function migrationV5(db: Database.Database): void {
  subStep('补人工纠错列', () => {
    // 老库若在 v4 之后被手工删过表，先补建（幂等），再补列
    db.exec(`
    CREATE TABLE IF NOT EXISTS person_flags (
      item_id    INTEGER PRIMARY KEY,
      has_person INTEGER NOT NULL DEFAULT 0,
      score      REAL NOT NULL DEFAULT 0,
      model      TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_person_flags_model ON person_flags(model);
    `)
    // NULL = 无人工结论 / 1 = 确认人像 / 0 = 不是人像
    ensureColumn(db, 'person_flags', 'override', 'override INTEGER')
    ensureColumn(db, 'person_flags', 'override_at', 'override_at INTEGER')
    ensureColumn(db, 'person_flags', 'override_model', 'override_model TEXT')
    db.exec('CREATE INDEX IF NOT EXISTS idx_person_flags_override ON person_flags(override)')
  })
}

const MIGRATION_STEPS: MigrationStep[] = [
  { version: 1, up: migrationV1 },
  { version: 2, up: migrationV2 },
  { version: 3, up: migrationV3 },
  { version: 4, up: migrationV4 },
  { version: 5, up: migrationV5 }
]

/** 按 user_version 逐级升级；每一步独立事务，版本号跟着步骤走 */
function migrate(db: Database.Database, fromVersion: number): number {
  let version = fromVersion
  for (const step of MIGRATION_STEPS) {
    if (step.version <= version) continue
    try {
      db.transaction(() => {
        step.up(db)
        db.pragma(`user_version = ${step.version}`)
      })()
    } catch (error) {
      throw new Error(`第 ${step.version} 步迁移失败：${(error as Error).message}`)
    }
    version = step.version
  }
  return version
}

/**
 * 旧库的 embeddings 以 item_id 为主键，只能存一个模型。
 * 改成 (item_id, model) 联合主键，让 Chinese-CLIP 与 SigLIP 2 的索引可以共存。
 */
function migrateEmbeddings(db: Database.Database): void {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'embeddings'")
    .get() as { sql: string } | undefined
  if (!row || /PRIMARY KEY\s*\(\s*item_id\s*,\s*model\s*\)/i.test(row.sql)) return

  const tx = db.transaction(() => {
    db.exec(`
      DROP TABLE IF EXISTS embeddings_v2;
      CREATE TABLE embeddings_v2 (
        item_id INTEGER NOT NULL,
        model TEXT NOT NULL,
        dim INTEGER NOT NULL,
        vec BLOB NOT NULL,
        PRIMARY KEY (item_id, model)
      );
      INSERT OR IGNORE INTO embeddings_v2(item_id, model, dim, vec)
        SELECT item_id, model, dim, vec FROM embeddings;
      DROP TABLE embeddings;
      ALTER TABLE embeddings_v2 RENAME TO embeddings;
    `)
  })
  tx()
}

/** 内置维度与取值：只在 facets 表为空时种一次，之后用户改名/删维度都不会被覆盖 */
const FACET_SEEDS: Array<{
  id: string
  name: string
  multi: boolean
  autoSource: string | null
  values: string[]
}> = [
  { id: 'shot_size', name: '景别', multi: false, autoSource: 'local', values: ['特写', '近景', '中景', '全景', '远景', '环境人像'] },
  { id: 'angle', name: '视角', multi: false, autoSource: 'local', values: ['平视', '俯拍', '仰拍', '过肩', '侧脸'] },
  { id: 'light', name: '光线', multi: true, autoSource: 'clip', values: ['顺光', '侧光', '侧逆光', '逆光', '窗口光', '硬光', '柔光'] },
  { id: 'weather', name: '天气', multi: false, autoSource: 'clip', values: ['晴', '多云', '阴', '雨', '雪', '雾'] },
  { id: 'scene', name: '场景', multi: true, autoSource: 'clip', values: ['影棚', '居家', '街头', '自然', '海边', '建筑', '咖啡馆', '废墟'] },
  { id: 'tone', name: '色调', multi: true, autoSource: 'local', values: ['冷调', '暖调', '中性', '高调', '低调', '黑白', '胶片'] },
  { id: 'mood', name: '氛围', multi: true, autoSource: 'clip', values: ['温柔', '冷峻', '复古', '清新', '忧郁', '张力', '慵懒'] },
  { id: 'emotion', name: '情绪', multi: true, autoSource: 'llm', values: ['笑', '沉思', '疏离', '俏皮', '严肃', '紧张', '害羞'] },
  { id: 'time_of_day', name: '时段', multi: false, autoSource: 'local', values: ['清晨', '上午', '正午', '傍晚', '蓝调', '夜'] }
]

const FACET_COLORS = ['#7aa2f7', '#a78bfa', '#f2c94c', '#e86a92', '#6fcf97', '#56ccf2', '#bb86fc', '#f2994a']

function seedFacets(db: Database.Database): void {
  const existing = db.prepare('SELECT COUNT(*) AS c FROM facets').get() as { c: number }
  if (existing.c > 0) return
  const insertFacet = db.prepare(
    'INSERT INTO facets(id, name, multi, auto_source, sort, builtin) VALUES(?, ?, ?, ?, ?, 1)'
  )
  const insertTag = db.prepare(
    'INSERT OR IGNORE INTO tags(name, color, created_at) VALUES(?, ?, ?)'
  )
  const attachTag = db.prepare('UPDATE tags SET facet_id = ? WHERE name = ? AND facet_id IS NULL')
  const tx = db.transaction(() => {
    FACET_SEEDS.forEach((facet, index) => {
      insertFacet.run(facet.id, facet.name, facet.multi ? 1 : 0, facet.autoSource, index)
      facet.values.forEach((value, i) => {
        insertTag.run(value, FACET_COLORS[i % FACET_COLORS.length], Date.now())
        attachTag.run(facet.id, value)
      })
    })
  })
  tx()
}

/**
 * 老图库没有 dir 列，打开时补一次就够了。
 * 目录树依赖它，缺了会全部落到「其他位置」。
 */
function backfillDirs(db: Database.Database): void {
  const done = db.prepare("SELECT value FROM meta WHERE key = 'dir-backfill-v1'").get() as
    | { value: string }
    | undefined
  if (done) return

  const rows = db.prepare('SELECT id, path FROM items WHERE dir IS NULL').all() as Array<{
    id: number
    path: string
  }>
  const update = db.prepare('UPDATE items SET dir = ? WHERE id = ?')
  const tx = db.transaction(() => {
    for (const row of rows) update.run(dirname(row.path), row.id)
    db.prepare(
      "INSERT INTO meta(key, value) VALUES('dir-backfill-v1', '1') ON CONFLICT(key) DO UPDATE SET value = '1'"
    ).run()
  })
  tx()
}

/**
 * 索引目录（library.db / thumbnails / previews）可以和图库分开存放。
 * 映射的索引目录丢了（被删/被移走）时回退到图库目录；但映射本身保留，
 * 这样用户把那个目录放回来（例如换回来一块移动硬盘）就能继续用，不必重新设置。
 */
export function resolveIndexDir(library: string): string {
  const mapped = getIndexDirFor(library)
  if (libraryKeyOf(mapped) === libraryKeyOf(library)) return library
  if (existsSync(join(mapped, 'library.db'))) return mapped
  void log.warn('db', '索引目录里找不到 library.db，临时回退到图库目录', { library, mapped })
  return library
}

function libraryKeyOf(path: string): string {
  return path.replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase()
}

/**
 * 迁移前的整库快照；同版本已有备份就直接复用。
 * VACUUM INTO 会生成一份一致副本，WAL 里已提交的内容也会带上。
 * 备份失败必须中止升级：没有回滚点的结构变更不能硬上。
 */
function backupBeforeMigrate(
  handle: Database.Database,
  indexDir: string,
  version: number
): string {
  const file = join(indexDir, `library.db.bak-v${version}`)
  if (existsSync(file)) return file
  try {
    handle.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`)
    return file
  } catch (error) {
    void log.error('db', '迁移前备份失败，已中止升级', {
      file,
      error: (error as Error).message
    })
    throw new Error(`升级前备份失败，请先手动备份图库：${(error as Error).message}`)
  }
}

/** 删掉数据库文件的附属文件（journal / wal / shm），失败不影响主流程 */
function removeSidecars(file: string): void {
  for (const suffix of ['-journal', '-wal', '-shm']) {
    try {
      rmSync(`${file}${suffix}`, { force: true })
    } catch {
      /* 清理失败忽略 */
    }
  }
}

/** 只保留最近两份备份，别让 .bak 越积越多 */
function pruneBackups(indexDir: string): void {
  try {
    const backups = readdirSync(indexDir)
      .filter((name) => /^library\.db\.bak-v\d+$/.test(name))
      .map((name) => ({ name, at: statSync(join(indexDir, name)).mtimeMs }))
      .sort((a, b) => a.at - b.at)
    for (const entry of backups.slice(0, Math.max(0, backups.length - 2))) {
      const file = join(indexDir, entry.name)
      unlinkSync(file)
      removeSidecars(file)
    }
  } catch {
    /* 清理失败不影响主流程 */
  }
}

/** 迁移失败：把快照换回主库，保证用户还能用旧版打开 */
function restoreBackup(indexDir: string, backup: string): void {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    try {
      rmSync(join(indexDir, `library.db${suffix}`), { force: true })
    } catch {
      /* 删不掉就让 rename 去报错 */
    }
  }
  renameSync(backup, join(indexDir, 'library.db'))
  removeSidecars(backup)
}

/**
 * 老库升级后补一次 FTS 重建：老版本没有 FTS 表或内容不完整时，
 * 三字以上的搜索会静默漏结果。只做一次，失败下次打开再试。
 */
function rebuildFtsIfNeeded(handle: Database.Database): void {
  try {
    const done = handle
      .prepare("SELECT value FROM meta WHERE key = 'fts-rebuild-v3'")
      .get() as { value: string } | undefined
    if (done) return
    handle.prepare("INSERT INTO items_fts(items_fts) VALUES('rebuild')").run()
    handle
      .prepare(
        "INSERT INTO meta(key, value) VALUES('fts-rebuild-v3', '1') ON CONFLICT(key) DO UPDATE SET value = '1'"
      )
      .run()
  } catch (error) {
    void log.warn('db', 'FTS 索引重建失败，下次打开再试', {
      error: (error as Error).message
    })
  }
}

export function openLibrary(dir: string): void {
  if (db) closeLibrary()
  const indexDir = resolveIndexDir(dir)
  mkdirSync(join(indexDir, 'thumbnails'), { recursive: true })
  const file = join(indexDir, 'library.db')
  const isNewLibrary = !existsSync(file)
  for (let attempt = 0; ; attempt++) {
    let step = 'open'
    try {
      const handle = new Database(file)
      db = handle
      step = 'schema'
      // PRAGMA 不能放进事务，先于迁移步骤执行
      handle.pragma('journal_mode = WAL')
      handle.pragma('synchronous = NORMAL')
      step = 'migrate'
      const version = Number(handle.pragma('user_version', { simple: true }) ?? 0)
      if (version < CURRENT_SCHEMA) {
        // 新库没有历史数据，不必备份；老库升级前先留一份快照
        const backup = isNewLibrary ? null : backupBeforeMigrate(handle, indexDir, version)
        try {
          migrate(handle, version)
        } catch (error) {
          if (backup) {
            try {
              handle.close()
            } catch {
              /* 已经坏掉的连接关不掉也无所谓 */
            }
            db = null
            restoreBackup(indexDir, backup)
          }
          throw new Error(
            `图库升级失败${backup ? '，已自动还原' : ''}：${(error as Error).message}`
          )
        }
        void log.info('db', '图库结构已升级', {
          from: version,
          to: CURRENT_SCHEMA,
          backup: backup ?? null
        })
        if (backup) removeSidecars(backup)
        pruneBackups(indexDir)
      }
      // 老库可能没有 FTS 内容：补一次重建，只做一次
      rebuildFtsIfNeeded(handle)
      // 上次异常退出可能留下较大的 WAL，打开时顺手收干净
      checkpoint()
      break
    } catch (error) {
      try {
        db?.close()
      } catch {
        /* 打不开的连接本身可能就是坏的，关不掉无所谓 */
      }
      db = null
      // 进程刚被强杀、或文件正被杀毒软件扫描时，库文件会短暂不可用，稍等再试一次；
      // 迁移失败是确定性的，重试只会重复报错，不再重试
      if (attempt === 0 && step === 'open') {
        void log.warn('db', '打开图库失败，稍后重试', {
          dir,
          indexDir,
          step,
          error: (error as Error).message
        })
        sleepSync(400)
        continue
      }
      // 打不开或迁移失败都要留痕，否则用户只看到"图库加载失败"
      void log.error('db', '打开图库失败', { dir, indexDir, step, error: (error as Error).message })
      throw error
    }
  }
  libraryPath = dir
  indexPath = indexDir
}

/** 主进程里同步等一小会儿（启动/开库阶段可以接受） */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/** 把 WAL 合并回主库并截断，避免 WAL 无界增长；关库与退出前都会调用 */
export function checkpoint(): void {
  try {
    db?.pragma('wal_checkpoint(TRUNCATE)')
  } catch (error) {
    void log.warn('db', 'WAL checkpoint 失败', { error: (error as Error).message })
  }
}

export function closeLibrary(): void {
  try {
    if (db) {
      checkpoint()
      db.close()
    }
  } catch (error) {
    void log.warn('db', '关闭图库时出错', { error: (error as Error).message })
  }
  db = null
  libraryPath = ''
  indexPath = ''
}

export function getDb(): Database.Database {
  if (!db) throw new Error('还没有打开图库')
  return db
}

export function getLibraryPath(): string {
  return libraryPath
}

/** 索引当前所在目录；没打开图库时返回空串 */
export function getIndexPath(): string {
  return indexPath
}

export function getMeta(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM meta WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row ? row.value : null
}

export function setMeta(key: string, value: string): void {
  getDb()
    .prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value)
}
