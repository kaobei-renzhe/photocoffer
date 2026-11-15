import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { ArrowLeft, Camera, Folder as FolderIcon, Images, Plus, RefreshCw, Trash2, X } from 'lucide-react'
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
import { PORTRAIT_THUMB } from '@shared/layout'
import { photoUrl, thumbUrl } from './lib/format'
import { inAiScope, outOfScopeText, type AiScope } from './lib/aiScope'
import { modLabel } from './lib/platform'
import Lightbox from './components/Lightbox'
import PhotoInspector from './components/inspector/PhotoInspector'

interface PortraitWorkspaceProps {
  onBack: () => void
  /** 大模型总开关与读片对话能力 */
  aiReady: boolean
  canAsk: boolean
  /** AI 处理范围：超出范围的单张不显示 AI 操作 */
  aiScope: AiScope | null
}

const PAGE_LIMIT = 500

/**
 * 人像工作台：左维度 / 中瀑布流 / 右详情。
 * 维度与取值本质是带 facet_id 的普通标签，所以照片上已有的标记、筛选都能直接复用。
 */
export default function PortraitWorkspace({
  onBack,
  aiReady,
  canAsk,
  aiScope
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
  /** 瀑布流卡片宽度：拖动时只改本地，停手后落盘 */
  const [thumbSize, setThumbSize] = useState<number>(PORTRAIT_THUMB.default)
  const thumbSaveTimer = useRef<number | null>(null)
  /** 人像检测：默认只看人像；模型与结果都由主进程缓存 */
  const [portraitOnly, setPortraitOnly] = useState(true)
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
      setMessage(`读取照片失败：${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [picked, folderId])

  useEffect(() => {
    void loadFacets().catch((error) => setMessage(`读取分类失败：${(error as Error).message}`))
  }, [loadFacets])

  useEffect(() => {
    void loadFolders().catch((error) => setMessage(`读取文件夹失败：${(error as Error).message}`))
    void loadTags().catch(() => undefined)
  }, [loadFolders, loadTags])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  useEffect(() => {
    void window.api.getPortraitThumbSize().then(setThumbSize).catch(() => undefined)
    return () => {
      if (thumbSaveTimer.current !== null) window.clearTimeout(thumbSaveTimer.current)
    }
  }, [])

  const changeThumbSize = (value: number): void => {
    setThumbSize(value)
    if (thumbSaveTimer.current !== null) window.clearTimeout(thumbSaveTimer.current)
    thumbSaveTimer.current = window.setTimeout(() => {
      thumbSaveTimer.current = null
      void window.api.savePortraitThumbSize(value).catch(() => undefined)
    }, 150)
  }

  const loadPortraitStatus = useCallback(async (): Promise<void> => {
    try {
      setPortraitStatus(await window.api.portraitStatus())
    } catch (error) {
      setPortraitMsg(`读取人像模型状态失败：${(error as Error).message}`)
    }
  }, [])

  useEffect(() => {
    void loadPortraitStatus()
  }, [loadPortraitStatus])

  // 分块扫描：每 20 张更新一次界面，未识别完之前不阻塞其它操作
  useEffect(() => {
    if (!portraitOnly) {
      setPortraitScanning(false)
      setPortraitProgress(null)
      return
    }
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
        if (scanToken.current === token) setPortraitMsg(`人像识别失败：${(error as Error).message}`)
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
  }, [items, portraitOnly, portraitStatus?.modelReady])

  const shownItems = useMemo(() => {
    if (!portraitOnly) return items
    if (!portraitStatus?.modelReady) return []
    return items.filter((item) => {
      const flag = portraitFlags[item.id]
      if (!flag) return false
      if (flag.override === 1) return true
      if (flag.override === 0) return false
      return flag.verdict === 'person' || flag.verdict === 'likely'
    })
  }, [items, portraitOnly, portraitStatus?.modelReady, portraitFlags])

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
      setPortraitMsg(`模型下载失败：${(error as Error).message}`)
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
  const activeFolder = folderId !== null ? folders.find((folder) => folder.id === folderId) : null

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
      setMessage(`标记失败：${(error as Error).message}`)
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
      setMessage(`新增取值失败：${(error as Error).message}`)
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
      setMessage(`新建分类失败：${(error as Error).message}`)
    }
  }

  const removeFacet = async (facet: Facet): Promise<void> => {
    const ok = await window.api.confirm(
      `删除分类「${facet.name}」？`,
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
      setMessage(`删除失败：${(error as Error).message}`)
    }
  }

  const pickedCount = Object.values(picked).reduce((sum, list) => sum + list.length, 0)
  const lightboxItem = lightIndex !== null ? shownItems[lightIndex] : null

  return (
    <div className="h-full flex flex-col bg-[var(--bg)]">
      <header className="h-[52px] shrink-0 px-3 flex items-center gap-2 border-b border-[var(--border)] bg-[var(--chrome)]">
        <button className="btn btn-ghost h-7 px-2 text-[12px]" onClick={onBack}>
          <ArrowLeft size={14} /> 返回图库
        </button>
        <Camera size={16} color="var(--accent-2)" />
        <span className="text-[13.5px] font-bold">人像工作台</span>
        <div className="flex items-center gap-1 ml-3 flex-wrap">
          {activeFolder && (
            <button
              className="inline-flex items-center gap-1 h-[22px] px-1.5 rounded-lg border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[12px] text-[var(--accent-text)]"
              onClick={() => setFolderId(null)}
              title="移除文件夹条件"
            >
              <FolderIcon size={14} />
              {activeFolder.name}
              <X size={14} />
            </button>
          )}
          {facets.flatMap((facet) =>
            (picked[facet.id] ?? []).map((valueId) => {
              const value = facet.values.find((entry) => entry.id === valueId)
              if (!value) return null
              return (
                <button
                  key={`${facet.id}-${valueId}`}
                  className="inline-flex items-center gap-1 h-[22px] px-1.5 rounded-lg border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[12px] text-[var(--accent-text)]"
                  onClick={() => toggleFilter(facet.id, valueId)}
                  title="移除这个条件"
                >
                  <span className="w-[6px] h-[6px] rounded-full" style={{ background: value.color }} />
                  {value.name}
                  <X size={14} />
                </button>
              )
            })
          )}
          {pickedCount > 0 && (
            <button className="text-[12px] text-[var(--faint)] hover:text-[var(--text)]" onClick={() => setPicked({})}>
              清空条件
            </button>
          )}
        </div>
        <span className="ml-auto text-[12px] text-[var(--faint)] tabular-nums">
          {loading ? '读取中…' : `${portraitOnly ? shownItems.length : items.length} / ${total} 张`}
        </span>
        <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--card)] p-0.5">
          <button
            className={`h-6 rounded-lg px-2 text-[12px] transition-colors ${
              portraitOnly
                ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]'
                : 'text-[var(--faint)] hover:text-[var(--text)]'
            }`}
            onClick={() => {
              setPortraitOnly(true)
              setSelection([])
              setActiveId(null)
            }}
            title="只显示检测到人物的照片"
          >
            仅人像
          </button>
          <button
            className={`h-6 rounded-lg px-2 text-[12px] transition-colors ${
              !portraitOnly
                ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]'
                : 'text-[var(--faint)] hover:text-[var(--text)]'
            }`}
            onClick={() => {
              setPortraitOnly(false)
              setSelection([])
              setActiveId(null)
            }}
            title="显示全部照片"
          >
            全部
          </button>
        </div>
        <div className="flex items-center gap-1.5" title="调整瀑布流卡片大小">
          <span className="text-[11px] text-[var(--faint)]">大小</span>
          <input
            type="range"
            min={PORTRAIT_THUMB.min}
            max={PORTRAIT_THUMB.max}
            step={PORTRAIT_THUMB.step}
            value={thumbSize}
            onChange={(event) => changeThumbSize(Number(event.target.value))}
            className="w-[92px] accent-[var(--accent)]"
          />
        </div>
        <button
          className="btn h-7 px-2 text-[12px]"
          onClick={() => void Promise.all([loadItems(), loadFacets(), loadFolders()])}
          title="重新读取文件夹、分类与照片"
        >
          <RefreshCw size={14} /> 刷新
        </button>
      </header>

      {message && (
        <div className="shrink-0 px-3 py-1.5 text-[12px] text-[var(--danger-text)] bg-[var(--danger-soft)] border-b border-[var(--danger-border)]">
          {message}
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        {/* 左：文件夹 + 维度 */}
        <aside className="w-[228px] shrink-0 border-r border-[var(--border)] overflow-y-auto px-2 py-3">
          <div className="mb-3">
            <div className="flex items-center gap-1.5 px-1 mb-1.5">
              <FolderIcon size={14} className="text-[var(--faint)]" />
              <span className="text-[12px] text-[var(--text)]">文件夹</span>
              <span className="ml-auto text-[11px] text-[var(--faint)] tabular-nums">
                {folders.length}
              </span>
            </div>
            <button
              className={`w-full flex items-center gap-1.5 h-[26px] px-1.5 rounded-lg text-[12px] transition-colors ${
                folderId === null
                  ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]'
                  : 'text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]'
              }`}
              onClick={() => setFolderId(null)}
            >
              <Images size={14} />
              全部照片
            </button>
            {folders.map((folder) => {
              const active = folderId === folder.id
              return (
                <button
                  key={folder.id}
                  className={`w-full flex items-center gap-1.5 h-[26px] px-1.5 rounded-lg text-[12px] transition-colors ${
                    active
                      ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]'
                      : 'text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]'
                  }`}
                  onClick={() => setFolderId(active ? null : folder.id)}
                  title={folder.name}
                >
                  <FolderIcon size={14} />
                  <span className="truncate">{folder.name}</span>
                  <span className="ml-auto text-[11px] text-[var(--faint)] tabular-nums">
                    {folder.count}
                  </span>
                </button>
              )
            })}
            {folders.length === 0 && (
              <div className="px-1 py-0.5 text-[11px] text-[var(--faint)]">
                还没有文件夹，可在图库里新建
              </div>
            )}
          </div>
          <div className="my-3 border-t border-[var(--border)]" />

          {facets.map((facet) => {
            const active = picked[facet.id] ?? []
            return (
              <div key={facet.id} className="mb-4">
                <div className="flex items-center gap-1.5 px-1 mb-1.5">
                  <span className="text-[12px] text-[var(--text)]">{facet.name}</span>
                  <span className="text-[11px] text-[var(--faint)]">{facet.multi ? '多选' : '单选'}</span>
                  <button
                    className="ml-auto w-5 h-5 rounded-lg grid place-items-center text-[var(--faint)] hover:text-[var(--text)] hover:bg-[var(--panel-2)]"
                    onClick={() => {
                      setAddingValueFor(addingValueFor === facet.id ? null : facet.id)
                      setValueDraft('')
                    }}
                    title="新增取值"
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    className="w-5 h-5 rounded-lg grid place-items-center text-[var(--faint)] hover:text-[var(--danger-text)] hover:bg-[var(--panel-2)]"
                    onClick={() => void removeFacet(facet)}
                    title="删除分类"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {facet.values.map((value) => {
                    const on = active.includes(value.id)
                    return (
                      <button
                        key={value.id}
                        className={`inline-flex items-center gap-1 h-[22px] px-1.5 rounded-lg border text-[12px] transition-colors ${
                          on
                            ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                            : 'border-[var(--border)] bg-[var(--panel-2)] text-[var(--faint)] hover:text-[var(--text)]'
                        }`}
                        onClick={() => toggleFilter(facet.id, value.id)}
                      >
                        <span
                          className="w-[6px] h-[6px] rounded-full"
                          style={{ background: value.color, opacity: on ? 1 : 0.5 }}
                        />
                        {value.name}
                        {value.count > 0 && <span className="tabular-nums opacity-60">{value.count}</span>}
                      </button>
                    )
                  })}
                  {facet.values.length === 0 && (
                    <span className="text-[11px] text-[var(--faint)] px-1">还没有取值</span>
                  )}
                </div>
                {addingValueFor === facet.id && (
                  <div className="flex items-center gap-1 mt-1.5">
                    <input
                      className="input h-6 text-[12px] min-w-0 flex-1"
                      value={valueDraft}
                      autoFocus
                      placeholder="新取值"
                      onChange={(e) => setValueDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void addValue(facet.id)
                        if (e.key === 'Escape') setAddingValueFor(null)
                      }}
                    />
                    <button className="btn h-6 px-1.5 text-[12px]" onClick={() => void addValue(facet.id)}>
                      加
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          {creatingFacet ? (
            <div className="flex items-center gap-1 px-1">
              <input
                className="input h-6 text-[12px] min-w-0 flex-1"
                value={facetDraft}
                autoFocus
                placeholder="分类名，如 道具"
                onChange={(e) => setFacetDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void addFacet()
                  if (e.key === 'Escape') setCreatingFacet(false)
                }}
              />
              <button className="btn h-6 px-1.5 text-[12px]" onClick={() => void addFacet()}>
                建
              </button>
            </div>
          ) : (
            <button
              className="btn btn-ghost h-7 px-2 text-[12px] w-full justify-center"
              onClick={() => setCreatingFacet(true)}
            >
              <Plus size={14} /> 新建分类
            </button>
          )}
        </aside>

        {/* 中：瀑布流 */}
        <main className="flex-1 min-w-0 overflow-y-auto px-3 py-3">
          {portraitOnly && portraitStatus && !portraitStatus.modelReady ? (
            <div className="h-full grid place-items-center">
              <div className="max-w-[360px] text-center">
                <div className="text-[13.5px] text-[var(--text)]">人像识别需要本地检测模型</div>
                <div className="mt-1.5 text-[12px] leading-5 text-[var(--faint)]">
                  DETR-ResNet-50 · 约 41 MB · 只下载一次。下载后会自动识别人像，结果缓存在当前图库。
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
                    <div className="mt-1 text-[11px] text-[var(--faint)] tabular-nums">
                      {modelDownload.total
                        ? `${Math.round((modelDownload.received / modelDownload.total) * 100)}%`
                        : '准备下载…'}
                    </div>
                  </div>
                ) : (
                  <button
                    className="btn btn-primary mt-3 h-8 px-3 text-[12px]"
                    onClick={() => void downloadPortraitModel()}
                  >
                    下载人像模型
                  </button>
                )}
                {portraitMsg && (
                  <div className="mt-2 text-[12px] leading-4 text-[var(--danger-text)]">{portraitMsg}</div>
                )}
                <button
                  className="btn btn-ghost mt-3 h-7 px-2 text-[12px]"
                  onClick={() => setPortraitOnly(false)}
                >
                  先看全部照片
                </button>
              </div>
            </div>
          ) : loading && items.length === 0 ? (
            <div className="text-[12px] text-[var(--faint)] px-1">读取中…</div>
          ) : items.length === 0 ? (
            <div className="h-full grid place-items-center">
              <div className="text-center text-[12px] text-[var(--faint)] max-w-[300px] leading-5">
                当前条件下没有照片。
                <br />
                换几个分类取值，或先在图库里导入人像。
              </div>
            </div>
          ) : portraitOnly && !portraitStatus ? (
            <div className="h-full grid place-items-center">
              <div className="text-center text-[12px] text-[var(--faint)] max-w-[300px] leading-5">
                {portraitMsg || '读取人像模型状态…'}
                <div className="mt-2">
                  <button
                    className="btn btn-ghost h-7 px-2 text-[12px]"
                    onClick={() => void loadPortraitStatus()}
                  >
                    重试
                  </button>
                </div>
              </div>
            </div>
          ) : portraitOnly && shownItems.length === 0 ? (
            <div className="h-full grid place-items-center">
              <div className="text-center text-[12px] text-[var(--faint)] max-w-[300px] leading-5">
                {portraitMsg ? (
                  <span className="text-[var(--danger-text)]">{portraitMsg}</span>
                ) : portraitScanning && portraitProgress ? (
                  `正在识别人像 ${portraitProgress.done} / ${portraitProgress.total}…`
                ) : (
                  '当前筛选下没有识别到人像，可以切到「全部」看看。'
                )}
              </div>
            </div>
          ) : (
            <>
              {portraitOnly && portraitScanning && portraitProgress && (
                <div className="mb-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-2.5 py-2">
                  <div className="flex items-center justify-between text-[12px] text-[var(--muted)]">
                    <span>正在识别人像</span>
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
              <div style={{ columnWidth: thumbSize, columnGap: 10 }}>
                {shownItems.map((item, index) => {
                  const on = selection.includes(item.id)
                  const marks = item.tags
                    .filter((tag) => valueName.has(tag.id))
                    .slice(0, 3)
                  return (
                    <button
                      key={item.id}
                      data-gallery-id={item.id}
                      className={`block w-full mb-2.5 break-inside-avoid text-left rounded-2xl overflow-hidden border transition-colors ${
                        on
                          ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]'
                          : 'border-[var(--border)] hover:border-[var(--border-strong)]'
                      }`}
                      onClick={(event) => selectCard(item, event)}
                      onDoubleClick={() => setLightIndex(index)}
                    >
                      <img
                        src={thumbUrl(item.id, 'mid')}
                        alt={item.name}
                        loading="lazy"
                        draggable={false}
                        className="w-full block bg-[var(--card)]"
                        style={{ aspectRatio: item.width > 0 && item.height > 0 ? `${item.width} / ${item.height}` : '3 / 4' }}
                      />
                      {marks.length > 0 && (
                        <div className="flex flex-wrap gap-1 px-2 py-1.5 bg-[var(--card)]">
                          {marks.map((tag) => (
                            <span
                              key={tag.id}
                              className="inline-flex items-center gap-1 text-[11px] text-[var(--faint)]"
                            >
                              <span
                                className="w-[5px] h-[5px] rounded-full"
                                style={{ background: valueName.get(tag.id)?.color ?? '#7aa2f7' }}
                              />
                              {valueName.get(tag.id)?.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </main>

        {/* 右：详情 */}
        <aside className="flex w-[306px] min-h-0 shrink-0 flex-col border-l border-[var(--border)]">
          {!current ? (
            <div className="p-3 text-[12px] leading-5 text-[var(--faint)]">
              点一张照片查看细节，{modLabel} 点可选多张。
              <br />
              选中后在下方按分类打标，多选时批量生效。
            </div>
          ) : (
            <>
              <div className="shrink-0 space-y-3 px-3 pt-3">
                <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
                  <img
                    src={photoUrl(current.id)}
                    alt={current.name}
                    className="max-h-[190px] w-full object-contain bg-black/20"
                    draggable={false}
                  />
                </div>
                <div>
                  <div className="truncate text-[12px] text-[var(--text)]">{current.name}</div>
                  <div className="mt-0.5 text-[11px] tabular-nums text-[var(--faint)]">
                    {current.width} × {current.height}
                    {current.rating > 0 ? (
                      <>
                        {' · '}
                        <span className="text-[var(--star)]">{'★'.repeat(current.rating)}</span>
                      </>
                    ) : (
                      ''
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-2 min-h-0 flex-1">
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
              </div>
            </>
          )}
        </aside>
      </div>

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
