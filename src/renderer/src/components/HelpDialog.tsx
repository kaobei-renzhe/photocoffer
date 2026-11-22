import { useEffect } from 'react'
import { BookOpen, Keyboard, X } from 'lucide-react'
import { modLabel } from '../lib/platform'

interface HelpDialogProps {
  onClose: () => void
}

// 内容与 README「常用快捷键」保持一致，改一处记得改另一处
const SHORTCUTS: Array<[string, string]> = [
  ['方向键', '按画面位置移动选择'],
  ['J / K', '上一张 / 下一张'],
  ['空格', '打开大图'],
  ['0–5', '打星'],
  ['P / X / U', '留用 / 淘汰 / 清除旗标'],
  [`${modLabel} + A`, '全选当前已加载的照片'],
  ['Delete', '从图库移出（原图不动）'],
  ['Esc', '关闭大图 / 取消选择']
]

const FAQS: Array<[string, string]> = [
  ['删除会删掉原图吗？', '不会。只是从图库移出，硬盘上的文件原样保留，Ctrl / Cmd + Z 可以撤销。'],
  ['照片会被上传吗？', '不会。除了你在设置里开了大模型后手动点的那些操作，其余全在本机完成。'],
  ['RAW 能调色吗？', '不能。存照只读 RAW 内嵌的预览图，负责看和挑，不代替 Lightroom。'],
  ['索引文件能删吗？', '能，删了重新导入即可。但标签、评分、笔记都存在索引里，删之前先备份。']
]

const DOC_URL = 'https://github.com/kaobei-renzhe/photocoffer'

export default function HelpDialog({ onClose }: HelpDialogProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[var(--overlay)] " onClick={onClose}>
      <div
        className="w-[620px] max-h-[84vh] flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="h-[46px] shrink-0 px-4 flex items-center gap-2 border-b border-[var(--border)]">
          <BookOpen size={16} color="var(--accent-2)" />
          <span className="text-[15px] font-bold">使用说明</span>
          <button className="btn btn-ghost h-7 px-1.5 ml-auto" onClick={onClose} title="关闭（Esc）">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <section>
            <h3 className="text-[12px] font-medium text-[var(--text)]">三分钟上手</h3>
            <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-[12px] leading-5 text-[var(--muted)]">
              <li>新建图库：选一个文件夹，索引文件会放在里面（也可以在「设置 → 存储位置」改到别处）。</li>
              <li>导入照片：把文件夹拖进窗口，或点左下角「导入照片」。</li>
              <li>开始看：单击选中，双击或空格打开大图。</li>
            </ol>
          </section>

          <section>
            <h3 className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--text)]">
              <Keyboard size={14} className="text-[var(--faint)]" /> 常用快捷键
            </h3>
            <div className="mt-1.5 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-[12px] leading-5">
              {SHORTCUTS.map(([key, action]) => (
                <div key={key} className="contents">
                  <span className="text-[var(--muted)]">{key}</span>
                  <span className="text-[var(--faint)]">{action}</span>
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] leading-4 text-[var(--faint)]">
              大图里：滚轮或 + / − 缩放 · 0 适应窗口 · R / Shift + R 旋转 · N 开关档案 · F 开关框选。
              macOS 上把 Ctrl 换成 Cmd。
            </p>
          </section>

          <section>
            <h3 className="text-[12px] font-medium text-[var(--text)]">常见问题</h3>
            <div className="mt-1.5 space-y-2">
              {FAQS.map(([question, answer]) => (
                <div key={question}>
                  <div className="text-[12px] leading-5 text-[var(--text)]">{question}</div>
                  <div className="text-[11px] leading-4 text-[var(--faint)]">{answer}</div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="shrink-0 px-4 py-2.5 border-t border-[var(--border)] flex items-center gap-2">
          <button
            className="text-[11px] text-[var(--accent-text)] hover:underline"
            onClick={() => void window.api.openExternal(DOC_URL)}
          >
            在浏览器中打开完整文档 ↗
          </button>
          <button className="btn btn-ghost ml-auto h-7 px-2 text-[12px]" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
