import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import { log } from './logger'
import type { UpdateStatus } from '../shared/types'

/**
 * 自动更新：地址只从环境变量读，留空就完全不联网。
 * 打包配置里的 publish.url 只是占位，用来让 electron-builder 生成 latest.yml；
 * 真正的更新源在运行时由 LUNARIS_UPDATE_URL 覆盖。
 */
const FEED_ENV = 'LUNARIS_UPDATE_URL'

function feedUrl(): string {
  return String(process.env[FEED_ENV] ?? '').trim()
}

/** 只信任 https；本机 mock 允许 http，方便发布前自测 */
function isAllowedFeed(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:') return true
    if (parsed.protocol !== 'http:') return false
    return ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  } catch {
    return false
  }
}

let status: UpdateStatus = { state: 'idle' }
const listeners = new Set<(next: UpdateStatus) => void>()
let installed = false

function setStatus(next: UpdateStatus): void {
  status = next
  for (const listener of listeners) {
    try {
      listener(status)
    } catch {
      /* 渲染层监听出错不影响更新流程 */
    }
  }
}

export function updateStatus(): UpdateStatus {
  return status
}

export function onUpdateStatus(listener: (next: UpdateStatus) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** 只有正式包 + 配了合法地址才检查：开发模式和留空时一律静默 */
export function updatesEnabled(): boolean {
  return app.isPackaged && isAllowedFeed(feedUrl())
}

export function installUpdater(): void {
  if (installed) return
  installed = true
  // 自己接管下载：checkForUpdates 里 autoDownload 的 Promise 没人接，失败会变成未处理拒绝
  autoUpdater.autoDownload = false
  // 只在用户点「重启安装」时替换版本，退出时别悄悄装
  autoUpdater.autoInstallOnAppQuit = false
  // 与 README 的回滚方案一致：允许用旧版 latest.yml 降级
  autoUpdater.allowDowngrade = true
  autoUpdater.on('checking-for-update', () => setStatus({ state: 'checking' }))
  autoUpdater.on('update-available', (info) => {
    const version = String(info?.version ?? '')
    setStatus({ state: 'available', version })
    void autoUpdater.downloadUpdate().catch((error) => {
      void log.warn('update', '下载更新失败', { error: String((error as Error)?.message ?? error) })
      setStatus({ state: 'error' })
    })
  })
  autoUpdater.on('update-not-available', () => setStatus({ state: 'latest' }))
  autoUpdater.on('download-progress', (progress) =>
    setStatus({ state: 'downloading', percent: Math.round(progress.percent ?? 0) })
  )
  autoUpdater.on('update-downloaded', (info) =>
    setStatus({ state: 'downloaded', version: String(info?.version ?? '') })
  )
  autoUpdater.on('error', (error) => {
    // 失败只写日志，不弹窗：网络波动不该打断用户干活
    void log.warn('update', '检查更新失败', { error: String((error as Error)?.message ?? error) })
    setStatus({ state: 'error' })
  })
}

/** 手动/自动共用一个入口；返回值让设置页能立刻显示结果 */
export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    setStatus({ state: 'disabled', message: '开发模式下不检查更新' })
    return status
  }
  const url = feedUrl()
  if (!url) {
    setStatus({ state: 'disabled', message: '没有配置更新地址' })
    return status
  }
  if (!isAllowedFeed(url)) {
    setStatus({ state: 'disabled', message: '更新地址必须是 https' })
    return status
  }
  installUpdater()
  autoUpdater.setFeedURL({ provider: 'generic', url })
  setStatus({ state: 'checking' })
  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    void log.warn('update', '检查更新失败', { error: String((error as Error)?.message ?? error) })
    setStatus({ state: 'error' })
  }
  return status
}

/** 启动后延迟 10 秒：别和启动初始化抢资源，失败也不打扰 */
export function scheduleUpdateCheck(): void {
  if (!updatesEnabled()) return
  installUpdater()
  setTimeout(() => {
    void checkForUpdates()
  }, 10_000)
}

export function quitAndInstall(): void {
  if (status.state !== 'downloaded') return
  autoUpdater.quitAndInstall()
}
