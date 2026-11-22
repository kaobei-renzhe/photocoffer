import type { SkinId } from './skins'
import type { LayoutSizes } from './layout'
import type {
  ThumbCacheClearResult,
  ThumbCacheLimitResult,
  ThumbCacheStats,
  ThumbCacheTarget,
  ThumbQualityPref
} from './thumbs'
import type { LlmRunOutcome, LlmSettings, LlmStatus, LlmTestResult, PhotoQualitySaved } from './llm'

export interface ExifData {
  camera?: string
  lens?: string
  iso?: number
  aperture?: string
  shutter?: string
  focal?: string
  takenAt?: string
}

export interface Tag {
  id: number
  name: string
  color: string
  count: number
  /** 多级标签树：NULL 表示顶层 */
  parentId?: number | null
  /** 属于某个人像维度时记录维度 id（普通标签为 null） */
  facetId?: string | null
}

/** 人像维度的一个取值，本质是带 facet_id 的普通标签 */
export interface FacetValue {
  id: number
  name: string
  color: string
  count: number
}

/** 人像维度（景别 / 光线 / 氛围……），可自定义增删 */
export interface Facet {
  id: string
  name: string
  /** 同一维度是否允许多选 */
  multi: boolean
  sort: number
  values: FacetValue[]
}

export interface Folder {
  id: number
  name: string
  count: number
  /** 父文件夹；null 表示顶层 */
  parentId: number | null
  /** 同级排序，小的在前 */
  sort: number
  /** 用户指定的封面；null 表示用文件夹里的第一张图兜底 */
  coverItemId: number | null
  note: string
}

export type ColorFamily =
  | 'black'
  | 'gray'
  | 'white'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'cyan'
  | 'blue'
  | 'purple'
  | 'pink'

export type Orientation = 'landscape' | 'portrait' | 'square'

/**
 * 旗标筛选取值：0 = 不限，>0 = 留用，<0 = 淘汰。
 * 下面两个是负向筛选，用不会和旗标值冲突的正数表示：
 * - FLAG_FILTER_NOT_REJECTED：非淘汰（留用 + 未标记）
 * - FLAG_FILTER_NOT_PICKED：非留用（只含未标记，明确排除淘汰）
 */
export const FLAG_FILTER_NOT_REJECTED = 2
export const FLAG_FILTER_NOT_PICKED = 3

export interface FilterState {
  query?: string
  tagIds?: number[]
  folderId?: number | null
  /** 按源目录筛选（含子目录） */
  dir?: string | null
  minRating?: number
  /** 按照片画面的主色筛选 */
  colorFamily?: ColorFamily | null
  orientation?: Orientation | null
  flag?: number
  /** 人像维度：facetId → 选中的 tagId 列表（同维度 OR，跨维度 AND） */
  facets?: Record<string, number[]>
  expandBursts?: boolean
  expandedGroups?: string[]
  missing?: boolean
  /** 只看导入失败的异常文件 */
  errors?: boolean
  /** 大模型评分下限（0-100），0 或不填表示不限 */
  minAiScore?: number
  /** 只看还没被大模型评过分的 */
  unscored?: boolean
  /** 只保留这些 id（AI 智能筛选的结果），空数组等于不限制 */
  onlyIds?: number[]
  /** 只看回收站里软删除的照片 */
  trashed?: boolean
  /** 客户选片：只看客户「要的」「要修的」或两者都看（默认最近一次已回传结果的会话） */
  pickAction?: 'keep' | 'fix' | 'any'
  /** 指定选片会话；不填表示最近一次已回传结果的会话 */
  pickSessionId?: number
  sort?: 'added' | 'name' | 'mtime' | 'rating' | 'size' | 'ai'
}

export interface RelocatePair {
  id: number
  name: string
  oldPath: string
  newPath: string
}

export interface RelocatePending extends RelocatePair {
  reason: string
  score: number
}

export interface RelocatePlan {
  matched: RelocatePair[]
  pending: RelocatePending[]
  mapped: number
  unmatched: number
  conflicts: number
  scanned: number
}

export interface RelocateResult {
  relinked: number
  failed: number
}

export type GearCategory = 'body' | 'lens' | 'tripod' | 'flash' | 'light' | 'gimbal' | 'other'
export type SensorSize = 'ff' | 'apsc' | 'm43' | 'compact'
export type ScenarioId =
  | 'portrait'
  | 'landscape'
  | 'street'
  | 'event'
  | 'astro'
  | 'macro'
  | 'video'
  | 'travel'
  | 'product'
  | 'sports'
  | 'indoor'
  | 'lowlight'
  | 'timelapse'

export interface GearSpec {
  category: GearCategory
  brand: string
  model: string
  note?: string
  mount?: string
  sensor?: SensorSize
  megapixels?: number
  ibis?: boolean
  burst?: number
  video4k?: boolean
  weight?: number
  focalMin?: number
  focalMax?: number
  aperture?: number
  macro?: boolean
  stabilized?: boolean
  payload?: number
  power?: number
}

export interface GearItem extends GearSpec {
  id: string
  createdAt: number
}

export interface GearPlan {
  scenario: ScenarioId
  body: GearItem | null
  lens: GearItem | null
  accessories: GearItem[]
  extras: GearItem[]
  score: number
  reasons: string[]
  warnings: string[]
  missing: string[]
}

export interface GearKit {
  id: string
  name: string
  scenario: ScenarioId
  bodyId: string | null
  lensId: string | null
  accessoryIds: string[]
  createdAt: number
}

export interface GearUsage {
  total: number
  matched: number
  byGear: Record<string, number>
}

export interface GearRecommendation {
  scenario: ScenarioId
  plans: GearPlan[]
  missing: string[]
}

