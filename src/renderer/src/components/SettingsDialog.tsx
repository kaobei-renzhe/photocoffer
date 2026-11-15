import { useEffect, useState } from 'react'
import {
  Camera,
  Check,
  Cpu,
  Download,
  FileText,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  Info,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  Settings as SettingsIcon,
  Sparkles,
  Sun,
  Upload,
  X
} from 'lucide-react'
import type {
  AppInfo,
  AppUseCase,
  EmbeddingModelId,
  EmbeddingModelInfo,
  Folder,
  LibraryStorage,
  ThemeMode,
  UpdateStatus,
  XmpProgress,
  XmpSettings
} from '@shared/types'
import type {
  LlmCapabilityId,
  LlmModelEntry,
  LlmProviderId,
  LlmSettings,
  LlmStatus,
  LlmTestResult
} from '@shared/llm'
import { LLM_CAPABILITY_IDS, LLM_MODEL_PRESETS } from '@shared/llm'
import { findSkin, SKINS, type SkinId } from '@shared/skins'
import {
  THUMB_CACHE_LIMIT_DEFAULT,
  THUMB_CACHE_LIMIT_OPTIONS,
  THUMB_QUALITY_OPTIONS,
  type ThumbCacheStats,
  type ThumbQualityPref
} from '@shared/thumbs'
import { formatBytes } from '../lib/format'

/** 设置面板的左侧分类 */
export type SettingsTab = 'appearance' | 'llm' | 'semantic' | 'storage' | 'about'

interface SettingsDialogProps {
  theme: ThemeMode
  onChange: (mode: ThemeMode) => void
  skin: SkinId
  onSkin: (id: SkinId) => void
  /** 使用方式：整理照片 / 拍片接单 */
  useCase: AppUseCase
  onUseCase: (value: AppUseCase) => void
  /** 瀑布流缩略图清晰度，改完立即生效 */
  thumbQuality: ThumbQualityPref
  onThumbQuality: (pref: ThumbQualityPref) => void
  /** 全部文件夹，用来选 AI 处理的文件夹范围 */
  folders: Folder[]
  onClose: () => void
  /** 打开时默认停在哪个分类（AI 弹窗的「去设置」直接落到大模型） */
  initialTab?: SettingsTab
}

const TABS: Array<{ id: SettingsTab; label: string; hint: string; Icon: typeof Monitor }> = [
  { id: 'appearance', label: '外观', hint: '主题与界面风格', Icon: Palette },
  { id: 'llm', label: '大模型', hint: '服务商、密钥、能力开关', Icon: Sparkles },
  { id: 'semantic', label: '语义索引', hint: '识图模型与自动识图', Icon: Cpu },
  { id: 'storage', label: '存储位置', hint: '索引与缓存放在哪', Icon: HardDrive },
  { id: 'about', label: '关于', hint: '版本与数据位置', Icon: Info }
]

const THEME_OPTIONS: Array<{
  value: ThemeMode
  label: string
  hint: string
  Icon: typeof Monitor
}> = [
  { value: 'system', label: '跟随系统', hint: '系统换成深色或浅色时，我也跟着变', Icon: Monitor },
  { value: 'dark', label: '深色模式', hint: '深灰背景，夜里看图不刺眼', Icon: Moon },
  { value: 'light', label: '浅色模式', hint: '亮色背景，白天看着更清爽', Icon: Sun }
]

const USE_CASE_OPTIONS: Array<{
  value: AppUseCase
  label: string
  hint: string
  Icon: typeof Monitor
}> = [
  { value: 'manage', label: '整理照片', hint: '导入、搜索、打标签；摄影工作台先收进「更多」', Icon: ImageIcon },
  { value: 'pro', label: '拍片接单', hint: '人像工作台、选片交付、客户反馈都放出来', Icon: Camera }
]

function PathRow({
  label,
  path,
  emptyHint = '暂不可用',
  onOpen
}: {
  label: string
  path: string | null
  emptyHint?: string
  onOpen: (path: string) => void
}) {
  return (
    <div className="flex items-start gap-2 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-[var(--faint)]">{label}</div>
        <div className="break-all text-[12px] leading-4 text-[var(--text)]">
          {path ?? emptyHint}
        </div>
      </div>
      {path && (
        <button
          className="btn btn-ghost h-6 px-1.5 shrink-0"
          title="打开这个目录"
          onClick={() => onOpen(path)}
        >
          <FolderOpen size={14} />
        </button>
      )}
    </div>
  )
}

interface LlmModelDraft {
  id: string | null
  name: string
  vendor: string
  provider: LlmProviderId
  baseUrl: string
  model: string
  vision: boolean
  jsonMode: boolean
  temperature: string
  maxOutputTokens: string
  timeoutSeconds: string
}

function emptyLlmDraft(presetId = 'openai'): LlmModelDraft {
  const preset = LLM_MODEL_PRESETS.find((entry) => entry.id === presetId) ?? LLM_MODEL_PRESETS[0]
  return {
    id: null,
    name: preset.label,
    vendor: preset.vendor,
    provider: preset.provider,
    baseUrl: preset.baseUrl,
    model: preset.model,
    vision: preset.vision,
    jsonMode: preset.jsonMode,
    temperature: '',
    maxOutputTokens: '',
    timeoutSeconds: '60'
  }
}

function draftFromModel(model: LlmModelEntry): LlmModelDraft {
  return {
    id: model.id,
    name: model.name,
    vendor: model.vendor,
    provider: model.provider,
    baseUrl: model.baseUrl,
    model: model.model,
    vision: model.vision,
    jsonMode: model.jsonMode,
    temperature: model.temperature === null ? '' : String(model.temperature),
    maxOutputTokens: model.maxOutputTokens === null ? '' : String(model.maxOutputTokens),
    timeoutSeconds: String(Math.round(model.timeoutMs / 1000))
  }
}

/** 关于页的更新状态文案；null 表示这次不用提示 */
function updateHintText(status: UpdateStatus | null): string | null {
  if (!status) return null
  switch (status.state) {
    case 'idle':
      return null
    case 'disabled':
      return status.message ?? '没有配置更新地址'
    case 'checking':
      return '正在检查更新…'
    case 'available':
      return `发现新版本 ${status.version ?? ''}，开始下载…`
    case 'downloading':
      return `正在下载新版本 ${status.percent ?? 0}%`
    case 'downloaded':
      return `新版本 ${status.version ?? ''} 已下载，重启后生效`
    case 'latest':
      return '已是最新版本'
    case 'error':
      return '检查更新失败，稍后再试'
  }
}

