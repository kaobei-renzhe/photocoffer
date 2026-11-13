import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Copy,
  FolderOpen,
  FolderPlus,
  Layers,
  Maximize,
  RefreshCw,
  Star,
  Tag as TagIcon,
  Trash2
} from 'lucide-react'
import type {
  AppUseCase,
  ClipDownloadProgress,
  ClipProgress,
  ClipStatus,
  CrossLibraryHint,
  EmbeddingModelId,
  GrownFeature,
  Facet,
  FilterState,
  Folder,
  ImportDirNode,
  Item,
  PickApplyResult,
  PickExportResult,
  PickSessionSummary,
  SmartFolder,
  Stats,
  Tag
} from '@shared/types'
import Sidebar from './components/Sidebar'
import Toolbar from './components/Toolbar'
import Gallery from './components/Gallery'
import DetailPanel from './components/DetailPanel'
import ResizeHandle from './components/ResizeHandle'
import Lightbox from './components/Lightbox'
import PortraitWorkspace from './PortraitWorkspace'
import { pickScorable } from './lib/scoreQueue'
import DuplicatesDialog from './components/DuplicatesDialog'
import AutoBackupDialog from './components/AutoBackupDialog'
import AutoTagDialog from './components/AutoTagDialog'
import RelocateDialog from './components/RelocateDialog'
import EquipmentDialog from './components/EquipmentDialog'
import SettingsDialog, { type SettingsTab } from './components/SettingsDialog'
import AdviceDialog from './components/AdviceDialog'
import SmartFilterDialog from './components/SmartFilterDialog'
import PickExportDialog from './components/PickExportDialog'
import FinalsExportDialog from './components/FinalsExportDialog'
import ContextMenu, { type ContextMenuEntry } from './components/ContextMenu'
import PickImportDialog from './components/PickImportDialog'
import PickDelivery from './components/PickDelivery'
import FirstRunDialog from './components/FirstRunDialog'
import FirstImportHint from './components/FirstImportHint'
import ImportDialog from './components/ImportDialog'
import ImportStatusCard from './components/ImportStatusCard'
import ResumeImportCard from './components/ResumeImportCard'
import Welcome from './components/Welcome'
import LibrarySwitcher from './components/LibrarySwitcher'
import { formatBytes, folderName, samePath } from './lib/format'
import { pickHttpUrl } from './lib/urlImport'
import { inAiScope, loadAiScope, type AiScope } from './lib/aiScope'
import { estimateBatchTokens } from './lib/aiCost'
import { useLayoutSizes } from './hooks/useLayoutSizes'
import { useAppearance } from './hooks/useAppearance'
import { useLightbox } from './hooks/useLightbox'
import { useShortcuts } from './hooks/useShortcuts'
import { useSelection } from './hooks/useSelection'
import { useImport } from './hooks/useImport'
import { modLabel } from './lib/platform'

const EMPTY_STATS: Stats = {
  total: 0,
  missing: 0,
  tags: 0,
  folders: 0,
  bytes: 0,
  errors: 0,
  clientPicked: 0,
  trashed: 0
}
const PAGE = 200

interface Toast {
  text: string
  undo?: boolean
}

/** 主进程抛回来的错误去掉 IPC 前缀，直接给用户看 */
function errorText(error: unknown): string {
  return String((error as Error)?.message ?? error)
    .replace(/^Error invoking remote method '[^']+':\s*/, '')
    .replace(/^Error:\s*/, '')
}

