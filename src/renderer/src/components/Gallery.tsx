import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from 'react'
import { Check, ImagePlus, Sparkles, TriangleAlert } from 'lucide-react'
import type { CrossLibraryHint, Item } from '@shared/types'
import { pickThumbQuality, type ThumbQuality, type ThumbQualityPref } from '@shared/thumbs'
import { RAW_EXT } from '@shared/formats'
import { scoreColor, thumbUrl } from '../lib/format'

const GAP = 10
const PAD = 14

interface GalleryProps {
  items: Item[]
  total: number
  selectedIds: number[]
  thumbSize: number
  /** 瀑布流缩略图清晰度：auto 按卡片实际像素选档，其余为强制锁定 */
  quality: ThumbQualityPref
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  focusId: number | null
  /** 递增时强制把焦点项重新滚进视野（比如从大图退出后） */
  focusTick: number
  expandedGroups: string[]
  hasFilter: boolean
  /** 当前库零结果时，其他库的命中概况 */
  otherHint: CrossLibraryHint | null
  onOpenOtherLibrary: () => void
  resetKey: string
  onSelect: (id: number, e: ReactMouseEvent) => void
  onOpen: (id: number) => void
  onContextMenu: (id: number, e: ReactMouseEvent) => void
  onExpandGroup: (key: string) => void
  onLoadMore: () => void
  onImportFiles: () => void
}

interface Box {
  x: number
  y: number
  w: number
  h: number
  /** 在原列表里的下标，可见区排序用 */
  index: number
}

/** 瀑布流布局缓存：只算新增项，换尺寸/宽度时整表重建 */
interface LayoutCache {
  key: string
  thumbSize: number
  width: number
  count: number
  firstId: number
  lastId: number
  boxes: Box[]
  /** 每列的盒子，按 y 递增，可见区二分用 */
  buckets: Box[][]
  heights: number[]
  columns: number
  totalHeight: number
}