export default function SettingsDialog({
  theme,
  onChange,
  skin,
  onSkin,
  useCase,
  onUseCase,
  thumbQuality,
  onThumbQuality,
  folders,
  onClose,
  initialTab = 'appearance'
}: SettingsDialogProps) {
  const [tab, setTab] = useState<SettingsTab>(initialTab)
  const [saving, setSaving] = useState(false)
  const [skinSaving, setSkinSaving] = useState(false)
  const [autoClip, setAutoClip] = useState<boolean | null>(null)
  const [embeddingModels, setEmbeddingModels] = useState<EmbeddingModelInfo[] | null>(null)
  const [modelBusy, setModelBusy] = useState<EmbeddingModelId | null>(null)
  const [modelMsg, setModelMsg] = useState<string | null>(null)
  const [scoreMinRating, setScoreMinRating] = useState<number | null>(null)
  const [scoreCounts, setScoreCounts] = useState<{ matched: number; total: number } | null>(null)
  /** AI 处理的文件夹范围；null = 还没读回来 */
  const [scopeFolders, setScopeFolders] = useState<number[] | null>(null)
  const [scoreBusy, setScoreBusy] = useState(false)
  const [llm, setLlm] = useState<LlmStatus | null>(null)
  /** 正在编辑的模型 id；'new' 表示添加表单 */
  const [llmEditing, setLlmEditing] = useState<string | 'new' | null>(null)
  const [llmForm, setLlmForm] = useState<LlmModelDraft>(() => emptyLlmDraft())
  const [llmMsg, setLlmMsg] = useState<string | null>(null)
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({})
  const [keyBusyId, setKeyBusyId] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [llmTests, setLlmTests] = useState<Record<string, LlmTestResult | undefined>>({})
  const [storage, setStorage] = useState<LibraryStorage | null>(null)
  /** 关于页：版本与数据位置 */
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  /** 关于页：自动更新状态（没配更新地址时是 disabled） */
  const [update, setUpdate] = useState<UpdateStatus | null>(null)
  /** 没有可用更新源时，整块更新入口都不渲染 */
  const [updateEnabled, setUpdateEnabled] = useState(false)
  /** 打开目录失败的那一行显示原因 */
  const [openError, setOpenError] = useState<string | null>(null)
  /** 配置导出/导入的状态提示 */
  const [transferMsg, setTransferMsg] = useState<string | null>(null)
  const [transferError, setTransferError] = useState(false)
  const [transferBusy, setTransferBusy] = useState<'export' | 'import' | null>(null)
  /** 导入后需要重新载入界面才能应用主题与布局 */
  const [needReload, setNeedReload] = useState(false)
  const [indexBusy, setIndexBusy] = useState(false)
  const [indexMsg, setIndexMsg] = useState<string | null>(null)
  const [thumbStats, setThumbStats] = useState<ThumbCacheStats | null>(null)
  const [thumbBusy, setThumbBusy] = useState(false)
  const [thumbMsg, setThumbMsg] = useState<string | null>(null)
  const [thumbLimit, setThumbLimit] = useState<number | null>(null)
  const [limitBusy, setLimitBusy] = useState(false)
  const [xmp, setXmp] = useState<XmpSettings | null>(null)
  const [xmpBusy, setXmpBusy] = useState(false)
  const [xmpMsg, setXmpMsg] = useState<string | null>(null)
  const [xmpProgress, setXmpProgress] = useState<XmpProgress | null>(null)

  useEffect(() => {
    void window.api
      .getClipAutoIndex()
      .then(setAutoClip)
      .catch(() => setAutoClip(true))
    void window.api
      .listEmbeddingModels()
      .then(setEmbeddingModels)
      .catch(() => setEmbeddingModels(null))
    void window.api
      .getAiScoreMinRating()
      .then(setScoreMinRating)
      .catch(() => setScoreMinRating(0))
    void window.api
      .getAiFolderIds()
      .then(setScopeFolders)
      .catch(() => setScopeFolders([]))
    void window.api
      .aiScoreCandidates()
      .then(setScoreCounts)
      .catch(() => setScoreCounts(null))
    void window.api
      .llmStatus()
      .then(setLlm)
      .catch(() => setLlm(null))
    void window.api
      .getLibraryStorage()
      .then(setStorage)
      .catch(() => setStorage(null))
    void window.api
      .thumbCacheStats()
      .then(setThumbStats)
      .catch(() => setThumbStats(null))
    void window.api
      .getThumbCacheLimit()
      .then(setThumbLimit)
      .catch(() => setThumbLimit(THUMB_CACHE_LIMIT_DEFAULT))
    void window.api
      .getXmpSettings()
      .then(setXmp)
      .catch(() => setXmp({ enabled: false, ignoreExternal: false }))
    void window.api
      .appInfo()
      .then(setAppInfo)
      .catch(() => setAppInfo(null))
    void window.api
      .updateStatus()
      .then(setUpdate)
      .catch(() => setUpdate(null))
    void window.api
      .updateEnabled()
      .then(setUpdateEnabled)
      .catch(() => setUpdateEnabled(false))
  }, [])

  // 下载进度由主进程推送，设置页打开时保持同步
  useEffect(() => window.api.onUpdateStatus(setUpdate), [])

  /** 关于页：手动检查更新；留空地址时主进程会回 disabled */
  const checkUpdate = async (): Promise<void> => {
    try {
      setUpdate(await window.api.updateCheck())
    } catch {
      setUpdate({ state: 'error' })
    }
  }

  /** 关于页：打开数据目录，失败就在面板里说明原因 */
  const openDir = async (path: string): Promise<void> => {
    setOpenError(null)
    try {
      await window.api.openPath(path)
    } catch (error) {
      setOpenError(
        `打不开 ${path}：${String((error as Error).message).replace(
          /^Error invoking remote method '[^']+': /,
          ''
        )}`
      )
    }
  }

  const errorText = (error: unknown): string =>
    String((error as Error).message).replace(/^Error invoking remote method '[^']+': /, '')

  /** 导出偏好设置（不含 API Key 与图库路径） */
  const exportConfig = async (): Promise<void> => {
    if (transferBusy) return
    setTransferBusy('export')
    setTransferMsg(null)
    setTransferError(false)
    setNeedReload(false)
    try {
      const result = await window.api.exportSettings()
      if (!result) return
      setTransferMsg(`已导出全部偏好与 ${result.gear} 台设备：${result.path}`)
    } catch (error) {
      setTransferError(true)
      setTransferMsg(`导出失败：${errorText(error)}`)
    } finally {
      setTransferBusy(null)
    }
  }

  /** 导入偏好设置：逐字段合并，不碰图库路径 */
  const importConfig = async (): Promise<void> => {
    if (transferBusy) return
    setTransferBusy('import')
    setTransferMsg(null)
    setTransferError(false)
    setNeedReload(false)
    try {
      const result = await window.api.importSettings()
      if (!result) return
      const skipped = result.skipped.length
        ? `；跳过 ${result.skipped.length} 项（图库路径或无效设备）`
        : ''
      const key = result.needsKey
        ? '。API Key 不随配置导出，请到「大模型」里重新填写'
        : ''
      setTransferMsg(
        `已导入 ${result.imported} 项偏好、${result.gear} 台设备${skipped}${key}。主题与布局需要重新载入界面后生效。`
      )
      setNeedReload(true)
    } catch (error) {
      setTransferError(true)
      setTransferMsg(`导入失败：${errorText(error)}`)
    } finally {
      setTransferBusy(null)
    }
  }

  useEffect(() => window.api.onXmpProgress(setXmpProgress), [])

  const limitLabel = (mb: number): string =>
    THUMB_CACHE_LIMIT_OPTIONS.find((option) => option.value === mb)?.label ?? `${mb} MB`

  /** 改 AI 评分的星级门槛：存主进程配置，顺手刷新当前范围内可评分的张数 */
  const changeScoreRating = async (value: number): Promise<void> => {
    if (scoreBusy) return
    setScoreBusy(true)
    try {
      const saved = await window.api.saveAiScoreMinRating(value)
      setScoreMinRating(saved)
      setScoreCounts(await window.api.aiScoreCandidates())
    } catch {
      /* 保存失败保持原值，下次打开设置再读 */
    } finally {
      setScoreBusy(false)
    }
  }

  /** 改 AI 处理的文件夹范围：空数组表示全部文件夹 */
  const changeScopeFolders = async (next: number[]): Promise<void> => {
    if (scoreBusy) return
    setScoreBusy(true)
    try {
      const saved = await window.api.saveAiFolderIds(next)
      setScopeFolders(saved)
      setScoreCounts(await window.api.aiScoreCandidates())
    } catch {
      /* 保存失败保持原值 */
    } finally {
      setScoreBusy(false)
    }
  }

  /** 点一下切换选中：已选就取消，没选就加上 */
  const toggleFolder = (id: number): number[] => {
    const current = scopeFolders ?? []
    return current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
  }

  /** 改上限：调小时主进程会立刻按最久未用淘汰一次 */
  const changeLimit = async (mb: number): Promise<void> => {
    if (limitBusy) return
    setLimitBusy(true)
    setThumbMsg(null)
    try {
      const result = await window.api.saveThumbCacheLimit(mb)
      setThumbLimit(result.limit)
      setThumbStats(await window.api.thumbCacheStats())
      setThumbMsg(
        result.freed > 0
          ? `上限已设为 ${limitLabel(result.limit)}，顺带清理了 ${formatBytes(result.freed)}`
          : `上限已设为 ${limitLabel(result.limit)}`
      )
    } catch {
      setThumbMsg('设置上限失败，稍后再试')
    } finally {
      setLimitBusy(false)
    }
  }

  /** 存 XMP 开关；关闭只影响后续自动写入，不删已有侧车 */
  const changeXmp = async (patch: Partial<XmpSettings>): Promise<void> => {
    if (!xmp) return
    try {
      const next = await window.api.saveXmpSettings(patch)
      setXmp(next)
      setXmpMsg(
        patch.enabled === false
          ? '已关闭，已有 .xmp 文件不会删除'
          : patch.enabled === true
            ? '已开启，之后改星级/旗标/标签会自动写入'
            : '设置已保存'
      )
    } catch {
      setXmpMsg('保存 XMP 设置失败')
    }
  }

  const exportAllXmp = async (): Promise<void> => {
    if (xmpBusy) return
    const ok = await window.api.confirm(
      '为所有照片写入 .xmp 文件？',
      '会在原图旁边生成 .xmp 文件，不改原图；RAW + JPEG 配对只写 RAW。图库很大时需要等一会儿。'
    )
    if (!ok) return
    setXmpBusy(true)
    setXmpMsg(null)
    setXmpProgress(null)
    try {
      const result = await window.api.xmpExportAll()
      setXmpMsg(
        `已写 ${result.written} 张${result.skipped ? ` · 跳过 ${result.skipped} 张` : ''}${
          result.failed ? ` · 失败 ${result.failed} 张（多为只读盘）` : ''
        }`
      )
    } catch (error) {
      setXmpMsg(`导出 XMP 失败：${(error as Error).message}`)
    } finally {
      setXmpBusy(false)
      setXmpProgress(null)
    }
  }

  const checkXmp = async (): Promise<void> => {
    if (xmpBusy) return
    setXmpBusy(true)
    setXmpMsg(null)
    setXmpProgress(null)
    try {
      const result = await window.api.xmpCheckConflicts()
      if (result.ignored) {
        setXmpMsg('已设置忽略外部修改，不再检查')
        return
      }
      if (result.conflicts.length === 0) {
        setXmpMsg(`检查了 ${result.scanned} 张，没有发现外部修改`)
        return
      }
      const ok = await window.api.confirm(
        `发现 ${result.conflicts.length} 张在别的软件里改过，要导入吗？`,
        '会覆盖星级、旗标、备注，标签只增不减；不导入就保持存照现在的判断。'
      )
      if (!ok) {
        setXmpMsg(`发现 ${result.conflicts.length} 张外部修改，已跳过`)
        return
      }
      const imported = await window.api.xmpImportConflicts(
        result.conflicts.map((item) => item.itemId)
      )
      setXmpMsg(
        `已导入 ${imported.imported} 张${imported.failed ? ` · ${imported.failed} 张失败` : ''}`
      )
    } catch (error) {
      setXmpMsg(`检查外部修改失败：${(error as Error).message}`)
    } finally {
      setXmpBusy(false)
      setXmpProgress(null)
    }
  }

  /** 清理缩略图缓存：high 只删高清档，all 连中/低档一起删 */
  const clearThumbs = async (target: 'high' | 'all'): Promise<void> => {
    if (thumbBusy) return
    if (target === 'all') {
      const ok = await window.api.confirm(
        '删除全部缩略图缓存？',
        '低 / 中 / 高三档都会被删掉，之后按需重新生成。图库很大时首次浏览会明显变慢，原图不受影响。'
      )
      if (!ok) return
    }
    setThumbBusy(true)
    setThumbMsg(null)
    try {
      const result = await window.api.clearThumbCache(target)
      setThumbMsg(
        result.removed > 0
          ? `已清理 ${result.removed} 个文件，释放 ${formatBytes(result.freed)}`
          : '没有需要清理的文件'
      )
      setThumbStats(await window.api.thumbCacheStats())
    } catch {
      setThumbMsg('清理失败，稍后再试')
    } finally {
      setThumbBusy(false)
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  /** 索引搬家：undefined = 弹目录选择框，null = 放回图库目录 */
  const moveIndex = async (target: string | null | undefined): Promise<void> => {
    if (indexBusy) return
    setIndexBusy(true)
    setIndexMsg(null)
    try {
      const result =
        target === undefined ? await window.api.pickIndexDir() : await window.api.moveIndexDir(target)
      if (result.cancelled) return
      if (!result.ok) {
        setIndexMsg(result.message ?? '移动失败')
        return
      }
      setStorage(await window.api.getLibraryStorage())
      const detail = [
        result.files ? `${result.files} 个文件` : '',
        result.cleaned === false ? '旧文件没清理干净，可手动删除' : ''
      ]
        .filter(Boolean)
        .join('，')
      setIndexMsg(`已移动到新位置${detail ? `（${detail}）` : ''}`)
    } catch (error) {
      setIndexMsg(`移动失败：${(error as Error).message}`)
    } finally {
      setIndexBusy(false)
    }
  }

  const saveLlm = async (patch: Partial<LlmSettings>): Promise<void> => {
    setLlm(await window.api.llmSaveSettings(patch))
  }

  const startAddModel = (): void => {
    setLlmForm(emptyLlmDraft())
    setLlmEditing('new')
    setLlmMsg(null)
  }

  const startEditModel = (model: LlmModelEntry): void => {
    setLlmForm(draftFromModel(model))
    setLlmEditing(model.id)
    setLlmMsg(null)
  }

  const patchForm = (patch: Partial<LlmModelDraft>): void =>
    setLlmForm((prev) => ({ ...prev, ...patch }))

  const commitModel = async (): Promise<void> => {
    if (!llm || !llmEditing) return
    const model = llmForm.model.trim()
    if (!model) {
      setLlmMsg('模型名称不能为空')
      return
    }
    const id = llmForm.id ?? `m_${Date.now().toString(36)}`
    const entry: LlmModelEntry = {
      id,
      name: llmForm.name.trim() || model,
      vendor: llmForm.vendor.trim() || '自定义',
      provider: llmForm.provider,
      baseUrl: llmForm.baseUrl.trim(),
      model,
      vision: llmForm.vision,
      jsonMode: llmForm.jsonMode,
      temperature: llmForm.temperature.trim() === '' ? null : Number(llmForm.temperature),
      maxOutputTokens:
        llmForm.maxOutputTokens.trim() === '' ? null : Number(llmForm.maxOutputTokens),
      contextTokens: null,
      maxRetries: 2,
      timeoutMs: Math.max(5, Number(llmForm.timeoutSeconds) || 60) * 1000
    }
    const exists = llm.settings.models.some((item) => item.id === id)
    const models = exists
      ? llm.settings.models.map((item) => (item.id === id ? entry : item))
      : [...llm.settings.models, entry]
    const currentDefault = llm.settings.models.find((item) => item.id === llm.settings.defaultModelId)
    const defaultModelId =
      !currentDefault || !currentDefault.model.trim() ? id : llm.settings.defaultModelId
    await saveLlm({ models, defaultModelId })
    setLlmEditing(null)
    setLlmMsg(exists ? '模型已更新' : '模型已添加')
  }

  const removeModel = async (model: LlmModelEntry): Promise<void> => {
    if (!llm) return
    const usedBy = llm.capabilities.filter((entry) => entry.modelId === model.id).map((entry) => entry.title)
    if (usedBy.length > 0) {
      const ok = await window.api.confirm(
        `删除模型「${model.name}」？`,
        `这些功能正在使用它：${usedBy.join('、')}。删除后会回退到默认模型。`
      )
      if (!ok) return
    }
    const models = llm.settings.models.filter((item) => item.id !== model.id)
    const routing = { ...llm.settings.routing }
    for (const id of LLM_CAPABILITY_IDS) {
      if (routing[id] === model.id) delete routing[id]
    }
    const defaultModelId =
      llm.settings.defaultModelId === model.id ? models[0]?.id ?? '' : llm.settings.defaultModelId
    await saveLlm({ models, routing, defaultModelId })
    if (llmEditing === model.id) setLlmEditing(null)
    setLlmMsg('已删除模型')
  }

  const setDefaultModel = async (modelId: string): Promise<void> => {
    await saveLlm({ defaultModelId: modelId })
    setLlmMsg('已设为默认模型')
  }

  const saveModelKey = async (modelId: string): Promise<void> => {
    const value = (keyDrafts[modelId] ?? '').trim()
    if (!value || keyBusyId) return
    setKeyBusyId(modelId)
    try {
      setLlm(await window.api.llmSaveKey(modelId, value))
      setKeyDrafts((prev) => ({ ...prev, [modelId]: '' }))
      setLlmMsg('API Key 已保存')
    } finally {
      setKeyBusyId(null)
    }
  }

  const clearModelKey = async (modelId: string): Promise<void> => {
    setKeyBusyId(modelId)
    try {
      setLlm(await window.api.llmClearKey(modelId))
      setLlmMsg('已清除 API Key')
    } finally {
      setKeyBusyId(null)
    }
  }

  const testModel = async (modelId: string): Promise<void> => {
    if (testingId) return
    setTestingId(modelId)
    try {
      const result = await window.api.llmTest(modelId)
      setLlmTests((prev) => ({ ...prev, [modelId]: result }))
      setLlm(await window.api.llmStatus())
    } finally {
      setTestingId(null)
    }
  }

  const setRouting = async (capability: LlmCapabilityId, modelId: string): Promise<void> => {
    if (!llm) return
    const routing = { ...llm.settings.routing }
    if (modelId) routing[capability] = modelId
    else delete routing[capability]
    await saveLlm({ routing })
  }

  const toggleCapability = async (capability: LlmCapabilityId): Promise<void> => {
    if (!llm) return
    await saveLlm({
      capabilities: {
        ...llm.settings.capabilities,
        [capability]: !llm.settings.capabilities[capability]
      }
    })
  }

  /** 添加 / 编辑模型的表单；预设只在新增时出现 */
  const renderModelForm = () => (
    <div className="space-y-2">
      {llmEditing === 'new' && (
        <label className="block">
          <span className="text-[11px] text-[var(--faint)]">厂商预设</span>
          <select
            className="input h-7 text-[12px] w-full mt-1"
            value={LLM_MODEL_PRESETS.find((preset) => preset.baseUrl === llmForm.baseUrl)?.id ?? ''}
            onChange={(event) => {
              const preset = LLM_MODEL_PRESETS.find((entry) => entry.id === event.target.value)
              if (!preset) return
              setLlmForm((prev) => ({
                ...prev,
                name: preset.label,
                vendor: preset.vendor,
                provider: preset.provider,
                baseUrl: preset.baseUrl,
                model: preset.model,
                vision: preset.vision,
                jsonMode: preset.jsonMode
              }))
            }}
          >
            <option value="">自定义</option>
            {LLM_MODEL_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[11px] text-[var(--faint)]">显示名称</span>
          <input
            className="input h-7 text-[12px] w-full mt-1"
            value={llmForm.name}
            onChange={(event) => patchForm({ name: event.target.value })}
            placeholder="例如 DeepSeek V3"
          />
        </label>
        <label className="block">
          <span className="text-[11px] text-[var(--faint)]">模型名</span>
          <input
            className="input h-7 text-[12px] w-full mt-1"
            value={llmForm.model}
            onChange={(event) => patchForm({ model: event.target.value })}
            placeholder="例如 gpt-4o-mini / qwen-vl-max"
          />
        </label>
      </div>

      <div className="grid grid-cols-[1fr_90px] gap-2">
        <label className="block">
          <span className="text-[11px] text-[var(--faint)]">接口地址</span>
          <input
            className="input h-7 text-[12px] w-full mt-1"
            value={llmForm.baseUrl}
            onChange={(event) => patchForm({ baseUrl: event.target.value })}
            placeholder="https://api.example.com/v1"
          />
        </label>
        <label className="block">
          <span className="text-[11px] text-[var(--faint)]">超时（秒）</span>
          <input
            type="number"
            min={5}
            max={300}
            className="input h-7 text-[12px] w-full mt-1"
            value={llmForm.timeoutSeconds}
            onChange={(event) => patchForm({ timeoutSeconds: event.target.value })}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[11px] text-[var(--faint)]">温度（留空用推荐值）</span>
          <input
            type="number"
            min={0}
            max={2}
            step={0.05}
            className="input h-7 text-[12px] w-full mt-1"
            value={llmForm.temperature}
            onChange={(event) => patchForm({ temperature: event.target.value })}
            placeholder="评分 0.2 / 研读 0.65"
          />
        </label>
        <label className="block">
          <span className="text-[11px] text-[var(--faint)]">单次回复长度（留空用推荐值）</span>
          <input
            type="number"
            min={16}
            max={32000}
            step={64}
            className="input h-7 text-[12px] w-full mt-1"
            value={llmForm.maxOutputTokens}
            onChange={(event) => patchForm({ maxOutputTokens: event.target.value })}
            placeholder="评分 400 / 建议 800"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-[var(--accent)]"
            checked={llmForm.vision}
            onChange={(event) => patchForm({ vision: event.target.checked })}
          />
          <span className="text-[12px]">能看图</span>
        </label>
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-[var(--accent)]"
            checked={llmForm.jsonMode}
            onChange={(event) => patchForm({ jsonMode: event.target.checked })}
          />
          <span className="text-[12px]">支持 JSON 模式</span>
        </label>
        <div className="ml-auto flex items-center gap-1.5">
          <button className="btn btn-ghost h-7 px-2 text-[12px]" onClick={() => setLlmEditing(null)}>
            取消
          </button>
          <button className="btn h-7 px-2.5 text-[12px]" onClick={() => void commitModel()}>
            保存模型
          </button>
        </div>
      </div>
    </div>
  )

  const toggleAutoClip = async (): Promise<void> => {
    if (autoClip === null) return
    const next = await window.api.saveClipAutoIndex(!autoClip)
    setAutoClip(next)
  }

  const refreshModels = async (): Promise<void> => {
    try {
      setEmbeddingModels(await window.api.listEmbeddingModels())
    } catch {
      /* 读取失败保留旧值，下次打开设置再刷新 */
    }
  }

  const switchModel = async (id: EmbeddingModelId, label: string): Promise<boolean> => {
    setModelBusy(id)
    setModelMsg(null)
    try {
      const status = await window.api.selectEmbeddingModel(id)
      setModelMsg(
        status.total > status.indexed
          ? `已切换到 ${label}，还有 ${status.total - status.indexed} 张照片需要重建索引`
          : `已切换到 ${label}`
      )
      await refreshModels()
      return true
    } catch (error) {
      setModelMsg(`切换失败：${(error as Error).message}`)
      return false
    } finally {
      setModelBusy(null)
    }
  }

  const downloadAndSwitchModel = async (model: EmbeddingModelInfo): Promise<void> => {
    if (modelBusy) return
    setModelBusy(model.id)
    setModelMsg(null)
    try {
      await window.api.clipDownloadModel(model.id)
      const ok = await switchModel(model.id, model.label)
      if (ok) {
        setModelMsg(
          `已下载并切换到 ${model.label}；点侧栏「语义索引」或等闲时自动建立索引后就能用`
        )
      }
    } catch (error) {
      setModelMsg(`下载失败：${(error as Error).message}`)
    } finally {
      setModelBusy(null)
    }
  }

  const useExistingModel = async (model: EmbeddingModelInfo): Promise<void> => {
    if (modelBusy || model.active) return
    const ok = await window.api.confirm(
      `切换到 ${model.label}？`,
      '旧模型的索引会保留，但新模型需要重新建立语义索引才能用于搜图与自动分类。'
    )
    if (ok) await switchModel(model.id, model.label)
  }

  const pick = async (mode: ThemeMode): Promise<void> => {
    if (mode === theme || saving) return
    setSaving(true)
    try {
      onChange(await window.api.saveTheme(mode))
    } finally {
      setSaving(false)
    }
  }

  const pickSkin = async (id: SkinId): Promise<void> => {
    if (id === skin || skinSaving) return
    setSkinSaving(true)
    onSkin(id)
    try {
      onSkin(await window.api.saveSkin(id))
    } finally {
      setSkinSaving(false)
    }
  }

  const activeSkin = findSkin(skin)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[var(--overlay)] backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[760px] h-[560px] max-h-[86vh] flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-[48px] px-4 flex items-center gap-2 border-b border-[var(--border)] shrink-0">
          <SettingsIcon size={16} color="var(--accent-2)" />
          <span className="text-[13.5px] font-bold">设置</span>
          <button className="btn btn-ghost h-7 px-1.5 ml-auto" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex">
          <nav className="w-[172px] shrink-0 border-r border-[var(--border)] p-2 space-y-1 overflow-y-auto">
            {TABS.map(({ id, label, hint, Icon }) => {
              const active = tab === id
              return (
                <button
                  key={id}
                  className={`w-full text-left rounded-2xl px-2.5 py-2 transition-colors ${
                    active
                      ? 'settings-nav-active'
                      : 'hover:bg-[var(--panel-2)]'
                  }`}
                  onClick={() => setTab(id)}
                  aria-current={active ? 'page' : undefined}
                >
                  <div className="flex items-center gap-2">
                    <Icon size={14} color={active ? 'var(--accent-2)' : 'var(--muted)'} />
                    <span
                      className={`text-[13.5px] ${active ? 'text-[var(--accent-text)]' : 'text-[var(--text)]'}`}
                    >
                      {label}
                    </span>
                  </div>
                  <div className="mt-0.5 pl-[22px] text-[11px] leading-4 text-[var(--faint)]">{hint}</div>
                </button>
              )
            })}
          </nav>

          <div className="flex-1 min-w-0 overflow-y-auto p-4 space-y-4">
            {tab === 'appearance' && (
              <>
                <div>
                  <div className="text-[13.5px] mb-2">主题</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {THEME_OPTIONS.map(({ value, label, hint, Icon }) => {
                      const active = theme === value
                      return (
                        <button
                          key={value}
                          className={`rounded-2xl border px-2.5 py-2.5 text-left transition-colors ${
                            active
                              ? 'border-[var(--accent-border)] bg-[var(--accent-soft)]'
                              : 'border-[var(--border)] bg-[var(--panel-2)] hover:border-[var(--border-strong)]'
                          }`}
                          disabled={saving}
                          onClick={() => void pick(value)}
                        >
                          <div className="flex items-center gap-1.5">
                            <Icon size={14} color={active ? 'var(--accent-2)' : 'var(--muted)'} />
                            <span
                              className={`text-[12px] ${active ? 'text-[var(--accent-text)]' : 'text-[var(--text)]'}`}
                            >
                              {label}
                            </span>
                          </div>
                          <div
                            className={`mt-1 text-[11px] leading-4 ${
                              active ? 'text-[var(--muted)]' : 'text-[var(--faint)]'
                            }`}
                          >
                            {hint}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-2 text-[12px] leading-4 text-[var(--faint)]">
                    选择后会立刻生效，下次启动也沿用这次的选择。
                  </div>
                </div>

                <div>
                  <div className="text-[13.5px] mb-2">界面风格</div>
                  <div className="grid grid-cols-3 gap-2">
                    {SKINS.map((item) => {
                      const active = item.id === skin
                      return (
                        <button
                          key={item.id}
                          className={`rounded-2xl border p-2 text-left transition-colors ${
                            active
                              ? 'border-[var(--accent-border)] bg-[var(--accent-soft)]'
                              : 'border-[var(--border)] bg-[var(--panel-2)] hover:border-[var(--border-strong)]'
                          }`}
                          disabled={skinSaving}
                          onClick={() => void pickSkin(item.id)}
                        >
                          <div className="flex gap-1.5">
                            {item.swatches.map((color) => (
                              <span
                                key={color}
                                className="h-7 flex-1 rounded-[5px] border border-white/10"
                                style={{ background: color }}
                              />
                            ))}
                          </div>
                          <div className="mt-1.5 flex items-center gap-1">
                            <span
                              className={`text-[12px] ${active ? 'text-[var(--accent-text)]' : 'text-[var(--text)]'}`}
                            >
                              {item.name}
                            </span>
                            {active && <Check size={14} color="var(--accent-2)" />}
                          </div>
                          <div className={`mt-0.5 text-[11px] leading-4 ${active ? 'text-[var(--muted)]' : 'text-[var(--faint)]'}`}>
                            {item.hint}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-2 text-[12px] leading-4 text-[var(--faint)]">
                    「{activeSkin.name}」已应用。除「默认」外，其余风格会固定深/浅，上方的主题开关对它们不起作用。
                  </div>
                </div>

                <div>
                  <div className="text-[13.5px] mb-2">照片清晰度</div>
                  <div className="space-y-1.5">
                    {THUMB_QUALITY_OPTIONS.map((item) => {
                      const active = item.id === thumbQuality
                      return (
                        <button
                          key={item.id}
                          className={`w-full flex items-start gap-2 rounded-2xl border px-2.5 py-2 text-left transition-colors ${
                            active
                              ? 'border-[var(--accent-border)] bg-[var(--accent-soft)]'
                              : 'border-[var(--border)] bg-[var(--panel-2)] hover:border-[var(--border-strong)]'
                          }`}
                          onClick={() => onThumbQuality(item.id)}
                        >
                          <ImageIcon
                            size={14}
                            className="mt-0.5 shrink-0"
                            color={active ? 'var(--accent-2)' : 'var(--muted)'}
                          />
                          <div className="min-w-0 flex-1">
                            <span
                              className={`text-[12px] ${active ? 'text-[var(--accent-text)]' : 'text-[var(--text)]'}`}
                            >
                              {item.label}
                            </span>
                            <div className={`mt-0.5 text-[11px] leading-4 ${active ? 'text-[var(--muted)]' : 'text-[var(--faint)]'}`}>
                              {item.hint}
                            </div>
                          </div>
                          {active && <Check size={14} color="var(--accent-2)" className="mt-0.5 shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-2 text-[12px] leading-4 text-[var(--faint)]">
                    只影响瀑布流里的小图，点开来看的始终是原图。选「自动」会按卡片大小和屏幕像素密度挑档，
                    缩略图拉大或竖构图自动上高清；切换后立刻重新加载，偏好自动记住。
                  </div>
                </div>

                <div>
                  <div className="text-[13.5px] mb-2">使用方式</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {USE_CASE_OPTIONS.map(({ value, label, hint, Icon }) => {
                      const active = useCase === value
                      return (
                        <button
                          key={value}
                          className={`rounded-2xl border px-2.5 py-2.5 text-left transition-colors ${
                            active
                              ? 'border-[var(--accent-border)] bg-[var(--accent-soft)]'
                              : 'border-[var(--border)] bg-[var(--panel-2)] hover:border-[var(--border-strong)]'
                          }`}
                          onClick={() => onUseCase(value)}
                        >
                          <div className="flex items-center gap-1.5">
                            <Icon size={14} color={active ? 'var(--accent-2)' : 'var(--muted)'} />
                            <span
                              className={`text-[12px] ${active ? 'text-[var(--accent-text)]' : 'text-[var(--text)]'}`}
                            >
                              {label}
                            </span>
                          </div>
                          <div
                            className={`mt-1 text-[11px] leading-4 ${
                              active ? 'text-[var(--muted)]' : 'text-[var(--faint)]'
                            }`}
                          >
                            {hint}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-2 text-[12px] leading-4 text-[var(--faint)]">
                    「整理照片」只是把摄影入口收进侧栏的「更多」，用过一次后自动回到导航，功能不会少。
                  </div>
                </div>
              </>
            )}

            {tab === 'llm' && (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="text-[13.5px]">模型服务</span>
                  {llm && (
                    <span className="ml-auto text-[11px] text-[var(--faint)]">
                      {llm.encryption === 'os' ? '密钥由系统加密保存' : '系统加密不可用'}
                    </span>
                  )}
                </div>

                {!llm ? (
                  <div className="text-[12px] text-[var(--faint)]">读取配置中…</div>
                ) : (
                  <>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-3">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0">
                          <div className="text-[13.5px]">启用大模型能力</div>
                          <div className="text-[11px] leading-4 text-[var(--faint)] mt-0.5">
                            默认关闭。关闭后相册里不会出现 AI
                            按钮，也不会联网；开启后只有你点 AI 按钮才会调用。
                          </div>
                        </div>
                        <button
                          className={`ml-auto mt-0.5 w-[38px] h-[21px] rounded-full relative shrink-0 transition-colors ${
                            llm.settings.enabled
                              ? 'bg-[var(--accent)]'
                              : 'bg-[var(--border-strong)]'
                          }`}
                          onClick={() => void saveLlm({ enabled: !llm.settings.enabled })}
                          aria-pressed={llm.settings.enabled}
                          title={llm.settings.enabled ? '关闭大模型能力' : '开启大模型能力'}
                        >
                          <span
                            className={`absolute top-[2px] w-[17px] h-[17px] rounded-full bg-white transition-all ${
                              llm.settings.enabled ? 'left-[19px]' : 'left-[2px]'
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {llm.encryption === 'unavailable' && (
                      <div className="text-[11px] leading-4 text-[var(--danger-text)]">
                        系统加密不可用，已拒绝保存明文密钥；请先在系统里启用凭据保护。
                      </div>
                    )}

                    <div className="space-y-2">
                      {llm.settings.models.length === 0 && (
                        <div className="text-[12px] text-[var(--faint)]">
                          还没有模型，点下面的「添加模型」加一个。
                        </div>
                      )}
                      {llm.settings.models.map((model) => {
                        const hint = llm.keyHints[model.id]
                        const test = llmTests[model.id]
                        const isDefault = llm.settings.defaultModelId === model.id
                        return (
                          <div
                            key={model.id}
                            className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-3 space-y-2"
                          >
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[13.5px] text-[var(--text)]">{model.name}</span>
                              {isDefault && (
                                <span className="rounded-lg border border-[var(--accent-border)] bg-[var(--accent-soft)] px-1.5 py-[1px] text-[11px] text-[var(--accent-text)]">
                                  默认
                                </span>
                              )}
                              <span
                                className={`rounded-lg border px-1.5 py-[1px] text-[11px] ${
                                  model.vision
                                    ? 'border-[var(--success)]/40 text-[var(--success)]'
                                    : 'border-[var(--warn)]/40 text-[var(--warn)]'
                                }`}
                              >
                                {model.vision ? '视觉 ✓' : '视觉不可用'}
                              </span>
                              <span className="rounded-lg border border-[var(--border)] px-1.5 py-[1px] text-[11px] text-[var(--faint)]">
                                {hint ? '已存 Key' : '未存 Key'}
                              </span>
                              <div className="ml-auto flex items-center gap-1">
                                <button
                                  className="btn btn-ghost h-6 px-2 text-[12px]"
                                  disabled={testingId !== null || !hint}
                                  onClick={() => void testModel(model.id)}
                                  title="先测文本，再发一张 32×32 照片确认能不能看图"
                                >
                                  {testingId === model.id ? '测试中…' : '测试'}
                                </button>
                                {!isDefault && (
                                  <button
                                    className="btn btn-ghost h-6 px-2 text-[12px]"
                                    onClick={() => void setDefaultModel(model.id)}
                                  >
                                    设为默认
                                  </button>
                                )}
                                <button
                                  className="btn btn-ghost h-6 px-2 text-[12px]"
                                  onClick={() => startEditModel(model)}
                                >
                                  编辑
                                </button>
                                <button
                                  className="btn btn-ghost btn-danger h-6 px-2 text-[12px]"
                                  onClick={() => void removeModel(model)}
                                >
                                  删除
                                </button>
                              </div>
                            </div>

                            <div className="break-all text-[11px] leading-4 text-[var(--faint)]">
                              {model.vendor} ·{' '}
                              {model.provider === 'anthropic' ? 'Anthropic' : 'OpenAI 兼容'} ·{' '}
                              {model.model || '未填模型名'}
                            </div>
                            <div className="break-all text-[11px] leading-4 text-[var(--faint)]">
                              {model.baseUrl}
                            </div>

                            {test && (
                              <div
                                className={`text-[11px] leading-4 ${
                                  test.ok ? 'text-[var(--success)]' : 'text-[var(--danger-text)]'
                                }`}
                              >
                                {test.ok ? '✓ ' : ''}
                                {test.message}（{test.latencyMs} ms）
                              </div>
                            )}

                            <div className="flex items-center gap-2">
                              <input
                                type="password"
                                className="input h-7 flex-1 text-[12px]"
                                placeholder={hint ? `已保存 ${hint}` : '粘贴 API Key'}
                                value={keyDrafts[model.id] ?? ''}
                                onChange={(event) =>
                                  setKeyDrafts((prev) => ({
                                    ...prev,
                                    [model.id]: event.target.value
                                  }))
                                }
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') void saveModelKey(model.id)
                                }}
                              />
                              <button
                                className="btn h-7 px-2 text-[12px]"
                                disabled={
                                  !(keyDrafts[model.id] ?? '').trim() ||
                                  keyBusyId !== null ||
                                  llm.encryption === 'unavailable'
                                }
                                onClick={() => void saveModelKey(model.id)}
                              >
                                保存
                              </button>
                              {hint && (
                                <button
                                  className="btn btn-ghost h-7 px-2 text-[12px]"
                                  disabled={keyBusyId !== null}
                                  onClick={() => void clearModelKey(model.id)}
                                >
                                  清除
                                </button>
                              )}
                            </div>

                            {llmEditing === model.id && renderModelForm()}
                          </div>
                        )
                      })}
                    </div>

                    {llmEditing === 'new' ? (
                      <div className="rounded-2xl border border-[var(--accent-border)] bg-[var(--panel-2)] p-3">
                        {renderModelForm()}
                      </div>
                    ) : (
                      <button
                        className="btn h-7 px-2 text-[12px]"
                        onClick={startAddModel}
                      >
                        + 添加模型
                      </button>
                    )}

                    {llmMsg && (
                      <div className="text-[11px] leading-4 text-[var(--accent-text)]">
                        {llmMsg}
                      </div>
                    )}

                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-3 space-y-2">
                      <div className="text-[12px]">功能分配</div>
                      <div className="text-[11px] leading-4 text-[var(--faint)]">
                        默认全部跟随默认模型；需要时给单个功能换模型。看不了图的模型会被标出来。
                      </div>
                      {llm.capabilities.map((capability) => (
                        <div key={capability.id} className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-[12px] text-[var(--text)]">
                              {capability.title}
                              {capability.maxItems ? (
                                <span className="text-[11px] text-[var(--faint)]">
                                  {' '}
                                  · 一次最多 {capability.maxItems} 张
                                </span>
                              ) : null}
                            </div>
                            <div className="text-[11px] leading-4 text-[var(--faint)]">
                              {capability.description}
                            </div>
                            {!capability.vision && capability.modelName && (
                              <div className="text-[11px] leading-4 text-[var(--warn)]">
                                「{capability.modelName}」看不了图，这个功能会不可用
                              </div>
                            )}
                          </div>
                          <select
                            className="input h-7 w-[150px] shrink-0 text-[12px]"
                            value={llm.settings.routing[capability.id] ?? ''}
                            onChange={(event) => void setRouting(capability.id, event.target.value)}
                          >
                            <option value="">跟随默认</option>
                            {llm.settings.models.map((model) => (
                              <option key={model.id} value={model.id}>
                                {model.name}
                                {model.vision ? '' : '（无视觉）'}
                              </option>
                            ))}
                          </select>
                          <button
                            className={`mt-1 w-[34px] h-[19px] rounded-full relative shrink-0 transition-colors ${
                              capability.enabled
                                ? 'bg-[var(--accent)]'
                                : 'bg-[var(--border-strong)]'
                            }`}
                            onClick={() => void toggleCapability(capability.id)}
                            aria-pressed={capability.enabled}
                            title={capability.enabled ? '关闭这个能力' : '开启这个能力'}
                          >
                            <span
                              className={`absolute top-[2px] w-[15px] h-[15px] rounded-full bg-white transition-all ${
                                capability.enabled ? 'left-[17px]' : 'left-[2px]'
                              }`}
                            />
                          </button>
                        </div>
                      ))}
                    </div>

                    {llm.lastCall && (
                      <div className="text-[11px] text-[var(--faint)]">
                        上次调用：{llm.lastCall.ok ? '成功' : '失败'} · {llm.lastCall.latencyMs} ms
                      </div>
                    )}
                  </>
                )}

                <div className="text-[12px] leading-4 text-[var(--faint)]">
                  支持 OpenAI 兼容接口与 Anthropic。请求在主进程发出，界面拿不到密钥和原图。
                </div>
              </>
            )}

            {tab === 'semantic' && (
              <>
                <div className="text-[13.5px]">语义模型</div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] divide-y divide-[var(--border)]">
                  {embeddingModels ? (
                    embeddingModels.map((model) => (
                      <div key={model.id} className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[13.5px]">{model.label}</span>
                          {model.active && (
                            <span className="text-[11px] px-1.5 py-[1px] rounded-lg border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-text)]">
                              使用中
                            </span>
                          )}
                          {!model.ready && (
                            <span className="text-[11px] px-1.5 py-[1px] rounded-lg border border-[var(--border)] bg-[var(--panel)] text-[var(--faint)]">
                              未下载
                            </span>
                          )}
                          <span className="ml-auto text-[11px] text-[var(--faint)] tabular-nums">
                            {formatBytes(model.bytes)} · {model.dim} 维
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--faint)] mt-0.5 leading-4">
                          {model.note}
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[11px] text-[var(--faint)] tabular-nums">
                            已索引 {model.indexed}/{model.total}
                          </span>
                          <div className="ml-auto">
                            {model.active && model.ready ? null : model.ready ? (
                              <button
                                className="btn h-6 px-2 text-[12px]"
                                disabled={modelBusy !== null}
                                onClick={() => void useExistingModel(model)}
                              >
                                切换使用
                              </button>
                            ) : (
                              <button
                                className="btn h-6 px-2 text-[12px]"
                                disabled={modelBusy !== null}
                                onClick={() => void downloadAndSwitchModel(model)}
                              >
                                {modelBusy === model.id ? '下载中…' : '下载并使用'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-[12px] text-[var(--faint)]">正在读取…</div>
                  )}
                </div>
                {modelMsg && (
                  <div className="text-[11px] leading-4 text-[var(--accent-text)]">{modelMsg}</div>
                )}
                <div className="text-[11px] leading-4 text-[var(--faint)]">
                  换模型不会删旧索引，但要重建后才能搜图和分类。SigLIP 2 的中文分类实测更弱，建议先小范围对比。
                </div>

                <div className="mt-2 text-[13.5px]">语义索引</div>
                <div className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-[13.5px]">空闲时自动识图</div>
                    <div className="text-[11px] text-[var(--faint)] mt-0.5 leading-4">
                      空闲时自动识图 + 插电且空闲 2 分钟后开始，每批 16 张，你一操作就停；只占 2 个 CPU 线程。
                    </div>
                  </div>
                  <button
                    className={`ml-auto mt-0.5 w-[38px] h-[21px] rounded-full relative shrink-0 transition-colors ${
                      autoClip ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]'
                    }`}
                    onClick={() => void toggleAutoClip()}
                    aria-pressed={Boolean(autoClip)}
                    disabled={autoClip === null}
                    title={autoClip ? '关闭空闲时自动识图' : '开启空闲时自动识图'}
                  >
                    <span
                      className={`absolute top-[2px] w-[17px] h-[17px] rounded-full bg-white transition-all ${
                        autoClip ? 'left-[19px]' : 'left-[2px]'
                      }`}
                    />
                  </button>
                </div>
                <div className="text-[12px] leading-4 text-[var(--faint)]">
                  手动点侧栏「语义索引」会一次跑完剩余的，随时可以停。
                </div>

                <div className="mt-2 text-[13.5px]">AI 作用的照片</div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2.5 space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[{ value: 0, label: '全部照片' }]
                      .concat([1, 2, 3, 4, 5].map((n) => ({ value: n, label: '★'.repeat(n) })))
                      .map((option) => {
                        const active = (scoreMinRating ?? 0) === option.value
                        return (
                          <button
                            key={option.value}
                            className={`h-[26px] px-2 rounded-lg border text-[12px] transition-colors ${
                              active
                                ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                                : 'border-[var(--border)] bg-[var(--panel)] text-[var(--faint)]'
                            }`}
                            disabled={scoreBusy || scoreMinRating === null}
                            aria-pressed={active}
                            onClick={() => void changeScoreRating(option.value)}
                          >
                            {option.label}
                          </button>
                        )
                      })}
                  </div>
                  <div className="text-[11px] leading-4 text-[var(--faint)]">
                    只处理达到这个星级的照片，默认 ★★★；没标星的算不达标。选「全部照片」就不限星级。
                  </div>
                  <div className="text-[11px] leading-4 text-[var(--faint)]">
                    范围内的照片才会出现 AI 按钮；已有的评分和笔记照常能看。
                  </div>
                  <div className="text-[11px] leading-4 text-[var(--faint)]">
                    当前有 {scoreCounts ? `${scoreCounts.matched} / ${scoreCounts.total} 张` : '正在读取…'}在范围内
                    {`（星级：${scoreMinRating ? `≥ ${scoreMinRating} 星` : '不限'}；文件夹：${
                      (scopeFolders ?? []).length > 0 ? `${(scopeFolders ?? []).length} 个` : '全部'
                    }）`}
                  </div>

                  <div className="mt-1 text-[11px] leading-4 text-[var(--faint)]">文件夹范围</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      className={`h-[26px] px-2 rounded-lg border text-[12px] transition-colors ${
                        (scopeFolders ?? []).length === 0
                          ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                          : 'border-[var(--border)] bg-[var(--panel)] text-[var(--faint)]'
                      }`}
                      onClick={() => void changeScopeFolders([])}
                      disabled={scopeFolders === null}
                    >
                      全部文件夹
                    </button>
                    {folders.map((folder) => {
                      const active = (scopeFolders ?? []).includes(folder.id)
                      return (
                        <button
                          key={folder.id}
                          className={`h-[26px] px-2 rounded-lg border text-[12px] transition-colors ${
                            active
                              ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                              : 'border-[var(--border)] bg-[var(--panel)] text-[var(--faint)]'
                          }`}
                          onClick={() => void changeScopeFolders(toggleFolder(folder.id))}
                          disabled={scopeFolders === null}
                          title={`${folder.name} · ${folder.count} 张`}
                        >
                          {folder.name}
                        </button>
                      )
                    })}
                    {folders.length === 0 && (
                      <span className="text-[11px] text-[var(--faint)]">
                        还没有文件夹。先在左侧新建文件夹，就能在这里限定范围
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] leading-4 text-[var(--faint)]">
                    不选就是所有文件夹；选了以后，只有这些文件夹里的照片能用到 AI。
                  </div>
                </div>
              </>
            )}

            {tab === 'storage' && (
              <>
                <div className="text-[13.5px]">索引与缓存</div>
                {!storage ? (
                  <div className="text-[12px] text-[var(--faint)]">正在读取…</div>
                ) : (
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2.5 space-y-2">
                    <div>
                      <div className="text-[11px] text-[var(--faint)]">图库目录（原图所在）</div>
                      <div className="text-[12px] leading-4 break-all text-[var(--text)]">{storage.library}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-[var(--faint)]">
                        索引与缓存（图库的数据文件、缩略图、预览）
                      </div>
                      <div className="text-[12px] leading-4 break-all text-[var(--text)]">{storage.indexDir}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        className="btn h-7 px-2 text-[12px]"
                        disabled={indexBusy}
                        onClick={() => void moveIndex(undefined)}
                        title="把图库的数据文件和缩略图缓存搬到别的文件夹，原图不动"
                      >
                        {indexBusy ? '移动中…' : '更改位置…'}
                      </button>
                      {storage.indexDir !== storage.library && (
                        <button
                          className="btn btn-ghost h-7 px-2 text-[12px]"
                          disabled={indexBusy}
                          onClick={() => void moveIndex(null)}
                        >
                          放回图库目录
                        </button>
                      )}
                    </div>
                    <div className="text-[11px] leading-4 text-[var(--faint)]">
                      只移动索引和缩略图，原图不动。索引大时要等一会儿，别关程序。
                    </div>
                    {indexMsg && (
                      <div className="text-[11px] leading-4 text-[var(--accent-text)]">{indexMsg}</div>
                    )}
                  </div>
                )}

                <div className="mt-1">
                  <div className="text-[13.5px] mb-2">缩略图缓存</div>
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2.5 space-y-2">
                    {!thumbStats ? (
                      <div className="text-[12px] text-[var(--faint)]">统计中…</div>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: '低 260px', data: thumbStats.low },
                            { label: '中 720px', data: thumbStats.mid },
                            { label: '高 1440px', data: thumbStats.high }
                          ].map(({ label, data }) => (
                            <div key={label}>
                              <div className="text-[11px] text-[var(--faint)]">{label}</div>
                              <div className="text-[12px] text-[var(--text)] tabular-nums">
                                {formatBytes(data.bytes)}
                              </div>
                              <div className="text-[11px] text-[var(--faint)] tabular-nums">{data.count} 张</div>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 pt-0.5">
                          <span className="text-[12px] text-[var(--muted)]">高清上限</span>
                          <select
                            className="input h-7 px-1.5 text-[12px] ml-auto"
                            value={thumbLimit ?? THUMB_CACHE_LIMIT_DEFAULT}
                            onChange={(e) => void changeLimit(Number(e.target.value))}
                            disabled={limitBusy || thumbLimit === null}
                            title="超过上限时自动删最久没看的高清图"
                          >
                            {THUMB_CACHE_LIMIT_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            className="btn h-7 px-2 text-[12px]"
                            disabled={thumbBusy || thumbStats.high.count === 0}
                            onClick={() => void clearThumbs('high')}
                            title="只删 1440px 那档，日常浏览不受影响"
                          >
                            {thumbBusy ? '清理中…' : '清理高清缓存'}
                          </button>
                          <button
                            className="btn btn-ghost h-7 px-2 text-[12px]"
                            disabled={thumbBusy}
                            onClick={() => void clearThumbs('all')}
                            title="三档全删，之后按需重新生成"
                          >
                            全部重建
                          </button>
                        </div>
                        <div className="text-[11px] leading-4 text-[var(--faint)]">
                          高清档按需生成，清掉最划算；超过上限会自动淘汰最久没看的。原图始终不动。
                        </div>
                        {thumbMsg && (
                          <div className="text-[11px] leading-4 text-[var(--accent-text)]">{thumbMsg}</div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-1">
                  <div className="mb-2 flex items-center gap-1.5 text-[13.5px]">
                    <FileText size={14} /> 写入照片信息（.xmp）
                  </div>
                  <div className="space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2.5">
                    {!xmp ? (
                      <div className="text-[12px] text-[var(--faint)]">正在读取…</div>
                    ) : (
                      <>
                        <div className="flex items-start gap-2">
                          <div className="min-w-0">
                            <div className="text-[12px]">启用写入 .xmp</div>
                            <div className="mt-0.5 text-[11px] leading-4 text-[var(--faint)]">
                              把星级、旗标、标签、短备注写到原图旁边的 .xmp；只写人的判断，不写 AI
                              评分。默认关闭。
                            </div>
                          </div>
                          <button
                            className={`relative ml-auto mt-0.5 h-[21px] w-[38px] shrink-0 rounded-full transition-colors ${
                              xmp.enabled ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]'
                            }`}
                            onClick={() => void changeXmp({ enabled: !xmp.enabled })}
                            aria-pressed={xmp.enabled}
                            title={xmp.enabled ? '停止写入 .xmp' : '开始写入 .xmp'}
                          >
                            <span
                              className={`absolute top-[2px] h-[17px] w-[17px] rounded-full bg-white transition-all ${
                                xmp.enabled ? 'left-[19px]' : 'left-[2px]'
                              }`}
                            />
                          </button>
                        </div>

                        <div className="flex items-start gap-2 border-t border-[var(--border)] pt-2">
                          <div className="min-w-0">
                            <div className="text-[12px]">忽略外部修改</div>
                            <div className="mt-0.5 text-[11px] leading-4 text-[var(--faint)]">
                              Lightroom 等软件改过 .xmp 时不再提示导入，存照保持自己的判断。
                            </div>
                          </div>
                          <button
                            className={`relative ml-auto mt-0.5 h-[21px] w-[38px] shrink-0 rounded-full transition-colors ${
                              xmp.ignoreExternal
                                ? 'bg-[var(--accent)]'
                                : 'bg-[var(--border-strong)]'
                            } ${xmp.enabled ? '' : 'opacity-40'}`}
                            onClick={() =>
                              void changeXmp({ ignoreExternal: !xmp.ignoreExternal })
                            }
                            aria-pressed={xmp.ignoreExternal}
                            disabled={!xmp.enabled}
                            title={xmp.ignoreExternal ? '恢复外部修改提示' : '忽略外部修改'}
                          >
                            <span
                              className={`absolute top-[2px] h-[17px] w-[17px] rounded-full bg-white transition-all ${
                                xmp.ignoreExternal ? 'left-[19px]' : 'left-[2px]'
                              }`}
                            />
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--border)] pt-2">
                          <button
                            className="btn h-7 px-2 text-[12px]"
                            disabled={xmpBusy}
                            onClick={() => void exportAllXmp()}
                            title="为所有照片生成 .xmp，用于迁移到 Lightroom 等软件"
                          >
                            导出全部 XMP
                          </button>
                          <button
                            className="btn btn-ghost h-7 px-2 text-[12px]"
                            disabled={xmpBusy || !xmp.enabled}
                            onClick={() => void checkXmp()}
                            title="检查照片信息有没有被别的软件改过"
                          >
                            检查外部修改
                          </button>
                          <span className="text-[11px] text-[var(--faint)]">
                            开启后导入新照片会读取同名 XMP
                          </span>
                        </div>

                        {xmpProgress && (
                          <div>
                            <div className="flex items-center justify-between text-[11px] text-[var(--faint)]">
                              <span>
                                {xmpProgress.phase === 'write'
                                  ? '正在写 XMP'
                                  : '正在检查外部修改'}
                              </span>
                              <span className="tabular-nums">
                                {xmpProgress.done}/{xmpProgress.total}
                              </span>
                            </div>
                            <div className="mt-1 h-[4px] overflow-hidden rounded-full bg-[var(--panel-3)]">
                              <div
                                className="h-full bg-[var(--accent)] transition-[width] duration-200"
                                style={{
                                  width: `${
                                    xmpProgress.total
                                      ? Math.round((xmpProgress.done / xmpProgress.total) * 100)
                                      : 0
                                  }%`
                                }}
                              />
                            </div>
                            <div className="mt-1 truncate text-[11px] text-[var(--faint)]">
                              {xmpProgress.current}
                            </div>
                          </div>
                        )}

                        {xmpMsg && (
                          <div className="text-[11px] leading-4 text-[var(--accent-text)]">
                            {xmpMsg}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </>
            )}

            {tab === 'about' && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-[13.5px] font-bold">存照</span>
                  <span className="text-[12px] text-[var(--faint)]">
                    {appInfo ? `版本 ${appInfo.version}` : '读取版本中…'}
                  </span>
                  {updateEnabled &&
                    (update?.state === 'downloaded' ? (
                      <button
                        className="btn ml-auto h-6 px-2 text-[12px]"
                        onClick={() => void window.api.updateInstall()}
                      >
                        <RefreshCw size={14} /> 重启安装
                      </button>
                    ) : (
                      <button
                        className="btn ml-auto h-6 px-2 text-[12px]"
                        onClick={() => void checkUpdate()}
                        disabled={update?.state === 'checking' || update?.state === 'downloading'}
                        title="检查有没有新版本"
                      >
                        <RefreshCw
                          size={14}
                          className={update?.state === 'checking' ? 'animate-spin' : ''}
                        />
                        {update?.state === 'checking' ? '检查中…' : '检查更新'}
                      </button>
                    ))}
                </div>

                {updateEnabled && updateHintText(update) && (
                  <div className="text-[11px] leading-4 text-[var(--faint)]">
                    {updateHintText(update)}
                  </div>
                )}
                {updateEnabled && update?.state === 'downloading' && (
                  <div className="h-1 overflow-hidden rounded-lg bg-[var(--border)]">
                    <div
                      className="h-full rounded-lg bg-[var(--accent)] transition-[width]"
                      style={{ width: `${Math.min(100, Math.max(0, update.percent ?? 0))}%` }}
                    />
                  </div>
                )}

                <div className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--panel-2)]">
                  <PathRow
                    label="图库目录"
                    path={storage?.library ?? null}
                    emptyHint="先打开一个图库"
                    onOpen={(path) => void openDir(path)}
                  />
                  {storage && storage.indexDir !== storage.library && (
                    <PathRow
                      label="索引与缩略图"
                      path={storage.indexDir}
                      onOpen={(path) => void openDir(path)}
                    />
                  )}
                  <PathRow
                    label="应用设置"
                    path={appInfo?.userData ?? null}
                    emptyHint="正在读取…"
                    onOpen={(path) => void openDir(path)}
                  />
                  <PathRow
                    label="AI 模型"
                    path={appInfo?.modelsDir ?? null}
                    emptyHint="正在读取…"
                    onOpen={(path) => void openDir(path)}
                  />
                </div>

                {openError && (
                  <div className="text-[11px] leading-4 text-[var(--danger-text)]">{openError}</div>
                )}

                <div className="text-[12px] leading-5 text-[var(--faint)]">
                  卸载存照不会删除以上任何文件。整理成果（标签、分类、笔记、评分）保存在图库索引里，备份图库目录就等于备份了全部整理结果。
                </div>

                <div>
                  <div className="text-[13.5px] mb-2">配置备份</div>
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2.5 space-y-2">
                    <div className="text-[11px] leading-4 text-[var(--faint)]">
                      备份主题、布局、缩略图偏好、AI 能力开关与设备清单。API Key、图库路径和照片不会写进文件。
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        className="btn h-7 px-2 text-[12px]"
                        onClick={() => void exportConfig()}
                        disabled={transferBusy !== null}
                      >
                        <Download size={14} /> {transferBusy === 'export' ? '导出中…' : '导出配置'}
                      </button>
                      <button
                        className="btn h-7 px-2 text-[12px]"
                        onClick={() => void importConfig()}
                        disabled={transferBusy !== null}
                      >
                        <Upload size={14} /> {transferBusy === 'import' ? '导入中…' : '导入配置'}
                      </button>
                      {needReload && (
                        <button
                          className="btn btn-ghost h-7 px-2 text-[12px]"
                          onClick={() => window.location.reload()}
                        >
                          重新载入界面
                        </button>
                      )}
                    </div>
                    {transferMsg && (
                      <div
                        className="break-all text-[11px] leading-4"
                        style={{
                          color: transferError ? 'var(--danger-text)' : 'var(--accent-text)'
                        }}
                      >
                        {transferMsg}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
