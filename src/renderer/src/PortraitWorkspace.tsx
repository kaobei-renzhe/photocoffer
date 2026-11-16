import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { ArrowLeft, Check, ChevronDown, Plus, RefreshCw, Search, X } from 'lucide-react'
import type {
  Facet,
  FacetValue,
  Folder,
  Item,
  PortraitFlag,
  PortraitScanProgress,
  PortraitStatus,
  Tag
} from '@shared/types'
import { PORTRAIT_COLUMNS, normalizePortraitColumns } from '@shared/layout'
import { photoUrl, thumbUrl } from './lib/format'
import { inAiScope, outOfScopeText, type AiScope } from './lib/aiScope'
import { sortFacets } from './lib/portraitFacets'
import Lightbox from './components/Lightbox'
import PhotoInspector from './components/inspector/PhotoInspector'
import PortraitReview from './components/PortraitReview'
import PortraitStatusCard from './components/PortraitStatusCard'

interface PortraitWorkspaceProps {
  onBack: () => void
  /** 大模型总开关与读片对话能力 */
  aiReady: boolean
  canAsk: boolean
  /** AI 处理范围：超出范围的单张不显示 AI 操作 */
  aiScope: AiScope | null
  onAddToPick: (ids: number[]) => Promise<void>
}

const PAGE_LIMIT = 500

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .replace(/^Error invoking remote method '[^']+':\s*/, '')
    .replace(/^Error:\s*/, '')
}

/**
 * 人像工作台：左维度 / 中瀑布流 / 右详情。
 * 维度与取值本质是带 facet_id 的普通标签，所以照片上已有的标记、筛选都能直接复用。
 */
