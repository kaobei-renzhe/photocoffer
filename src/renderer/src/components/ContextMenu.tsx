import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Check, ChevronRight } from 'lucide-react'

export interface ContextMenuEntry {
  id: string
  label: string
  icon?: ReactNode
  /** 右侧的淡色说明，例如「3 张」 */
  hint?: string
  /** 分隔线，其余字段忽略 */
  separator?: boolean
  disabled?: boolean
  danger?: boolean
  checked?: boolean
  onSelect?: () => void
  /** 有子项时右侧出现箭头，悬停展开 */
  children?: ContextMenuEntry[]
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuEntry[]
  onClose: () => void
}

interface SubmenuState {
  id: string
  flip: boolean
}

/**
 * 图库与灯箱共用的单例右键菜单。
 * 位置按鼠标坐标贴边翻转，外点 / Esc / 右键空白都能关闭；同一时间只渲染一份。
 */
export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  const [sub, setSub] = useState<SubmenuState | null>(null)

  // 先按鼠标位置渲染一帧，量出真实尺寸后再贴边收回来，避免闪一下
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPos({
      x: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))
    })
  }, [x, y, items])

  useEffect(() => {
    setSub(null)
  }, [x, y])

  useEffect(() => {
    // 用捕获阶段：灯箱的 Esc 先跑（可能已经 preventDefault），这里再决定关菜单
    const onKey = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const openSub = (entry: ContextMenuEntry): void => {
    if (!entry.children?.length) return
    const rect = menuRef.current?.getBoundingClientRect()
    const flip = rect ? rect.right + 220 > window.innerWidth - 8 : false
    setSub({ id: entry.id, flip })
  }

  const renderEntry = (entry: ContextMenuEntry): ReactNode => {
    if (entry.separator) {
      return <div key={entry.id} className="my-1 h-px bg-[var(--border)]" />
    }
    const hasChildren = Boolean(entry.children?.length)
    const active = sub?.id === entry.id
    return (
      <div key={entry.id} className="relative">
        <button
          className={`flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-left text-[12px] transition-colors ${
            entry.disabled
              ? 'cursor-default text-[var(--faint)] opacity-55'
              : entry.danger
                ? 'text-[var(--danger-text)] hover:bg-[var(--danger-soft)]'
                : 'text-[var(--text)] hover:bg-[var(--panel-3)]'
          } ${active ? 'bg-[var(--panel-3)]' : ''}`}
          disabled={entry.disabled}
          onMouseEnter={() => openSub(entry)}
          onClick={() => {
            if (entry.disabled) return
            if (hasChildren) {
              openSub(entry)
              return
            }
            entry.onSelect?.()
            onClose()
          }}
        >
          <span className="grid w-[14px] shrink-0 place-items-center text-[var(--muted)]">
            {entry.checked ? <Check size={12} /> : entry.icon}
          </span>
          <span className="min-w-0 flex-1 truncate">{entry.label}</span>
          {entry.hint && (
            <span className="shrink-0 text-[10.5px] text-[var(--faint)]">{entry.hint}</span>
          )}
          {hasChildren && <ChevronRight size={12} className="shrink-0 text-[var(--faint)]" />}
        </button>

        {hasChildren && active && (
          <div
            className={`absolute top-[-5px] z-10 min-w-[168px] max-w-[260px] rounded-lg border border-[var(--border)] bg-[var(--panel)] p-1 shadow-2xl ${
              sub?.flip ? 'right-full mr-1' : 'left-full ml-1'
            }`}
            style={{ maxHeight: '60vh', overflowY: 'auto' }}
            onMouseLeave={() => setSub(null)}
          >
            {entry.children?.map(renderEntry)}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[80]"
      onPointerDown={onClose}
      onContextMenu={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div
        ref={menuRef}
        data-context-menu="true"
        className="absolute min-w-[190px] rounded-lg border border-[var(--border)] bg-[var(--panel)] p-1 shadow-2xl"
        style={{ left: pos.x, top: pos.y }}
        onPointerDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        {items.map(renderEntry)}
      </div>
    </div>
  )
}