const Card = memo(function Card({
  item,
  box,
  quality,
  selected,
  expanded,
  onSelect,
  onOpen,
  onContextMenu,
  onDragStart,
  onExpandGroup
}: {
  item: Item
  box: Box
  quality: ThumbQuality
  selected: boolean
  expanded: boolean
  onSelect: (id: number, e: ReactMouseEvent) => void
  onOpen: (id: number) => void
  onContextMenu: (id: number, e: ReactMouseEvent) => void
  onDragStart: (id: number, e: ReactDragEvent) => void
  onExpandGroup: (key: string) => void
}) {
  const src = thumbUrl(item.id, quality)
  // 切档时先预加载新图、加载完成再换 src，旧图一直留在屏幕上，不会闪白
  const [shown, setShown] = useState(src)
  useEffect(() => {
    if (src === shown) return
    let cancelled = false
    const loader = new Image()
    const commit = (): void => {
      if (!cancelled) setShown(src)
    }
    loader.onload = commit
    loader.onerror = commit
    loader.src = src
    return () => {
      cancelled = true
      loader.onload = null
      loader.onerror = null
      loader.src = ''
    }
  }, [src, shown])

  return (
    <div
      className={`card-thumb group ${selected ? 'selected' : ''}`}
      style={{
        position: 'absolute',
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        zIndex: selected ? 2 : 1
      }}
      data-gallery-id={item.id}
      draggable
      onDragStart={(e) => onDragStart(item.id, e)}
      onClick={(e) => onSelect(item.id, e)}
      onDoubleClick={() => onOpen(item.id)}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu(item.id, e)
      }}
    >
      {item.error ? (
        <div className="absolute inset-0 grid place-items-center bg-[var(--card)] px-2 text-center">
          <div>
            <TriangleAlert size={18} className="mx-auto text-[var(--danger-text)]" />
            <div className="mt-1 text-[10px] text-[var(--danger-text)]">无法读取</div>
            <div className="mt-0.5 text-[9.5px] text-[var(--faint)] truncate">{item.ext.replace('.', '').toUpperCase()}</div>
          </div>
        </div>
      ) : (
        <img
          src={shown}
          alt={item.name}
          loading="lazy"
          decoding="async"
          draggable={false}
          style={item.missing ? { opacity: 0.5, filter: 'grayscale(0.6)' } : undefined}
        />
      )}
      <div
        className="absolute inset-x-0 bottom-0 h-[42%] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        style={{ background: 'linear-gradient(to top, rgba(5,7,10,0.72), rgba(5,7,10,0))' }}
      />
      <div className="absolute bottom-1.5 left-2 right-2 text-[11px] text-white/90 truncate opacity-0 group-hover:opacity-100 pointer-events-none">
        {item.name}
      </div>
      {item.quality && (
        <span
          className="absolute top-1.5 left-2 px-1 rounded text-[10.5px] font-semibold tabular-nums"
          style={{ color: scoreColor(item.quality.overall), background: 'rgba(0,0,0,0.5)' }}
          title={`AI 评分 ${item.quality.overall}${item.quality.comment ? `：${item.quality.comment}` : ''}`}
        >
          {item.quality.overall}
        </span>
      )}
      {selected && (
        <span className="absolute right-1.5 top-1.5 z-10 grid h-[17px] w-[17px] place-items-center rounded-full bg-[var(--accent)] text-[var(--on-accent)] shadow">
          <Check size={11} strokeWidth={3} />
        </span>
      )}
      {item.flag !== 0 && (
        <span
          className="absolute top-1.5 text-[11px] font-semibold px-1 rounded"
          style={{
            right: selected ? 26 : 8,
            color: item.flag > 0 ? '#8be9a8' : '#ff9aa2',
            background: 'rgba(0,0,0,0.45)'
          }}
        >
          {item.flag > 0 ? '✓' : '✕'}
        </span>
      )}
      {item.rating > 0 && (
        <div
          className="absolute text-[10.5px] text-amber-300 drop-shadow"
          style={{ top: item.flag !== 0 ? 26 : 6, right: selected ? 26 : 8 }}
        >
          {'★'.repeat(item.rating)}
        </div>
      )}
      <div className="absolute bottom-1.5 right-2 flex items-center gap-1 pointer-events-none">
        {item.missing === 1 && (
          <span className="px-1 py-[1px] rounded bg-[#7a2b2f] text-[9px] tracking-wide text-[#ffd7da]">
            丢失
          </span>
        )}
        {item.groupCount > 1 && item.groupKey && (
          <button
            className="px-1 py-[1px] rounded bg-black/70 text-[9px] tracking-wide text-[#cfe0ff] hover:bg-black/90 pointer-events-auto"
            onClick={(e) => {
              e.stopPropagation()
              onExpandGroup(item.groupKey as string)
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            title={expanded ? '收起这一组' : '展开这一组'}
          >
            ×{item.groupCount} {expanded ? '收起' : '展开'}
          </button>
        )}
        {item.pairCount > 1 && (
          <span className="px-1 py-[1px] rounded bg-black/60 text-[9px] tracking-wide text-[#cfe0ff]">
            ＋{item.pairCount - 1}
          </span>
        )}
        {RAW_EXT.has(item.ext) && (
          <span className="px-1 py-[1px] rounded bg-black/55 text-[9px] tracking-wider text-white/75">
            RAW
          </span>
        )}
      </div>
    </div>
  )
})

