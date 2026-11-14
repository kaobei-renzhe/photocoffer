import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { cp, mkdir, rename, rm } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BrowserWindow, app, nativeTheme, net, protocol, shell } from 'electron'
import { registerIpc, stopLibraryWatcher } from './ipc'
import { getLightboxFile, thumbPathFor } from './repo'
import { ensureThumb, pruneHighCache, touchHighThumb } from './thumbs'
import { isThumbQuality } from '../shared/thumbs'
import { closeLibrary } from './db'
import { getSkin, getTheme } from './settings'
import { log } from './logger'
import { installCrashGuards } from './crash'
import { installAppMenu, isMac, platformName } from './platform'
import { scheduleUpdateCheck } from './updater'
import { isInside } from './pathGuard'
import { EMBEDDING_MODELS, modelDirFor, resolveModelDir } from './clip/models'
import type { EmbeddingModelId } from '../shared/types'
import { SKINS } from '../shared/skins'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'thumb',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  },
  {
    scheme: 'photo',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

// 越早安装越好：启动阶段的异常也要能落盘
installCrashGuards()

function parseId(request: Request): number {
  const url = new URL(request.url)
  const id = Number(url.pathname.replace(/^\/+/, ''))
  return Number.isInteger(id) && id > 0 ? id : 0
}

function isAppRendererUrl(target: string): boolean {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl && (target === devUrl || target.startsWith(`${devUrl}/`))) return true
  if (!target.startsWith('file://')) return false
  try {
    return isInside(join(__dirname, '../renderer'), fileURLToPath(new URL(target)))
  } catch {
    return false
  }
}

/**
 * 渲染层被注入时，最危险的是把主窗导航到外站，或者开新窗口拿到 preload 能力。
 * 这里统一拦掉：只允许应用自己的页面导航，外链交给系统浏览器。
 */
function installNavigationGuards(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, target) => {
      if (!isAppRendererUrl(target)) {
        event.preventDefault()
        void log.warn('security', '已拦截窗口导航', { target })
      }
    })
    contents.setWindowOpenHandler(({ url }) => {
      try {
        const parsed = new URL(url)
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          void shell.openExternal(url)
        }
      } catch {
        /* 不是合法 URL 就什么都不做 */
      }
      return { action: 'deny' }
    })
  })
}

function notFound(): Response {
  return new Response('Not found', { status: 404 })
}

/**
 * 缩略图/原图路径缓存：一屏几十张卡片会反复请求同一批 id，
 * 每次都查库 + 三次 existsSync 太浪费；命中后仍会检查文件还在不在。
 */
const resolvedPaths = new Map<string, string>()
const RESOLVED_PATH_MAX = 4000

function recallPath(key: string): string | null {
  const file = resolvedPaths.get(key)
  if (!file) return null
  if (existsSync(file)) return file
  resolvedPaths.delete(key)
  return null
}

function rememberPath(key: string, file: string): void {
  if (resolvedPaths.size >= RESOLVED_PATH_MAX) {
    const oldest = resolvedPaths.keys().next().value
    if (oldest) resolvedPaths.delete(oldest)
  }
  resolvedPaths.set(key, file)
}

function currentSkin() {
  return SKINS.find((skin) => skin.id === getSkin()) ?? SKINS[0]
}

/** 首帧窗口底色：固定风格用皮肤底色，默认（auto）跟随系统深浅 */
function windowBackground(): string {
  const skin = currentSkin()
  if (skin.mode !== 'auto') return skin.base
  return nativeTheme.shouldUseDarkColors ? '#14161B' : '#F0F3F7'
}

/**
 * 调试开关：LUNARIS_HEADLESS=1 时窗口创建出来但不显示（照常渲染，可走调试端口截图），
 * 免得跑一次调试就把界面弹到最前面打断手头的事。
 */
const headless = process.env.LUNARIS_HEADLESS === '1'

