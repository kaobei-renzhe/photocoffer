import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronUp, FolderOpen, ImagePlus, Loader2, Palette, X } from 'lucide-react'
import type { PickExportProgress, PickExportResult, PickWatermarkStyle } from '@shared/types'
import {
  PICK_WATERMARK_DEFAULT,
  PICK_WATERMARK_POSITIONS,
  normalizePickWatermark
} from '@shared/pick'
import { formatBytes } from '../lib/format'

interface PickExportDialogProps {
  itemIds: number[]
  defaultTitle: string
  /** 已有草稿单：生成后写回这一单，不新建记录 */
  sessionId?: number
  defaultClient?: string
  onClose: () => void
  onExported: (result: PickExportResult) => void
}

function today(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function cleanError(error: unknown): string {
  return String((error as Error)?.message ?? error).replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    ''
  )
}

export default function PickExportDialog({
  itemIds,
  defaultTitle,
  sessionId,
  defaultClient,
  onClose,
  onExported
}: PickExportDialogProps) {
  const [title, setTitle] = useState(defaultTitle)
  const [client, setClient] = useState(defaultClient ?? '')
  const [watermark, setWatermark] = useState('')
  const [watermarkTouched, setWatermarkTouched] = useState(false)
  const [maxEdge, setMaxEdge] = useState(1200)
  const [style, setStyle] = useState<PickWatermarkStyle>(PICK_WATERMARK_DEFAULT)
  const [styleOpen, setStyleOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState<PickExportProgress | null>(null)
  const [result, setResult] = useState<PickExportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const date = useMemo(today, [])
  const autoWatermark = useMemo(
    () => [client.trim(), date].filter(Boolean).join(' · '),
    [client, date]
  )
  const watermarkValue = watermarkTouched ? watermark : autoWatermark
  const positionLabel =
    PICK_WATERMARK_POSITIONS.find((item) => item.id === style.position)?.label ?? '右下角'
  const logoName = style.logo ? style.logo.split(/[\\/]/).pop() ?? style.logo : ''
  const patchStyle = (next: Partial<PickWatermarkStyle>): void =>
    setStyle((prev) => normalizePickWatermark({ ...prev, ...next }))

  const chooseLogo = async (): Promise<void> => {
    const path = await window.api.pickPickLogo()
    if (path) patchStyle({ logo: path })
  }

  useEffect(() => {
    void window.api.pickDefaults().then((defaults) => {
      // 用户在配置读回来之前已经敲了字就保留用户输入
      setClient((prev) => prev || defaults.lastClient)
      setStyle(defaults.watermarkStyle)
    })
  }, [])

  useEffect(() => window.api.onPickProgress(setProgress), [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !exporting) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [exporting, onClose])

  const run = async (): Promise<void> => {
    if (exporting || !title.trim() || itemIds.length === 0) return
    setExporting(true)
    setProgress(null)
    setError(null)
    setResult(null)
    try {
      const payload = {
        itemIds,
        title: title.trim(),
        client: client.trim(),
        watermark: watermarkValue.trim(),
        maxEdge,
        watermarkStyle: style
      }
      const exported = sessionId
        ? await window.api.pickExportSession(sessionId, payload)
        : await window.api.pickExport(payload)
      if (exported) {
        setResult(exported)
        onExported(exported)
      }
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setExporting(false)
      setProgress(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[var(--overlay)] backdrop-blur-sm" onClick={exporting ? undefined : onClose}>
      <div
        className="w-[540px] max-h-[86vh] flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="h-[46px] shrink-0 px-4 flex items-center gap-2 border-b border-[var(--border)]">
          <FolderOpen size={16} color="var(--accent-2)" />
          <span className="text-[13.5px] font-bold">生成浏览页</span>
          <span className="text-[12px] text-[var(--faint)]">已选 {itemIds.length} 张</span>
          <button
            className="btn btn-ghost h-7 px-1.5 ml-auto"
            onClick={onClose}
            disabled={exporting}
            title="关闭（Esc）"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {result ? (
            <div>
              <div className="flex items-start gap-2 rounded-2xl border border-[var(--success)]/40 bg-[var(--panel-2)] px-3 py-3">
                <Check size={16} className="mt-0.5 shrink-0 text-[var(--success)]" />
                <div className="min-w-0">
                  <div className="text-[13.5px] text-[var(--text)]">
                    已生成 {result.count} 张的浏览页 · {formatBytes(result.bytes)}
                  </div>
                  <div className="mt-1 break-all text-[11px] leading-4 text-[var(--faint)]" title={result.path}>
                    {result.path}
                  </div>
                </div>
              </div>

              {result.bytes > 20 * 1024 * 1024 && (
                <div className="mt-3 rounded-2xl border border-[var(--warn)]/40 bg-[var(--panel-2)] px-3 py-2.5 text-[12px] leading-5 text-[var(--warn)]">
                  文件超过 20 MB，微信传输可能失败。建议把图片长边改成 800，或分两批导出。
                </div>
              )}

              {result.failed.length > 0 && (
                <div className="mt-3 rounded-2xl border border-[var(--warn)]/40 bg-[var(--panel-2)] px-3 py-2.5">
                  <div className="text-[12px] text-[var(--warn)]">
                    {result.failed.length} 张读不出来，已跳过
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {result.failed.slice(0, 5).map((item) => (
                      <div key={item.id} className="truncate text-[11px] text-[var(--faint)]">
                        {item.name} · {item.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="mt-3 text-[12px] leading-5 text-[var(--muted)]">
                把文件发给对方。对方点「要 / 要修 / 不要」后复制结果发回来，再到「选片交付」粘贴。
              </p>
            </div>
          ) : (
            <>
              <label className="block text-[12px] text-[var(--muted)] mb-1">标题（对方打开时看到）</label>
              <input
                className="input w-full"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="例如：小林 · 老门东街拍"
              />

              <div className="mt-3 flex gap-3">
                <div className="flex-1">
                  <label className="block text-[12px] text-[var(--muted)] mb-1">发给谁（可选）</label>
                  <input
                    className="input w-full"
                    value={client}
                    onChange={(event) => setClient(event.target.value)}
                    placeholder="例如：王女士"
                  />
                </div>
                <div className="w-[132px]">
                  <label className="block text-[12px] text-[var(--muted)] mb-1">图片长边</label>
                  <select
                    className="input w-full"
                    value={maxEdge}
                    onChange={(event) => setMaxEdge(Number(event.target.value))}
                  >
                    <option value={800}>800 · 更小</option>
                    <option value={1200}>1200 · 默认</option>
                    <option value={1600}>1600 · 更清晰</option>
                  </select>
                </div>
              </div>

              <label className="mt-3 block text-[12px] text-[var(--muted)] mb-1">
                水印（会烘焙进像素，去不掉）
              </label>
              <input
                className="input w-full"
                value={watermarkValue}
                onChange={(event) => {
                  setWatermarkTouched(true)
                  setWatermark(event.target.value)
                }}
                placeholder="名字 · 日期"
              />

              <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)]">
                <button
                  className="w-full h-9 px-3 flex items-center gap-2 text-left text-[12px]"
                  onClick={() => setStyleOpen((open) => !open)}
                  disabled={exporting}
                >
                  <Palette size={14} className="text-[var(--accent-2)]" />
                  <span>水印样式</span>
                  <span className="text-[var(--faint)]">
                    {positionLabel} · {Math.round(style.opacity * 100)}%
                    {style.logo ? ' · 含 logo' : ''}
                  </span>
                  {styleOpen ? (
                    <ChevronUp size={14} className="ml-auto" />
                  ) : (
                    <ChevronDown size={14} className="ml-auto" />
                  )}
                </button>
                {styleOpen && (
                  <div className="px-3 pb-3 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-[44px] text-[12px] text-[var(--muted)]">位置</span>
                      <select
                        className="input h-7 flex-1 text-[12px]"
                        value={style.position}
                        onChange={(event) =>
                          patchStyle({
                            position: event.target.value as PickWatermarkStyle['position']
                          })
                        }
                        disabled={exporting}
                      >
                        {PICK_WATERMARK_POSITIONS.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="w-[44px] text-[12px] text-[var(--muted)]">透明度</span>
                      <input
                        type="range"
                        min={20}
                        max={100}
                        step={5}
                        value={Math.round(style.opacity * 100)}
                        onChange={(event) => patchStyle({ opacity: Number(event.target.value) / 100 })}
                        className="flex-1 accent-[var(--accent)]"
                        disabled={exporting}
                      />
                      <span className="w-9 text-right text-[11px] tabular-nums text-[var(--faint)]">
                        {Math.round(style.opacity * 100)}%
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="w-[44px] text-[12px] text-[var(--muted)]">字号</span>
                      <input
                        type="range"
                        min={1.4}
                        max={5}
                        step={0.1}
                        value={Number((style.fontScale * 100).toFixed(1))}
                        onChange={(event) =>
                          patchStyle({ fontScale: Number(event.target.value) / 100 })
                        }
                        className="flex-1 accent-[var(--accent)]"
                        disabled={exporting}
                      />
                      <span className="w-9 text-right text-[11px] tabular-nums text-[var(--faint)]">
                        {(style.fontScale * 100).toFixed(1)}%
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="w-[44px] text-[12px] text-[var(--muted)]">Logo</span>
                      {style.logo ? (
                        <>
                          <span
                            className="flex-1 truncate text-[12px] text-[var(--text)]"
                            title={style.logo}
                          >
                            {logoName}
                          </span>
                          <button
                            className="btn btn-ghost h-6 px-1.5"
                            onClick={() => patchStyle({ logo: null })}
                            disabled={exporting}
                            title="去掉 logo"
                          >
                            <X size={14} />
                          </button>
                        </>
                      ) : (
                        <button
                          className="btn h-7 px-2 text-[12px]"
                          onClick={() => void chooseLogo()}
                          disabled={exporting}
                        >
                          <ImagePlus size={14} /> 选择图片
                        </button>
                      )}
                    </div>

                    {style.logo && (
                      <div className="flex items-center gap-2">
                        <span className="w-[44px] text-[12px] text-[var(--muted)]">大小</span>
                        <input
                          type="range"
                          min={8}
                          max={35}
                          step={1}
                          value={Math.round(style.logoScale * 100)}
                          onChange={(event) =>
                            patchStyle({ logoScale: Number(event.target.value) / 100 })
                          }
                          className="flex-1 accent-[var(--accent)]"
                          disabled={exporting}
                        />
                        <span className="w-9 text-right text-[11px] tabular-nums text-[var(--faint)]">
                          {Math.round(style.logoScale * 100)}%
                        </span>
                      </div>
                    )}

                    <div className="text-[11px] leading-4 text-[var(--faint)]">
                      logo 会和文字叠成一块放在所选位置，建议用透明 PNG。
                    </div>
                  </div>
                )}
              </div>

              <p className="mt-3 text-[11px] leading-5 text-[var(--faint)]">
                导出带水印的压缩图，不含拍摄参数；单个 HTML，断网也能打开。
              </p>

              {exporting && (
                <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2.5">
                  <div className="flex items-center justify-between text-[12px] text-[var(--muted)]">
                    <span className="flex items-center gap-1.5">
                      <Loader2 size={14} className="animate-spin" />
                      正在压缩并加水印
                    </span>
                    <span className="tabular-nums">
                      {progress ? `${progress.done}/${progress.total}` : '准备中…'}
                    </span>
                  </div>
                  <div className="mt-2 h-[4px] rounded-full bg-[var(--panel-3)] overflow-hidden">
                    <div
                      className="h-full bg-[var(--accent)] transition-[width] duration-200"
                      style={{
                        width: `${
                          progress && progress.total
                            ? Math.round((progress.done / progress.total) * 100)
                            : 0
                        }%`
                      }}
                    />
                  </div>
                  <div className="mt-1.5 truncate text-[11px] text-[var(--faint)]">
                    {progress?.current ?? '正在准备…'}
                  </div>
                </div>
              )}

              {error && (
                <div className="mt-3 rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2 text-[12px] leading-5 text-[var(--danger-text)]">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        <div className="shrink-0 px-4 py-2.5 border-t border-[var(--border)] flex items-center gap-2">
          <span className="text-[11px] text-[var(--faint)]">
            {result ? '对方回传后，在「选片交付」里点「粘贴反馈」' : '导出过程中别关窗口'}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            {result ? (
              <>
                <button className="btn h-7 px-2.5 text-[12px]" onClick={() => void window.api.showInFolder(result.path)}>
                  <FolderOpen size={14} /> 打开所在文件夹
                </button>
                <button className="btn h-7 px-2.5 text-[12px]" onClick={onClose}>
                  完成
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-ghost h-7 px-2.5 text-[12px]" onClick={onClose} disabled={exporting}>
                  取消
                </button>
                <button
                  className="btn h-7 px-2.5 text-[12px]"
                  disabled={exporting || !title.trim() || itemIds.length === 0}
                  onClick={() => void run()}
                >
                  {exporting ? '导出中…' : '选择位置并导出'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
