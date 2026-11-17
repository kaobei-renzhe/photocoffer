import { useEffect, useRef } from 'react'

export type GlobalView = 'gallery' | 'portrait' | 'delivery'

interface Options {
  enabled: boolean
  onView: (view: GlobalView) => void
  onSearch: () => void
  onSettings: () => void
  onReload: () => void
}

/** 主窗口快捷键：只放菜单里没有的全局动作，网格方向/星级/旗标仍由 useShortcuts 处理 */
export function useGlobalKeys(options: Options): void {
  const latest = useRef(options)
  latest.current = options

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const current = latest.current
      if (!current.enabled || event.defaultPrevented) return
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return
      if (target?.isContentEditable) return
      const mod = event.ctrlKey || event.metaKey
      if (mod && event.key === '1') {
        event.preventDefault()
        current.onView('gallery')
        return
      }
      if (mod && event.key === '2') {
        event.preventDefault()
        current.onView('portrait')
        return
      }
      if (mod && event.key === '3') {
        event.preventDefault()
        current.onView('delivery')
        return
      }
      if (mod && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        current.onSearch()
        return
      }
      if (mod && event.key === ',') {
        event.preventDefault()
        current.onSettings()
        return
      }
      if (event.key === 'F11') {
        // 视图菜单删掉后，主窗口的全屏只能靠这个键；灯箱打开时本 hook 已禁用
        event.preventDefault()
        void window.api.setFullScreen()
        return
      }
      if (event.key === 'F5') {
        event.preventDefault()
        current.onReload()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