/** 从照片 EXIF 里发现的器材，可直接一键加入装备 */
export interface GearSuggestion extends GearSpec {
  /** 库中有多少张照片用到这件器材 */
  count: number
  /** 是否来自内置目录（false 表示仅从 EXIF 推断，参数可能不全） */
  catalogued: boolean
}

export interface ScenarioOption {
  id: ScenarioId
  name: string
  hint: string
}

/** 大模型质量评分（已落库的那份） */
export interface ItemQuality {
  composition: number
  exposure: number
  color: number
  sharpness: number
  overall: number
  comment: string
  /** 产生这份评分的模型名，便于换模型后判断结果是否过时 */
  model: string
  updatedAt: number
}

export interface Item {
  id: number
  path: string
  name: string
  ext: string
  size: number
  width: number
  height: number
  mtime: number
  addedAt: number
  rating: number
  note: string
  url: string | null
  flag: number
  pairCount: number
  burstCount: number
  stackId: number | null
  stackCount: number
  groupKey: string | null
  groupCount: number
  dominant: string | null
  palette: string[]
  exif: ExifData | null
  missing: number
  /** 导入失败的原因，null 表示正常 */
  error: string | null
  tags: Tag[]
  folderIds: number[]
  /** 大模型评分，没评过为 null */
  quality: ItemQuality | null
  /** 1 = 参考片（默认走研读），0 = 自己的片子（默认走复盘） */
  reference: number
}

/** 索引（library.db / 缩略图 / 预览）当前存放位置 */
export interface LibraryStorage {
  library: string
  indexDir: string
}

/** 配置导出结果；path = 实际写入位置 */
export interface SettingsExportResult {
  path: string
  bytes: number
  gear: number
}

/** 配置导入结果；skipped 是没跟着走的字段或设备 */
export interface SettingsImportResult {
  imported: number
  gear: number
  skipped: string[]
  needsKey: boolean
}

/** 首启使用方式：整理照片 / 拍片接单 */
export type AppUseCase = 'manage' | 'pro'

/** 摄影功能用过一次后常驻主导航 */
export type GrownFeature = 'portrait' | 'delivery' | 'clientPicked' | 'facets'

/** 关于页需要的数据位置 */
export interface AppInfo {
  version: string
  userData: string
  modelsDir: string
}

/** 自动更新的状态；disabled = 没配地址或开发模式，完全静默 */
export interface UpdateStatus {
  state: 'idle' | 'disabled' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'latest' | 'error'
  /** 发现的新版本号 */
  version?: string
  /** 下载进度 0-100 */
  percent?: number
  /** 给界面看的说明（disabled 时说明原因） */
  message?: string
}

/** 移动索引位置的结果（失败不抛异常，走 message） */
export interface IndexMoveResult {
  ok: boolean
  indexDir?: string
  /** 复制过去的文件数 */
  files?: number
  /** 旧位置是否清理干净 */
  cleaned?: boolean
  message?: string
  cancelled?: boolean
}

export interface SmartFolder {
  id: number
  name: string
  filter: FilterState
}

/* ─────────────── 客户选片 ─────────────── */

/** 客户对单张照片的选择；null 表示还没回传 */
export type PickAction = 'keep' | 'fix' | 'reject'

/** 水印在画面里的位置，直接对应 sharp 的 gravity */
export type PickWatermarkPosition =
  | 'southeast'
  | 'southwest'
  | 'northeast'
  | 'northwest'
  | 'center'

export interface PickWatermarkStyle {
  position: PickWatermarkPosition
  /** 0.15 - 1 */
  opacity: number
  /** logo 文件路径；null 表示只用水印文字 */
  logo: string | null
  /** logo 宽度占画面宽度的比例，0.08 - 0.35 */
  logoScale: number
  /** 字号占画面短边的比例，0.014 - 0.05 */
  fontScale: number
}

export interface PickSession {
  id: number
  /** 8 位短码，文件名里带上，方便认出是哪一单 */
  token: string
  title: string
  client: string
  photoCount: number
  watermark: string
  createdAt: number
  /** 草稿最后编辑时间；已发出的单等于发出时间 */
  updatedAt: number
  /** 导出时间 */
  sentAt: number | null
  /** 导入客户结果的时间 */
  receivedAt: number | null
  /** 导出的 HTML 路径，会话历史里用来打开所在文件夹 */
  filePath: string | null
  /** 客户在页面上写的备注 */
  clientNote: string
  /** 客户回传过几次（二次修改会累加） */
  replyCount: number
}

export interface PickSessionSummary extends PickSession {
  keep: number
  fix: number
  reject: number
  pending: number
}

export interface PickSessionItem {
  seq: number
  itemId: number
  name: string
  action: PickAction | null
}

export interface PickExportInput {
  itemIds: number[]
  title: string
  client: string
  watermark: string
  /** 长边像素，800 / 1200 / 1600 */
  maxEdge: number
  watermarkStyle: PickWatermarkStyle
}

/** 存成「待交付」：只记照片和标题，还没生成选片页、也没发出去 */
export interface PickDraftInput {
  itemIds: number[]
  title: string
  client?: string
}

/** 草稿单可改的字段；已发出的单不允许再改 */
export interface PickSessionPatch {
  title?: string
  client?: string
}

export interface PickExportFailure {
  id: number
  name: string
  message: string
}

export interface PickExportResult {
  sessionId: number
  token: string
  path: string
  bytes: number
  count: number
  /** 读不出来的照片，已跳过 */
  failed: PickExportFailure[]
}

export interface PickExportProgress {
  done: number
  total: number
  current: string
}

export interface PickReplyPreview {
  keep: number[]
  fix: number[]
  /** 回复里出现、但这次会话没有的编号 */
  unmatched: number[]
  /** 回复里明确写了「不要的：其余」，才把剩下的照片标成不要 */
  rejectRest: boolean
  /** 客户写的备注，没有就是空串 */
  note: string
  /** 这次会话一共多少张 */
  total: number
}

