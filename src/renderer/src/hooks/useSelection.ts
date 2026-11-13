import { useCallback, useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { Item } from '@shared/types'
import { findRenderedNeighbor, type Direction } from '../lib/spatialNav'

export interface SelectionController {
  selectedIds: number[]
  activeId: number | null
  setSelectedIds: Dispatch<SetStateAction<number[]>>
  setActiveId: Dispatch<SetStateAction<number | null>>
  /** 全选当前已加载的照片，返回选中数量 */
  selectAll: () => number
  /** 顺序移动选中项 */
  moveSelection: (delta: number) => void
  /** 按瀑布流的真实位置移动：↑↓ 同列、←→ 跨列 */
  moveSelectionBy: (direction: Direction) => void
  /** 退出大图后把焦点交回图库 */
  restoreSelection: (id: number) => void
}

export function useSelection(itemsRef: MutableRefObject<Item[]>): SelectionController {
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)

  const selectAll = useCallback(() => {
    const loaded = itemsRef.current
    if (loaded.length === 0) return 0
    setSelectedIds(loaded.map((item) => item.id))
    return loaded.length
  }, [itemsRef])

  const moveSelection = useCallback(
    (delta: number) => {
      const list = itemsRef.current
      if (!list.length) return
      const index = activeId ? list.findIndex((i) => i.id === activeId) : -1
      const next = list[Math.min(list.length - 1, Math.max(0, index + delta))] ?? list[0]
      setActiveId(next.id)
      setSelectedIds([next.id])
    },
    [activeId, itemsRef]
  )

  const moveSelectionBy = useCallback(
    (direction: Direction) => {
      const list = itemsRef.current
      const currentId = activeId ?? selectedIds[0]
      if (!list.length || !currentId) return
      const neighbor = findRenderedNeighbor(currentId, direction)
      const index = neighbor === null ? -1 : list.findIndex((item) => item.id === neighbor)
      if (index >= 0) {
        setActiveId(list[index].id)
        setSelectedIds([list[index].id])
        return
      }
      moveSelection(direction === 'up' || direction === 'left' ? -1 : 1)
    },
    [activeId, selectedIds, moveSelection, itemsRef]
  )

  const restoreSelection = useCallback((id: number) => {
    setActiveId(id)
    setSelectedIds([id])
  }, [])

  return {
    selectedIds,
    activeId,
    setSelectedIds,
    setActiveId,
    selectAll,
    moveSelection,
    moveSelectionBy,
    restoreSelection
  }
}
