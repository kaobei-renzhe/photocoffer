import { Menu, app } from 'electron'

/**
 * 平台差异只在这里出现一次。
 * 业务代码一律 import 这里的常量，不要再散落 process.platform。
 */
export const platformName = process.platform
export const isMac = platformName === 'darwin'
export const isWindows = platformName === 'win32'

/** 界面文案里的修饰键：mac 用 ⌘ / ⌥，其余用 Ctrl / Alt */
export const modLabel = isMac ? '⌘' : 'Ctrl'
export const altLabel = isMac ? '⌥' : 'Alt'

/**
 * macOS 必须有应用菜单：编辑类快捷键（⌘C/⌘V/⌘A/⌘Z）依赖菜单的 edit role。
 * Windows 保持现状（autoHideMenuBar: true，按 Alt 可呼出），不要设成 null。
 */
export function installAppMenu(): void {
  if (!isMac) return
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' }
    ])
  )
}

/** 数据目录的用户可读说明，用于「关于」页 */
export function dataDirHint(): string {
  const name = app.getName()
  return isMac ? `~/Library/Application Support/${name}` : `%APPDATA%\\${name}`
}
