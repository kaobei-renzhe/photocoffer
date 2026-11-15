import type { PortraitStatus } from '@shared/types'

interface Props {
  status: PortraitStatus
  onShowConfirmed: () => void
  onShowLikely: () => void
  onShowReview: () => void
}

function Row({
  label,
  count,
  hint,
  onClick,
  tone = 'normal'
}: {
  label: string
  count: number
  hint: string
  onClick: () => void
  tone?: 'normal' | 'accent'
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--panel-2)]"
      onClick={onClick}
      aria-label={`${label} ${count} 张，${hint}`}
      title={hint}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${tone === 'accent' ? 'bg-[var(--accent)]' : 'bg-[var(--faint)]'}`} />
      <span className="text-[12px] text-[var(--muted)]">{label}</span>
      <span className="ml-auto text-[15px] font-bold tabular-nums text-[var(--text)]">{count}</span>
    </button>
  )
}

/** 人像状态层：已确认 / 可能 / 待确认；staleOverrides 只做告知，不做警告 */
export default function PortraitStatusCard({ status, onShowConfirmed, onShowLikely, onShowReview }: Props) {
  const confirmed = status.confirmedByModel + status.confirmedByHuman
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-2">
      <div className="px-2 pb-1 pt-0.5 text-[11px] text-[var(--faint)]">本场人像</div>
      <Row label="已确认" count={confirmed} hint="模型确认或你确认的人像" onClick={onShowConfirmed} tone="accent" />
      <Row label="可能" count={status.likely} hint="模型把握不大，值得看一眼" onClick={onShowLikely} />
      <Row label="待确认" count={status.unresolved} hint="还没检测，或检测失败" onClick={onShowReview} />
      {status.staleOverrides > 0 && (
        <div className="px-2 pb-1 pt-2 text-[11px] leading-4 text-[var(--muted)]">
          模型已更新，{status.staleOverrides} 张人工判定仍保留
        </div>
      )}
    </div>
  )
}
