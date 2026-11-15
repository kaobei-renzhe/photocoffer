import { useState } from 'react'
import { ChevronDown, Settings as SettingsIcon } from 'lucide-react'
import { EDIT_COMMANDS, MENU_SECTIONS, type MenuSectionId } from '@shared/menu'

interface Props {
  libraryName: string
  onMenuAction: (id: string) => void
  onSwitch: () => void
  onSettings: () => void
}

const drag = { WebkitAppRegion: 'drag' } as React.CSSProperties
const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

/** 36px 自定义标题栏：Windows 五菜单 + 齿轮；mac 红绿灯死区 + 图库名 + 视图下拉 */
export default function TitleBar({ libraryName, onMenuAction, onSwitch, onSettings }: Props) {
  const isMac = window.env?.platform === 'darwin'
  const [open, setOpen] = useState<MenuSectionId | null>(null)

  const run = (id: string): void => {
    setOpen(null)
    if (id === 'app.quit') {
      window.close()
      return
    }
    const command = EDIT_COMMANDS[id]
    if (command) {
      document.execCommand(command)
      return
    }
    onMenuAction(id)
  }

  const section = (id: MenuSectionId) => MENU_SECTIONS.find((entry) => entry.id === id)

  const dropdown = (id: MenuSectionId) => {
    const data = section(id)
    if (!data || open !== id) return null
    return (
      <>
        <div className="fixed inset-0 z-40" onClick={() => setOpen(null)} />
        <div className="absolute left-0 top-[34px] z-50 w-[230px] rounded-xl border border-[var(--border)] bg-[var(--panel)] p-1 shadow-2xl">
          {data.items.map((entry, index) =>
            entry === '---' ? (
              <div key={`sep-${index}`} className="my-1 h-px bg-[var(--border)]" />
            ) : (
              <button
                key={entry.id}
                className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[12px] text-[var(--text)] hover:bg-[var(--panel-2)]"
                onClick={() => run(entry.id)}
              >
                <span>{entry.label}</span>
                {entry.accelerator && (
                  <span className="ml-auto text-[10.5px] tabular-nums text-[var(--faint)]">
                    {entry.accelerator.replace('CmdOrCtrl', isMac ? '⌘' : 'Ctrl')}
                  </span>
                )}
              </button>
            )
          )}
        </div>
      </>
    )
  }

  return (
    <div
      className="relative z-40 flex h-9 shrink-0 select-none items-center border-b border-[var(--border)] bg-[var(--chrome)]"
      style={drag}
    >
      {isMac && <div className="w-[78px] shrink-0" />}

      <div className="flex items-center gap-2 pl-4" style={noDrag}>
        <span className="text-[13px] font-bold tracking-[0.06em] text-[var(--text)]">存照</span>
        {isMac && (
          <>
            <span className="h-3 w-px bg-[var(--border)]" />
            <button
              className="max-w-[260px] truncate text-[12px] text-[var(--faint)] hover:text-[var(--text)]"
              onClick={onSwitch}
              title="切换图库"
            >
              {libraryName}
            </button>
          </>
        )}
      </div>

      {!isMac && (
        <div className="ml-3 flex items-center gap-0.5" style={noDrag}>
          {MENU_SECTIONS.map((entry) => (
            <div key={entry.id} className="relative">
              <button
                className={`h-7 rounded-[10px] px-2.5 text-[13px] ${
                  open === entry.id
                    ? 'bg-[var(--panel-2)] text-[var(--text)]'
                    : 'text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]'
                }`}
                onClick={() => setOpen((value) => (value === entry.id ? null : entry.id))}
              >
                {entry.label}
              </button>
              {dropdown(entry.id)}
            </div>
          ))}
        </div>
      )}

      <div className="flex-1" />

      {isMac && (
        <div className="relative mr-2" style={noDrag}>
          <button
            className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[12px] text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
            onClick={() => setOpen((value) => (value === 'view' ? null : 'view'))}
          >
            视图 <ChevronDown size={14} strokeWidth={1.75} />
          </button>
          {dropdown('view')}
        </div>
      )}

      <button
        className="grid h-7 w-7 place-items-center rounded-lg text-[var(--faint)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
        style={noDrag}
        onClick={onSettings}
        title="设置"
        aria-label="设置"
      >
        <SettingsIcon size={16} strokeWidth={1.75} />
      </button>

      {/* Windows 原生三键 overlay 的 148px 禁区 */}
      <div className="w-[148px] shrink-0" />
    </div>
  )
}