export default function PortraitWorkspace({
  onBack,
  aiReady,
  canAsk,
  aiScope,
  onAddToPick
}: PortraitWorkspaceProps) {
  const [facets, setFacets] = useState<Facet[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  /** 文件夹与维度条件叠加：先用文件夹缩小范围，再按维度细筛 */
  const [folderId, setFolderId] = useState<number | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [picked, setPicked] = useState<Record<string, number[]>>({})
  const [selection, setSelection] = useState<number[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [lightIndex, setLightIndex] = useState<number | null>(null)
  const [addingValueFor, setAddingValueFor] = useState<string | null>(null)
  const [valueDraft, setValueDraft] = useState('')
  const [creatingFacet, setCreatingFacet] = useState(false)
  const [facetDraft, setFacetDraft] = useState('')
  const [message, setMessage] = useState('')
  /** 人像工作台列数：2/3/4，读不到就用默认 3 */
  const [columns, setColumns] = useState<number>(PORTRAIT_COLUMNS.default)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'confirmed' | 'likely' | 'excluded'>('all')
  const anchorRef = useRef<number | null>(null)
  const [openFacets, setOpenFacets] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('portraitFacetsOpen')
      const parsed = raw ? JSON.parse(raw) : null
      if (Array.isArray(parsed)) return parsed.filter((id) => typeof id === 'string')
    } catch {
      /* 坏数据回落默认 */
    }
    return ['shot_size', 'light']
  })
  /** 人像检测：结果由主进程缓存 */
  const [portraitStatus, setPortraitStatus] = useState<PortraitStatus | null>(null)
  const [portraitFlags, setPortraitFlags] = useState<Record<number, PortraitFlag>>({})
  const [portraitScanning, setPortraitScanning] = useState(false)
  const [portraitProgress, setPortraitProgress] = useState<PortraitScanProgress | null>(null)
  const [portraitMsg, setPortraitMsg] = useState('')
  const [modelDownload, setModelDownload] = useState<{ received: number; total: number } | null>(null)
  const scanToken = useRef(0)
  const portraitFlagsRef = useRef(portraitFlags)
  portraitFlagsRef.current = portraitFlags

  const loadFacets = useCallback(async () => {
    setFacets(await window.api.listFacets())
  }, [])

  const loadFolders = useCallback(async () => {
    setFolders(await window.api.listFolders())
  }, [])

  const loadTags = useCallback(async () => {
    setTags(await window.api.listTags())
  }, [])

  const loadItems = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.api.listItems(
        { facets: picked, folderId, sort: 'added' },
        0,
        PAGE_LIMIT
      )
      setItems(result.items)
      setTotal(result.total)
    } catch (error) {
      setMessage(`读取照片失败：${errorText(error)}`)
    } finally {
      setLoading(false)
    }
  }, [picked, folderId])

  useEffect(() => {
    void loadFacets().catch((error) => setMessage(`读取维度失败：${errorText(error)}`))
  }, [loadFacets])

  useEffect(() => {
    void loadFolders().catch((error) => setMessage(`读取文件夹失败：${errorText(error)}`))
    void loadTags().catch(() => undefined)
  }, [loadFolders, loadTags])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  useEffect(() => {
    void window.api
      .getPortraitColumns()
      .then((value) => setColumns(normalizePortraitColumns(value)))
      .catch(() => undefined)
  }, [])

  const changeColumns = (value: number): void => {
    const next = normalizePortraitColumns(value)
    setColumns(next)
    void window.api.savePortraitColumns(next).catch(() => undefined)
  }

  const loadPortraitStatus = useCallback(async (): Promise<void> => {
    try {
      setPortraitStatus(await window.api.portraitStatus())
    } catch (error) {
      setPortraitMsg(`读取人像模型状态失败：${errorText(error)}`)
    }
  }, [])

  useEffect(() => {
    void loadPortraitStatus()
  }, [loadPortraitStatus])

  // 分块扫描：每 20 张更新一次界面，未识别完之前不阻塞其它操作；扫描中不重排
  useEffect(() => {
    if (!portraitStatus?.modelReady || items.length === 0) return
    const known = portraitFlagsRef.current
    const missing = items.filter((item) => known[item.id] === undefined).map((item) => item.id)
    if (missing.length === 0) return

    const token = ++scanToken.current
    setPortraitScanning(true)
    setPortraitProgress({ done: 0, total: missing.length })
    setPortraitMsg('')
    void (async () => {
      const CHUNK = 20
      let done = 0
      for (let i = 0; i < missing.length; i += CHUNK) {
        if (scanToken.current !== token) return
        const flags = await window.api.portraitScan(missing.slice(i, i + CHUNK))
        if (scanToken.current !== token) return
        setPortraitFlags((prev) => {
          const next = { ...prev }
          for (const flag of flags) next[flag.id] = flag
          return next
        })
        done += Math.min(CHUNK, missing.length - i)
        setPortraitProgress({ done, total: missing.length })
      }
      void window.api.portraitStatus().then(setPortraitStatus).catch(() => undefined)
    })()
      .catch((error) => {
        if (scanToken.current === token) setPortraitMsg(`人像识别失败：${errorText(error)}`)
      })
      .finally(() => {
        if (scanToken.current === token) {
          setPortraitScanning(false)
          setPortraitProgress(null)
        }
      })

    return () => {
      scanToken.current++
    }
  }, [items, portraitStatus?.modelReady])

  const shownItems = useMemo(() => {
    if (!portraitStatus?.modelReady) return []
    return items.filter((item) => {
      const flag = portraitFlags[item.id]
      if (!flag) return false
      if (statusFilter === 'excluded') {
        return flag.override === 0 || (flag.override == null && flag.verdict === 'no-person')
      }
      if (flag.override === 0) return false
      if (statusFilter === 'confirmed') return flag.override === 1 || flag.verdict === 'person'
      if (statusFilter === 'likely') return flag.override == null && flag.verdict === 'likely'
      return flag.override === 1 || flag.verdict === 'person' || flag.verdict === 'likely'
    })
  }, [items, portraitStatus?.modelReady, portraitFlags, statusFilter])

  // 切换筛选后，右侧详情不能继续显示已经被隐藏的照片
  useEffect(() => {
    if (activeId !== null && !shownItems.some((item) => item.id === activeId)) {
      setActiveId(null)
      setSelection([])
    }
  }, [shownItems, activeId])

  const downloadPortraitModel = async (): Promise<void> => {
    setPortraitMsg('')
    setModelDownload({ received: 0, total: 0 })
    const off = window.api.onPortraitDownload((progress) =>
      setModelDownload({ received: progress.received, total: progress.total })
    )
    try {
      await window.api.portraitDownloadModel()
      setPortraitStatus(await window.api.portraitStatus())
    } catch (error) {
      setPortraitMsg(`模型下载失败：${errorText(error)}`)
    } finally {
      off()
      setModelDownload(null)
    }
  }

  // 当前照片被筛掉时清空详情，避免右侧显示一张已经不在列表里的图
  useEffect(() => {
    if (activeId !== null && !items.some((item) => item.id === activeId)) {
      setActiveId(null)
      setSelection([])
    }
  }, [items, activeId])

  const current = useMemo(
    () => items.find((item) => item.id === activeId) ?? null,
    [items, activeId]
  )
  const targets = selection.length ? selection : activeId ? [activeId] : []
  // AI 处理范围外的人像照不显示 AI 对话入口
  const currentScopeBlocked = Boolean(current && aiScope && !inAiScope(current, aiScope))
  const currentScopeHint =
    current && currentScopeBlocked && aiScope ? outOfScopeText(current, aiScope) : ''
  const valueName = useMemo(() => {
    const map = new Map<number, { name: string; color: string }>()
    for (const facet of facets) {
      for (const value of facet.values) map.set(value.id, { name: value.name, color: value.color })
    }
    return map
  }, [facets])

  const toggleFilter = (facetId: string, valueId: number): void => {
    setPicked((prev) => {
      const list = prev[facetId] ?? []
      const next = list.includes(valueId)
        ? list.filter((id) => id !== valueId)
        : [...list, valueId]
      const merged = { ...prev, [facetId]: next }
      if (!next.length) delete merged[facetId]
      return merged
    })
  }

  const selectCard = (item: Item, event: ReactMouseEvent): void => {
    const ids = shownItems.map((entry) => entry.id)
    if (event.shiftKey && anchorRef.current !== null) {
      const a = ids.indexOf(anchorRef.current)
      const b = ids.indexOf(item.id)
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a]
        setSelection(ids.slice(lo, hi + 1))
        setActiveId(item.id)
        return
      }
    }
    anchorRef.current = item.id
    setActiveId(item.id)
    if (event.ctrlKey || event.metaKey) {
      setSelection((prev) =>
        prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]
      )
    } else {
      setSelection([item.id])
    }
  }

  const assignedValues = (facet: Facet, item: Item | null): FacetValue[] => {
    if (!item) return []
    return facet.values.filter((value) => item.tags.some((tag) => tag.id === value.id))
  }

  /** 给当前目标加/去某个取值；单选维度会自动替换，多选维度按加法处理 */
  const applyValue = async (facet: Facet, value: FacetValue, add: boolean): Promise<void> => {
    if (!targets.length) return
    setMessage('')
    try {
      if (targets.length === 1) {
        const item = items.find((entry) => entry.id === targets[0])
        if (!item) return
        const before = assignedValues(facet, item).map((entry) => entry.id)
        const next = facet.multi
          ? add
            ? [...before, value.id]
            : before.filter((id) => id !== value.id)
          : add
            ? [value.id]
            : []
        await window.api.setItemFacet(item.id, facet.id, [...new Set(next)])
      } else {
        await window.api.bulkSetFacetValue(targets, facet.id, value.id, add)
      }
      await Promise.all([loadItems(), loadFacets()])
    } catch (error) {
      setMessage(`标记失败：${errorText(error)}`)
    }
  }

  const addValue = async (facetId: string): Promise<void> => {
    const name = valueDraft.trim()
    if (!name) return
    try {
      await window.api.createFacetValue(facetId, name)
      setValueDraft('')
      setAddingValueFor(null)
      await loadFacets()
    } catch (error) {
      setMessage(`新增取值失败：${errorText(error)}`)
    }
  }

  const addFacet = async (): Promise<void> => {
    const name = facetDraft.trim()
    if (!name) return
    try {
      await window.api.createFacet(name)
      setFacetDraft('')
      setCreatingFacet(false)
      await loadFacets()
    } catch (error) {
      setMessage(`新建维度失败：${errorText(error)}`)
    }
  }

  const removeFacet = async (facet: Facet): Promise<void> => {
    const ok = await window.api.confirm(
      `删除维度「${facet.name}」？`,
      '只解除标签归属，照片上的标记与标签本身都会保留，之后可以在标签里继续用。'
    )
    if (!ok) return
    try {
      await window.api.deleteFacet(facet.id)
      setPicked((prev) => {
        const next = { ...prev }
        delete next[facet.id]
        return next
      })
      await Promise.all([loadFacets(), loadItems()])
    } catch (error) {
      setMessage(`删除失败：${errorText(error)}`)
    }
  }

  const lightboxItem = lightIndex !== null ? shownItems[lightIndex] : null

  const orderedFacets = useMemo(() => sortFacets(facets), [facets])

  const reviewItems = useMemo(
    () =>
      items.filter((item) => {
        const flag = portraitFlags[item.id]
        return !flag || (flag.override == null && flag.verdict === 'unresolved')
      }),
    [items, portraitFlags]
  )
  const reviewCount = reviewItems.length
  const selectionSet = useMemo(() => new Set(selection), [selection])

  const toggleFacetOpen = (id: string): void => {
    setOpenFacets((prev) => {
      const next = prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
      try {
        localStorage.setItem('portraitFacetsOpen', JSON.stringify(next))
      } catch {
        /* 隐私模式写不进去也不影响使用 */
      }
      return next
    })
  }

  const judgePortrait = async (id: number, value: 0 | 1): Promise<void> => {
    try {
      await window.api.portraitOverride([id], value)
      setPortraitFlags((prev) => {
        const old = prev[id]
        return {
          ...prev,
          [id]: {
            id,
            verdict: old?.verdict ?? 'unresolved',
            score: old?.score ?? 0,
            hasPerson: value === 1,
            override: value
          }
        }
      })
      await loadPortraitStatus()
    } catch (error) {
      setMessage(`人工判定失败：${errorText(error)}`)
    }
  }

  const clearPortraitVerdict = async (id: number): Promise<void> => {
    try {
      await window.api.portraitOverride([id], null)
      setPortraitFlags((prev) => {
        const old = prev[id]
        return {
          ...prev,
          [id]: {
            id,
            verdict: old?.verdict ?? 'unresolved',
            score: old?.score ?? 0,
            hasPerson: old?.verdict === 'person' || old?.verdict === 'likely',
            override: null
          }
        }
      })
      await loadPortraitStatus()
    } catch (error) {
      setMessage(`清除判定失败：${errorText(error)}`)
    }
  }

  const rateTargets = async (rating: number): Promise<void> => {
    if (!targets.length) return
    try {
      await window.api.bulkUpdate(targets, { rating })
      await loadItems()
    } catch (error) {
      setMessage(`设置星级失败：${errorText(error)}`)
    }
  }

  const flagTargets = async (flag: number): Promise<void> => {
    if (!targets.length) return
    try {
      await window.api.bulkUpdate(targets, { flag })
      await loadItems()
    } catch (error) {
      setMessage(`设置去留失败：${errorText(error)}`)
    }
  }

  return (
    <div className="h-full flex flex-col bg-[var(--bg)]">
      {reviewOpen ? (
        <PortraitReview
          items={reviewItems}
          flags={portraitFlags}
          onJudge={judgePortrait}
          onUndo={clearPortraitVerdict}
          onExit={() => setReviewOpen(false)}
          onOpenLightbox={(id) => {
            const index = shownItems.findIndex((item) => item.id === id)
            if (index >= 0) setLightIndex(index)
          }}
        />
      ) : (
        <>
          <header className="h-12 shrink-0 px-3 flex items-center gap-2 border-b border-[var(--border)] bg-[var(--chrome)]">
            <button className="btn btn-ghost h-8 px-2 text-[12px]" onClick={onBack}>
              <ArrowLeft size={16} strokeWidth={1.75} /> 图库
            </button>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold">人像</span>
              <span className="text-[12px] text-[var(--muted)] tabular-nums">
                {loading ? '正在读取' : `${shownItems.length} 张`}
                {selection.length > 0 ? ` · 已选 ${selection.length}` : ''}
              </span>
            </div>
            <select
              className="input h-8 min-w-[150px] max-w-[220px] text-[12px]"
              value={folderId ?? ''}
              onChange={(event) => {
                const value = event.target.value
                setFolderId(value ? Number(value) : null)
                setSelection([])
                setActiveId(null)
              }}
              title="选择范围"
            >
              <option value="">范围：整个图库</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}（{folder.count}）
                </option>
              ))}
            </select>
            {/* 列数切换＝缩略图大小。光秃秃的数字看不出含义，前面加「每行」标注 */}
            <div className="flex items-center gap-1.5" title="调整每行显示几张，也就是缩略图大小">
              <span className="text-[11px] text-[var(--faint)]">每行</span>
              <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--card)] p-0.5">
                {[2, 3, 4].map((n) => (
                  <button
                    key={n}
                    className={`h-7 w-7 rounded-lg text-[12px] tabular-nums ${
                      columns === n
                        ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]'
                        : 'text-[var(--faint)] hover:text-[var(--text)]'
                    }`}
                    onClick={() => changeColumns(n)}
                    aria-pressed={columns === n}
                    aria-label={`每行 ${n} 张`}
                    title={`每行 ${n} 张`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            {statusFilter !== 'all' && (
              <button
                className="inline-flex items-center gap-1 h-7 px-2 rounded-lg border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[12px] text-[var(--accent-text)]"
                onClick={() => setStatusFilter('all')}
                title="返回全部人像"
              >
                {statusFilter === 'confirmed' ? '已确认' : statusFilter === 'likely' ? '可能' : '被判无人'}
                <X size={12} strokeWidth={1.75} />
              </button>
            )}
            {reviewCount > 0 && portraitStatus?.modelReady && (
              <button
                className="inline-flex items-center gap-1.5 h-8 px-2 rounded-lg border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[12px] text-[var(--accent-text)]"
                onClick={() => setReviewOpen(true)}
                title="过待确认"
              >
                <Search size={14} strokeWidth={1.75} /> 待确认 {reviewCount}
              </button>
            )}
            <span className="ml-auto" />
            <button
              className="btn btn-ghost h-8 w-8 p-0"
              onClick={() => void Promise.all([loadItems(), loadFacets(), loadFolders()])}
              title="重新读取照片与维度"
            >
              <RefreshCw size={16} strokeWidth={1.75} />
            </button>
          </header>

          {message && (
            <div className="shrink-0 px-3 py-1.5 text-[12px] text-[var(--danger-text)] bg-[var(--danger-soft)] border-b border-[var(--danger-border)]">
              {message}
            </div>
          )}

          <div className="flex-1 flex min-h-0">
            <aside className="w-[264px] shrink-0 border-r border-[var(--border)] overflow-y-auto px-2 py-2">
              <div className="sticky top-0 z-10 -mx-2 px-2 pb-2 bg-[var(--chrome)]">
                {portraitStatus ? (
                  <PortraitStatusCard
                    status={portraitStatus}
                    onShowConfirmed={() => setStatusFilter('confirmed')}
                    onShowLikely={() => setStatusFilter('likely')}
                    onShowReview={() => {
                      if (portraitStatus?.modelReady) setReviewOpen(true)
                    }}
                  />
                ) : (
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 text-[12px] text-[var(--faint)]">
                    正在读取人像状态…
                  </div>
                )}
              </div>

              <div className="mt-2">
                {orderedFacets.map((facet) => {
                  const active = picked[facet.id] ?? []
                  const open = openFacets.includes(facet.id)
                  return (
                    <div
                      key={facet.id}
                      className="mb-1"
                      onContextMenu={(event) => {
                        event.preventDefault()
                        void removeFacet(facet)
                      }}
                    >
                      <button
                        className="flex w-full items-center gap-1.5 h-8 rounded-lg px-2 hover:bg-[var(--panel-2)]"
                        onClick={() => toggleFacetOpen(facet.id)}
                        title="展开/收起；右键删除维度"
                      >
                        <ChevronDown
                          size={14}
                          strokeWidth={1.75}
                          className={`transition-transform ${open ? '' : '-rotate-90'}`}
                        />
                        <span className="text-[12px] font-bold text-[var(--text)]">{facet.name}</span>
                        <span className="text-[11px] text-[var(--faint)]">
                          {facet.multi ? '可多选' : '单选'}
                        </span>
                        {active.length > 0 && (
                          <span className="ml-auto text-[11px] tabular-nums text-[var(--accent-text)]">
                            {active.length}
                          </span>
                        )}
                      </button>
                      {open && (
                        <div className="flex flex-wrap gap-1 px-2 pb-2 pt-1">
                          {facet.values.map((value) => {
                            const on = active.includes(value.id)
                            return (
                              <button
                                key={value.id}
                                className={`inline-flex items-center gap-1 h-[23px] px-1.5 rounded-lg border text-[12px] transition-colors ${
                                  on
                                    ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                                    : 'border-[var(--border)] bg-[var(--panel-2)] text-[var(--faint)] hover:text-[var(--text)]'
                                }`}
                                onClick={() => toggleFilter(facet.id, value.id)}
                              >
                                {value.name}
                                {value.count > 0 && (
                                  <span className="tabular-nums opacity-60">{value.count}</span>
                                )}
                              </button>
                            )
                          })}
                          <button
                            className="inline-flex items-center h-[23px] px-1.5 rounded-lg border border-dashed border-[var(--border)] text-[11px] text-[var(--faint)] hover:text-[var(--text)]"
                            onClick={() => {
                              setAddingValueFor(addingValueFor === facet.id ? null : facet.id)
                              setValueDraft('')
                            }}
                            title="新增选项"
                          >
                            <Plus size={12} strokeWidth={1.75} />
                          </button>
                          {facet.values.length === 0 && (
                            <span className="text-[11px] text-[var(--faint)]">还没有选项</span>
                          )}
                        </div>
                      )}
                      {open && addingValueFor === facet.id && (
                        <div className="flex items-center gap-1 px-2 pb-2">
                          <input
                            className="input h-7 min-w-0 flex-1 text-[12px]"
                            value={valueDraft}
                            autoFocus
                            placeholder="新增选项"
                            onChange={(event) => setValueDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') void addValue(facet.id)
                              if (event.key === 'Escape') setAddingValueFor(null)
                            }}
                          />
                          <button className="btn h-7 px-2 text-[12px]" onClick={() => void addValue(facet.id)}>
                            加
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="my-3 border-t border-[var(--border)]" />
              {creatingFacet ? (
                <div className="flex items-center gap-1 px-1">
                  <input
                    className="input h-8 min-w-0 flex-1 text-[12px]"
                    value={facetDraft}
                    autoFocus
                    placeholder="维度名，如 服装"
                    onChange={(event) => setFacetDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void addFacet()
                      if (event.key === 'Escape') setCreatingFacet(false)
                    }}
                  />
                  <button className="btn h-8 px-2 text-[12px]" onClick={() => void addFacet()}>
                    建
                  </button>
                </div>
              ) : (
                <button
                  className="btn btn-ghost h-8 w-full justify-center text-[12px]"
                  onClick={() => setCreatingFacet(true)}
                >
                  <Plus size={14} strokeWidth={1.75} /> 新建维度
                </button>
              )}
              <button
                className="mt-3 flex w-full items-center justify-between px-2 py-1.5 text-[11px] text-[var(--faint)] hover:text-[var(--text)]"
                onClick={() => setStatusFilter('excluded')}
              >
                <span>被判无人</span>
                <span className="tabular-nums">{portraitStatus?.excludedByHuman ?? 0} · 抽查 →</span>
              </button>
            </aside>

            <main className="flex-1 min-w-0 overflow-y-auto px-3 py-3">
              {loading && items.length === 0 ? (
                <div className="grid grid-cols-3 gap-4">
                  {[0, 1, 2].map((n) => (
                    <div key={n} className="h-[220px] rounded-2xl bg-[var(--panel-2)]" />
                  ))}
                </div>
              ) : !portraitStatus?.modelReady ? (
                <div className="h-full grid place-items-center">
                  <div className="max-w-[360px] text-center">
                    <div className="text-[15px] font-bold text-[var(--text)]">人像识别需要一个本地模型</div>
                    <div className="mt-1.5 text-[12px] leading-5 text-[var(--muted)]">
                      人像检测有专用模型，和「语义索引」用的那个是两套，互不替代。
                      下载后只在这台电脑上运行，照片不外传。约 41 MB，只需下载一次。
                    </div>
                    {modelDownload ? (
                      <div className="mt-3">
                        <div className="h-1 overflow-hidden rounded-lg bg-[var(--border)]">
                          <div
                            className="h-full rounded-lg bg-[var(--accent)] transition-[width]"
                            style={{
                              width: `${
                                modelDownload.total
                                  ? Math.round((modelDownload.received / modelDownload.total) * 100)
                                  : 0
                              }%`
                            }}
                          />
                        </div>
                        <div className="mt-1 text-[11px] tabular-nums text-[var(--faint)]">
                          {modelDownload.total
                            ? `${Math.round((modelDownload.received / modelDownload.total) * 100)}%`
                            : '正在准备下载…'}
                        </div>
                      </div>
                    ) : (
                      <button
                        className="btn btn-primary mt-3 h-10 px-4"
                        onClick={() => void downloadPortraitModel()}
                      >
                        下载模型（41 MB）
                      </button>
                    )}
                    {portraitMsg && (
                      <div className="mt-2 text-[12px] leading-4 text-[var(--danger-text)]">{portraitMsg}</div>
                    )}
                    <button className="btn btn-ghost mt-3 h-8 px-2 text-[12px]" onClick={onBack}>
                      回图库
                    </button>
                  </div>
                </div>
              ) : items.length === 0 ? (
                <div className="h-full grid place-items-center">
                  <div className="max-w-[320px] text-center text-[12px] leading-5 text-[var(--faint)]">
                    这个范围里还没有照片。
                    <div className="mt-2">
                      <button className="btn btn-ghost h-8 px-2 text-[12px]" onClick={onBack}>
                        回图库导入
                      </button>
                    </div>
                  </div>
                </div>
              ) : shownItems.length === 0 ? (
                <div className="h-full grid place-items-center">
                  <div className="max-w-[340px] text-center text-[12px] leading-5 text-[var(--faint)]">
                    {statusFilter === 'excluded' ? (
                      '这个范围里没有被判无人的照片。'
                    ) : portraitScanning && portraitProgress ? (
                      `正在辨认人像 ${portraitProgress.done} / ${portraitProgress.total}`
                    ) : (
                      <>
                        这个范围里还没有人像。
                        <br />
                        换个范围，或去「被判无人」抽查。
                      </>
                    )}
                    {statusFilter !== 'all' && (
                      <div className="mt-2">
                        <button
                          className="btn btn-ghost h-8 px-2 text-[12px]"
                          onClick={() => setStatusFilter('all')}
                        >
                          返回人像
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {portraitScanning && portraitProgress && (
                    <div className="mb-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-2.5 py-2">
                      <div className="flex items-center justify-between text-[12px] text-[var(--muted)]">
                        <span>正在辨认人像</span>
                        <span className="tabular-nums">
                          {portraitProgress.done} / {portraitProgress.total}
                        </span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-lg bg-[var(--border)]">
                        <div
                          className="h-full rounded-lg bg-[var(--accent)] transition-[width]"
                          style={{
                            width: `${Math.round(
                              (portraitProgress.done / Math.max(1, portraitProgress.total)) * 100
                            )}%`
                          }}
                        />
                      </div>
                    </div>
                  )}
                  {portraitMsg && (
                    <div className="mb-2 text-[12px] text-[var(--danger-text)]">{portraitMsg}</div>
                  )}
                  <div style={{ columnCount: columns, columnGap: 16 }}>
                    {shownItems.map((item, index) => {
                      const on = selectionSet.has(item.id)
                      const marks = item.tags.filter((tag) => valueName.has(tag.id)).slice(0, 3)
                      return (
                        <button
                          key={item.id}
                          data-gallery-id={item.id}
                          className="group relative block w-full mb-4 break-inside-avoid text-left rounded-2xl overflow-hidden bg-[var(--card)] shadow-[var(--shadow-1)] hover:shadow-[var(--shadow-2)]"
                          onClick={(event) => selectCard(item, event)}
                          onDoubleClick={() => setLightIndex(index)}
                        >
                          <img
                            src={thumbUrl(item.id, 'mid')}
                            alt={item.name}
                            loading="lazy"
                            draggable={false}
                            className="w-full block bg-[var(--card)]"
                            style={{
                              aspectRatio:
                                item.width > 0 && item.height > 0
                                  ? `${item.width} / ${item.height}`
                                  : '3 / 4'
                            }}
                          />
                          {on && (
                            <span className="absolute right-2 top-2 z-10 grid h-[26px] w-[26px] place-items-center rounded-full bg-[var(--accent)] text-[var(--on-accent)] shadow">
                              <Check size={16} strokeWidth={1.75} />
                            </span>
                          )}
                          {marks.length > 0 && (
                            <div
                              className={`pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-2 pt-6 transition-opacity ${
                                on ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                              }`}
                            >
                              <div className="flex flex-wrap gap-1">
                                {marks.map((tag) => (
                                  <span key={tag.id} className="text-[11px] text-white/85">
                                    {valueName.get(tag.id)?.name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </main>

            <aside className="w-[252px] flex min-h-0 shrink-0 flex-col border-l border-[var(--border)]">
              <div className="shrink-0 border-b border-[var(--border)] p-2.5">
                {targets.length === 0 ? (
                  <>
                    <div className="text-[13.5px] font-bold text-[var(--text)]">本场人像</div>
                    <div className="mt-1 text-[11px] leading-4 text-[var(--muted)]">
                      已确认{' '}
                      {(portraitStatus?.confirmedByModel ?? 0) + (portraitStatus?.confirmedByHuman ?? 0)} ·
                      可能 {portraitStatus?.likely ?? 0} · 待确认 {portraitStatus?.unresolved ?? 0}
                    </div>
                    {reviewCount > 0 && portraitStatus?.modelReady && (
                      <button className="btn btn-primary mt-2 h-9 w-full" onClick={() => setReviewOpen(true)}>
                        开始过待确认
                      </button>
                    )}
                    <div className="mt-3 space-y-1 text-[11px] leading-4 text-[var(--faint)]">
                      <div>1. 先过待确认</div>
                      <div>2. 留用 / 淘汰</div>
                      <div>3. 加入选片</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="truncate text-[12px] font-bold text-[var(--text)]">
                      {targets.length === 1 && current ? current.name : `已选 ${targets.length} 张`}
                    </div>
                    {targets.length === 1 && current && (
                      <div className="mt-2 flex items-center gap-1">
                        <button
                          className={`h-7 rounded-lg px-2 text-[11px] ${
                            portraitFlags[current.id]?.override === 1
                              ? 'bg-[var(--accent-soft)] text-[var(--accent-text)] font-bold'
                              : 'text-[var(--muted)] hover:bg-[var(--panel-2)]'
                          }`}
                          onClick={() => void judgePortrait(current.id, 1)}
                        >
                          是人像
                        </button>
                        <button
                          className={`h-7 rounded-lg px-2 text-[11px] ${
                            portraitFlags[current.id]?.override === 0
                              ? 'bg-[var(--panel-3)] text-[var(--danger-text)] font-bold'
                              : 'text-[var(--muted)] hover:bg-[var(--panel-2)]'
                          }`}
                          onClick={() => void judgePortrait(current.id, 0)}
                        >
                          不是
                        </button>
                        <button
                          className="h-7 rounded-lg px-2 text-[11px] text-[var(--faint)] hover:bg-[var(--panel-2)]"
                          onClick={() => void clearPortraitVerdict(current.id)}
                        >
                          清除
                        </button>
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          className={`h-6 w-6 rounded text-[12px] tabular-nums ${
                            current && targets.length === 1 && current.rating >= n
                              ? 'text-[var(--star)]'
                              : 'text-[var(--muted)] hover:text-[var(--star)]'
                          }`}
                          onClick={() => void rateTargets(n)}
                          title={`${n} 星`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <div className="mt-1.5 flex items-center gap-1">
                      <button className="btn btn-ghost h-7 px-2 text-[11px]" onClick={() => void flagTargets(1)}>
                        留用
                      </button>
                      <button className="btn btn-ghost h-7 px-2 text-[11px]" onClick={() => void flagTargets(-1)}>
                        淘汰
                      </button>
                      <button className="btn btn-ghost h-7 px-2 text-[11px]" onClick={() => void flagTargets(0)}>
                        清除
                      </button>
                    </div>
                    <button
                      className="btn btn-primary mt-2 h-9 w-full"
                      onClick={() => void onAddToPick(targets)}
                    >
                      加入选片
                    </button>
                  </>
                )}
              </div>
              <div className="min-h-0 flex-1">
                {current ? (
                  <PhotoInspector
                    item={current}
                    host="portrait"
                    compact
                    showPreview={false}
                    facet={{ targetIds: targets, onApplyValue: applyValue }}
                    study={{
                      aiReady,
                      canAsk: canAsk && !currentScopeBlocked,
                      scopeBlocked: currentScopeBlocked,
                      scopeHint: currentScopeHint
                    }}
                  />
                ) : (
                  <div className="p-3 text-[12px] leading-5 text-[var(--faint)]">
                    点一张看细节；Ctrl 点选多张。
                    <br />
                    选中后这里会出现可选的动作。
                  </div>
                )}
              </div>
            </aside>
          </div>
        </>
      )}

      {lightboxItem && lightIndex !== null && (
        <Lightbox
          items={shownItems}
          index={lightIndex}
          onClose={() => setLightIndex(null)}
          onNavigate={setLightIndex}
          tags={tags}
          folders={folders}
          onRefresh={() => {
            void loadItems()
            void loadFacets()
            void loadTags()
          }}
          onPushUndo={() => undefined}
          // 人像工作台有自己的操作区，右键菜单只在主图库 / 灯箱里提供
          onContextMenu={() => undefined}
          aiReady={aiReady}
          canAsk={canAsk}
          aiScope={aiScope}
        />
      )}
    </div>
  )

}
