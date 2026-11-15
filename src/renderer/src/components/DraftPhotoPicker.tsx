import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent } from 'react'
import { GripVertical, ImagePlus, Loader2, Plus, Search, X } from 'lucide-react'
import type { Item, PickSessionItem, PickSessionSummary } from '@shared/types'
import { thumbUrl } from '../lib/format'

interface DraftPhotoPickerProps {
  session: PickSessionSummary
  /** 这一单当前的照片，顺序会被保留 */
  currentItems: PickSessionItem[]
  onClose: () => void
  onSaved: (summary: PickSessionSummary) => void
}

const PAGE = 120

function pad3(value: number): string {
  return String(value).padStart(3, '0')
}

function cleanError(error: unknown): string {
  return String((error as Error)?.message ?? error).replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    ''
  )
}

/**
 * 草稿照片集编辑：上半部分是这一单已有的照片（可移除），
 * 下半部分是图库最近照片与搜索结果（点一下加入）。保存时整体替换并重新编号。
 */
export default function DraftPhotoPicker({
  session,
  currentItems,
  onClose,
  onSaved
}: DraftPhotoPickerProps) {
  const [picked, setPicked] = useState<Map<number, string>>(
    () => new Map(currentItems.map((item) => [item.itemId, item.name]))
  )
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<Item[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** 拖拽排序：dragId 是被拖的，overId 是当前悬停的目标 */
  const dragRef = useRef<number | null>(null)
  const [dragId, setDragId] = useState<number | null>(null)
  const [overId, setOverId] = useState<number | null>(null)
  const [overEnd, setOverEnd] = useState(false)

  // 默认展示最近 120 张；输入关键词后走图库搜索，避免一次拉全库
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(
      () => {
        window.api
          .listItems({ sort: 'added', query: query.trim() || undefined }, 0, PAGE)
          .then((result) => {
            if (!cancelled) setCandidates(result.items)
          })
          .catch((err) => {
            if (cancelled) return
            setCandidates([])
            setError(cleanError(err))
          })
          .finally(() => {
            if (!cancelled) setLoading(false)
          })
      },
      query.trim() ? 260 : 0
    )
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saving, onClose])

  const pickedIds = useMemo(() => new Set(picked.keys()), [picked])
  const visibleCandidates = (candidates ?? []).filter((item) => !pickedIds.has(item.id))

  const add = (item: Item): void => {
    setPicked((prev) => {
      const next = new Map(prev)
      next.set(item.id, item.name)
      return next
    })
  }

  const remove = (id: number): void => {
    setPicked((prev) => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }

  const clearDrag = (): void => {
    dragRef.current = null
    setDragId(null)
    setOverId(null)
    setOverEnd(false)
  }

  const onDragStart = (id: number, event: ReactDragEvent<HTMLDivElement>): void => {
    dragRef.current = id
    setDragId(id)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(id))
  }

  const onDragOverCard = (id: number, event: ReactDragEvent<HTMLDivElement>): void => {
    if (dragRef.current === null || dragRef.current === id) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setOverId(id)
    setOverEnd(false)
  }

  /** 放到目标位置前面；从后往前拖时目标索引要减一 */
  const reorder = (fromId: number, targetId: number): void => {
    setPicked((prev) => {
      const entries = [...prev.entries()]
      const from = entries.findIndex(([id]) => id === fromId)
      const to = entries.findIndex(([id]) => id === targetId)
      if (from < 0 || to < 0 || from === to) return prev
      const next = [...entries]
      const [moved] = next.splice(from, 1)
      next.splice(from < to ? to - 1 : to, 0, moved)
      return new Map(next)
    })
  }

  const onDropCard = (targetId: number, event: ReactDragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const from = dragRef.current
    if (from !== null) reorder(from, targetId)
    clearDrag()
  }

  const moveToEnd = (fromId: number): void => {
    setPicked((prev) => {
      const entries = [...prev.entries()]
      const from = entries.findIndex(([id]) => id === fromId)
      if (from < 0 || from === entries.length - 1) return prev
      const next = [...entries]
      const [moved] = next.splice(from, 1)
      next.push(moved)
      return new Map(next)
    })
  }

  const onDropEnd = (event: ReactDragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const from = dragRef.current
    if (from !== null) moveToEnd(from)
    clearDrag()
  }

  const save = async (): Promise<void> => {
    const ids = [...picked.keys()]
    if (ids.length === 0) {
      setError('至少保留一张照片')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const updated = await window.api.pickUpdateDraftItems(session.id, ids)
      onSaved(updated)
      onClose()
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[var(--overlay)] backdrop-blur-sm"
      onClick={saving ? undefined : onClose}
    >
      <div
        className="flex h-[700px] max-h-[90vh] w-[980px] max-w-[94vw] flex-col rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex h-[46px] shrink-0 items-center gap-2 border-b border-[var(--border)] px-4">
          <ImagePlus size={16} color="var(--accent-2)" />
          <span className="text-[13.5px] font-bold">管理这单的照片</span>
          <span className="text-[12px] text-[var(--faint)]">
            {session.title} · 已选 {picked.size} 张
          </span>
          <button
            className="btn btn-ghost ml-auto h-7 px-1.5"
            onClick={onClose}
            disabled={saving}
            title="关闭（Esc）"
          >
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="shrink-0 border-b border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-2 text-[12px] text-[var(--danger-text)]">
            {error}
          </div>
        )}

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          <section>
            <div className="flex items-center gap-2 text-[12px] font-normal text-[var(--faint)]">
              已在这单
              <span className="tabular-nums">{picked.size}</span>
              <span className="ml-auto text-[11px] font-normal normal-case tracking-normal">
                点右上角 × 移出；拖动缩略图调整顺序；保存后按这里的顺序重新编号
              </span>
            </div>
            {picked.size === 0 ? (
              <div className="mt-2 rounded-2xl border border-dashed border-[var(--border)] px-3 py-6 text-center text-[12px] text-[var(--faint)]">
                这一单还没有照片，从下面挑几张
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-8 gap-2">
                {[...picked.entries()].map(([id, name], index) => {
                  const isDragging = dragId === id
                  const isOver = overId === id && dragId !== null && dragId !== id
                  return (
                    <div
                      key={id}
                      draggable
                      onDragStart={(event) => onDragStart(id, event)}
                      onDragOver={(event) => onDragOverCard(id, event)}
                      onDrop={(event) => onDropCard(id, event)}
                      onDragEnd={clearDrag}
                      className={`group overflow-hidden rounded-2xl border bg-[var(--panel-2)] transition ${
                        isDragging ? 'opacity-40' : ''
                      } ${
                        isOver
                          ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]'
                          : 'border-[var(--border)]'
                      }`}
                      title={`${name}（拖动可调整顺序）`}
                    >
                      <div className="relative aspect-square bg-[var(--panel-3)]">
                        <img
                          src={thumbUrl(id, 'low')}
                          alt=""
                          draggable={false}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                        <span className="absolute left-1 top-1 rounded-lg bg-black/55 px-1 py-0.5 text-[11px] tabular-nums text-white">
                          {pad3(index + 1)}
                        </span>
                        <span className="absolute bottom-1 left-1 rounded-lg bg-black/55 p-0.5 text-white/80 opacity-0 transition group-hover:opacity-100">
                          <GripVertical size={14} />
                        </span>
                        <button
                          className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/65 text-white hover:bg-[var(--panel-3)]"
                          onClick={() => remove(id)}
                          title="移出这单"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <div className="truncate px-1.5 py-1 text-[11px] text-[var(--faint)]">
                        {name}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {dragId !== null && (
              <div
                className={`mt-2 rounded-2xl border border-dashed px-3 py-2 text-center text-[11px] transition ${
                  overEnd
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                    : 'border-[var(--border)] text-[var(--faint)]'
                }`}
                onDragOver={(event) => {
                  event.preventDefault()
                  setOverId(null)
                  setOverEnd(true)
                }}
                onDragLeave={() => setOverEnd(false)}
                onDrop={onDropEnd}
              >
                拖到这里放到最后
              </div>
            )}
          </section>

          <section>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[12px] font-normal text-[var(--faint)]">
                从图库添加
              </div>
              <div className="relative ml-auto w-[260px]">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--faint)]"
                />
                <input
                  autoFocus
                  className="input w-full"
                  style={{ paddingLeft: 30 }}
                  placeholder="搜索文件名、标签、备注…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </div>
            <div className="mt-1 text-[11px] text-[var(--faint)]">
              默认显示最近 {PAGE} 张；图库很大时用搜索找。
            </div>

            {loading && !candidates ? (
              <div className="mt-3 flex items-center gap-2 py-6 text-[12px] text-[var(--muted)]">
                <Loader2 size={14} className="animate-spin" /> 读取图库…
              </div>
            ) : visibleCandidates.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-dashed border-[var(--border)] px-3 py-6 text-center text-[12px] text-[var(--faint)]">
                {query.trim() ? '没有更多匹配的照片' : '图库里暂时没有可添加的照片'}
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-8 gap-2">
                {visibleCandidates.map((item) => (
                  <button
                    key={item.id}
                    className="group overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] text-left"
                    onClick={() => add(item)}
                    title={`加入这单：${item.name}`}
                  >
                    <div className="relative aspect-square bg-[var(--panel-3)]">
                      <img
                        src={thumbUrl(item.id, 'low')}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                      <span className="absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100">
                        <Plus size={18} className="text-white" />
                      </span>
                    </div>
                    <div className="truncate px-1.5 py-1 text-[11px] text-[var(--faint)]">
                      {item.name}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-[var(--border)] px-4 py-2.5">
          <span className="text-[11px] text-[var(--faint)]">
            只改这一单的照片，不动图库；已发出的单不能改。
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button className="btn btn-ghost h-7 px-2.5 text-[12px]" onClick={onClose} disabled={saving}>
              取消
            </button>
            <button
              className="btn btn-primary h-7 px-2.5 text-[12px]"
              disabled={saving || picked.size === 0}
              onClick={() => void save()}
            >
              {saving ? '保存中…' : `保存（${picked.size} 张）`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
