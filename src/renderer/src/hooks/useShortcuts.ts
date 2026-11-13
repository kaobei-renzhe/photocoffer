import { useEffect, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { AppUseCase } from '@shared/types'
import type { Direction } from '../lib/spatialNav'

export interface ShortcutOptions {
  portraitOpen: boolean
  pickDeliveryOpen: boolean
  library: string | null
  useCaseLoaded: boolean
  useCase: AppUseCase | null
  lightboxId: number | null
  activeId: number | null
  selectedIds: number[]
  setSelectedIds: Dispatch<SetStateAction<number[]>>
  setActiveId: Dispatch<SetStateAction<number | null>>
  /** 全选当前已加载的照片，返回选中数量 */
  selectAll: () => number
  openLightbox: (id: number) => void
  closeLightbox: () => void
  undoLast: () => Promise<void>
  deleteSelected: () => Promise<void>
  rateSelected: (rating: number) => Promise<void>
  setFlagSelected: (flag: number) => Promise<void>
  moveSelection: (delta: number) => void
  moveSelectionBy: (direction: Direction) => void
  notify: (text: string) => void
}

/**
 * 主图库的全局快捷键。
 * 用 ref 持有最新回调，键盘监听只注册一次，避免每次选中变化都重新绑定。
 */
export function useShortcuts(options: ShortcutOptions): void {
  const latest = useRef(options)
  latest.current = options

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const o = latest.current
      // 人像工作台 / 选片交付 / 首启弹窗有自己的一套交互，主图库不要再抢键
      if (o.portraitOpen || o.pickDeliveryOpen) return
      if (o.library && o.useCaseLoaded && o.useCase === null) return
      const el = document.activeElement as HTMLElement | null
      const typing =
        !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault()
        void o.undoLast()
        return
      }

      if (e.key === 'Escape') {
        if (o.lightboxId) o.closeLightbox()
        else if (o.activeId) o.setActiveId(null)
        else o.setSelectedIds([])
        return
      }
      // 灯箱打开时，键盘交给灯箱自己，别把后面的列表也动了
      if (o.lightboxId) return
      if (typing) return

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        // 只全选"当前已加载"的图片：不去主进程拉全库 id，避免一次选中上万张后再逐条发 IPC
        e.preventDefault()
        const count = o.selectAll()
        if (count > 0) o.notify(`已选中当前加载的 ${count} 张`)
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        const id = o.selectedIds[0] ?? o.activeId
        if (!id) return
        e.preventDefault()
        void window.api.copyImage(id).then((ok) => {
          o.notify(ok ? '已复制图片到剪贴板' : '复制失败，试试其它图片')
        })
        return
      }
      // macOS 键盘的主删除键是 Backspace，Windows 上不认它，免得误删
      const macDelete = e.key === 'Backspace' && window.env?.platform === 'darwin'
      if ((e.key === 'Delete' || macDelete) && (o.selectedIds.length || o.activeId)) {
        e.preventDefault()
        void o.deleteSelected()
        return
      }
      if (/^[0-5]$/.test(e.key) && (o.selectedIds.length || o.activeId)) {
        e.preventDefault()
        void o.rateSelected(Number(e.key))
        return
      }
      if ((e.key === 'p' || e.key === 'P') && (o.selectedIds.length || o.activeId)) {
        e.preventDefault()
        void o.setFlagSelected(1)
        return
      }
      if ((e.key === 'x' || e.key === 'X') && (o.selectedIds.length || o.activeId)) {
        e.preventDefault()
        void o.setFlagSelected(-1)
        return
      }
      if ((e.key === 'u' || e.key === 'U') && (o.selectedIds.length || o.activeId)) {
        e.preventDefault()
        void o.setFlagSelected(0)
        return
      }
      // 方向键按瀑布流实际位置走；j / k 仍保持顺序切换
      const arrow: Direction | null =
        e.key === 'ArrowLeft'
          ? 'left'
          : e.key === 'ArrowRight'
            ? 'right'
            : e.key === 'ArrowUp'
              ? 'up'
              : e.key === 'ArrowDown'
                ? 'down'
                : null
      if (arrow) {
        e.preventDefault()
        o.moveSelectionBy(arrow)
        return
      }
      if (e.key === 'j') {
        e.preventDefault()
        o.moveSelection(1)
        return
      }
      if (e.key === 'k') {
        e.preventDefault()
        o.moveSelection(-1)
        return
      }
      if (e.key === ' ' && o.activeId) {
        e.preventDefault()
        o.openLightbox(o.activeId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
