export type MenuSectionId = 'file' | 'edit' | 'photo' | 'view' | 'help'

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

/** 菜单唯一来源：原生菜单与 Windows 窗内下拉都从这里渲染 */
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
      { id: 'app.settings', label: '设置…', accelerator: 'CmdOrCtrl+,' },
      '---',
      { id: 'app.about', label: '关于存照' },
      { id: 'app.quit', label: '退出', accelerator: 'CmdOrCtrl+Q' }
    ]
  },
  {
    id: 'edit',
    label: '编辑',
    items: [
      { id: 'edit.undo', label: '撤销', accelerator: 'CmdOrCtrl+Z' },
      { id: 'edit.redo', label: '重做', accelerator: 'CmdOrCtrl+Shift+Z' },
      '---',
      { id: 'edit.cut', label: '剪切', accelerator: 'CmdOrCtrl+X' },
      { id: 'edit.copy', label: '复制', accelerator: 'CmdOrCtrl+C' },
      { id: 'edit.paste', label: '粘贴', accelerator: 'CmdOrCtrl+V' },
      { id: 'edit.selectAll', label: '全选', accelerator: 'CmdOrCtrl+A' }
    ]
  },
  {
    id: 'photo',
    label: '照片',
    items: [
      { id: 'photo.rate.1', label: '1 星' },
      { id: 'photo.rate.2', label: '2 星' },
      { id: 'photo.rate.3', label: '3 星' },
      { id: 'photo.rate.4', label: '4 星' },
      { id: 'photo.rate.5', label: '5 星' },
      { id: 'photo.rate.0', label: '清除星级' },
      '---',
      { id: 'photo.flag.keep', label: '留用' },
      { id: 'photo.flag.reject', label: '淘汰' },
      { id: 'photo.flag.clear', label: '清除旗标' },
      '---',
      { id: 'photo.addToPick', label: '加入选片' },
      { id: 'photo.export', label: '导出成品…' }
    ]
  },
  {
    id: 'view',
    label: '视图',
    items: [
      { id: 'view.gallery', label: '图库', accelerator: 'CmdOrCtrl+1' },
      { id: 'view.portrait', label: '人像', accelerator: 'CmdOrCtrl+2' },
      { id: 'view.delivery', label: '选片交付', accelerator: 'CmdOrCtrl+3' },
      '---',
      { id: 'view.fullscreen', label: '全屏', accelerator: 'F11' }
    ]
  },
  {
    id: 'help',
    label: '帮助',
    items: [{ id: 'app.about', label: '关于存照' }]
  }
]

export const EDIT_COMMANDS: Record<string, string> = {
  'edit.undo': 'undo',
  'edit.redo': 'redo',
  'edit.cut': 'cut',
  'edit.copy': 'copy',
  'edit.paste': 'paste',
  'edit.selectAll': 'selectAll'
}
