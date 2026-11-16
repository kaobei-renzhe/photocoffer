import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  CheckCheck,
  Download,
  FolderOpen,
  Images,
  Loader2,
  Pencil,
  Send,
  Trash2,
  Upload
} from 'lucide-react'
import type { PickSessionItem, PickSessionSummary } from '@shared/types'
import { formatDate, thumbUrl } from '../lib/format'
import DraftPhotoPicker from './DraftPhotoPicker'

interface PickDeliveryProps {
  onBack: () => void
  /** 打开粘贴反馈弹窗，并预选这一单 */
  onOpenImport: (sessionId: number) => void
  /** 回主图库只看这一单客户选中的照片 */
  onViewSession: (sessionId: number) => void
  /** 删除记录后通知外面刷新统计与筛选 */
  onDeleted: (sessionId: number) => void
  /** 用这一单「要 + 要修」的照片打开导出成品 */
  onExportFinals: (itemIds: number[]) => void
  /** 草稿单：生成选片页（写回同一单） */
  onExportDraft: (session: PickSessionSummary, itemIds: number[]) => void
  /** 回主图库重新选一批照片 */
  onPickNew: () => void
  /** 回传或删除后递增，用来重新拉会话 */
  refreshTick: number
}

type SessionState = 'draft' | 'sent' | 'done'

function stateOf(session: PickSessionSummary): SessionState {
  if (session.receivedAt) return 'done'
  if (session.sentAt) return 'sent'
  return 'draft'
}

const STATE_LABEL: Record<SessionState, string> = {
  draft: '待交付',
  sent: '已发出',
  done: '已完成'
}

function pad3(value: number): string {
  return String(value).padStart(3, '0')
}

function daysAgo(timestamp: number): string {
  const days = Math.floor((Date.now() - timestamp) / 86_400_000)
  if (days <= 0) return '今天'
  return `${days} 天前`
}

/** 列表显示的时间和排序用的时间是同一个，避免"看着旧却排最前" */
function listTimestamp(session: PickSessionSummary): string {
  if (session.receivedAt) return `回传 ${formatDate(session.receivedAt)}`
  if (session.sentAt) return `发出 ${formatDate(session.sentAt)}`
  return `更新 ${formatDate(session.updatedAt)}`
}

function ActionBadge({ action }: { action: PickSessionItem['action'] }) {
  if (action === 'keep') {
    return <span className="rounded-lg bg-[var(--accent)] px-1.5 py-0.5 text-[11px] text-[var(--on-accent)]">✓ 要</span>
  }
  if (action === 'fix') {
    return <span className="rounded-lg bg-[var(--panel-3)] px-1.5 py-0.5 text-[11px] text-[var(--text)]">要修</span>
  }
  if (action === 'reject') {
    return <span className="rounded-lg bg-[var(--panel-3)] px-1.5 py-0.5 text-[11px] text-[var(--faint)]">不要</span>
  }
  return <span className="rounded-lg bg-[var(--panel-3)] px-1.5 py-0.5 text-[11px] text-[var(--faint)]">待定</span>
}

/** 流程线上的一个节点：编号 + 当前状态 + 可选操作 */
function FlowStep({
  index,
  title,
  value,
  tone,
  action
}: {
  index: number
  title: string
  value: string
  tone: 'done' | 'active' | 'idle'
  action?: ReactNode
}) {
  const toneClass =
    tone === 'done'
      ? 'border-[var(--success-border)] bg-[var(--success-soft)]'
      : tone === 'active'
        ? 'border-[var(--accent-border)] bg-[var(--accent-soft)]'
        : 'border-[var(--border)] bg-[var(--panel-2)]'
  return (
    <div className={`min-w-[148px] flex-1 rounded-2xl border px-3 py-2 ${toneClass}`}>
      <div className="flex items-center gap-1.5 text-[11px] text-[var(--faint)]">
        <span className="grid h-4 w-4 place-items-center rounded-full bg-[var(--panel-3)] text-[11px] tabular-nums">
          {index}
        </span>
        {title}
      </div>
      <div className="mt-1 text-[12px] text-[var(--text)]">{value}</div>
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  )
}