export default function Gallery({
  items,
  total,
  selectedIds,
  thumbSize,
  quality,
  loading,
  loadingMore,
  hasMore,
  focusId,
  focusTick,
  expandedGroups,
  hasFilter,
  otherHint,
  onOpenOtherLibrary,
  resetKey,
  onSelect,
  onOpen,
  onContextMenu,
  onExpandGroup,
  onLoadMore,
  onImportFiles
}: GalleryProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [scrollTop, setScrollTop] = useState(0)

  // 一块缩略图要喂多少像素取决于屏幕密度，换显示器/改缩放时跟着重算
  const [dpr, setDpr] = useState(() => window.devicePixelRatio || 1)
  useEffect(() => {
    const update = (): void => setDpr(window.devicePixelRatio || 1)
    const query = window.matchMedia(`(resolution: ${dpr}dppx)`)
    query.addEventListener('change', update)
    // 有些环境（缩放、远程桌面）只发 resize 不发 media query 变化
    window.addEventListener('resize', update)
    return () => {
      query.removeEventListener('change', update)
      window.removeEventListener('resize', update)
    }
  }, [dpr])

  // 空状态时不会渲染滚动容器，因此有数据后需要重新绑定观察器
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = (): void => setViewport({ width: el.clientWidth, height: el.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [items.length])

  // 换筛选/排序/搜索时回到顶部，避免停在空白区
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.scrollTop = 0
    setScrollTop(0)
  }, [resetKey])

  const layoutRef = useRef<LayoutCache | null>(null)
  const rafRef = useRef(0)

  const { boxes, buckets, totalHeight } = useMemo(() => {
    const usable = Math.max(120, viewport.width - PAD * 2)
    const columns = Math.max(1, Math.floor((usable + GAP) / (thumbSize + GAP)))
    const colWidth = (usable - GAP * (columns - 1)) / columns
    const firstId = items[0]?.id ?? 0
    const lastId = items[items.length - 1]?.id ?? 0
    const key = `${thumbSize}|${viewport.width}|${items.length}|${firstId}|${lastId}|${resetKey}`
    const cache = layoutRef.current
    if (cache && cache.key === key) {
      return { boxes: cache.boxes, buckets: cache.buckets, totalHeight: cache.totalHeight }
    }

    // 只追加一页、尺寸没变时，从上次的列高继续算；换尺寸/宽度整表重建
    const canExtend =
      !!cache &&
      cache.thumbSize === thumbSize &&
      cache.width === viewport.width &&
      cache.columns === columns &&
      items.length >= cache.count &&
      cache.firstId === firstId &&
      (cache.count === 0 || items[cache.count - 1]?.id === cache.lastId)

    const nextBoxes = canExtend ? cache!.boxes.slice() : []
    const nextBuckets = canExtend
      ? cache!.buckets.map((list) => list.slice())
      : Array.from({ length: columns }, () => [] as Box[])
    const heights = canExtend ? cache!.heights.slice() : new Array<number>(columns).fill(0)

    for (let index = nextBoxes.length; index < items.length; index++) {
      const item = items[index]
      let target = 0
      for (let i = 1; i < columns; i++) if (heights[i] < heights[target]) target = i
      const rawRatio = item.width > 0 && item.height > 0 ? item.height / item.width : 1
      const ratio = Math.min(2.4, Math.max(0.4, rawRatio))
      const h = Math.round(colWidth * ratio)
      const box: Box = {
        x: PAD + target * (colWidth + GAP),
        y: heights[target],
        w: colWidth,
        h,
        index
      }
      nextBoxes.push(box)
      nextBuckets[target].push(box)
      heights[target] += h + GAP
    }

    const nextTotal = Math.max(0, ...heights)
    layoutRef.current = {
      key,
      thumbSize,
      width: viewport.width,
      count: items.length,
      firstId,
      lastId,
      boxes: nextBoxes,
      buckets: nextBuckets,
      heights,
      columns,
      totalHeight: nextTotal
    }
    return { boxes: nextBoxes, buckets: nextBuckets, totalHeight: nextTotal }
  }, [items, thumbSize, viewport.width, resetKey])

  const visible = useMemo(() => {
    // 过扫描只留半屏多点：700px 在 230px 卡片下会多渲染三四倍
    const top = scrollTop - 350
    const bottom = scrollTop + (viewport.height || 800) + 350
    const picked: Box[] = []
    for (const column of buckets) {
      // 每列按 y 递增，二分找第一个可能进入视口的盒子
      let low = 0
      let high = column.length
      while (low < high) {
        const mid = (low + high) >> 1
        if (column[mid].y + column[mid].h < top) low = mid + 1
        else high = mid
      }
      for (let i = low; i < column.length && column[i].y <= bottom; i++) {
        picked.push(column[i])
      }
    }
    picked.sort((a, b) => a.index - b.index)
    return picked.map((box) => ({ item: items[box.index], box }))
  }, [items, buckets, scrollTop, viewport.height])

  const onScroll = (): void => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      const el = containerRef.current
      if (!el) return
      setScrollTop(el.scrollTop)
      if (hasMore && !loadingMore && el.scrollTop + el.clientHeight > totalHeight - 700) {
        onLoadMore()
      }
    })
  }

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // 触底加载：用哨兵元素 + IntersectionObserver，后台窗口也可靠
  useEffect(() => {
    if (!hasMore || loadingMore) return
    const root = containerRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore()
      },
      { root, rootMargin: '600px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, onLoadMore, items.length])

  // 键盘 J/K 切换时把当前项滚进视野；从大图退出时靠 focusTick 强制重新定位
  // items/boxes 用 ref 读：换筛选或加载更多时不该把视图拽回焦点项
  const itemsRef = useRef(items)
  itemsRef.current = items
  const boxesRef = useRef(boxes)
  boxesRef.current = boxes
  useEffect(() => {
    if (!focusId) return
    const index = itemsRef.current.findIndex((i) => i.id === focusId)
    const box = boxesRef.current[index]
    const el = containerRef.current
    if (!box || !el) return
    const top = box.y
    const bottom = box.y + box.h
    if (top < el.scrollTop + 40 || bottom > el.scrollTop + el.clientHeight - 40) {
      el.scrollTo({ top: Math.max(0, top - el.clientHeight / 2 + box.h / 2), behavior: 'smooth' })
    }
  }, [focusId, focusTick])

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  /**
   * 自动档：按 contain 之后的真实显示尺寸 × 屏幕密度挑够用的档。
   * 竖构图的横向像素只有长边的 w/h，必须按显示后的长边算，不能只看卡片宽度。
   */
  const qualityFor = (item: Item, box: Box): ThumbQuality => {
    if (quality !== 'auto') return quality
    const ratio = item.width > 0 && item.height > 0 ? item.width / item.height : box.w / box.h
    const shownW = Math.min(box.w, box.h * ratio)
    const shownH = shownW / ratio
    return pickThumbQuality(Math.max(shownW, shownH) * dpr)
  }

  const handleDragStart = useCallback(
    (id: number, e: ReactDragEvent): void => {
      // Alt + 拖拽交给系统原生拖拽，可以直接拖进资源管理器或其它应用
      if (e.altKey) {
        e.preventDefault()
        window.api.startDrag(id)
        return
      }
      const ids = selectedSet.has(id) ? selectedIds : [id]
      e.dataTransfer.setData('application/x-imagenest-items', JSON.stringify(ids))
      e.dataTransfer.effectAllowed = 'copyMove'
    },
    [selectedSet, selectedIds]
  )

  if (items.length === 0 && !loading) {
    return (
      <div className="flex-1 grid place-items-center">
        <div className="text-center max-w-[360px]">
          <div className="mx-auto mb-4 w-12 h-12 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] grid place-items-center">
            {hasFilter ? (
              <Sparkles size={20} color="var(--muted)" />
            ) : (
              <ImagePlus size={20} color="var(--muted)" />
            )}
          </div>
          <div className="text-[14px] text-[var(--text)]">
            {hasFilter ? '没有符合筛选条件的图片' : '图库还是空的'}
          </div>
          <div className="text-[12px] text-[var(--muted)] mt-1.5 leading-5">
            {hasFilter ? '换个关键词，或清空筛选再找找看' : '把图片或文件夹拖进窗口，也可以点击下面的按钮'}
          </div>
          {hasFilter && otherHint && otherHint.total > 0 && (
            <button
              className="mt-3 text-[11.5px] text-[var(--accent-2)] hover:underline"
              onClick={onOpenOtherLibrary}
            >
              其他 {otherHint.libraries} 个库里可能还有 {otherHint.total} 条 →
            </button>
          )}
          {!hasFilter && (
            <button className="btn btn-primary mt-5" onClick={onImportFiles}>
              选择图片导入
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto relative" onScroll={onScroll}>
      <div style={{ height: totalHeight + PAD, position: 'relative' }}>
        {visible.map(({ item, box }) => (
          <Card
            key={item.id}
            item={item}
            box={box}
            quality={qualityFor(item, box)}
            selected={selectedSet.has(item.id)}
            expanded={!!item.groupKey && expandedGroups.includes(item.groupKey)}
            onSelect={onSelect}
            onOpen={onOpen}
            onContextMenu={onContextMenu}
            onDragStart={handleDragStart}
            onExpandGroup={onExpandGroup}
          />
        ))}
      </div>
      {(hasMore || loadingMore) && (
        <div className="py-6 text-center text-[11.5px] text-[var(--faint)]">
          {loadingMore ? '正在加载更多…' : `已加载 ${items.length} / ${total} 张，继续下滑加载`}
        </div>
      )}
      <div ref={sentinelRef} style={{ height: 1 }} />
    </div>
  )
}
