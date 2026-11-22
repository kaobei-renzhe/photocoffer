export type MenuSectionId = 'file' | 'settings' | 'help'

export interface MenuAction {
  id: string
  label: string
  accelerator?: string
}

export type MenuEntry = MenuAction | '---'

export interface MenuSection {
  id: MenuSectionId
  label: string
  items: MenuEntry[]
}

/**
 * 菜单唯一来源：原生菜单与 Windows 窗内下拉都从这里渲染。
 * 导入与图库归「文件」，设置各分段归「设置」，离线帮助归「帮助」。
 * 星级、旗标、全屏、撤销这些都有各自快捷键（useShortcuts / useGlobalKeys），不需要菜单。
 */
export const MENU_SECTIONS: MenuSection[] = [
  {
    id: 'file',
    label: '文件',
    items: [
      { id: 'import.files', label: '导入照片…', accelerator: 'CmdOrCtrl+O' },
      { id: 'import.folder', label: '导入文件夹…', accelerator: 'CmdOrCtrl+Shift+O' },
      '---',
      { id: 'library.switch', label: '切换图库…', accelerator: 'CmdOrCtrl+Shift+L' },
      '---',
      { id: 'app.quit', label: '退出', accelerator: 'CmdOrCtrl+Q' }
    ]
  },
  {
    id: 'settings',
    label: '设置',
    items: [
      { id: 'settings.open.appearance', label: '外观', accelerator: 'CmdOrCtrl+,' },
      { id: 'settings.open.llm', label: '大模型' },
      { id: 'settings.open.semantic', label: '语义索引' },
      { id: 'settings.open.storage', label: '存储位置' },
      '---',
      { id: 'app.about', label: '关于存照' }
    ]
  },
  {
    id: 'help',
    label: '帮助',
    items: [{ id: 'app.help', label: '使用说明' }]
  }
]

/** Windows 窗内菜单的编辑动作：走 document.execCommand，不占用原生 role */
export const EDIT_COMMANDS: Record<string, string> = {
  'edit.undo': 'undo',
  'edit.redo': 'redo',
  'edit.cut': 'cut',
  'edit.copy': 'copy',
  'edit.paste': 'paste',
  'edit.selectAll': 'selectAll'
}
