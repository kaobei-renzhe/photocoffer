import { BrowserWindow, Menu, app, type MenuItemConstructorOptions } from 'electron'
import { MENU_SECTIONS } from '../shared/menu'

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

function sendMenuAction(id: string): void {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  win?.webContents.send('menu:action', id)
}

const ROLE_BY_ID: Record<string, MenuItemConstructorOptions['role']> = {
  'edit.undo': 'undo',
  'edit.redo': 'redo',
  'edit.cut': 'cut',
  'edit.copy': 'copy',
  'edit.paste': 'paste',
  'edit.selectAll': 'selectAll',
  'view.fullscreen': 'togglefullscreen',
  'app.quit': 'quit'
}

/**
 * 菜单唯一来源：Windows 与 macOS 都安装同一份模板。
 * Windows 保留 autoHideMenuBar: true，原生菜单不可见但加速键仍生效；
 * 绝不能 setApplicationMenu(null)，否则 Ctrl+Z/C/V 会失去加速键来源。
 */
export function installAppMenu(): void {
  const sections = MENU_SECTIONS.map((section) => ({
    label: section.label,
    submenu: section.items.map((entry) => {
      if (entry === '---') return { type: 'separator' as const }
      const role = ROLE_BY_ID[entry.id]
      if (role) {
        return { role, label: entry.label, accelerator: entry.accelerator }
      }
      // Windows 不注册 edit 加速键：Ctrl+Z/A/C 由渲染层 useShortcuts 处理，
      // 原生菜单只保留可点击项，避免菜单 role 抢走图库的撤销/全选/复制。
      if (!isMac && section.id === 'edit') {
        return { label: entry.label, click: () => sendMenuAction(entry.id) }
      }
      return {
        label: entry.label,
        accelerator: entry.accelerator,
        click: () => sendMenuAction(entry.id)
      }
    })
  }))
  const template = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    ...sections
  ] as MenuItemConstructorOptions[]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/** 数据目录的用户可读说明，用于「关于」页 */
export function dataDirHint(): string {
  const name = app.getName()
  return isMac ? `~/Library/Application Support/${name}` : `%APPDATA%\\${name}`
}
