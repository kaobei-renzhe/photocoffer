import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Undo2, X } from 'lucide-react'
import type { Item, PortraitFlag } from '@shared/types'
import { photoUrl } from '../lib/format'

interface Props {
  items: Item[]
  flags: Record<number, PortraitFlag>
  onJudge: (id: number, value: 0 | 1) => Promise<void>
  onUndo: (id: number) => Promise<void>
  onExit: () => void
  onOpenLightbox: (id: number) => void
}

/** 待确认队列：只做判定，不复用 Lightbox 的七套状态 */
export default function PortraitReview({ items, flags, onJudge, onUndo, onExit, onOpenLightbox }: Props) {
  const [handled, setHandled] = useState<Set<number>>(new Set())
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState<number | null>(null)

  const queue = useMemo(() => items.filter((item) => !handled.has(item.id)), [items, handled])
  useEffect(() => {
    if (index >= queue.length) setIndex(Math.max(0, queue.length - 1))
  }, [queue.length, index])

  const item = queue[index]
  const flag = item ? flags[item.id] : undefined
  const reason = !flag
    ? '这张还没检测'
    : flag.reason === 'no-source'
      ? '这张取不到缩略图，没能检测'
      : flag.reason === 'error'
        ? '这张检测失败了'
        : '这张还没检测'

  const advance = (id: number): void => {
    setHandled((prev) => new Set(prev).add(id))
    setIndex(0)
  }

  const judge = async (value: 0 | 1): Promise<void> => {
    if (!item || busy) return
    setBusy(true)
    try {
      await onJudge(item.id, value)
      setLast(item.id)
      advance(item.id)
    } finally {
      setBusy(false)
    }
  }

  const undo = async (): Promise<void> => {
    if (last === null || busy) return
    setBusy(true)
    try {
      await onUndo(last)
      setHandled((prev) => {
        const next = new Set(prev)
        next.delete(last)
        return next
      })
      setLast(null)
      setIndex(0)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return
      if (event.key === 'Escape') {
        event.preventDefault()
        onExit()
      } else if (event.key === 'y' || event.key === 'Y') {
        event.preventDefault()
        void judge(1)
      } else if (event.key === 'n' || event.key === 'N') {
        event.preventDefault()
        void judge(0)
      } else if (event.key === 'ArrowRight' || event.key === ' ') {
        event.preventDefault()
        if (item) advance(item.id)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setIndex((value) => Math.max(0, value - 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="flex h-full flex-col bg-[var(--bg)]">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--chrome)] px-3">
        <button className="btn btn-ghost h-7 px-2 text-[12px]" onClick={onExit}>
          <ArrowLeft size={14} strokeWidth={1.75} /> 退出队列
        </button>
        <span className="text-[12px] text-[var(--muted)]">
          待确认 <span className="tabular-nums">{queue.length ? index + 1 : 0}</span> /{' '}
          <span className="tabular-nums">{queue.length}</span>
        </span>
        <span className="ml-auto" />
        {last !== null && (
          <button className="btn btn-ghost h-7 px-2 text-[12px]" onClick={() => void undo()} disabled={busy}>
            <Undo2 size={14} strokeWidth={1.75} /> 撤回上一次
          </button>
        )}
        <button
          className="btn btn-ghost h-7 px-2 text-[12px]"
          onClick={() => setHandled(new Set(queue.map((entry) => entry.id)))}
          disabled={!item}
        >
          跳过全部 <ArrowRight size={14} strokeWidth={1.75} />
        </button>
      </header>

      <div className="grid min-h-0 flex-1 place-items-center p-4">
        {!item ? (
          <div className="text-center">
            <div className="text-[15px] font-bold text-[var(--text)]">这批已经过完了</div>
            <div className="mt-1 text-[12px] text-[var(--faint)]">没有待确认的照片了。</div>
            <button className="btn btn-primary mt-4 h-10 px-4" onClick={onExit}>
              回人像工作台
            </button>
          </div>
        ) : (
          <div className="w-full max-w-[720px]">
            <button
              type="button"
              className="block w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-black/20"
              onClick={() => onOpenLightbox(item.id)}
              title="双击或点这里看大图"
            >
              <img
                src={photoUrl(item.id)}
                alt={item.name}
                className="mx-auto max-h-[56vh] w-full object-contain"
                draggable={false}
              />
            </button>
            <div className="mt-2 flex items-center gap-2 text-[12px] text-[var(--muted)]">
              <span className="truncate">{item.name}</span>
              <span className="text-[var(--faint)]">·</span>
              <span>{reason}</span>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button
                className="btn btn-primary h-10 flex-1 justify-center"
                onClick={() => void judge(1)}
                disabled={busy}
              >
                <Check size={16} strokeWidth={1.75} /> 是人像
              </button>
              <button
                className="btn h-10 flex-1 justify-center"
                onClick={() => void judge(0)}
                disabled={busy}
              >
                <X size={16} strokeWidth={1.75} /> 不是人像
              </button>
              <button
                className="btn btn-ghost h-10 px-3"
                onClick={() => advance(item.id)}
                disabled={busy}
                title="跳过这张"
                aria-label="跳过这张"
              >
                <ArrowRight size={16} strokeWidth={1.75} />
              </button>
            </div>
            <div className="mt-2 text-center text-[11px] text-[var(--faint)]">
              Y 是人像 · N 不是人像 · 空格跳过 · Esc 退出
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