export interface PickApplyResult {
  keep: number
  fix: number
  reject: number
  unmatched: number[]
  /** 本次落库保存的客户备注 */
  note: string
  /** 这一单累计回传次数 */
  replyCount: number
}

export interface PickDefaults {
  lastDir: string | null
  lastClient: string
  watermarkStyle: PickWatermarkStyle
}

/* ─────────────── 导出成品 ─────────────── */

/** jpeg/png/webp = 缩放转码（可烘水印）；copy = 原样复制原件 */
export type FinalsExportMode = 'jpeg' | 'png' | 'webp' | 'copy'
/** original = 沿用原文件名；prefix = 前缀 + 三位序号 */
export type FinalsNaming = 'original' | 'prefix'
/** 同名处理：rename = 自动加序号；skip = 直接跳过 */
export type FinalsCollision = 'rename' | 'skip'

export interface FinalsExportInput {
  itemIds: number[]
  mode: FinalsExportMode
  /** 长边像素；null 表示不缩放，仅重新编码模式有效 */
  maxEdge: number | null
  /** 有损格式的质量 60-95；PNG 忽略 */
  quality: number
  naming: FinalsNaming
  /** naming = prefix 时用，如「小林-街拍」 */
  prefix: string
  /** 水印文字；空串表示不加水印 */
  watermark: string
  watermarkStyle: PickWatermarkStyle
  /** 重新编码时保留 EXIF/GPS；关闭时只留 sRGB 色彩配置。copy 模式始终保留 */
  keepMetadata: boolean
  /** 同名文件怎么处理 */
  collision: FinalsCollision
}

export interface FinalsExportFailure {
  id: number
  name: string
  message: string
}

export interface FinalsExportResult {
  dir: string
  count: number
  bytes: number
  /** 因重名自动加序号的文件数 */
  renamed: number
  /** collision = skip 时因重名被跳过的文件数 */
  skipped: number
  failed: FinalsExportFailure[]
}

export interface FinalsExportProgress {
  done: number
  total: number
  current: string
}

export interface FinalsDefaults {
  lastDir: string | null
  mode: FinalsExportMode
  maxEdge: number | null
  quality: number
  naming: FinalsNaming
  prefix: string
  watermark: string
  watermarkStyle: PickWatermarkStyle
  keepMetadata: boolean
  collision: FinalsCollision
}

export interface Stats {
  total: number
  missing: number
  tags: number
  folders: number
  bytes: number
  /** 导入失败、等待处理的文件数 */
  errors: number
  /** 最近一次已回传结果的选片会话里，客户「要的 + 要修的」张数 */
  clientPicked: number
  /** 回收站里的条数 */
  trashed: number
}

/** 导入配置，会记住上次的选择 */
export interface ImportOptions {
  /** 递归扫描子目录 */
  recursive: boolean
  /** 跳过内容重复的照片 */
  skipDuplicates: boolean
}

export interface ImportProgress {
  phase: 'scanning' | 'importing' | 'paused'
  total: number
  done: number
  remaining: number
  added: number
  skipped: number
  failed: number
  current: string
  paused: boolean
}

export interface ImportErrorInfo {
  path: string
  name: string
  message: string
}

export interface ImportResult {
  added: number
  skipped: number
  failed: number
  relinked: number
  scanned: number
  cancelled: boolean
  errors: ImportErrorInfo[]
  /** 本次导入涉及的根目录，用于导入后按原文件夹展示 */
  roots: string[]
}

/** 粘贴剪贴板图片的结果：empty = 剪贴板里没有图片；no-library = 还没打开图库 */
export interface PasteImageResult {
  ok: boolean
  itemId?: number | null
  /** 本次真正入库的张数；0 表示图库里已有同一张图 */
  added?: number
  reason?: 'no-library' | 'empty'
}

/** 从网址存图的结果；失败一律走 reason，不抛异常 */
export interface ImportUrlResult {
  ok: boolean
  itemId?: number | null
  /** 本次真正入库的张数；0 表示图库里已有同一张图 */
  added?: number
  reason?: 'no-library' | 'invalid-url' | 'download-failed' | 'not-image' | 'too-large'
}

/** 重试导入失败文件的结果 */
export interface RetryFailedResult {
  /** 待重试的记录数 */
  total: number
  /** 这次修好的张数 */
  recovered: number
  /** 仍然失败的张数 */
  failed: number
}

/** 媒体库里的源目录树节点 */
export interface ImportDirNode {
  path: string
  name: string
  /** 本目录直接包含的图片数 */
  count: number
  /** 含子目录的图片总数 */
  total: number
  children: ImportDirNode[]
}

/** 手动「刷新图库」的结果 */
export interface SyncResult {
  /** 扫描到的图片文件数 */
  scanned: number
  added: number
  missing: number
  restored: number
  refreshed: number
  failed: number
  /** 已经不存在的源目录（需要重新定位或重新导入） */
  missingRoots: string[]
}

/** 上次被中断（关软件/崩溃）的导入任务，用于下次启动时继续 */
export interface PendingImport {
  paths: string[]
  options: ImportOptions
  startedAt: number
  total: number
  done: number
}

export interface DuplicateGroup {
  hash: string
  items: Item[]
}

/** 启动时恢复上次图库的结果 */
export interface LastLibraryResult {
  dir: string | null
  /** 上次把索引放在别处，但那个目录里已经没有 library.db 了 */
  indexMissing?: string
}

/* ─────────────── 多图库 ─────────────── */

export interface LibraryEntry {
  /** UUID，存在 library.db 的 meta 表里；目录改名/移动后仍能认回同一个库 */
  id: string
  path: string
  name: string
  lastOpened: number
  /** 上次打开时的张数，用于卡片展示；打开时刷新 */
  itemCount: number
}

/** ok = 正常；missing = 目录不在；index-missing = 目录在但 library.db 不在 */
export type LibraryStatus = 'ok' | 'missing' | 'index-missing'

