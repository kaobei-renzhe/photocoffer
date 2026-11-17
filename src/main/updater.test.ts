import { tmpdir } from 'node:os'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  packaged: true,
  handlers: new Map<string, (...args: unknown[]) => void>(),
  checkForUpdates: vi.fn(async () => ({})),
  downloadUpdate: vi.fn(async () => []),
  setFeedURL: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return state.packaged
    },
    getPath: () => tmpdir()
  }
}))

vi.mock('electron-updater', () => ({
  autoUpdater: {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowDowngrade: false,
    on: (event: string, handler: (...args: unknown[]) => void) => {
      state.handlers.set(event, handler)
    },
    setFeedURL: state.setFeedURL,
    checkForUpdates: state.checkForUpdates,
    downloadUpdate: state.downloadUpdate,
    quitAndInstall: vi.fn()
  }
}))

async function loadUpdater() {
  return import('./updater')
}

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
  state.packaged = true
  state.handlers.clear()
  state.checkForUpdates.mockClear()
  state.downloadUpdate.mockClear()
  state.setFeedURL.mockClear()
})

describe('updater', () => {
  it('没配地址时完全静默', async () => {
    const updater = await loadUpdater()
    expect(updater.updatesEnabled()).toBe(false)
    const status = await updater.checkForUpdates()
    expect(status.state).toBe('disabled')
    expect(state.checkForUpdates).not.toHaveBeenCalled()
  })

  it('拒绝非 https 的更新源', async () => {
    vi.stubEnv('LUNARIS_UPDATE_URL', 'http://evil.example.com')
    const updater = await loadUpdater()
    const status = await updater.checkForUpdates()
    expect(status.state).toBe('disabled')
    expect(status.message).toContain('https')
    expect(state.checkForUpdates).not.toHaveBeenCalled()
  })

  it('新变量名 PHOTOCOFFER_UPDATE_URL 生效', async () => {
    vi.stubEnv('PHOTOCOFFER_UPDATE_URL', 'https://updates.example.com/photocoffer')
    const updater = await loadUpdater()
    const status = await updater.checkForUpdates()
    expect(state.setFeedURL).toHaveBeenCalledWith({
      provider: 'generic',
      url: 'https://updates.example.com/photocoffer'
    })
    expect(status.state).toBe('checking')
  })

  it('旧变量名 LUNARIS_UPDATE_URL 仍兼容（已装用户设过）', async () => {
    vi.stubEnv('LUNARIS_UPDATE_URL', 'https://updates.example.com/lunaris')
    const updater = await loadUpdater()
    const status = await updater.checkForUpdates()
    expect(state.setFeedURL).toHaveBeenCalledWith({
      provider: 'generic',
      url: 'https://updates.example.com/lunaris'
    })
    expect(status.state).toBe('checking')
  })

  it('https 地址会发起检查', async () => {
    vi.stubEnv('LUNARIS_UPDATE_URL', 'https://updates.example.com/lunaris')
    const updater = await loadUpdater()
    const status = await updater.checkForUpdates()
    expect(state.setFeedURL).toHaveBeenCalledWith({
      provider: 'generic',
      url: 'https://updates.example.com/lunaris'
    })
    expect(state.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(status.state).toBe('checking')
  })

  it('发现新版本后自动下载并推进状态', async () => {
    vi.stubEnv('LUNARIS_UPDATE_URL', 'https://updates.example.com/lunaris')
    const updater = await loadUpdater()
    updater.installUpdater()

    state.handlers.get('update-available')?.({ version: '0.4.0' })
    expect(state.downloadUpdate).toHaveBeenCalledTimes(1)

    state.handlers.get('download-progress')?.({ percent: 42.4 })
    expect(updater.updateStatus()).toMatchObject({ state: 'downloading', percent: 42 })

    state.handlers.get('update-downloaded')?.({ version: '0.4.0' })
    expect(updater.updateStatus()).toMatchObject({ state: 'downloaded', version: '0.4.0' })
  })

  it('开发模式不检查更新', async () => {
    state.packaged = false
    vi.stubEnv('LUNARIS_UPDATE_URL', 'https://updates.example.com/lunaris')
    const updater = await loadUpdater()
    const status = await updater.checkForUpdates()
    expect(status.state).toBe('disabled')
  })
})
