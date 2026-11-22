import type { QuotaHint } from '../lib/aiQuota'

interface AiDataNoticeProps {
  hint: QuotaHint | null
  className?: string
}

/**
 * AI 入口的数据去向提示：本机不上传、不计量；外部会发送图片并计入额度。
 * 只负责展示，不拦截请求；按钮是否禁用由父组件根据 hint.level 决定。
 */
export default function AiDataNotice({ hint, className = '' }: AiDataNoticeProps) {
  if (!hint) return null
  // 还没读到模型位置时不显示占位噪音；AI 入口本身会根据可用性隐藏
  if (hint.locality === 'unknown' && !hint.line) return null

  const local = hint.locality === 'local'
  const external = hint.locality === 'external'
  const tone =
    hint.level === 'hard'
      ? 'var(--danger)'
      : hint.level === 'soft'
        ? 'var(--warn)'
        : 'var(--faint)'
  const text = local
    ? '本机模型运行，照片不会离开本机，不计入额度。'
    : external
      ? `图片会发送到你配置的服务商。${hint.line}`
      : hint.line || '还没读取到模型位置。'

  return (
    <div
      className={`rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1.5 text-[11px] leading-4 ${className}`}
    >
      <span
        className="mr-1.5 rounded border px-1 py-[1px] font-medium"
        style={{ color: tone, borderColor: tone }}
      >
        {local ? '本机' : external ? '外部' : '数据去向'}
      </span>
      <span style={{ color: tone }}>{text}</span>
    </div>
  )
}