export interface LibrarySummary extends LibraryEntry {
  status: LibraryStatus
  /** status = missing 时，盘符/共享根也不存在 = 移动盘没接上，而不是目录被改名 */
  driveMissing?: boolean
}

/** 移动硬盘在线状态：只在「拔掉 / 插回」的瞬间推送，避免界面频繁刷新 */
export interface VolumeStatus {
  /** 当前图库所在盘离线 */
  libraryOffline: boolean
  /** 本轮刚从离线恢复（用于自动重扫/接回） */
  libraryRecovered: boolean
  /** 当前离线或丢失的导入目录 */
  offlineSources: string[]
  /** 本轮刚恢复的导入目录 */
  recoveredSources: string[]
}

/** 跨库搜索里命中的一个库 */
export interface CrossLibraryMatch {
  id: string
  name: string
  path: string
  count: number
}

/** 当前库零结果时，其他库的命中概况 */
export interface CrossLibraryHint {
  /** 有命中的库数量 */
  libraries: number
  /** 所有命中库的条数之和 */
  total: number
  /** 按最近打开排序；第一条用于点击切换 */
  matches: CrossLibraryMatch[]
}

export interface LibraryRelocateResult {
  ok: boolean
  /** 用户取消了目录选择 */
  cancelled?: boolean
  message?: string
  entry?: LibrarySummary
}

/* ─────────────── XMP 侧车 ─────────────── */

export interface XmpSettings {
  /** 总开关，默认关闭；开了才随改动写侧车 */
  enabled: boolean
  /** 外部软件改过时不再提示 */
  ignoreExternal: boolean
}

export interface XmpProgress {
  phase: 'write' | 'scan'
  done: number
  total: number
  current: string
}

export interface XmpExportResult {
  written: number
  skipped: number
  failed: number
}

export interface XmpConflictItem {
  itemId: number
  name: string
  sidecar: string
  /** 侧车文件当前的 mtime */
  mtime: number
}

export interface XmpCheckResult {
  scanned: number
  conflicts: XmpConflictItem[]
  ignored: boolean
}

export interface XmpImportResult {
  imported: number
  failed: number
}

