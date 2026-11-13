import { useCallback, useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type {
  FilterState,
  ImportOptions,
  ImportProgress,
  ImportResult,
  PendingImport
} from '@shared/types'

const FIRST_IMPORT_TIP_KEY = 'lunaris:first-import-tip'

interface ImportContext {
  library: string | null
  notify: (text: string) => void
  bump: () => void
  setFilter: Dispatch<SetStateAction<FilterState>>
}

export interface ImportController {
  importOpen: boolean
  openImportDialog: () => void
  closeImportDialog: () => void
  importOptions: ImportOptions
  setImportOptions: Dispatch<SetStateAction<ImportOptions>>
  importRunning: boolean
  progress: ImportProgress | null
  /** 恢复备份等不走导入的流程也会用到进度条，结束后手动收起 */
  clearProgress: () => void
  importResult: ImportResult | null
  setImportResult: Dispatch<SetStateAction<ImportResult | null>>
  pendingImport: PendingImport | null
  firstImportHint: number | null
  closeFirstImportHint: () => void
  startImport: (paths: string[], override?: ImportOptions) => Promise<void>
  importFiles: () => Promise<void>
  importFolder: () => Promise<void>
  resumePendingImport: () => void
  discardPendingImport: () => void
  retryFailedImports: () => Promise<void>
  syncLibrary: () => Promise<void>
}

/** 导入流程：开始导入、断点续导、进度、失败重试与首导提示 */
export function useImport({ library, notify, bump, setFilter }: ImportContext): ImportController {
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importRunning, setImportRunning] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null)
  const [importOptions, setImportOptions] = useState<ImportOptions>({
    recursive: true,
    skipDuplicates: true
  })
  const [firstImportHint, setFirstImportHint] = useState<number | null>(null)

  useEffect(() => {
    void window.api.getImportOptions().then(setImportOptions)
  }, [])

  useEffect(() => window.api.onImportProgress(setProgress), [])

  // 打开图库时看看上次有没有被中断的导入任务
  useEffect(() => {
    if (!library) {
      setPendingImport(null)
      return
    }
    let cancelled = false
    void window.api
      .pendingImport()
      .then((task) => {
        if (!cancelled) setPendingImport(task)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [library])

  const closeFirstImportHint = useCallback((): void => {
    localStorage.setItem(FIRST_IMPORT_TIP_KEY, '1')
    setFirstImportHint(null)
  }, [])

  const startImport = useCallback(
    async (paths: string[], override?: ImportOptions) => {
      if (!paths.length) return
      const options = override ?? importOptions
      if (override) setImportOptions(override)
      setPendingImport(null)
      setImportOpen(false)
      setImportResult(null)
      setProgress(null)
      setImportRunning(true)
      try {
        const result = await window.api.importPaths(paths, options)
        setImportResult(result)
        if (result.added > 0 && localStorage.getItem(FIRST_IMPORT_TIP_KEY) !== '1') {
          setFirstImportHint(result.added)
        }
        // 只导入了一个文件夹时，视图直接切到它，按原目录结构展示
        if (result.roots.length === 1) {
          setFilter((prev) => ({ sort: prev.sort, dir: result.roots[0] }))
        }
        bump()
      } catch (error) {
        const text = (error as Error).message
          .replace(/^Error invoking remote method '[^']+':\s*/, '')
          .replace(/^Error:\s*/, '')
        notify(`导入失败：${text}`)
      } finally {
        setImportRunning(false)
        setProgress(null)
      }
    },
    [importOptions, notify, bump, setFilter]
  )

  const importFiles = useCallback(async () => {
    const paths = await window.api.pickImages()
    await startImport(paths)
  }, [startImport])

  const importFolder = useCallback(async () => {
    const dir = await window.api.pickFolder()
    if (dir) await startImport([dir])
  }, [startImport])

  const openImportDialog = useCallback(() => setImportOpen(true), [])
  const closeImportDialog = useCallback(() => setImportOpen(false), [])
  const clearProgress = useCallback(() => setProgress(null), [])

  const resumePendingImport = useCallback(() => {
    if (!pendingImport) return
    // 继续时强制跳过已导入的照片，只处理剩下的
    void startImport(pendingImport.paths, { ...pendingImport.options, skipDuplicates: true })
  }, [pendingImport, startImport])

  const discardPendingImport = useCallback(() => {
    void window.api.discardPendingImport()
    setPendingImport(null)
    notify('已忽略上次未完成的导入')
  }, [notify])

  /** 重试导入失败的记录：修好的会从「导入异常」里消失 */
  const retryFailedImports = useCallback(async (): Promise<void> => {
    // 上一轮导入的失败清单已经过时，先收起，避免修好后还挂着旧错误
    setImportResult(null)
    try {
      const result = await window.api.retryFailedImports()
      if (result.total === 0) {
        notify('没有待重试的异常文件')
        return
      }
      notify(
        `重试完成：修好 ${result.recovered} 张${result.failed ? `，仍失败 ${result.failed} 张` : ''}`
      )
      // 全部修好时退出「导入异常」视图，别把用户留在空列表里
      if (result.failed === 0) {
        setFilter((prev) => (prev.errors ? { ...prev, errors: false } : prev))
      }
      bump()
    } catch (error) {
      notify(`重试失败：${(error as Error).message}`)
    }
  }, [notify, bump, setFilter])

  const syncLibrary = useCallback(async () => {
    if (importRunning) {
      notify('正在导入，等当前任务结束再刷新')
      return
    }
    setImportOpen(false)
    setImportResult(null)
    setProgress(null)
    setImportRunning(true)
    try {
      const result = await window.api.syncLibrary()
      const parts = [
        `扫描 ${result.scanned}`,
        `新增 ${result.added}`,
        `丢失 ${result.missing}`,
        `恢复 ${result.restored}`,
        `刷新 ${result.refreshed}`
      ]
      if (result.failed > 0) parts.push(`失败 ${result.failed}`)
      const roots =
        result.missingRoots.length > 0
          ? ` · ${result.missingRoots.length} 个源目录已不在原位，可用「重新定位」接回`
          : ''
      notify(`刷新完成 · ${parts.join(' · ')}${roots}`)
      bump()
    } catch (error) {
      const text = (error as Error).message
        .replace(/^Error invoking remote method '[^']+':\s*/, '')
        .replace(/^Error:\s*/, '')
      notify(`刷新失败：${text}`)
    } finally {
      setImportRunning(false)
      setProgress(null)
    }
  }, [importRunning, notify, bump])

  return {
    importOpen,
    openImportDialog,
    closeImportDialog,
    importOptions,
    setImportOptions,
    importRunning,
    progress,
    clearProgress,
    importResult,
    setImportResult,
    pendingImport,
    firstImportHint,
    closeFirstImportHint,
    startImport,
    importFiles,
    importFolder,
    resumePendingImport,
    discardPendingImport,
    retryFailedImports,
    syncLibrary
  }
}
