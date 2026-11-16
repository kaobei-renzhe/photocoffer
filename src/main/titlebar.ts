import { nativeTheme } from 'electron'
import { SKINS } from '../shared/skins'
import { getSkin } from './settings'

/** 标题栏 overlay 与 --chrome 同源：深色 #1B1B1B / 浅色 #FFFDF9 */
export function titleBarColors(): { color: string; symbolColor: string } {
  const skin = SKINS.find((entry) => entry.id === getSkin()) ?? SKINS[0]
  const dark =
    skin.mode === 'dark' || (skin.mode === 'auto' && nativeTheme.shouldUseDarkColors)
  return dark
    ? { color: '#1B1B1B', symbolColor: '#A6A6A6' }
    : { color: '#FFFDF9', symbolColor: '#5A5348' }
}