function createWindow(): void {
  const iconPath = join(app.getAppPath(), 'build', 'icon.png')
  const win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1080,
    minHeight: 680,
    backgroundColor: windowBackground(),
    autoHideMenuBar: true,
    title: '存照',
    show: !headless,
    // 隐藏态也要出帧，否则调试端口截到的是空白
    paintWhenInitiallyHidden: true,
    ...(existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // 沙箱实测：preload 仍能拿到 ipcRenderer / contextBridge / webUtils.getPathForFile
      sandbox: true
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// 调试端口只在未打包时开放：正式版不能被外部环境变量打开 CDP
const debugPort = app.isPackaged ? undefined : process.env.IMAGENEST_DEBUG_PORT
if (debugPort) app.commandLine.appendSwitch('remote-debugging-port', debugPort)

const customUserData = process.env.IMAGENEST_USER_DATA ?? process.env.LUNARIS_USER_DATA

/**
 * 改名（月巢 / image-nest → 月相 / lunaris → 片匣 → 砚白 → 存照）后 Electron 的 userData 目录跟着变了，
 * 首次启动时把旧目录里的配置、装备库与日志搬过来，老图库不用重新配置一遍。
 * 只在目标目录还没有 config.json（即没配过）时执行，搬完就不管了。
 */
const LEGACY_APP_DIRS = ['砚白', '片匣', '月相', 'lunaris', '月巢', 'moonnest', 'image-nest']

function migrateLegacyUserData(): void {
  const target = app.getPath('userData')
  if (existsSync(join(target, 'config.json'))) return
  const appData = app.getPath('appData')
  for (const name of LEGACY_APP_DIRS) {
    const legacy = join(appData, name)
    if (legacy === target) continue
    if (!existsSync(join(legacy, 'config.json'))) continue
    try {
      mkdirSync(target, { recursive: true })
      // 只搬业务数据；Cache / GPU 缓存这些重建即可，没必要带
      for (const item of ['config.json', 'gear.json', 'logs']) {
        const from = join(legacy, item)
        if (existsSync(from)) cpSync(from, join(target, item), { recursive: true, force: false })
      }
      void log.info('app', '已从旧版本迁移配置', { from: legacy, to: target })
    } catch (error) {
      void log.warn('app', '迁移旧配置失败，按全新配置启动', { from: legacy, error: String(error) })
    }
    return
  }
}

if (customUserData) app.setPath('userData', customUserData)
else migrateLegacyUserData()

/**
 * 改名时特意没搬 models 目录（183 MB 复制不划算），一直靠 candidates() 的遗留目录回退读。
 * 旧目录一旦被清理软件当残留扫掉，用户就要重下模型；窗口起来后在后台把它搬到当前数据目录。
 */
async function migrateModelDir(): Promise<void> {
  const appData = app.getPath('appData')
  const targetRoot = join(app.getPath('userData'), 'models')
  const legacyRoot = appData + sep

  for (const id of Object.keys(EMBEDDING_MODELS) as EmbeddingModelId[]) {
    const target = modelDirFor(id)
    const source = resolveModelDir(id)
    if (!source || source === target) continue
    // 只搬旧应用目录里的模型；仓库内开发用模型和 IMAGENEST_* 指定的目录都不动
    if (!source.startsWith(legacyRoot)) continue

    await mkdir(targetRoot, { recursive: true })
    try {
      await rename(source, target)
    } catch {
      // 跨盘会抛 EXDEV；目标已有空目录时 rename 也会失败，复制后删除
      await cp(source, target, { recursive: true, force: true })
      await rm(source, { recursive: true, force: true })
    }
    void log.info('clip', '模型已迁到当前数据目录', { id, from: source, to: target })
  }
}

app.whenReady().then(() => {
  void log.info('app', '启动', {
    version: app.getVersion(),
    electron: process.versions.electron,
    userData: app.getPath('userData')
  })
  const skin = currentSkin()
  nativeTheme.themeSource = skin.mode === 'auto' ? getTheme() : skin.mode

  // mac 上没有应用菜单，输入框里的 ⌘C / ⌘V / ⌘A / ⌘Z 会全部失效
  installAppMenu()
  installNavigationGuards()

  protocol.handle('thumb', async (request) => {
    try {
      const id = parseId(request)
      if (!id) return notFound()
      const raw = new URL(request.url).searchParams.get('q')
      const quality = isThumbQuality(raw) ? raw : 'mid'
      const cacheKey = `thumb:${quality}:${id}`
      const touchHigh = (file: string): Promise<Response> => {
        if (quality === 'high') {
          touchHighThumb(id)
          void pruneHighCache()
        }
        return net.fetch(pathToFileURL(file).toString())
      }
      const cached = recallPath(cacheKey)
      if (cached) return touchHigh(cached)
      // 三档都按需补：高档是常态，中/低档只在缓存被清理或缺失时才真正生成
      await ensureThumb(id, quality)
      // 高清还没生成好 / 小图缺失时逐级回退，界面不会出现空白
      for (const fallback of [quality, 'mid', 'low'] as const) {
        const file = thumbPathFor(id, fallback)
        if (existsSync(file)) {
          // 只在命中请求档位时缓存：回退档位缓存住会导致高清新生成后还一直用旧图
          if (fallback === quality) rememberPath(cacheKey, file)
          return touchHigh(file)
        }
      }
      return notFound()
    } catch {
      return notFound()
    }
  })

  protocol.handle('photo', async (request) => {
    try {
      const id = parseId(request)
      if (!id) return notFound()
      const cacheKey = `photo:${id}`
      const cached = recallPath(cacheKey)
      if (cached) return net.fetch(pathToFileURL(cached).toString())
      const file = getLightboxFile(id)
      if (file && existsSync(file)) {
        rememberPath(cacheKey, file)
        return net.fetch(pathToFileURL(file).toString())
      }
      const fallback = thumbPathFor(id)
      if (existsSync(fallback)) return net.fetch(pathToFileURL(fallback).toString())
      return notFound()
    } catch {
      return notFound()
    }
  })

  registerIpc()
  createWindow()
  // 配了更新地址才在启动 10 秒后静默检查；留空完全不联网
  scheduleUpdateCheck()

  // 模型可能有几百 MB：放到窗口创建之后异步搬，失败也不影响正常使用
  if (!customUserData) {
    void migrateModelDir().catch((error) => {
      void log.warn('clip', '模型迁移失败，继续使用旧目录', { error: String(error) })
    })
  }

  // 上次退出时可能留下超限的高清缓存，等图库打开后收一次
  setTimeout(() => void pruneHighCache(true), 20000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  void log.info('app', '准备退出，收尾数据库')
  // closeLibrary 内部会 checkpoint，异常退出后下次打开也会再收一次
  closeLibrary()
})

app.on('window-all-closed', () => {
  void log.info('app', '窗口全部关闭', { platform: platformName })
  stopLibraryWatcher()
  closeLibrary()
  // macOS 的习惯是关掉窗口不退出应用，点 Dock 图标再打开
  if (!isMac) app.quit()
})
