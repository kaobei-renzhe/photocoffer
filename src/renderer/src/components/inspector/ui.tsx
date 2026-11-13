import type { ReactNode } from 'react'

export type PushUndo = (label: string, run: () => Promise<void>, showToast?: boolean) => void

export function Section({
  title,
  children,
  compact
}: {
  title: string
  children: ReactNode
  compact?: boolean
}) {
  return (
    <div className={compact ? 'mt-3' : 'mt-4'}>
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--faint)]">
        <span className="h-[3px] w-[3px] rounded-full bg-[var(--accent)] opacity-70" />
        {title}
      </div>
      <div
        className={`rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--card)] ${
          compact ? 'p-2' : 'p-2.5'
        }`}
      >
        {children}
      </div>
    </div>
  )
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-[11.5px] leading-5">
      <span className="w-[52px] shrink-0 text-[var(--faint)]">{label}</span>
      <span className="break-all text-[var(--text)]">{value}</span>
    </div>
  )
}