export interface Api {
  pickLibraryDir: () => Promise<string | null>
  createLibrary: (dir: string) => Promise<string>
  openLibrary: (dir: string) => Promise<string>
  lastLibrary: () => Promise<LastLibraryResult>
  /** 索引（library.db / 缩略图 / 预览）当前放在哪 */
  getLibraryStorage: () => Promise<LibraryStorage | null>
  /** 把偏好设置导出成 JSON；返回 null 表示用户取消 */
  exportSettings: () => Promise<SettingsExportResult | null>
  /** 从 JSON 导入偏好设置；返回 null 表示用户取消 */
  importSettings: () => Promise<SettingsImportResult | null>
  /** 首启使用方式；null = 还没选过 */
  getUseCase: () => Promise<AppUseCase | null>
  saveUseCase: (value: AppUseCase) => Promise<AppUseCase>
  /** 用过即常驻的摄影功能 */
  getGrownFeatures: () => Promise<GrownFeature[]>
  saveGrownFeatures: (features: GrownFeature[]) => Promise<GrownFeature[]>
  /** 关于页：版本与数据目录 */
  appInfo: () => Promise<AppInfo>
  /** 自动更新：当前状态；没配更新地址时 state = disabled */
  updateStatus: () => Promise<UpdateStatus>
  /** 是否配置了可用的更新源；未配置时关于页隐藏更新入口 */
  updateEnabled: () => Promise<boolean>
  /** 手动检查更新 */
  updateCheck: () => Promise<UpdateStatus>
  /** 已下载完成后重启安装 */
  updateInstall: () => Promise<void>
  /** 订阅下载进度与状态变化 */
  onUpdateStatus: (cb: (status: UpdateStatus) => void) => () => void
  /** 用系统默认方式打开一个目录 */
  openPath: (path: string) => Promise<void>
  /** 图库清单（带探活状态） */
  listLibraries: () => Promise<LibrarySummary[]>
  /** 取图库代表缩略图（data URL）；null = 这个库没有可用缩略图 */
  libraryCover: (id: string) => Promise<string | null>
  /** 当前库零结果时，查其他库有没有可能命中的内容 */
  searchOtherLibraries: (query: string) => Promise<CrossLibraryHint>
  renameLibrary: (id: string, name: string) => Promise<void>
  /** 从清单移除；alsoDeleteData=true 时连索引数据一起删（原图不动） */
  forgetLibrary: (id: string, alsoDeleteData: boolean) => Promise<void>
  /** 选目录重新定位一个库；目录里的 library_id 必须对得上 */
  relocateLibrary: (id: string) => Promise<LibraryRelocateResult>
  /** XMP 侧车：默认关闭，只写人的判断 */
  getXmpSettings: () => Promise<XmpSettings>
  saveXmpSettings: (patch: Partial<XmpSettings>) => Promise<XmpSettings>
  /** 手动全量写 XMP（迁移/备份用），会发进度事件 */
  xmpExportAll: () => Promise<XmpExportResult>
  /** 检查哪些侧车在外部被改过 */
  xmpCheckConflicts: () => Promise<XmpCheckResult>
  /** 把指定照片的外部修改导入回来 */
  xmpImportConflicts: (itemIds: number[]) => Promise<XmpImportResult>
  onXmpProgress: (cb: (progress: XmpProgress) => void) => () => void
  /** 左栏 / 右栏宽度（记住用户拖过的值） */
  getLayout: () => Promise<LayoutSizes>
  saveLayout: (patch: Partial<LayoutSizes>) => Promise<LayoutSizes>
  /** 瀑布流缩略图清晰度 */
  getThumbQuality: () => Promise<ThumbQualityPref>
  saveThumbQuality: (pref: ThumbQualityPref) => Promise<ThumbQualityPref>
  /** 人像工作台瀑布流卡片宽度 */
  getPortraitThumbSize: () => Promise<number>
  savePortraitThumbSize: (size: number) => Promise<number>
  getPortraitColumns: () => Promise<number>
  savePortraitColumns: (columns: number) => Promise<number>
  /** 三档缩略图各占多少磁盘 */
  thumbCacheStats: () => Promise<ThumbCacheStats>
  /** 清理缩略图缓存（high = 只删高清档） */
  clearThumbCache: (target?: ThumbCacheTarget) => Promise<ThumbCacheClearResult>
  /** 高清缓存上限（MB），0 = 不限 */
  getThumbCacheLimit: () => Promise<number>
  saveThumbCacheLimit: (mb: number) => Promise<ThumbCacheLimitResult>
  /** 选一个文件夹并把索引搬过去 */
  pickIndexDir: () => Promise<IndexMoveResult>
  /** target 为 null 表示搬回图库目录 */
  moveIndexDir: (target: string | null) => Promise<IndexMoveResult>
  listItems: (
    filter: FilterState,
    offset?: number,
    limit?: number
  ) => Promise<{ items: Item[]; total: number }>
  getItem: (id: number) => Promise<Item | null>
  updateItem: (
    id: number,
    patch: { rating?: number; note?: string; url?: string; flag?: number }
  ) => Promise<void>
  /** 批量写评分/旗标/备注：一次 IPC 完成，返回更新条数 */
  bulkUpdate: (
    ids: number[],
    patch: { rating?: number; note?: string; noteAppend?: boolean; url?: string; flag?: number }
  ) => Promise<number>
  deleteItems: (ids: number[]) => Promise<void>
  /** 清理文件已丢失的记录（软删除，可撤销），返回处理的 id */
  trashMissing: () => Promise<number[]>
  restoreItems: (ids: number[]) => Promise<void>
  /** 彻底删除记录与缩略图缓存；不动磁盘上的原图 */
  purgeItems: (ids: number[]) => Promise<void>
  /** 清空回收站，返回删除的条数 */
  purgeAllTrashed: () => Promise<number>
  copyImage: (id: number) => Promise<boolean>
  stackItems: (ids: number[]) => Promise<number>
  unstack: (stackId: number) => Promise<void>
  rescan: () => Promise<{ missing: number; restored: number }>
  stats: () => Promise<Stats>
  listTags: () => Promise<Tag[]>
  /** 人像工作台：维度与取值 */
  listFacets: () => Promise<Facet[]>
  createFacet: (name: string) => Promise<Facet>
  renameFacet: (id: string, name: string) => Promise<void>
  deleteFacet: (id: string) => Promise<void>
  createFacetValue: (facetId: string, name: string) => Promise<FacetValue>
  setItemFacet: (itemId: number, facetId: string, tagIds: number[]) => Promise<void>
  bulkSetFacetValue: (itemIds: number[], facetId: string, tagId: number, add: boolean) => Promise<void>
  createTag: (name: string, color?: string, parentId?: number | null) => Promise<Tag>
  deleteTag: (id: number) => Promise<void>
  /** 调整标签层级：parentId 为 null 时移回顶层 */
  setTagParent: (id: number, parentId: number | null) => Promise<void>
  setTag: (itemIds: number[], tagId: number, add: boolean) => Promise<void>
  /** 照片研读笔记 */
  notes: NotesApi
  listFolders: () => Promise<Folder[]>
  /** parentId 为空时建在顶层 */
  createFolder: (name: string, parentId?: number | null) => Promise<Folder>
  renameFolder: (id: number, name: string) => Promise<void>
  /** 移动到 parentId 下；index 是在目标同级里的位置 */
  moveFolder: (id: number, parentId: number | null, index: number) => Promise<void>
  /** itemId 为 null 时清掉自定义封面，回到第一张图兜底 */
  setFolderCover: (id: number, itemId: number | null) => Promise<void>
  deleteFolder: (id: number) => Promise<void>
  addToFolder: (itemIds: number[], folderId: number) => Promise<void>
  removeFromFolder: (itemIds: number[], folderId: number) => Promise<void>
  listSmart: () => Promise<SmartFolder[]>
  saveSmart: (name: string, filter: FilterState) => Promise<SmartFolder>
  deleteSmart: (id: number) => Promise<void>
  /** 客户选片：上次的输出目录与客户名 */
  pickDefaults: () => Promise<PickDefaults>
  /** 生成自包含选片页；用户取消保存时返回 null */
  pickExport: (input: PickExportInput) => Promise<PickExportResult | null>
  /** 把选中照片存成草稿单（待交付） */
  pickCreateDraft: (input: PickDraftInput) => Promise<PickSessionSummary>
  /** 给已有的草稿单生成选片页；用户取消保存时返回 null */
  pickExportSession: (sessionId: number, input: PickExportInput) => Promise<PickExportResult | null>
  /** 改草稿单的标题 / 客户；已发出的单会拒绝 */
  pickUpdateSession: (sessionId: number, patch: PickSessionPatch) => Promise<PickSessionSummary>
  /** 整体替换草稿单的照片集合；已发出的单会拒绝 */
  pickUpdateDraftItems: (sessionId: number, itemIds: number[]) => Promise<PickSessionSummary>
  listPickSessions: () => Promise<PickSessionSummary[]>
  /** 删除一单选片记录（只删记录，不动照片） */
  deletePickSession: (sessionId: number) => Promise<void>
  /** 某一单的序号 ↔ 照片明细 */
  listPickSessionItems: (sessionId: number) => Promise<PickSessionItem[]>
  /** 选一个 logo 文件，返回路径；取消返回 null */
  pickPickLogo: () => Promise<string | null>
  /** 解析客户回传的文本，先预览再落库 */
  pickReplyPreview: (sessionId: number, text: string) => Promise<PickReplyPreview>
  pickApplyReply: (sessionId: number, preview: PickReplyPreview) => Promise<PickApplyResult>
  onPickProgress: (cb: (progress: PickExportProgress) => void) => () => void
  /** 导出成品：上次的目录与参数 */
  finalsDefaults: () => Promise<FinalsDefaults>
  /** 导出成品到用户选的文件夹；取消时返回 null */
  finalsExport: (input: FinalsExportInput) => Promise<FinalsExportResult | null>
  onFinalsProgress: (cb: (progress: FinalsExportProgress) => void) => () => void
  pickImages: () => Promise<string[]>
  pickFolder: () => Promise<string | null>
  importPaths: (paths: string[], options?: Partial<ImportOptions>) => Promise<ImportResult>
  /** 把剪贴板里的图片存进图库（Ctrl+V） */
  pasteImage: () => Promise<PasteImageResult>
  /** 从 http(s) 网址下载一张图片存进图库（拖网址进来） */
  importUrl: (url: string) => Promise<ImportUrlResult>
  /** 重试所有导入失败的文件 */
  retryFailedImports: () => Promise<RetryFailedResult>
  pauseImport: () => Promise<void>
  resumeImport: () => Promise<void>
  cancelImport: () => Promise<void>
  importStatus: () => Promise<ImportProgress | null>
  getImportOptions: () => Promise<ImportOptions>
  saveImportOptions: (options: Partial<ImportOptions>) => Promise<ImportOptions>
  listDirTree: () => Promise<ImportDirNode[]>
  syncLibrary: () => Promise<SyncResult>
  pendingImport: () => Promise<PendingImport | null>
  discardPendingImport: () => Promise<void>
  findDuplicates: () => Promise<DuplicateGroup[]>
  backupLibrary: () => Promise<{ path: string; size: number } | null>
  restoreLibrary: () => Promise<string | null>
  exportCsv: () => Promise<{ path: string; count: number } | null>
  getAutoBackup: () => Promise<AutoBackupSettings>
  saveAutoBackup: (patch: Partial<AutoBackupSettings>) => Promise<AutoBackupSettings>
  pickAutoBackupDir: () => Promise<string | null>
  onAutoBackup: (cb: (result: AutoBackupResult) => void) => () => void
  clipStatus: () => Promise<ClipStatus>
  /** 可用的内嵌语义模型（含是否已下载、是否正在使用、索引进度） */
  listEmbeddingModels: () => Promise<EmbeddingModelInfo[]>
  /** 切换语义模型：只改配置，旧模型索引保留，新模型需要重建索引 */
  selectEmbeddingModel: (id: EmbeddingModelId) => Promise<ClipStatus>
  getClipAutoIndex: () => Promise<boolean>
  saveClipAutoIndex: (enabled: boolean) => Promise<boolean>
  onClipAutoStatus: (cb: (status: ClipStatus) => void) => () => void
  clipIndex: () => Promise<{ indexed: number; failed: number; cancelled: boolean }>
  clipCancel: () => Promise<void>
  clipSearchText: (
    query: string,
    filter: FilterState,
    limit?: number,
    offset?: number,
    /** 结果上限：精确 50 / 标准 200 / 全部 0（不限），默认 200 */
    cap?: number
  ) => Promise<{ items: Item[]; scores: number[]; total: number; matched: number }>
  clipSimilar: (
    itemId: number,
    limit?: number,
    offset?: number
  ) => Promise<{ items: Item[]; scores: number[]; total: number; matched: number }>
  clipDownloadModel: (id?: EmbeddingModelId) => Promise<string>
  onClipIndex: (cb: (progress: ClipProgress) => void) => () => void
  /** 语义索引结束（完成 / 取消 / 出错都会发），用来收起进度卡片 */
  onClipIndexEnd: (cb: () => void) => () => void
  onClipDownload: (cb: (progress: ClipDownloadProgress) => void) => () => void
  /** 模型下载结束（成功或失败）——设置页也会发起下载，全局进度卡片统一在这里收起 */
  onClipDownloadEnd: (cb: () => void) => () => void
  /** 人像检测：模型状态、三级降级查询与扫描 */
  portraitStatus: () => Promise<PortraitStatus>
  /** 人工 override > 模型 has_person > 自动分类「人像」类目 */
  portraitFlags: (ids: number[]) => Promise<PortraitFlag[]>
  /** 选择本地 .onnx 导入；取消时返回 null */
  portraitImportModel: () => Promise<PortraitStatus | null>
  portraitRemoveModel: () => Promise<PortraitStatus>
  portraitScan: (ids: number[]) => Promise<PortraitFlag[]>
  /** 写入人工判定：1=确认人像，0=不是人像，null=清除人工结论 */
  portraitOverride: (ids: number[], value: 0 | 1 | null) => Promise<number>
  /** 自定义标题栏 / 原生菜单动作 */
  onMenuAction: (cb: (id: string) => void) => () => void
  autoTagCategories: () => Promise<AutoTagCategory[]>
  /** 新增类目；返回当前图库的最新类目列表 */
  addTagCategory: (name: string) => Promise<AutoTagCategory[]>
  /** 改名；主进程会同步 auto_tags 与 tags 两张表 */
  renameTagCategory: (from: string, to: string) => Promise<AutoTagCategory[]>
  /** 删除类目配置；保留 auto_tags 历史标注 */
  removeTagCategory: (name: string) => Promise<AutoTagCategoryRemoveResult>
  reorderTagCategories: (names: string[]) => Promise<AutoTagCategory[]>
  /** 删除前查询该类别下有多少张照片的自动标注 */
  countTagCategory: (name: string) => Promise<number>
  getAutoTagSettings: () => Promise<AutoTagSettings>
  saveAutoTagSettings: (patch: Partial<AutoTagSettings>) => Promise<AutoTagSettings>
  autoTagStatus: () => Promise<AutoTagStatus>
  autoTag: () => Promise<AutoTagResult>
  clearAutoTags: () => Promise<{ removed: number }>
  onAutoTagProgress: (cb: (progress: AutoTagProgress) => void) => () => void
  showInFolder: (path: string) => Promise<void>
  /** 用系统浏览器打开 https 链接；非 https 一律拒绝 */
  openExternal: (url: string) => Promise<boolean>
  /** 切换窗口全屏；不传参数时取反，返回切换后的状态 */
  setFullScreen: (value?: boolean) => Promise<boolean>
  isFullScreen: () => Promise<boolean>
  /** 灯箱沉浸：把 Windows 原生三键融进黑色舞台（非 Windows 返回 false） */
  setOverlayImmersive: (value: boolean) => Promise<boolean>
  pickRelocateDir: () => Promise<RelocatePlan | null>
  planRelocate: (dir: string) => Promise<RelocatePlan>
  lastRelocateDir: () => Promise<string | null>
  applyRelocate: (pairs: RelocatePair[]) => Promise<RelocateResult>
  listGear: () => Promise<GearItem[]>
  saveGear: (item: GearSpec & { id?: string }) => Promise<GearItem>
  deleteGear: (id: string) => Promise<void>
  gearCatalog: () => Promise<GearSpec[]>
  gearSuggestions: () => Promise<GearSuggestion[]>
  gearScenarios: () => Promise<ScenarioOption[]>
  recommendGear: (scenario: ScenarioId) => Promise<GearRecommendation>
  gearUsage: () => Promise<GearUsage>
  listKits: () => Promise<GearKit[]>
  saveKit: (kit: {
    name: string
    scenario: ScenarioId
    bodyId?: string
    lensId?: string
    accessoryIds?: string[]
  }) => Promise<GearKit>
  deleteKit: (id: string) => Promise<void>
  getTheme: () => Promise<ThemeMode>
  saveTheme: (mode: ThemeMode) => Promise<ThemeMode>
  getSkin: () => Promise<SkinId>
  saveSkin: (id: SkinId) => Promise<SkinId>
  llmStatus: () => Promise<LlmStatus>
  /** AI 用量配额快照：今日已用、阈值、当前判定 */
  llmQuota: () => Promise<{
    settings: import('./quota').LlmQuotaSettings
    state: import('./quota').LlmQuotaState
    verdict: import('./quota').QuotaVerdict
  }>
  llmSaveQuota: (
    patch: Partial<import('./quota').LlmQuotaSettings>
  ) => Promise<import('./quota').LlmQuotaSettings>
  llmResetQuota: () => Promise<import('./quota').LlmQuotaState>
  llmSaveSettings: (patch: Partial<LlmSettings>) => Promise<LlmStatus>
  llmSaveKey: (modelId: string, key: string) => Promise<LlmStatus>
  llmClearKey: (modelId: string) => Promise<LlmStatus>
  /** 不传 modelId 时测默认模型 */
  llmTest: (modelId?: string) => Promise<LlmTestResult>
  llmRun: (capabilityId: string, input: unknown) => Promise<LlmRunOutcome>
  /** 评分并落库，返回每张的分数与实际写入条数 */
  llmScore: (itemIds: number[]) => Promise<LlmRunOutcome<PhotoQualitySaved>>
  llmAutoTag: (itemIds: number[]) => Promise<
    LlmRunOutcome<{
      results: Array<{ itemId: number; category: string; confidence: number; reason: string }>
      failed: Array<{ itemId: number; message: string }>
      persisted: number
    }>
  >
  /** AI 评分的最低星级：0 = 全部照片 */
  getAiScoreMinRating: () => Promise<number>
  saveAiScoreMinRating: (value: number) => Promise<number>
  /** AI 处理的文件夹范围：空数组 = 不限 */
  getAiFolderIds: () => Promise<number[]>
  saveAiFolderIds: (ids: number[]) => Promise<number[]>
  /** 当前范围内可评分的照片数（matched 满足星级与文件夹范围，total 全部可评分） */
  aiScoreCandidates: () => Promise<{ matched: number; total: number }>
  startDrag: (itemId: number) => void
  confirm: (message: string, detail?: string) => Promise<boolean>
  replyDialog: (id: number, result: AppDialogResult) => void
  getPathForFile: (file: File) => string
  onImportProgress: (cb: (p: ImportProgress) => void) => () => void
  onLibraryChanged: (cb: (info: LibraryChange) => void) => () => void
  /** 移动硬盘在线状态（拔掉/插回时推送） */
  volumeStatus: () => Promise<VolumeStatus>
  onVolumeStatus: (cb: (status: VolumeStatus) => void) => () => void
  onDialogRequest: (cb: (request: AppDialogRequest) => void) => () => void
}

