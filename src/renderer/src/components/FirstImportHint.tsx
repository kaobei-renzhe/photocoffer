import { useEffect, useRef } from 'react'
import { Send, Tags, X } from 'lucide-react'

interface FirstImportHintProps {
  count: number
  onTag: () => void
  onSend: () => void
  onClose: () => void
}

/** 首次成功导入后的一次性引导条；8 秒后自动消失 */
export default function FirstImportHint({ count, onTag, onSend, onClose }: FirstImportHintProps) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const timer = window.setTimeout(() => closeRef.current(), 8000)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <div className="fixed bottom-4 left-1/2 z-40 flex w-[560px] max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-2.5 shadow-2xl">
      <span className="min-w-0 text-[12px] leading-5 text-[var(--text)]">
        导进来了 {count} 张。要不要顺手打个标签，或者发给对方？
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <button className="btn h-7 px-2 text-[11.5px]" onClick={onTag}>
          <Tags size={12} /> 打标签
        </button>
        <button className="btn h-7 px-2 text-[11.5px]" onClick={onSend}>
          <Send size={12} /> 发给对方
        </button>
        <button
          className="btn btn-ghost h-7 px-1.5"
          onClick={onClose}
          title="知道了"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  )
}