export default function PickDelivery({
  onBack,
  onOpenImport,
  onViewSession,
  onDeleted,
  onExportFinals,
  onExportDraft,
  onPickNew,
  refreshTick
}: PickDeliveryProps) {
  const [sessions, setSessions] = useState<PickSessionSummary[] | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [items, setItems] = useState<PickSessionItem[]>([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** 草稿单轻量编辑：只改标题和客户 */
  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftClient, setDraftClient] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  /** 草稿照片集编辑弹层 */
  const [photoOpen, setPhotoOpen] = useState(false)

  // 每次回传 / 删除后 refreshTick 递增，重新拉一次会话状态
  useEffect(() => {
    let cancelled = false
    window.api
      .listPickSessions()
      .then((list) => {
        if (cancelled) return
        setSessions(list)
        setSelectedId((current) =>
          current && list.some((session) => session.id === current) ? current : (list[0]?.id ?? null)
        )
      })
      .catch((err) => {
        if (cancelled) return
        setSessions([])
        setError(String((err as Error)?.message ?? err))
      })
    return () => {
      cancelled = true
    }
  }, [refreshTick])

  useEffect(() => {
    if (!selectedId) {
      setItems([])
      return
    }
    let cancelled = false
    setLoadingItems(true)
    window.api
      .listPickSessionItems(selectedId)
      .then((list) => {
        if (!cancelled) setItems(list)
      })
      .catch((err) => {
        if (!cancelled) setError(String((err as Error)?.message ?? err))
      })
      .finally(() => {
        if (!cancelled) setLoadingItems(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedId, refreshTick])

  const groups = useMemo(() => {
    const list = sessions ?? []
    return [
      {
        key: 'draft' as const,
        label: '待交付',
        hint: '主图库选中照片后点「生成浏览页」',
        items: list.filter((session) => stateOf(session) === 'draft')
      },
      {
        key: 'sent' as const,
        label: '已发出',
        hint: '暂无等待回传的单',
        items: list.filter((session) => stateOf(session) === 'sent')
      },
      {
        key: 'done' as const,
        label: '已完成',
        hint: '回传后会自动归到这里',
        items: list.filter((session) => stateOf(session) === 'done')
      }
    ]
  }, [sessions])

  const selected = sessions?.find((session) => session.id === selectedId) ?? null
  const selectedState = selected ? stateOf(selected) : null
  const pickedIds = items
    .filter((item) => item.action === 'keep' || item.action === 'fix')
    .map((item) => item.itemId)

  // 切换单据时退出编辑，避免把上一单的标题带到下一单
  useEffect(() => {
    setEditing(false)
    setPhotoOpen(false)
  }, [selectedId])

  const startEdit = (): void => {
    if (!selected) return
    setDraftTitle(selected.title)
    setDraftClient(selected.client)
    setError(null)
    setEditing(true)
  }

  const saveDraftEdit = async (): Promise<void> => {
    if (!selected || !draftTitle.trim() || savingEdit) return
    setSavingEdit(true)
    try {
      const updated = await window.api.pickUpdateSession(selected.id, {
        title: draftTitle.trim(),
        client: draftClient.trim()
      })
      setSessions((prev) =>
        prev ? prev.map((session) => (session.id === updated.id ? updated : session)) : prev
      )
      setEditing(false)
      setError(null)
    } catch (err) {
      setError(
        String((err as Error)?.message ?? err).replace(
          /^Error invoking remote method '[^']+': (Error: )?/,
          ''
        )
      )
    } finally {
      setSavingEdit(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (!selected) return
    const ok = await window.api.confirm(
      '删除这条选片单？',
      '只删除记录和对方的选择，不会删除照片、文件夹或你自己的旗标。'
    )
    if (!ok) return
    await window.api.deletePickSession(selected.id)
    const rest = (sessions ?? []).filter((session) => session.id !== selected.id)
    setSessions(rest)
    setSelectedId(rest[0]?.id ?? null)
    onDeleted(selected.id)
  }

  return (
    <div className="fixed inset-x-0 bottom-0 top-9 z-30 flex flex-col bg-[var(--bg)]">
      <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--panel)] px-4">
        <button className="btn btn-ghost h-8 px-2" onClick={onBack} title="返回图库">
          <ArrowLeft size={14} /> 返回图库
        </button>
        <div className="text-[15px] font-bold">选片交付</div>
        <span className="text-[12px] text-[var(--faint)]">
          {sessions === null ? '正在读取…' : `共 ${sessions.length} 单`}
        </span>
        <button className="btn btn-primary ml-auto h-8 px-3" onClick={onPickNew}>
          <Images size={14} /> 去图库选片
        </button>
      </header>

      {error && (
        <div className="shrink-0 border-b border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-2 text-[12px] text-[var(--danger-text)]">
          {error}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside className="w-[272px] shrink-0 overflow-y-auto border-r border-[var(--border)] bg-[var(--panel)]">
          {sessions === null ? (
            <div className="flex items-center gap-2 px-3 py-4 text-[12px] text-[var(--muted)]">
              <Loader2 size={14} className="animate-spin" /> 正在读取…
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.key}>
                <div className="flex items-center gap-2 px-3 pb-1 pt-3 text-[11px] font-normal text-[var(--faint)]">
                  {group.label}
                  <span className="ml-auto tabular-nums">{group.items.length}</span>
                </div>
                {group.items.length === 0 ? (
                  <div className="px-3 pb-2 text-[11px] leading-4 text-[var(--faint)]">
                    {group.hint}
                  </div>
                ) : (
                  group.items.map((session) => {
                    const active = session.id === selectedId
                    return (
                      <button
                        key={session.id}
                        className={`w-full border-b border-[var(--border)] px-3 py-2.5 text-left transition-colors ${
                          active ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--panel-2)]'
                        }`}
                        onClick={() => setSelectedId(session.id)}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[12px] text-[var(--text)]">{session.title}</span>
                          {session.receivedAt && (
                            <CheckCheck size={14} className="shrink-0 text-[var(--success)]" />
                          )}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-[var(--faint)]">
                          {session.client || '未填称呼'} · {session.photoCount} 张 ·{' '}
                          {listTimestamp(session)}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[11px] tabular-nums">
                          <span className="text-[var(--success)]">✓ 要 {session.keep}</span>
                          <span className="text-[var(--warn)]">修 {session.fix}</span>
                          <span className="text-[var(--faint)]">待 {session.pending}</span>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            ))
          )}
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto p-5">
          {!selected ? (
            <div className="grid h-full place-items-center">
              <div className="max-w-[360px] text-center">
                <Send size={28} className="mx-auto mb-3 text-[var(--faint)]" />
                <div className="text-[15px] text-[var(--text)]">还没有选片单</div>
                <div className="mt-1.5 text-[12px] leading-5 text-[var(--faint)]">
                  回主图库选中一批照片，点「生成浏览页」，这一单就会出现在这里。
                  回传结果后，也能在这条线上直接导出成品。
                </div>
                <button className="btn btn-primary mt-4 h-8 px-3" onClick={onPickNew}>
                  <Images size={14} /> 去图库选片
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="truncate text-[18px] text-[var(--text)]">{selected.title}</h1>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
                        selectedState === 'done'
                          ? 'bg-[var(--success-soft)] text-[var(--success)]'
                          : selectedState === 'sent'
                            ? 'bg-[var(--accent-soft)] text-[var(--accent-2)]'
                            : 'bg-[var(--panel-3)] text-[var(--faint)]'
                      }`}
                    >
                      {selectedState ? STATE_LABEL[selectedState] : ''}
                    </span>
                  </div>
                  <div className="mt-1 text-[12px] text-[var(--muted)]">
                    {selected.client || '未填称呼'} · {selected.photoCount} 张 · 短码 {selected.token}
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--faint)]">
                    {selected.sentAt
                      ? `导出 ${formatDate(selected.sentAt)}`
                      : `更新 ${formatDate(selected.updatedAt)}`}{' '}
                    · 回传 {selected.receivedAt ? formatDate(selected.receivedAt) : '还没收到'}
                    {selected.replyCount > 1 ? ` · 已回传 ${selected.replyCount} 次` : ''}
                  </div>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                  {selected.filePath && (
                    <button
                      className="btn btn-ghost h-7 px-2 text-[12px]"
                      onClick={() => void window.api.showInFolder(selected.filePath as string)}
                      title={selected.filePath}
                    >
                      <FolderOpen size={14} /> 文件夹
                    </button>
                  )}
                  {selectedState === 'draft' && (
                    <button
                      className="btn h-7 px-2 text-[12px]"
                      onClick={() => setPhotoOpen(true)}
                      title="从图库添加照片，或把照片移出这一单"
                    >
                      <Images size={14} /> 管理照片
                    </button>
                  )}
                  {selectedState === 'draft' && !editing && (
                    <button
                      className="btn h-7 px-2 text-[12px]"
                      onClick={startEdit}
                      title="改标题和称呼"
                    >
                      <Pencil size={14} /> 编辑
                    </button>
                  )}
                  <button
                    className="btn btn-ghost btn-danger h-7 px-2 text-[12px]"
                    onClick={() => void remove()}
                    title="只删除这单记录，不动照片"
                  >
                    <Trash2 size={14} /> 删除
                  </button>
                  <button
                    className="btn h-7 px-2 text-[12px]"
                    disabled={pickedIds.length === 0}
                    onClick={() => onViewSession(selected.id)}
                    title="回到主图库，只看这一单要的 + 要修的"
                  >
                    <Images size={14} /> 看这一单
                  </button>
                </div>
              </div>

              {editing && selectedState === 'draft' && (
                <div className="mt-3 flex flex-wrap items-end gap-2 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2.5">
                  <label className="min-w-[240px] flex-1">
                    <span className="text-[11px] text-[var(--faint)]">标题</span>
                    <input
                      autoFocus
                      className="input mt-1 h-7 w-full text-[12px]"
                      maxLength={80}
                      value={draftTitle}
                      onChange={(event) => setDraftTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void saveDraftEdit()
                        if (event.key === 'Escape') setEditing(false)
                      }}
                    />
                  </label>
                  <label className="w-[180px]">
                    <span className="text-[11px] text-[var(--faint)]">发给谁</span>
                    <input
                      className="input mt-1 h-7 w-full text-[12px]"
                      placeholder="可留空"
                      maxLength={40}
                      value={draftClient}
                      onChange={(event) => setDraftClient(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void saveDraftEdit()
                        if (event.key === 'Escape') setEditing(false)
                      }}
                    />
                  </label>
                  <button
                    className="btn btn-primary h-7 px-2.5 text-[12px]"
                    disabled={savingEdit || !draftTitle.trim()}
                    onClick={() => void saveDraftEdit()}
                  >
                    {savingEdit ? '保存中…' : '保存'}
                  </button>
                  <button
                    className="btn btn-ghost h-7 px-2.5 text-[12px]"
                    onClick={() => setEditing(false)}
                  >
                    取消
                  </button>
                </div>
              )}

              {/* 一条线走完：这批 → 选片页 → 发出 → 反馈 → 成品 */}
              <div className="mt-4 flex flex-wrap items-stretch gap-2">
                <FlowStep
                  index={1}
                  title="这批照片"
                  value={`${selected.photoCount} 张`}
                  tone="done"
                />
                <FlowStep
                  index={2}
                  title="浏览页"
                  value={selected.filePath ? '已生成' : '未生成'}
                  tone={selected.filePath ? 'done' : 'active'}
                  action={
                    selected.filePath ? (
                      <button
                        className="btn h-6 px-2 text-[11px]"
                        onClick={() => void window.api.showInFolder(selected.filePath as string)}
                      >
                        <FolderOpen size={14} /> 打开位置
                      </button>
                    ) : (
                      <button
                        className="btn h-6 px-2 text-[11px]"
                        disabled={items.length === 0}
                        onClick={() =>
                          onExportDraft(
                            selected,
                            items.map((item) => item.itemId)
                          )
                        }
                        title="给这单生成能直接打开的浏览页"
                      >
                        <Send size={14} /> 生成浏览页
                      </button>
                    )
                  }
                />
                <FlowStep
                  index={3}
                  title="发出"
                  value={selected.sentAt ? daysAgo(selected.sentAt) : '还没发出'}
                  tone={selected.sentAt ? 'done' : 'idle'}
                />
                <FlowStep
                  index={4}
                  title="回传"
                  value={
                    selectedState === 'draft'
                      ? '发出后才能收反馈'
                      : selected.receivedAt
                        ? `要 ${selected.keep} · 要修 ${selected.fix}`
                        : '等对方回传'
                  }
                  tone={
                    selected.receivedAt ? 'done' : selectedState === 'draft' ? 'idle' : 'active'
                  }
                  action={
                    selectedState === 'draft' ? undefined : (
                      <button
                        className="btn h-6 px-2 text-[11px]"
                        onClick={() => onOpenImport(selected.id)}
                      >
                        <Upload size={14} /> {selected.receivedAt ? '更新反馈' : '粘贴反馈'}
                      </button>
                    )
                  }
                />
                <FlowStep
                  index={5}
                  title="导出成品"
                  value={pickedIds.length ? `${pickedIds.length} 张可导出` : '还没有可导出的照片'}
                  tone={pickedIds.length ? 'active' : 'idle'}
                  action={
                    <button
                      className="btn h-6 px-2 text-[11px]"
                      disabled={pickedIds.length === 0}
                      onClick={() => onExportFinals(pickedIds)}
                      title="把要的 + 要修的照片按尺寸/质量导出"
                    >
                      <Download size={14} /> 导出成品
                    </button>
                  }
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
                <span className="text-[var(--success)]">✓ 要 {selected.keep}</span>
                <span className="text-[var(--warn)]">要修 {selected.fix}</span>
                <span className="text-[var(--faint)]">不要 {selected.reject}</span>
                <span className="text-[var(--faint)]">待定 {selected.pending}</span>
                {selected.watermark && (
                  <span className="truncate text-[11px] text-[var(--faint)]">
                    水印：{selected.watermark}
                  </span>
                )}
              </div>

              {selected.clientNote && (
                <div className="mt-3 rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-2 text-[12px] leading-5 whitespace-pre-wrap text-[var(--text)]">
                  <span className="text-[11px] text-[var(--muted)]">对方备注：</span>
                  {selected.clientNote}
                </div>
              )}

              {!selected.receivedAt && (
                <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[12px] text-[var(--muted)]">
                  对方还没回传。收到文字后点「粘贴反馈」，粘进来就会自动按编号打标。
                </div>
              )}

              <div className="mt-4">
                {loadingItems ? (
                  <div className="flex items-center gap-2 py-6 text-[12px] text-[var(--muted)]">
                    <Loader2 size={14} className="animate-spin" /> 读取照片…
                  </div>
                ) : (
                  <div className="grid grid-cols-6 gap-2">
                    {items.map((item) => (
                      <div
                        key={item.seq}
                        className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel-2)]"
                        title={`${pad3(item.seq)} · ${item.name}`}
                      >
                        <div className="relative aspect-square bg-[var(--panel-3)]">
                          <img
                            src={thumbUrl(item.itemId, 'low')}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                          <span className="absolute left-1 top-1 rounded-lg bg-black/55 px-1 py-0.5 text-[11px] tabular-nums text-white">
                            {pad3(item.seq)}
                          </span>
                          <span className="absolute bottom-1 right-1">
                            <ActionBadge action={item.action} />
                          </span>
                        </div>
                        <div className="truncate px-1.5 py-1 text-[11px] text-[var(--faint)]">
                          {item.name}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {photoOpen && selected && (
        <DraftPhotoPicker
          session={selected}
          currentItems={items}
          onClose={() => setPhotoOpen(false)}
          onSaved={(updated) => {
            setSessions((prev) =>
              prev ? prev.map((session) => (session.id === updated.id ? updated : session)) : prev
            )
            void window.api.listPickSessionItems(updated.id).then(setItems)
          }}
        />
      )}
    </div>
  )
}
