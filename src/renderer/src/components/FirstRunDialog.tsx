import { Camera, Images } from 'lucide-react'
import type { AppUseCase } from '@shared/types'

interface FirstRunDialogProps {
  onChoose: (value: AppUseCase) => void
}

/**
 * 首启二选一：只问一次，决定侧栏先露出哪些功能。
 * 没有跳过按钮，避免每次启动都重复打扰。
 */
export default function FirstRunDialog({ onChoose }: FirstRunDialogProps) {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-[var(--overlay)] backdrop-blur-sm">
      <div className="w-[560px] max-w-[92vw] rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6 shadow-2xl">
        <div className="text-[18px] font-bold text-[var(--text)]">你主要用存照做什么？</div>
        <div className="mt-1.5 text-[12px] leading-5 text-[var(--muted)]">
          这决定侧栏先露出哪些功能，不会限制你能用的东西，以后随时能改。
        </div>

        <div className="mt-5 grid gap-3">
          <button
            className="group flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-4 py-3.5 text-left transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
            onClick={() => onChoose('manage')}
          >
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-2)]">
              <Images size={18} />
            </span>
            <span className="min-w-0">
              <span className="block text-[13.5px] font-bold text-[var(--text)]">
                整理自己的照片和灵感图
              </span>
              <span className="mt-1 block text-[12px] leading-5 text-[var(--faint)]">
                导入、搜索、打标签、拖出去用。人像工作台和客户交付先收进「更多」。
              </span>
            </span>
          </button>

          <button
            className="group flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-4 py-3.5 text-left transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
            onClick={() => onChoose('pro')}
          >
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-2)]">
              <Camera size={18} />
            </span>
            <span className="min-w-0">
              <span className="block text-[13.5px] font-bold text-[var(--text)]">
                拍片接单，要交付给客户
              </span>
              <span className="mt-1 block text-[12px] leading-5 text-[var(--faint)]">
                人像工作台、选片交付、客户反馈全部放出来。
              </span>
            </span>
          </button>
        </div>

        <div className="mt-4 text-center text-[11px] text-[var(--faint)]">
          以后可在 设置 → 外观 → 使用方式 里改
        </div>
      </div>
    </div>
  )
}