/** 主进程要弹的确认框参数，界面用应用内弹窗渲染 */
export interface AppDialogOptions {
  kind?: 'question' | 'warning' | 'error' | 'info'
  title: string
  detail?: string
  confirmText?: string
  cancelText?: string
  /** 危险操作（删除、覆盖）把确认按钮标红 */
  danger?: boolean
  /** 只给一个确认按钮，没有取消 */
  onlyConfirm?: boolean
  checkboxLabel?: string
  checkboxChecked?: boolean
}

export interface AppDialogRequest extends AppDialogOptions {
  id: number
}

export interface AppDialogResult {
  confirmed: boolean
  checked: boolean
}

export interface LibraryChange {
  added: number
  missing: number
}

export type ThemeMode = 'system' | 'dark' | 'light'

export interface AutoBackupSettings {
  enabled: boolean
  intervalDays: number
  keep: number
  directory: string | null
  lastRunAt: number
}

export interface AutoBackupResult {
  ok: boolean
  path?: string
  size?: number
  error?: string
}

/** 内嵌语义模型：换模型要重建索引，但新旧索引可以同时留在库里 */
export type EmbeddingModelId = 'chinese-clip' | 'siglip2'

export interface EmbeddingModelInfo {
  id: EmbeddingModelId
  label: string
  note: string
  /** 下载体积（字节） */
  bytes: number
  dim: number
  ready: boolean
  active: boolean
  indexed: number
  total: number
  /** 设置页讲取舍用：中文强度 / 速度 / 擅长场景 */
  zhStrength: string
  speed: string
  bestFor: string
}