export default function App() {
  const [library, setLibrary] = useState<string | null>(null)
  /** 图库显示名（启动页可重命名） */
  const [libraryName, setLibraryName] = useState('')
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [booting, setBooting] = useState(true)
  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  /** 当前库零结果时，其他库的命中提示 */
  const [otherHint, setOtherHint] = useState<CrossLibraryHint | null>(null)
  const [tags, setTags] = useState<Tag[]>([])
  const [facets, setFacets] = useState<Facet[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [smarts, setSmarts] = useState<SmartFolder[]>([])
  const [dirTree, setDirTree] = useState<ImportDirNode[]>([])
  const [stats, setStats] = useState<Stats>(EMPTY_STATS)
  const [filter, setFilter] = useState<FilterState>({ sort: 'added' })
  const [thumbSize, setThumbSize] = useState(230)
  const [duplicatesOpen, setDuplicatesOpen] = useState(false)
  const [autoBackupOpen, setAutoBackupOpen] = useState(false)
  const [autoTagOpen, setAutoTagOpen] = useState(false)
  /** 首启二选一：null = 还没选过 */
  const [useCase, setUseCase] = useState<AppUseCase | null>(null)
  const [useCaseLoaded, setUseCaseLoaded] = useState(false)
  /** 摄影功能用过一次后常驻主导航 */
  const [grownFeatures, setGrownFeatures] = useState<GrownFeature[]>([])
  /** 人像工作台：独立三栏视图，和主图库共用同一份 items */
  const [portraitOpen, setPortraitOpen] = useState(false)
  const [relocateOpen, setRelocateOpen] = useState(false)
  const [equipmentOpen, setEquipmentOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('appearance')
  /** 上次的索引目录里没有 library.db：在欢迎页上说清楚，别让用户以为图库没了 */
  const [indexMissing, setIndexMissing] = useState<string | null>(null)
  const [adviceOpen, setAdviceOpen] = useState(false)
  const [aiScoring, setAiScoring] = useState(false)
  /** 大模型是否可用：关掉开关或没存 Key 时，相册里的 AI 入口只引导去设置，不发请求 */
  const [aiReady, setAiReady] = useState(false)
  /** 每个能力自己的开关，关掉后对应入口直接隐藏 */
  const [aiCaps, setAiCaps] = useState<Record<string, boolean>>({})
  /** 当前模型看不了图：AI 入口不可用，但要在界面上说清楚原因 */
  const [aiVisionBlocked, setAiVisionBlocked] = useState(false)
  /** AI 处理范围（星级 + 文件夹）：单张的 AI 入口据此显隐；null = 还没读回来 */
  const [aiScope, setAiScope] = useState<AiScope | null>(null)
  const [smartFilterOpen, setSmartFilterOpen] = useState(false)
  const [pickExportOpen, setPickExportOpen] = useState(false)
  /** 从选片交付打开草稿：生成时写回同一单，不新建 */
  const [pickExportDraft, setPickExportDraft] = useState<{
    session: PickSessionSummary
    itemIds: number[]
  } | null>(null)
  const [finalsExportOpen, setFinalsExportOpen] = useState(false)
  /** 导出成品的目标照片；null = 用主图库当前选中的照片 */
  const [finalsExportIds, setFinalsExportIds] = useState<number[] | null>(null)
  /** 右键菜单：同一时间只有一份，位置是鼠标坐标 */
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: number } | null>(null)
  const [pickImportOpen, setPickImportOpen] = useState(false)
  /** 选片交付视图：和主图库、人像工作台同级 */
  const [pickDeliveryOpen, setPickDeliveryOpen] = useState(false)
  /** 回传或删除后递增，让交付视图重新拉会话 */
  const [pickDeliveryTick, setPickDeliveryTick] = useState(0)
  /** 从选片交付进入导入时，预选那一单 */
  const [pickImportSessionId, setPickImportSessionId] = useState<number | null>(null)
  /** AI 筛选用的规则文案，仅用于工具栏 chip 展示；筛选条件本身在 filter.onlyIds 里 */
  const [aiRule, setAiRule] = useState<string | null>(null)
  const [lastRelocateDir, setLastRelocateDir] = useState<string | null>(null)
  const [semanticMode, setSemanticMode] = useState(false)
  const [clipStatus, setClipStatus] = useState<ClipStatus | null>(null)
  const [clipProgress, setClipProgress] = useState<ClipProgress | null>(null)
  const [clipCardMinimized, setClipCardMinimized] = useState(false)
  const [clipDownload, setClipDownload] = useState<ClipDownloadProgress | null>(null)
  const [similar, setSimilar] = useState<{ id: number; name: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<string[]>([])
  const [tick, setTick] = useState(0)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const itemsRef = useRef<Item[]>([])
  const totalRef = useRef(0)
  const filterRef = useRef(filter)
  const loadingMoreRef = useRef(false)
  const undoRef = useRef<Array<{ label: string; run: () => Promise<void> }>>([])
  const aiScoringRef = useRef(false)
  const shellRef = useRef<HTMLDivElement>(null)

  const {
    selectedIds,
    activeId,
    setSelectedIds,
    setActiveId,
    selectAll,
    moveSelection,
    moveSelectionBy,
    restoreSelection
  } = useSelection(itemsRef)

  filterRef.current = { ...filter, expandedGroups }
  totalRef.current = total

  const bump = useCallback(() => setTick((v) => v + 1), [])

  /** 打开设置；从 AI 弹窗点「去设置」时直接落到「大模型」分类 */
  const openSettings = useCallback((tab: SettingsTab = 'appearance') => {
    setSettingsTab(tab)
    setSettingsOpen(true)
  }, [])

  const { layoutRef, resizeRef, resizeLayout, commitResize, resetLayout } = useLayoutSizes(shellRef, library)

  const applyItems = useCallback((list: Item[]) => {
    itemsRef.current = list
    setItems(list)
  }, [])

  const notify = useCallback((text: string) => setToast({ text }), [])

  /** 用过一次就常驻主导航；配置写失败也不影响本次会话 */
  const growFeature = useCallback((feature: GrownFeature) => {
    setGrownFeatures((prev) => {
      if (prev.includes(feature)) return prev
      const next = [...prev, feature]
      void window.api.saveGrownFeatures(next).catch(() => undefined)
      return next
    })
  }, [])

  const chooseUseCase = useCallback(async (value: AppUseCase): Promise<void> => {
    try {
      setUseCase(await window.api.saveUseCase(value))
    } catch {
      setUseCase(value)
    }
  }, [])

  const {
    importOpen,
    openImportDialog,
    closeImportDialog,
    importOptions,
    setImportOptions,
    importRunning,
    progress,
    clearProgress,
    importResult,
    setImportResult,
    pendingImport,
    firstImportHint,
    closeFirstImportHint,
    startImport,
    importFiles,
    importFolder,
    resumePendingImport,
    discardPendingImport,
    retryFailedImports,
    syncLibrary
  } = useImport({ library, notify, bump, setFilter })

  const pushUndo = useCallback(
    (label: string, run: () => Promise<void>, showToast = true) => {
      undoRef.current.push({ label, run })
      if (undoRef.current.length > 20) undoRef.current.shift()
      if (showToast) setToast({ text: label, undo: true })
    },
    []
  )

  const undoLast = useCallback(async () => {
    const entry = undoRef.current.pop()
    if (!entry) {
      notify('没有可撤销的操作')
      return
    }
    try {
      await entry.run()
      setTick((v) => v + 1)
      notify(`已撤销：${entry.label}`)
    } catch (error) {
      notify(`撤销失败：${(error as Error).message}`)
    }
  }, [notify])

  const { lightboxId, revealTick, openLightbox, closeLightbox } = useLightbox(restoreSelection)

  const refreshMeta = useCallback(async () => {
    const [nextTags, nextFolders, nextSmarts, nextStats, nextDirs, nextFacets] = await Promise.all([
      window.api.listTags(),
      window.api.listFolders(),
      window.api.listSmart(),
      window.api.stats(),
      window.api.listDirTree(),
      window.api.listFacets()
    ])
    setTags(nextTags)
    setFolders(nextFolders)
    setSmarts(nextSmarts)
    setStats(nextStats)
    setDirTree(nextDirs)
    setFacets(nextFacets)
    // 文件夹可能刚被删或新建，处理范围跟着刷新，免得按钮该出现却不出现
    void loadAiScope().then(setAiScope)
  }, [])

  useEffect(() => {
    window.api
      .lastLibrary()
      .then((result) => {
        if (result?.dir) setLibrary(result.dir)
        else if (result?.indexMissing) setIndexMissing(result.indexMissing)
      })
      .catch(() => undefined)
      .finally(() => setBooting(false))
  }, [])

  // 首启使用方式与「用过即常驻」功能一起读回来，避免侧栏闪一下再收起
  useEffect(() => {
    let cancelled = false
    void Promise.all([window.api.getUseCase(), window.api.getGrownFeatures()])
      .then(([value, features]) => {
        if (cancelled) return
        setUseCase(value)
        setGrownFeatures(features)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setUseCaseLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 侧栏显示库名：优先用启动页里改过的名字
  useEffect(() => {
    if (!library) {
      setLibraryName('')
      return
    }
    let cancelled = false
    void window.api
      .listLibraries()
      .then((list) => {
        if (cancelled) return
        setLibraryName(
          list.find((item) => samePath(item.path, library))?.name ?? folderName(library)
        )
      })
      .catch(() => {
        if (!cancelled) setLibraryName(folderName(library))
      })
    return () => {
      cancelled = true
    }
  }, [library])

  const { theme, changeTheme, skin, changeSkin, thumbQuality, changeThumbQuality } = useAppearance()

  /** 筛选签名：只有筛选真的变了才把列表收回到第一页 */
  const filterKey = useMemo(() => JSON.stringify(filter), [filter])
  filterRef.current = filter
  const lastFilterKeyRef = useRef('')

  useEffect(() => {
    if (!library) return
    // 找相似模式下列表由该操作接管
    if (similar) return
    let cancelled = false
    setLoading(true)
    const filterChanged = lastFilterKeyRef.current !== filterKey
    lastFilterKeyRef.current = filterKey
    // 换筛选只取首页；只是展开/收起分组时保留已加载条数
    const keep = filterChanged ? PAGE : Math.max(PAGE, itemsRef.current.length)
    const timer = setTimeout(async () => {
      const current = filterRef.current
      try {
        const query = (current.query ?? '').trim()
        if (semanticMode && query) {
          const result = await window.api.clipSearchText(query, { ...current, query: '' }, 200, 0)
          if (cancelled) return
          applyItems(result.items)
          setTotal(result.total)
          return
        }
        const result = await window.api.listItems({ ...current, expandedGroups }, 0, keep)
        if (cancelled) return
        applyItems(result.items)
        setTotal(result.total)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, semanticMode ? 320 : 120)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [library, filterKey, expandedGroups, tick, applyItems, semanticMode, similar])

  // 本库零结果时，顺手探一下其他库有没有可能命中的内容
  useEffect(() => {
    const query = (filter.query ?? '').trim()
    if (!library || loading || total > 0 || !query) {
      setOtherHint(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      void window.api
        .searchOtherLibraries(query)
        .then((hint) => {
          if (!cancelled) setOtherHint(hint.total > 0 ? hint : null)
        })
        .catch(() => {
          if (!cancelled) setOtherHint(null)
        })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [library, filter.query, total, loading, tick])

  // 导入/评分等操作会连续 bump tick：元数据刷新合并成一次 300ms 防抖
  useEffect(() => {
    if (!library) return
    const timer = setTimeout(() => {
      void refreshMeta()
      void window.api.clipStatus().then(setClipStatus).catch(() => undefined)
      void window.api.lastRelocateDir().then(setLastRelocateDir).catch(() => undefined)
    }, 300)
    return () => clearTimeout(timer)
  }, [library, tick, refreshMeta])

  useEffect(() => window.api.onClipIndex(setClipProgress), [])
  // 索引结束（完成 / 取消 / 出错）后收起进度卡片，并刷新侧栏的已索引数量
  useEffect(
    () =>
      window.api.onClipIndexEnd(() => {
        setClipProgress(null)
        void window.api.clipStatus().then(setClipStatus).catch(() => undefined)
      }),
    []
  )
  useEffect(() => window.api.onClipAutoStatus(setClipStatus), [])
  useEffect(() => window.api.onClipDownload(setClipDownload), [])

  useEffect(
    () =>
      window.api.onLibraryChanged((info) => {
        setToast({ text: `检测到文件变化 · 新增 ${info.added} · 丢失 ${info.missing}` })
        setTick((v) => v + 1)
      }),
    []
  )

  useEffect(
    () =>
      window.api.onAutoBackup((result) => {
        setToast({
          text: result.ok
            ? `自动备份完成 · ${formatBytes(result.size ?? 0)}`
            : `自动备份失败：${result.error ?? '未知错误'}`
        })
      }),
    []
  )

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4200)
    return () => clearTimeout(timer)
  }, [toast])

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current) return
    const current = itemsRef.current
    if (current.length >= totalRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const activeFilter = filterRef.current
      const query = (activeFilter.query ?? '').trim()
      const result =
        semanticMode && query
          ? await window.api.clipSearchText(query, { ...activeFilter, query: '' }, PAGE, current.length)
          : similar
            ? await window.api.clipSimilar(similar.id, PAGE, current.length)
            : await window.api.listItems(activeFilter, current.length, PAGE)
      const seen = new Set(current.map((i) => i.id))
      const merged = [...current, ...result.items.filter((i) => !seen.has(i.id))]
      applyItems(merged)
      setTotal(result.total)
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [applyItems, semanticMode, similar])

  useEffect(() => {
    const onDragEnter = (e: DragEvent): void => {
      e.preventDefault()
      dragDepth.current += 1
      if (library) setDragging(true)
    }
    const onDragOver = (e: DragEvent): void => {
      e.preventDefault()
    }
    const onDragLeave = (e: DragEvent): void => {
      e.preventDefault()
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragging(false)
    }
    const onDrop = (e: DragEvent): void => {
      e.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      if (!library) return
      // 库内拖拽（整理到文件夹/标签）不当作导入
      if (e.dataTransfer?.types.includes('application/x-imagenest-items')) return
      const files = Array.from(e.dataTransfer?.files ?? [])
      const paths = files.map((f) => window.api.getPathForFile(f)).filter(Boolean)
      if (paths.length > 0) {
        void startImport(paths)
        return
      }
      // 从浏览器拖图片网址进来：交给主进程下载后再走导入
      const raw =
        e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain') || ''
      const url = pickHttpUrl(raw)
      if (!url) return
      notify('正在从网址取图…')
      void window.api
        .importUrl(url)
        .then((result) => {
          if (!result.ok) {
            notify(
              result.reason === 'not-image'
                ? '这个网址不是图片'
                : result.reason === 'too-large'
                  ? '图片超过 30 MB，先存下来再导入吧'
                  : result.reason === 'invalid-url'
                    ? '只支持 http/https 图片地址'
                    : result.reason === 'no-library'
                      ? '先打开一个图库'
                      : '下载失败，检查网址或网络'
            )
            return
          }
          setTick((value) => value + 1)
          notify(result.added === 0 ? '这张图已经在图库里了' : '已从网址存入图库')
        })
        .catch((error) => notify(`网址导入失败：${(error as Error).message}`))
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [library, startImport])

  // Ctrl+V：剪贴板里是图片文件就直接导入；截图这类没有路径的位图交给主进程落盘再入库
  useEffect(() => {
    const onPaste = (event: ClipboardEvent): void => {
      if (!library) return
      const target = event.target as HTMLElement | null
      const typing =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      if (typing) return

      const data = event.clipboardData
      if (!data) return

      const files = Array.from(data.files).filter((file) => file.type.startsWith('image/'))
      const paths = files.map((file) => window.api.getPathForFile(file)).filter(Boolean)
      if (paths.length) {
        event.preventDefault()
        void startImport(paths)
        return
      }

      // 网页 / 截图工具复制出来的只有位图，没有磁盘路径，让主进程从系统剪贴板读
      if (!Array.from(data.items).some((entry) => entry.type.startsWith('image/'))) return
      event.preventDefault()
      void window.api
        .pasteImage()
        .then((result) => {
          if (!result.ok) {
            if (result.reason === 'no-library') notify('先打开一个图库再粘贴')
            return
          }
          setTick((value) => value + 1)
          notify(result.added === 0 ? '这张图已经在图库里了' : '已存入图库')
        })
        .catch((error) => notify(`粘贴失败：${(error as Error).message}`))
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [library, notify, startImport])

  const deleteSelected = useCallback(async () => {
    const ids = selectedIds.length ? [...selectedIds] : activeId ? [activeId] : []
    if (!ids.length) return
    await window.api.deleteItems(ids)
    setSelectedIds([])
    setActiveId(null)
    pushUndo(`已移除 ${ids.length} 张，按 ${modLabel}+Z 撤销`, async () => {
      await window.api.restoreItems(ids)
      setTick((v) => v + 1)
    })
    bump()
  }, [selectedIds, activeId, pushUndo, bump])

  /** 丢失视图里一次性清理所有丢失记录：只动索引，不动磁盘，可撤销 */
  const clearMissing = useCallback(async () => {
    const snapshot = await window.api.stats()
    if (!snapshot.missing) {
      notify('没有可清理的丢失记录')
      return
    }
    const ok = await window.api.confirm(
      '清理丢失记录',
      `将移除 ${snapshot.missing} 条文件已丢失的索引记录。磁盘上的原图不受影响，清理后可按 ${modLabel}+Z 撤销。`
    )
    if (!ok) return
    const ids = await window.api.trashMissing()
    if (!ids.length) return
    setSelectedIds([])
    setActiveId(null)
    pushUndo(`已清理 ${ids.length} 条丢失记录，按 ${modLabel}+Z 撤销`, async () => {
      await window.api.restoreItems(ids)
      setTick((v) => v + 1)
    })
    bump()
  }, [notify, pushUndo, bump])

  /** 回收站：把选中的照片恢复到主图库 */
  const restoreSelected = useCallback(async () => {
    const ids = selectedIds.length ? [...selectedIds] : activeId ? [activeId] : []
    if (!ids.length) return
    await window.api.restoreItems(ids)
    setSelectedIds([])
    setActiveId(null)
    // 全部恢复了就退出回收站视图，别让用户留在空列表里
    if (ids.length >= stats.trashed) {
      setFilter((prev) => (prev.trashed ? { ...prev, trashed: false } : prev))
    }
    notify(`已恢复 ${ids.length} 张`)
    bump()
  }, [selectedIds, activeId, stats.trashed, notify, bump])

  /** 回收站：彻底删除记录与缩略图缓存，原图文件不动 */
  const purgeSelected = useCallback(async () => {
    const ids = selectedIds.length ? [...selectedIds] : activeId ? [activeId] : []
    if (!ids.length) return
    const ok = await window.api.confirm(
      '彻底删除这些照片？',
      `会删除 ${ids.length} 条记录与缩略图缓存，无法撤销；磁盘上的原图文件不会动。`
    )
    if (!ok) return
    await window.api.purgeItems(ids)
    setSelectedIds([])
    setActiveId(null)
    if (ids.length >= stats.trashed) {
      setFilter((prev) => (prev.trashed ? { ...prev, trashed: false } : prev))
    }
    notify(`已彻底删除 ${ids.length} 条记录`)
    bump()
  }, [selectedIds, activeId, stats.trashed, notify, bump])

  /** 回收站：清空，并退出空视图 */
  const purgeAllTrashed = useCallback(async () => {
    if (stats.trashed === 0) {
      notify('回收站已经是空的')
      return
    }
    const ok = await window.api.confirm(
      '清空回收站？',
      `会彻底删除 ${stats.trashed} 条记录与缩略图缓存，无法撤销；原图文件不受影响。`
    )
    if (!ok) return
    const count = await window.api.purgeAllTrashed()
    setSelectedIds([])
    setActiveId(null)
    setFilter((prev) => ({ ...prev, trashed: false }))
    notify(`已清空回收站 · ${count} 条`)
    bump()
  }, [stats.trashed, notify, bump])

  const rateSelected = useCallback(
    async (rating: number) => {
      const ids = selectedIds.length ? selectedIds : activeId ? [activeId] : []
      if (!ids.length) return
      const before = itemsRef.current
        .filter((i) => ids.includes(i.id))
        .map((i) => ({ id: i.id, rating: i.rating }))
      await window.api.bulkUpdate(ids, { rating })
      pushUndo(
        `评分改为 ${rating} 星`,
        async () => {
          // 撤销时按旧分值分组回写，最多 6 次 IPC，不再逐张
          const groups = new Map<number, number[]>()
          for (const prev of before) {
            const list = groups.get(prev.rating) ?? []
            list.push(prev.id)
            groups.set(prev.rating, list)
          }
          for (const [value, group] of groups) {
            await window.api.bulkUpdate(group, { rating: value })
          }
        },
        false
      )
      bump()
    },
    [selectedIds, activeId, pushUndo, bump]
  )

  const setFlagSelected = useCallback(
    async (flag: number) => {
      const ids = selectedIds.length ? selectedIds : activeId ? [activeId] : []
      if (!ids.length) return
      const before = itemsRef.current
        .filter((i) => ids.includes(i.id))
        .map((i) => ({ id: i.id, flag: i.flag }))
      await window.api.bulkUpdate(ids, { flag })
      pushUndo(
        `旗标：${flag > 0 ? '留用' : flag < 0 ? '淘汰' : '清除'}`,
        async () => {
          const groups = new Map<number, number[]>()
          for (const prev of before) {
            const list = groups.get(prev.flag) ?? []
            list.push(prev.id)
            groups.set(prev.flag, list)
          }
          for (const [value, group] of groups) {
            await window.api.bulkUpdate(group, { flag: value })
          }
        },
        false
      )
      bump()
    },
    [selectedIds, activeId, pushUndo, bump]
  )

  /** 批量备注：追加交给主进程一条 SQL 完成，撤销按旧备注分组回写 */
  const bulkNoteSelected = useCallback(
    async (text: string, append: boolean) => {
      const value = text.trim()
      const ids = selectedIds.length ? selectedIds : activeId ? [activeId] : []
      if (!ids.length || !value) return
      const before = itemsRef.current
        .filter((i) => ids.includes(i.id))
        .map((i) => ({ id: i.id, note: i.note ?? '' }))
      await window.api.bulkUpdate(ids, append ? { note: value, noteAppend: true } : { note: value })
      pushUndo(
        append ? `已给 ${ids.length} 张追加备注` : `已替换 ${ids.length} 张的备注`,
        async () => {
          const groups = new Map<string, number[]>()
          for (const prev of before) {
            const list = groups.get(prev.note) ?? []
            list.push(prev.id)
            groups.set(prev.note, list)
          }
          for (const [note, group] of groups) {
            await window.api.bulkUpdate(group, { note })
          }
        },
        false
      )
      notify(append ? `已给 ${ids.length} 张追加备注` : `已替换 ${ids.length} 张的备注`)
      bump()
    },
    [selectedIds, activeId, pushUndo, notify, bump]
  )

  /**
   * 大模型评分：一次最多 12 张（能力侧也会拦），结果由主进程直接落库，
   * 这里只负责刷新列表，让卡片角标与详情面板立刻读到分数。
   */
  const scoreItems = useCallback(
    async (ids: number[]) => {
      if (!ids.length || aiScoringRef.current) return
      // 批量评分只处理设置里圈定的范围；单张按钮在范围外根本不会出现
      const scope = await loadAiScope()
      const items = itemsRef.current
      const ratings = new Map(items.map((item) => [item.id, item.rating]))
      const inScope = new Set(
        items.filter((item) => inAiScope(item, scope)).map((item) => item.id)
      )
      const candidates = pickScorable(ids, ratings, scope.minRating).filter((id) =>
        inScope.has(id)
      )
      const skipped = ids.length - candidates.length
      if (!candidates.length) {
        const rule = [
          scope.minRating > 0 ? `${scope.minRating} 星及以上` : '',
          scope.folderIds.length > 0 ? '在选中的文件夹里' : ''
        ]
          .filter(Boolean)
          .join('、')
        notify(`选中的照片都不在「AI 作用的照片」里${rule ? `（需要${rule}）` : ''}，已全部跳过`)
        return
      }
      const picked = candidates.slice(0, 12)
      // 批量处理前先把数量和预估 token 交给用户确认；单张点选不再多弹一次
      if (picked.length > 1) {
        const cost = estimateBatchTokens('quality', picked.length)
        const detail =
          `本次会给 ${picked.length} 张照片评分，会多花一点时间。` +
          (skipped > 0 ? `另有 ${skipped} 张不在 AI 作用范围，会跳过。` : '') +
          (cost.heavy ? '这次调用量较大，确认后才会开始。' : '')
        const ok = await window.api.confirm(
          cost.heavy ? '这次评分花的时间会久一些' : 'AI 评分',
          detail
        )
        if (!ok) return
      }
      aiScoringRef.current = true
      setAiScoring(true)
      try {
        const outcome = await window.api.llmScore(picked)
        if (!outcome.ok) {
          notify(outcome.message)
          return
        }
        const { results, failed, persisted } = outcome.data
        const average = results.length
          ? Math.round(results.reduce((sum, item) => sum + item.overall, 0) / results.length)
          : 0
        const extra = [
          failed.length ? `${failed.length} 张失败` : '',
          skipped ? `跳过 ${skipped} 张不在 AI 作用范围` : '',
          candidates.length > picked.length ? `本次只评了前 ${picked.length} 张` : ''
        ]
          .filter(Boolean)
          .join('，')
        notify(`已评分 ${persisted} 张，平均 ${average} 分${extra ? `（${extra}）` : ''}`)
        bump()
      } catch (error) {
        // IPC 层本身出错（例如主进程没准备好）时也要给用户回执，不能静默失败
        notify(`评分失败：${(error as Error).message}`)
      } finally {
        aiScoringRef.current = false
        setAiScoring(false)
      }
    },
    [notify, bump]
  )

  const clearAiFilter = useCallback(() => {
    setAiRule(null)
    setFilter((prev) => ({ ...prev, onlyIds: undefined }))
  }, [])

  // 设置面板开关/换 Key 后回到主界面要立刻反映到 AI 入口的可用状态
  useEffect(() => {
    if (!library) {
      setAiScope(null)
      return
    }
    // 处理范围跟着图库与设置走：换库或关掉设置面板时重新读一次
    void loadAiScope().then(setAiScope)
    void window.api
      .llmStatus()
      .then((status) => {
        // 视觉能力是硬门槛：模型看不了图时，对应的 AI 入口直接不可用
        setAiReady(status.ready)
        setAiCaps(
          Object.fromEntries(
            status.capabilities.map((capability) => [
              capability.id,
              capability.enabled && capability.vision
            ])
          )
        )
        setAiVisionBlocked(
          status.capabilities.some((capability) => capability.enabled && !capability.vision)
        )
      })
      .catch(() => {
        setAiReady(false)
        setAiCaps({})
        setAiVisionBlocked(false)
      })
  }, [library, settingsOpen])

  // AI 评分入口被关掉（或总开关关闭）时，把隐藏起来的 AI 排序与筛选项一并复位，
  // 免得不显示却还在偷偷过滤结果
  const aiScoreAvailable = aiReady && aiCaps['photo.quality'] !== false
  useEffect(() => {
    if (aiScoreAvailable) return
    if ((filter.sort ?? 'added') !== 'ai' && !filter.minAiScore && !filter.unscored) return
    setFilter((prev) => ({
      ...prev,
      sort: prev.sort === 'ai' ? 'added' : prev.sort,
      minAiScore: 0,
      unscored: false
    }))
  }, [aiScoreAvailable, filter.sort, filter.minAiScore, filter.unscored])

  const applyAiFilter = useCallback(
    (rule: string, ids: number[]) => {
      setAiRule(rule)
      setFilter((prev) => ({ ...prev, onlyIds: ids }))
      setSmartFilterOpen(false)
      setSelectedIds([])
      setActiveId(null)
      notify(`AI 筛出 ${ids.length} 张：${rule}`)
    },
    [notify]
  )

  // 从侧栏或其它入口换掉整套筛选条件时，AI 规则文案也要跟着消失，避免 chip 与结果不一致
  useEffect(() => {
    if (aiRule && !filter.onlyIds?.length) setAiRule(null)
  }, [aiRule, filter.onlyIds])

  const stackSelected = useCallback(async () => {
    if (selectedIds.length < 2) return
    try {
      await window.api.stackItems(selectedIds)
      notify(`已堆叠 ${selectedIds.length} 张`)
      setSelectedIds([])
      bump()
    } catch (error) {
      notify(`堆叠失败：${(error as Error).message}`)
    }
  }, [selectedIds, notify, bump])

  const unstackItem = useCallback(
    async (stackId: number) => {
      await window.api.unstack(stackId)
      setExpandedGroups((prev) => prev.filter((key) => key !== `s${stackId}`))
      notify('已拆开堆叠')
      bump()
    },
    [notify, bump]
  )

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    )
  }, [])

  useShortcuts({
    portraitOpen,
    pickDeliveryOpen,
    library,
    useCaseLoaded,
    useCase,
    lightboxId,
    activeId,
    selectedIds,
    setSelectedIds,
    selectAll,
    setActiveId,
    openLightbox,
    closeLightbox,
    undoLast,
    deleteSelected,
    rateSelected,
    setFlagSelected,
    moveSelection,
    moveSelectionBy,
    notify
  })

  const selectedIdsRef = useRef<number[]>([])
  selectedIdsRef.current = selectedIds

  const handleSelect = useCallback((id: number, e: ReactMouseEvent): void => {
    const current = selectedIdsRef.current
    const additive = e.ctrlKey || e.metaKey
    if (e.shiftKey && current.length > 0) {
      const list = itemsRef.current
      const from = list.findIndex((i) => i.id === current[current.length - 1])
      const to = list.findIndex((i) => i.id === id)
      if (from >= 0 && to >= 0) {
        const [start, end] = from < to ? [from, to] : [to, from]
        setSelectedIds(list.slice(start, end + 1).map((i) => i.id))
        return
      }
    }
    if (additive) {
      setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
    } else {
      setSelectedIds([id])
      setActiveId(id)
    }
  }, [setActiveId, setSelectedIds])

  const addSelectedToFolder = async (folderId: number): Promise<void> => {
    const ids = selectedIds.length ? selectedIds : activeId ? [activeId] : []
    if (!ids.length) return
    await window.api.addToFolder(ids, folderId)
    pushUndo(
      `已加入「${folders.find((f) => f.id === folderId)?.name ?? ''}」`,
      async () => {
        await window.api.removeFromFolder(ids, folderId)
      },
      false
    )
    notify(`已加入「${folders.find((f) => f.id === folderId)?.name ?? ''}」`)
    bump()
  }

  /** 右键菜单 / 拖拽共用的打标签：失败时把主进程的原因带出来 */
  const addSelectedTag = async (tagId: number): Promise<void> => {
    const ids = selectedIds.length ? selectedIds : activeId ? [activeId] : []
    if (!ids.length) return
    const name = tags.find((tag) => tag.id === tagId)?.name ?? ''
    try {
      await window.api.setTag(ids, tagId, true)
      pushUndo(
        `已打上「${name}」`,
        async () => {
          await window.api.setTag(ids, tagId, false)
        },
        false
      )
      notify(`已打上「${name}」`)
      bump()
    } catch (error) {
      notify(`打标签失败：${errorText(error)}`)
    }
  }

  /** 右键先把这张选上（已在多选里就保持多选），再在鼠标位置弹菜单 */
  const openItemContextMenu = useCallback(
    (id: number, position: { clientX: number; clientY: number; preventDefault: () => void }): void => {
      position.preventDefault()
      setSelectedIds((prev) => (prev.includes(id) ? prev : [id]))
      setActiveId(id)
      setContextMenu({ x: position.clientX, y: position.clientY, id })
    },
    []
  )

  const handleDropItems = async (
    ids: number[],
    target: { folderId?: number; tagId?: number }
  ): Promise<void> => {
    if (!ids.length) return
    try {
      if (target.folderId) {
        await window.api.addToFolder(ids, target.folderId)
        pushUndo(`已加入「${folders.find((f) => f.id === target.folderId)?.name ?? ''}」`, async () => {
          await window.api.removeFromFolder(ids, target.folderId as number)
        })
      }
      if (target.tagId) {
        await window.api.setTag(ids, target.tagId, true)
        pushUndo(`已打上「${tags.find((t) => t.id === target.tagId)?.name ?? ''}」`, async () => {
          await window.api.setTag(ids, target.tagId as number, false)
        })
      }
      bump()
    } catch (error) {
      // 目标可能在拖拽途中被删掉，别静默失败
      notify(`拖入失败：${errorText(error)}`)
    }
  }

  /** 右键菜单条目：回收站视图只给恢复与彻底删除，主库给完整动作 */
  const buildItemMenu = (item: Item): ContextMenuEntry[] => {
    const ids = selectedIds.includes(item.id) ? selectedIds : [item.id]
    const base: ContextMenuEntry[] = [
      {
        id: 'open',
        label: '打开',
        icon: <Maximize size={12} />,
        onSelect: () => openLightbox(item.id)
      },
      {
        id: 'reveal',
        label: '在资源管理器中显示',
        icon: <FolderOpen size={12} />,
        onSelect: () => void window.api.showInFolder(item.path)
      }
    ]
    if (filter.trashed) {
      return [
        ...base,
        { id: 'trash-sep', label: '', separator: true },
        {
          id: 'restore',
          label: `从回收站恢复${ids.length > 1 ? `（${ids.length} 张）` : ''}`,
          icon: <RefreshCw size={12} />,
          onSelect: () => void restoreSelected()
        },
        {
          id: 'purge',
          label: `彻底删除${ids.length > 1 ? `（${ids.length} 张）` : ''}`,
          icon: <Trash2 size={12} />,
          danger: true,
          onSelect: () => void purgeSelected()
        }
      ]
    }
    const tagChildren: ContextMenuEntry[] = tags.length
      ? tags.map((tag) => ({
          id: `tag-${tag.id}`,
          label: tag.name,
          onSelect: () => void addSelectedTag(tag.id)
        }))
      : [{ id: 'tag-empty', label: '还没有标签', disabled: true }]
    const folderChildren: ContextMenuEntry[] = folders.length
      ? folders.map((folder) => ({
          id: `folder-${folder.id}`,
          label: folder.name,
          onSelect: () => void addSelectedToFolder(folder.id)
        }))
      : [{ id: 'folder-empty', label: '还没有文件夹', disabled: true }]
    return [
      ...base,
      {
        id: 'copy',
        label: '复制图片',
        icon: <Copy size={12} />,
        onSelect: () =>
          void window.api
            .copyImage(item.id)
            .then((ok) => notify(ok ? '已复制图片到剪贴板' : '复制失败，试试其它图片'))
      },
      { id: 'action-sep', label: '', separator: true },
      {
        id: 'rate',
        label: '评分',
        icon: <Star size={12} />,
        hint: item.rating ? '★'.repeat(item.rating) : undefined,
        children: [
          ...[1, 2, 3, 4, 5].map((n) => ({
            id: `rate-${n}`,
            label: '★'.repeat(n),
            checked: item.rating === n,
            onSelect: () => void rateSelected(n)
          })),
          {
            id: 'rate-0',
            label: '清除评分',
            checked: item.rating === 0,
            onSelect: () => void rateSelected(0)
          }
        ]
      },
      { id: 'tag', label: '加标签', icon: <TagIcon size={12} />, children: tagChildren },
      {
        id: 'folder',
        label: '加入文件夹',
        icon: <FolderPlus size={12} />,
        children: folderChildren
      },
      {
        id: 'stack',
        label: ids.length > 1 ? `堆叠这 ${ids.length} 张` : '堆叠',
        icon: <Layers size={12} />,
        disabled: ids.length < 2,
        onSelect: () => void stackSelected()
      },
      { id: 'remove-sep', label: '', separator: true },
      {
        id: 'remove',
        label: '移除',
        icon: <Trash2 size={12} />,
        danger: true,
        onSelect: () => void deleteSelected()
      }
    ]
  }

  const saveSmart = async (name: string): Promise<void> => {
    if (!name.trim()) return
    await window.api.saveSmart(name.trim(), filter)
    notify(`已保存智能文件夹「${name.trim()}」`)
    bump()
  }

  const createFolder = async (name: string, parentId: number | null = null): Promise<void> => {
    if (!name.trim()) return
    try {
      await window.api.createFolder(name.trim(), parentId)
      bump()
    } catch (error) {
      notify(`新建文件夹失败：${errorText(error)}`)
    }
  }

  const renameFolder = async (id: number, name: string): Promise<void> => {
    if (!name.trim()) return
    try {
      await window.api.renameFolder(id, name.trim())
      bump()
    } catch (error) {
      notify(`重命名失败：${errorText(error)}`)
    }
  }

  const moveFolder = async (
    id: number,
    parentId: number | null,
    index: number
  ): Promise<void> => {
    try {
      await window.api.moveFolder(id, parentId, index)
      bump()
    } catch (error) {
      notify(`移动文件夹失败：${errorText(error)}`)
    }
  }

  /** 把当前选中的照片设为文件夹封面；没有选中就给出提示 */
  const setFolderCover = async (folderId: number): Promise<void> => {
    const id = activeId ?? selectedIds[0] ?? null
    const item = id ? itemsRef.current.find((entry) => entry.id === id) : null
    if (!item) {
      notify('先在文件夹里选一张照片，再设为封面')
      return
    }
    try {
      await window.api.setFolderCover(folderId, item.id)
      notify(`已把「${item.name}」设为封面`)
      bump()
    } catch (error) {
      notify(`设置封面失败：${errorText(error)}`)
    }
  }

  const rescan = async (): Promise<void> => {
    const result = await window.api.rescan()
    notify(`扫描完成 · 丢失 ${result.missing} · 恢复 ${result.restored}`)
    bump()
  }

  const backupLibrary = async (): Promise<void> => {
    try {
      const result = await window.api.backupLibrary()
      if (result) notify(`备份完成 · ${formatBytes(result.size)}`)
    } catch (error) {
      notify(`备份失败：${(error as Error).message}`)
    }
  }

  const restoreLibrary = async (): Promise<void> => {
    try {
      const dir = await window.api.restoreLibrary()
      if (!dir) return
      setLibrary(dir)
      setFilter({ sort: 'added' })
      setSelectedIds([])
      setActiveId(null)
      setExpandedGroups([])
      setSemanticMode(false)
      setSimilar(null)
      setPickDeliveryOpen(false)
      notify('已从备份恢复')
      bump()
    } catch (error) {
      notify(`恢复失败：${(error as Error).message}`)
    } finally {
      // 恢复时补齐缩略图会走导入进度条，结束后要收起来
      clearProgress()
    }
  }

  const exportCsv = async (): Promise<void> => {
    try {
      const result = await window.api.exportCsv()
      if (result) notify(`已导出 ${result.count} 条素材清单`)
    } catch (error) {
      notify(`导出失败：${(error as Error).message}`)
    }
  }

  const downloadClipModel = async (modelId?: EmbeddingModelId): Promise<boolean> => {
    try {
      setClipDownload({ received: 0, total: 0, file: '' })
      await window.api.clipDownloadModel(modelId)
      setToast({ text: '识图模型下载完成' })
      setClipStatus(await window.api.clipStatus())
      return true
    } catch (error) {
      notify(`模型下载失败：${(error as Error).message}`)
      return false
    } finally {
      setClipDownload(null)
    }
  }

  const startClipIndex = async (): Promise<void> => {
    try {
      setClipCardMinimized(false)
      setClipProgress({ done: 0, total: 0, current: '' })
      const result = await window.api.clipIndex()
      notify(
        result.cancelled
          ? `识图已停止 · 本次新增 ${result.indexed} 张`
          : `识图完成 · 新增 ${result.indexed} 张${result.failed ? ` · 失败 ${result.failed}` : ''}`
      )
      setClipStatus(await window.api.clipStatus())
      bump()
    } catch (error) {
      notify(`识图失败：${(error as Error).message}`)
    } finally {
      setClipProgress(null)
    }
  }

  const ensureClipIndex = async (): Promise<void> => {
    const status = await window.api.clipStatus()
    setClipStatus(status)
    if (!status.modelReady) {
      const ok = await window.api.confirm(
        '描述搜图需要先下载识图模型',
        `${status.modelLabel} 模型约 ${formatBytes(status.modelBytes)}，只会下载一次，保存到本机。继续吗？`
      )
      if (!ok) return
      if (!(await downloadClipModel(status.modelId))) return
    }
    await startClipIndex()
  }

  const toggleSemantic = async (): Promise<void> => {
    if (semanticMode) {
      setSemanticMode(false)
      return
    }
    const status = await window.api.clipStatus()
    setClipStatus(status)

    if (!status.modelReady) {
      const ok = await window.api.confirm(
        '描述搜图需要先下载识图模型',
        `${status.modelLabel} 模型约 ${formatBytes(status.modelBytes)}，只会下载一次，保存到本机。继续吗？`
      )
      if (!ok) return
      const ready = await downloadClipModel(status.modelId)
      if (!ready) return
    }

    const fresh = await window.api.clipStatus()
    setClipStatus(fresh)
    setSemanticMode(true)
    if (fresh.total > fresh.indexed && !fresh.running) {
      notify('正在后台识别图片，完成后就能按描述搜')
      void startClipIndex()
    }
  }

  const findSimilar = async (id: number): Promise<void> => {
    try {
      const item = itemsRef.current.find((entry) => entry.id === id)
      const result = await window.api.clipSimilar(id, 200)
      setSimilar({ id, name: item?.name ?? '当前图片' })
      applyItems(result.items)
      setTotal(result.total)
      setSelectedIds([])
      setActiveId(null)
    } catch (error) {
      notify(`找相似失败：${(error as Error).message}`)
    }
  }

  const exitSimilar = (): void => {
    setSimilar(null)
    bump()
  }

  const activeItem = items.find((i) => i.id === activeId) ?? null
  const lightboxIndex = items.findIndex((i) => i.id === lightboxId)
  const contextMenuItem = contextMenu ? items.find((i) => i.id === contextMenu.id) ?? null : null

  /** 选片页按相册里的顺序编号，而不是按用户点选的先后 */
  const pickItemIds = useMemo(
    () => items.filter((item) => selectedIds.includes(item.id)).map((item) => item.id),
    [items, selectedIds]
  )
  const pickTitle = useMemo(() => {
    const d = new Date()
    const pad = (n: number): string => String(n).padStart(2, '0')
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const first = items.find((item) => selectedIds.includes(item.id))
    const dir = filter.dir ?? (first ? first.path.replace(/[\\/][^\\/]+$/, '') : '')
    return `${dir ? folderName(dir) : '选片'} · ${stamp}`
  }, [items, selectedIds, filter.dir])

  /** 把当前选中的一批照片存成「待交付」草稿，生成选片页留给交付视图 */
  const savePickDraft = useCallback(async (): Promise<void> => {
    if (!pickItemIds.length) return
    try {
      await window.api.pickCreateDraft({ itemIds: pickItemIds, title: pickTitle })
      notify('已存为待交付，去侧栏「选片交付」里生成浏览页')
      setSelectedIds([])
      setPickDeliveryTick((value) => value + 1)
    } catch (error) {
      const text = (error as Error).message
        .replace(/^Error invoking remote method '[^']+':\s*/, '')
        .replace(/^Error:\s*/, '')
      notify(`存草稿失败：${text}`)
    }
  }, [pickItemIds, pickTitle, notify])

  // 条件/排序/模式变化时让瀑布流回到顶部
  const listResetKey = [
    filter.sort ?? '',
    filter.query ?? '',
    filter.folderId ?? '',
    filter.dir ?? '',
    filter.errors ? 'errors' : '',
    (filter.tagIds ?? []).join(','),
    filter.colorFamily ?? '',
    filter.orientation ?? '',
    filter.minRating ?? 0,
    filter.flag ?? 0,
    filter.missing ? 'missing' : '',
    (filter.onlyIds ?? []).join(','),
    semanticMode ? 'sem' : '',
    similar ? `sim${similar.id}` : ''
  ].join('|')

  /** 热切换图库：主进程已经换好库，这里只重置视图状态 */
  const switchLibrary = (dir: string): void => {
    setSwitcherOpen(false)
    setLibrary(dir)
    setFilter({ sort: 'added' })
    setSelectedIds([])
    setActiveId(null)
    setExpandedGroups([])
    setSemanticMode(false)
    setSimilar(null)
    setOtherHint(null)
    setPickDeliveryOpen(false)
    closeLightbox()
    bump()
  }

  /** 零结果提示：切到命中的第一个库，并把查询词一起带过去 */
  const openOtherLibrary = async (): Promise<void> => {
    const target = otherHint?.matches[0]
    if (!target) return
    const query = filter.query ?? ''
    try {
      const dir = await window.api.openLibrary(target.path)
      switchLibrary(dir)
      setFilter({ sort: 'added', query })
    } catch (error) {
      notify(`切换图库失败：${errorText(error)}`)
    }
  }

  if (booting) {
    return (
      <div className="h-full grid place-items-center text-[var(--faint)] text-[13px]">正在唤醒月相…</div>
    )
  }

  if (!library) {
    return (
      <Welcome
        notice={indexMissing}
        onReady={(dir) => {
          setIndexMissing(null)
          setLibrary(dir)
          setFilter({ sort: 'added' })
          setSelectedIds([])
          setActiveId(null)
          setSemanticMode(false)
          setSimilar(null)
          setPickDeliveryOpen(false)
        }}
      />
    )
  }

  if (portraitOpen) {
    return (
      <PortraitWorkspace
        onBack={() => setPortraitOpen(false)}
        aiReady={aiReady}
        canAsk={aiCaps['photo.socratic'] !== false}
        aiScope={aiScope}
      />
    )
  }

  return (
    <div ref={shellRef} className="h-full flex flex-col relative">
      <div className="flex-1 flex min-h-0">
        <Sidebar
          library={library}
          libraryName={libraryName || folderName(library)}
          stats={stats}
          tags={tags}
          facets={facets}
          folders={folders}
          smarts={smarts}
          dirTree={dirTree}
          filter={filter}
          onFilter={(next) => {
            setFilter(next)
            setSelectedIds([])
            setActiveId(null)
          }}
          onImportFiles={openImportDialog}
          onImportFolder={openImportDialog}
          useCase={useCase ?? 'pro'}
          grownFeatures={grownFeatures}
          onGrowFeature={growFeature}
          onPortrait={() => {
            growFeature('portrait')
            growFeature('facets')
            setPortraitOpen(true)
          }}
          onSync={() => void syncLibrary()}
          onRescan={rescan}
          onDuplicates={() => setDuplicatesOpen(true)}
          onSwitch={() => setSwitcherOpen(true)}
          onBackup={backupLibrary}
          onRestore={restoreLibrary}
          onExport={exportCsv}
          onAutoBackup={() => setAutoBackupOpen(true)}
          clipStatus={clipStatus}
          onIndexClip={() => void ensureClipIndex()}
          onAutoTag={() => setAutoTagOpen(true)}
          onRelocate={() => setRelocateOpen(true)}
          onPickDelivery={() => {
            growFeature('delivery')
            setPickDeliveryOpen(true)
          }}
          lastRelocateDir={lastRelocateDir}
          onEquipment={() => setEquipmentOpen(true)}
          onSettings={() => openSettings('appearance')}
          onCreateFolder={createFolder}
          onRenameFolder={renameFolder}
          onMoveFolder={moveFolder}
          onSetFolderCover={setFolderCover}
          onDropItems={handleDropItems}
          onDeleteFolder={async (id) => {
            const ok = await window.api.confirm(
              '删除这个文件夹？',
              '里面的图片不会被删除；子文件夹会移到上一级。'
            )
            if (ok) {
              await window.api.deleteFolder(id)
              if (filter.folderId === id) setFilter({ ...filter, folderId: null })
              bump()
            }
          }}
          onDeleteTag={async (id) => {
            const ok = await window.api.confirm('删除这个标签？', '标签会从所有图片上移除。')
            if (ok) {
              await window.api.deleteTag(id)
              setFilter({ ...filter, tagIds: (filter.tagIds ?? []).filter((t) => t !== id) })
              bump()
            }
          }}
          onTagNest={async (childId, parentId) => {
            try {
              await window.api.setTagParent(childId, parentId)
              bump()
            } catch (error) {
              notify(String((error as Error).message).replace(/^Error invoking remote method '[^']+': /, ''))
            }
          }}
          onDeleteSmart={async (id) => {
            await window.api.deleteSmart(id)
            bump()
          }}
        />

        <ResizeHandle
          title="拖动调整左栏宽度，双击复位"
          onStart={() => {
            resizeRef.current = { side: 'sidebar', origin: layoutRef.current.sidebar }
          }}
          onDrag={(delta) => resizeLayout('sidebar', delta)}
          onCommit={commitResize}
          onReset={resetLayout}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <Toolbar
            filter={filter}
            onFilter={setFilter}
            total={total}
            loading={loading}
            selectedIds={selectedIds}
            folders={folders}
            thumbSize={thumbSize}
            onThumbSize={setThumbSize}
            onRateSelected={rateSelected}
            onFlagSelected={setFlagSelected}
            onStackSelected={stackSelected}
            onScoreSelected={() => void scoreItems(selectedIds)}
            aiScoring={aiScoring}
            aiRule={aiRule}
            onOpenSmartFilter={() => setSmartFilterOpen(true)}
            onClearAi={clearAiFilter}
            aiReady={aiReady}
            aiVisionBlocked={aiVisionBlocked}
            canScore={aiCaps['photo.quality'] !== false}
            canSmartFilter={aiCaps['photo.smartFilter'] !== false}
            semanticMode={semanticMode}
            clipStatus={clipStatus}
            onToggleSemantic={() => void toggleSemantic()}
            onAddToFolder={addSelectedToFolder}
            onDeleteSelected={deleteSelected}
            onClearMissing={clearMissing}
            onRetryErrors={() => void retryFailedImports()}
            trashView={Boolean(filter.trashed)}
            onRestoreSelected={() => void restoreSelected()}
            onPurgeSelected={() => void purgeSelected()}
            onPurgeAllTrashed={() => void purgeAllTrashed()}
            onClearSelection={() => setSelectedIds([])}
            onBulkNote={bulkNoteSelected}
            onSaveSmart={saveSmart}
            onSaveDraft={() => void savePickDraft()}
            onExportPick={() => {
              setPickExportDraft(null)
              setPickExportOpen(true)
            }}
            onExportFinals={() => {
              setFinalsExportIds(null)
              setFinalsExportOpen(true)
            }}
          />
          {similar && (
            <div className="shrink-0 px-4 py-2 border-b border-[var(--border)] bg-[var(--panel-2)] flex items-center gap-3 text-[12px]">
              <span className="text-[var(--text)]">
                与「{similar.name}」相似 · {total} 张
              </span>
              <button className="btn h-6 px-2 text-[11px] ml-auto" onClick={exitSimilar}>
                返回全部
              </button>
            </div>
          )}
          <Gallery
            items={items}
            total={total}
            selectedIds={selectedIds}
            thumbSize={thumbSize}
            quality={thumbQuality}
            loading={loading}
            loadingMore={loadingMore}
            hasMore={items.length < total}
            resetKey={listResetKey}
            focusId={lightboxId ?? activeId}
            focusTick={revealTick}
            expandedGroups={expandedGroups}
            onExpandGroup={toggleGroup}
            onLoadMore={loadMore}
            onSelect={handleSelect}
            onOpen={openLightbox}
            onContextMenu={openItemContextMenu}
            onImportFiles={openImportDialog}
            otherHint={otherHint}
            onOpenOtherLibrary={() => void openOtherLibrary()}
            hasFilter={
              Boolean(filter.query) ||
              Boolean(filter.folderId) ||
              Boolean(filter.dir) ||
              Boolean(filter.errors) ||
              (filter.tagIds?.length ?? 0) > 0 ||
              Boolean(filter.colorFamily) ||
              Boolean(filter.orientation) ||
              Boolean(filter.flag) ||
              Boolean(filter.missing) ||
              Boolean(filter.trashed) ||
              Boolean(filter.pickAction) ||
              (filter.minRating ?? 0) > 0
            }
          />
        </div>

        {activeItem && (
          <ResizeHandle
            title="拖动调整右栏宽度，双击复位"
            onStart={() => {
              resizeRef.current = { side: 'detail', origin: layoutRef.current.detail }
            }}
            onDrag={(delta) => resizeLayout('detail', delta)}
            onCommit={commitResize}
            onReset={resetLayout}
          />
        )}

        {activeItem && (
          <DetailPanel
            item={activeItem}
            tags={tags}
            folders={folders}
            aiScope={aiScope}
            onClose={() => setActiveId(null)}
            onRefresh={bump}
            onOpenLightbox={() => openLightbox(activeItem.id)}
            onPushUndo={pushUndo}
            onUnstack={unstackItem}
            onFindSimilar={() => void findSimilar(activeItem.id)}
            onAdvice={() => setAdviceOpen(true)}
            onScore={() => void scoreItems([activeItem.id])}
            aiScoring={aiScoring}
            aiReady={aiReady}
            visionBlocked={aiVisionBlocked}
            canScore={aiCaps['photo.quality'] !== false}
            canAdvice={aiCaps['photo.advice'] !== false}
            canStudy={aiCaps['photo.socratic'] !== false}
          />
        )}
      </div>

      {dragging && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-[rgba(9,11,15,0.82)] backdrop-blur-sm pointer-events-none">
          <div className="px-10 py-8 rounded-2xl border-2 border-dashed border-[var(--accent)] text-center">
            <div className="text-[16px] text-[var(--accent-2)] font-medium">松手就收进图库</div>
            <div className="text-[12px] text-[var(--muted)] mt-1">支持文件夹、文件与图片网址</div>
          </div>
        </div>
      )}

      {pendingImport && !importRunning && !importResult && (
        <ResumeImportCard
          pending={pendingImport}
          onResume={resumePendingImport}
          onDiscard={discardPendingImport}
        />
      )}

      <ImportStatusCard
        progress={progress}
        running={importRunning}
        result={importResult}
        onPause={() => void window.api.pauseImport()}
        onResume={() => void window.api.resumeImport()}
        onCancel={() => {
          void window.api.cancelImport()
          notify('正在停止导入…')
        }}
        onDismiss={() => setImportResult(null)}
      />

      {firstImportHint !== null && (
        <FirstImportHint
          count={firstImportHint}
          onTag={() => {
            closeFirstImportHint()
            setAutoTagOpen(true)
          }}
          onSend={() => {
            closeFirstImportHint()
            growFeature('delivery')
            setPickDeliveryOpen(true)
          }}
          onClose={closeFirstImportHint}
        />
      )}

      {library && useCaseLoaded && useCase === null && (
        <FirstRunDialog onChoose={(value) => void chooseUseCase(value)} />
      )}

      {clipDownload && (
        <div className="absolute bottom-[86px] left-1/2 -translate-x-1/2 z-[60] w-[360px] rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 shadow-2xl">
          <div className="flex items-center justify-between text-[12px] mb-2">
            <span className="text-[var(--muted)] truncate pr-3">正在下载识图模型</span>
            <span className="text-[var(--text)] tabular-nums">
              {clipDownload.total
                ? `${Math.round((clipDownload.received / clipDownload.total) * 100)}%`
                : '…'}
            </span>
          </div>
          <div className="h-[4px] rounded-full bg-[var(--panel-3)] overflow-hidden">
            <div
              className="h-full bg-[var(--accent)] transition-[width] duration-200"
              style={{
                width: `${
                  clipDownload.total
                    ? Math.round((clipDownload.received / clipDownload.total) * 100)
                    : 0
                }%`
              }}
            />
          </div>
        </div>
      )}

      {clipProgress && !clipDownload && (
        clipCardMinimized ? (
          <div className="absolute bottom-[86px] left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 shadow-2xl">
            <span className="text-[11.5px] text-[var(--muted)]">识图</span>
            <span className="text-[11.5px] text-[var(--text)] tabular-nums">
              {clipProgress.total ? `${clipProgress.done}/${clipProgress.total}` : '准备中…'}
              {clipProgress.total
                ? ` · ${Math.round((clipProgress.done / clipProgress.total) * 100)}%`
                : ''}
            </span>
            <button
              className="btn btn-ghost h-5 px-1"
              title="展开进度"
              onClick={() => setClipCardMinimized(false)}
            >
              <ChevronUp size={12} />
            </button>
          </div>
        ) : (
          <div className="absolute bottom-[86px] left-1/2 -translate-x-1/2 z-40 w-[360px] rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 shadow-2xl">
            <div className="flex items-center justify-between text-[12px] mb-2">
              <span className="text-[var(--muted)] truncate pr-3">
                识图 {clipProgress.current || (clipProgress.total ? '' : '准备中…')}
              </span>
              <span className="flex items-center gap-1 shrink-0">
                <span className="text-[var(--text)] tabular-nums">
                  {clipProgress.total ? `${clipProgress.done}/${clipProgress.total}` : '—'}
                </span>
                <button
                  className="btn btn-ghost h-5 px-1"
                  title="最小化，处理别的事"
                  onClick={() => setClipCardMinimized(true)}
                >
                  <ChevronDown size={12} />
                </button>
              </span>
            </div>
            <div className="h-[4px] rounded-full bg-[var(--panel-3)] overflow-hidden">
              <div
                className="h-full bg-[var(--accent)] transition-[width] duration-200"
                style={{
                  width: `${
                    clipProgress.total
                      ? Math.round((clipProgress.done / clipProgress.total) * 100)
                      : 0
                  }%`
                }}
              />
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <button
                className="btn btn-ghost btn-danger h-6 px-2 text-[11px]"
                onClick={() => {
                  void window.api.clipCancel()
                  notify('正在停止语义索引…')
                }}
              >
                停止索引
              </button>
              <span className="ml-auto text-[10.5px] text-[var(--faint)]">
                只占用 2 个 CPU 线程
              </span>
            </div>
          </div>
        )
      )}

      {toast && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-2 text-[12.5px] text-[var(--text)] shadow-xl">
          <span>{toast.text}</span>
          {toast.undo && (
            <button
              className="text-[var(--accent-2)] hover:underline"
              onClick={() => void undoLast()}
            >
              撤销
            </button>
          )}
        </div>
      )}

      {lightboxId !== null && lightboxIndex >= 0 && (
        <Lightbox
          items={items}
          index={lightboxIndex}
          onClose={closeLightbox}
          onNavigate={(next) => {
            const item = items[next]
            if (item) openLightbox(item.id)
          }}
          tags={tags}
          folders={folders}
          onRefresh={bump}
          onPushUndo={pushUndo}
          onContextMenu={(id, x, y) =>
            openItemContextMenu(id, { clientX: x, clientY: y, preventDefault: () => undefined })
          }
          aiReady={aiReady}
          canAsk={aiCaps['photo.socratic'] !== false}
          aiScope={aiScope}
        />
      )}

      {contextMenu && contextMenuItem && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildItemMenu(contextMenuItem)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {importOpen && (
        <ImportDialog
          options={importOptions}
          onOptions={setImportOptions}
          onPickFolder={importFolder}
          onPickFiles={importFiles}
          onClose={closeImportDialog}
        />
      )}

      {duplicatesOpen && (
        <DuplicatesDialog
          onClose={() => setDuplicatesOpen(false)}
          onRemove={async (ids) => {
            await window.api.deleteItems(ids)
            pushUndo(`已移除 ${ids.length} 张重复图片`, async () => {
              await window.api.restoreItems(ids)
              bump()
            })
            bump()
          }}
        />
      )}

      {autoBackupOpen && (
        <AutoBackupDialog
          onClose={() => setAutoBackupOpen(false)}
          onSaved={(settings) => {
            notify(
              settings.enabled
                ? `自动备份已开启 · 每 ${settings.intervalDays} 天 · 保留 ${settings.keep} 份`
                : '自动备份已关闭'
            )
          }}
        />
      )}

      {autoTagOpen && (
        <AutoTagDialog
          onClose={() => setAutoTagOpen(false)}
          onFinished={(message) => {
            notify(message)
            bump()
          }}
        />
      )}

      {relocateOpen && (
        <RelocateDialog
          onClose={() => {
            setRelocateOpen(false)
            // 选过文件夹但没应用就关掉时，侧栏也要更新
            void window.api.lastRelocateDir().then(setLastRelocateDir)
          }}
          onFinished={(message) => {
            setRelocateOpen(false)
            // 接回后「文件丢失」视图通常空了，直接回到全部图片
            setFilter({ sort: filter.sort })
            notify(message)
            bump()
          }}
        />
      )}

      {equipmentOpen && <EquipmentDialog onClose={() => setEquipmentOpen(false)} />}

      {settingsOpen && (
        <SettingsDialog
          theme={theme}
          onChange={changeTheme}
          skin={skin}
          onSkin={changeSkin}
          useCase={useCase ?? 'pro'}
          onUseCase={(value) => void chooseUseCase(value)}
          thumbQuality={thumbQuality}
          onThumbQuality={changeThumbQuality}
          folders={folders}
          onClose={() => {
            setSettingsOpen(false)
            // XMP 导入可能改了星级/标签，关掉设置后刷新一次
            bump()
          }}
          initialTab={settingsTab}
        />
      )}

      {adviceOpen && activeItem && (
        <AdviceDialog
          item={activeItem}
          onClose={() => setAdviceOpen(false)}
          onOpenSettings={() => openSettings('llm')}
        />
      )}

      {smartFilterOpen && (
        <SmartFilterDialog
          items={items}
          total={total}
          onApply={applyAiFilter}
          onClose={() => setSmartFilterOpen(false)}
          onOpenSettings={() => openSettings('llm')}
        />
      )}

      {pickExportOpen && (
        <PickExportDialog
          itemIds={pickExportDraft?.itemIds ?? pickItemIds}
          defaultTitle={pickExportDraft?.session.title ?? pickTitle}
          sessionId={pickExportDraft?.session.id}
          defaultClient={pickExportDraft?.session.client}
          onClose={() => {
            setPickExportOpen(false)
            setPickExportDraft(null)
          }}
          onExported={(result: PickExportResult) => {
            notify(
              `已生成浏览页 · ${result.count} 张 · ${formatBytes(result.bytes)}${
                result.failed.length ? `（${result.failed.length} 张读取失败已跳过）` : ''
              }`
            )
            setPickDeliveryTick((value) => value + 1)
          }}
        />
      )}

      {finalsExportOpen && (
        <FinalsExportDialog
          itemIds={finalsExportIds ?? pickItemIds}
          onClose={() => {
            setFinalsExportOpen(false)
            setFinalsExportIds(null)
          }}
          onExported={(result) => {
            notify(
              `已导出 ${result.count} 张到 ${folderName(result.dir)}${
                result.failed.length ? `（${result.failed.length} 张失败）` : ''
              }`
            )
          }}
        />
      )}

      {pickImportOpen && (
        <PickImportDialog
          initialSessionId={pickImportSessionId}
          onClose={() => setPickImportOpen(false)}
          onApplied={(result: PickApplyResult, sessionId: number) => {
            setPickImportOpen(false)
            setPickImportSessionId(null)
            // 在选片交付里粘贴反馈时，留在原视图看这一单更新；在主图库入口进来才跳去筛选
            if (!pickDeliveryOpen) {
              setFilter({ ...filter, pickAction: 'any', pickSessionId: sessionId })
            }
            setPickDeliveryTick((value) => value + 1)
            notify(
              `浏览页已选 ${result.keep + result.fix} 张（要修 ${result.fix} 张）${
                result.unmatched.length ? ` · ${result.unmatched.length} 个编号对不上` : ''
              }${result.replyCount > 1 ? ` · 第 ${result.replyCount} 次回传` : ''}`
            )
            bump()
          }}
        />
      )}

      {pickDeliveryOpen && (
        <PickDelivery
          refreshTick={pickDeliveryTick}
          onBack={() => setPickDeliveryOpen(false)}
          onPickNew={() => {
            setPickDeliveryOpen(false)
            setSelectedIds([])
            notify('在主图库选中照片后，点选中操作条里的「生成浏览页」')
          }}
          onOpenImport={(sessionId) => {
            setPickImportSessionId(sessionId)
            setPickImportOpen(true)
          }}
          onViewSession={(sessionId) => {
            setPickDeliveryOpen(false)
            setFilter({ ...filter, pickAction: 'any', pickSessionId: sessionId })
            setSelectedIds([])
            setActiveId(null)
          }}
          onExportFinals={(itemIds) => {
            setFinalsExportIds(itemIds)
            setFinalsExportOpen(true)
          }}
          onExportDraft={(session, itemIds) => {
            setPickExportDraft({ session, itemIds })
            setPickExportOpen(true)
          }}
          onDeleted={(sessionId) => {
            // 正在看这一单时把它删了，筛选条件也一起收回，避免列表空着
            if (filter.pickSessionId === sessionId) {
              setFilter({ ...filter, pickAction: undefined, pickSessionId: undefined })
            }
            setPickDeliveryTick((value) => value + 1)
            bump()
          }}
        />
      )}
      {switcherOpen && (
        <LibrarySwitcher
          current={library}
          onClose={() => setSwitcherOpen(false)}
          onSwitched={switchLibrary}
        />
      )}
    </div>
  )
}
