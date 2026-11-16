import { nativeTheme } from 'electron'
import { SKINS } from '../shared/skins'
import { getSkin } from './settings'

/**
 * 网页标题栏是 36px。原生 overlay 比它矮 1px：
 * 否则 Windows 会把标题栏下面那条 1px 分隔线一起盖住，右上角窗口按钮下方会缺一截。
 */
export const TITLEBAR_OVERLAY_HEIGHT = 35

/** 标题栏 overlay 与 --chrome 同源：深色 #1B1B1B / 浅色 #FFFDF9 */
export function titleBarColors(): { color: string; symbolColor: string } {
  const skin = SKINS.find((entry) => entry.id === getSkin()) ?? SKINS[0]
  const dark =
    skin.mode === 'dark' || (skin.mode === 'auto' && nativeTheme.shouldUseDarkColors)
  return dark
    ? { color: '#1B1B1B', symbolColor: '#A6A6A6' }
    : { color: '#FFFDF9', symbolColor: '#5A5348' }
}