/** 语义搜图的结果档位：固定条数收敛，不向用户暴露相似度阈值 */
export type SemanticCapMode = 'precise' | 'normal' | 'all'

export interface ClipStatus {
  modelReady: boolean
  modelId: EmbeddingModelId
  modelLabel: string
  modelBytes: number
  indexed: number
  total: number
  running: boolean
  dim: number
}

export interface ClipProgress {
  done: number
  total: number
  current: string
}

export interface ClipDownloadProgress {
  received: number
  total: number
  file: string
}

/** 人像检测模型的准备情况 */
export interface PortraitStatus {
  modelReady: boolean
  modelBytes: number
  /** 已检测且仍在库里的照片数 */
  detected: number
  /** 库内可检测的照片总数 */
  total: number
  /** 模型确认的人像（未被人工作废） */
  confirmedByModel: number
  /** 人工确认为人像 */
  confirmedByHuman: number
  /** 人工排除（不是人像） */
  excludedByHuman: number
  /** 人工结论来自旧模型 */
  staleOverrides: number
  /** 模型判定为可能人像（0.50–0.80） */
  likely: number
  /** 尚未完成检测的照片数（主进程计算，UI 不做减法） */
  unresolved: number
}

export type PortraitVerdict = 'person' | 'likely' | 'no-person' | 'unresolved'

export interface PortraitFlag {
  id: number
  /** 权威结论：person / likely / no-person / unresolved */
  verdict: PortraitVerdict
  score: number
  /** 兼容旧字段：仅 person / likely 为 true */
  hasPerson: boolean
  /** 人工结论，最高优先级：1=确认人像，0=不是人像，null=无人工结论 */
  override?: 0 | 1 | null
  /** 这条结论来自哪里：人工 / 检测模型 / 自动分类的「人像」类目 */
  source?: 'human' | 'model' | 'autoTag'
  /** 仅 unresolved 有意义 */
  reason?: 'error' | 'no-source'
}

export interface PortraitScanProgress {
  done: number
  total: number
}

export interface AutoTagCategory {
  name: string
  color: string
}

export interface AutoTagCategoryRemoveResult {
  /** 该类目下保留在 auto_tags 里的历史标注数量 */
  removed: number
  categories: AutoTagCategory[]
}

export interface AutoTagSettings {
  threshold: number
  categories: string[]
}

export interface AutoTagProgress {
  phase: 'prepare' | 'scan'
  done: number
  total: number
  current: string
}

export interface AutoTagResult {
  total: number
  assigned: number
  counts: Record<string, number>
}

export interface AutoTagStatus {
  tagged: number
  indexed: number
  total: number
  /** 当前语义模型，不同模型的相似度分布不同，阈值范围也要跟着换 */
  modelId: EmbeddingModelId
  modelLabel: string
  thresholdMin: number
  thresholdMax: number
  thresholdStep: number
}

/* ─────────────── 照片研读与复盘 ─────────────── */

/** 研读（看别人的好片偷手法） / 复盘（看自己的片子找差距） */
export type NoteMode = 'study' | 'review'

/** question 提问 · answer 回答 · insight 提炼 · intent 当时的意图 · tech 五维拆解 */
export type NoteKind = 'question' | 'answer' | 'insight' | 'intent' | 'tech'

export type NoteAuthor = 'me' | 'ai'

/** 归一化坐标（0-1），相对照片本身，缩放平移都不用换算 */
export interface NoteRegion {
  x: number
  y: number
  w: number
  h: number
}

export interface PhotoNote {
  id: number
  itemId: number
  parentId: number | null
  kind: NoteKind
  mode: NoteMode
  body: string
  region: NoteRegion | null
  author: NoteAuthor
  tags: string[]
  createdAt: number
}

/** 一条线程 = 一个根笔记（可能带圈选）+ 它的全部追问 */
export interface NoteThread {
  root: PhotoNote
  replies: PhotoNote[]
}

export interface CreateNoteInput {
  itemId: number
  parentId?: number | null
  kind?: NoteKind
  mode?: NoteMode
  body: string
  region?: NoteRegion | null
  author?: NoteAuthor
  tags?: string[]
}

/** 反问对话的一轮 */
export interface SocraticTurn {
  role: 'me' | 'ai'
  text: string
}

export interface SocraticInput {
  itemId: number
  /** 圈选区域，null = 整图提问 */
  region?: NoteRegion | null
  question: string
  /** 之前的对话（不含本轮），用于多轮上下文 */
  history?: SocraticTurn[]
  mode?: NoteMode
  /** 用户点了「直接告诉我」，跳过反问直接给答案 */
  skipSocratic?: boolean
}

export interface SocraticReply {
  text: string
  /** 本轮是反问还是解释，前端用来渲染不同气泡 */
  stage: 'probe' | 'explain'
}

/** 照片研读笔记：渲染层只碰这一组接口 */
export interface NotesApi {
  list: (itemId: number) => Promise<NoteThread[]>
  count: (itemId: number) => Promise<number>
  create: (input: CreateNoteInput) => Promise<PhotoNote>
  update: (
    id: number,
    patch: Partial<Pick<PhotoNote, 'body' | 'kind' | 'tags'>>
  ) => Promise<PhotoNote | null>
  remove: (id: number) => Promise<void>
  setReference: (itemId: number, value: boolean) => Promise<void>
}
