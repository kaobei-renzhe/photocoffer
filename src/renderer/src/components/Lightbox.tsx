import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Info,
  Maximize,
  Minimize,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  X
} from 'lucide-react'
import type { Folder, Item, NoteRegion, NoteThread, PhotoNote, Tag } from '@shared/types'
import { photoUrl } from '../lib/format'
import PhotoInspector, {
  type InspectorTab,
  type InspectorTabRequest
} from './inspector/PhotoInspector'
import type { PushUndo } from './inspector/ui'
import { inAiScope, outOfScopeText, type AiScope } from '../lib/aiScope'
import { isChromeVisible } from '../lib/chromeVisibility'

interface LightboxProps {
  items: Item[]
  index: number
  onClose: () => void
  onNavigate: (index: number) => void
  tags: Tag[]
  folders: Folder[]
  onRefresh: () => void
  onPushUndo: PushUndo
  /** 右键：先在 App 里选中这张，再在鼠标位置弹菜单 */
  onContextMenu: (id: number, x: number, y: number) => void
  aiReady: boolean
  canAsk: boolean
  /** AI 处理范围：超出范围的单张不显示 AI 操作 */
  aiScope: AiScope | null
}

/** 适应窗口时四周留出的边距 */
const FIT_PADDING = 48
/** 相对原图的最大放大倍率（按屏幕物理像素算，8 倍已经能看清单个像素） */
const MAX_ZOOM = 8
const MIN_ZOOM = 0.02

export default function Lightbox({
  items,
  index,
  onClose,
  onNavigate,
  tags,
  folders,
  onRefresh,
  onPushUndo,
  onContextMenu,
  aiReady,
  canAsk,
  aiScope
}: LightboxProps) {
  const item = items[index]
  const itemId = item?.id ?? 0

  // 预加载前后各一张，翻页时少一次空白
  useEffect(() => {
    const neighbours = [items[index - 1], items[index + 1]].filter(Boolean)
    const loaders = neighbours.map((entry) => {
      const image = new Image()
      image.src = photoUrl(entry.id)
      return image
    })
    return () => {
      for (const image of loaders) image.src = ''
    }
  }, [items, index])
  // 超出 AI 处理范围时，研读里的 AI 入口一并隐藏
  const scopeBlocked = Boolean(item && aiScope && !inAiScope(item, aiScope))
  const scopeHint = scopeBlocked && item && aiScope ? outOfScopeText(item, aiScope) : ''
  const stageRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ w: 0, h: 0 })
  const [natural, setNatural] = useState({ w: 0, h: 0 })
  const [inspectorOpen, setInspectorOpen] = useState(false)
  /** 档案当前停在哪个 Tab（由 PhotoInspector 回报，F 键据此判断能不能框） */
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('info')
  const [tabRequest, setTabRequest] = useState<InspectorTabRequest | null>(null)
  const tabTokenRef = useRef(0)
  /** 点了图上的框 → 让研读 Tab 定位到那条线程 */
  const [focusThreadId, setFocusThreadId] = useState<number | null>(null)
  /** 研读笔记：圈选框要画在图上，所以由灯箱自己持有，不依赖侧栏是否展开 */
  const [threads, setThreads] = useState<NoteThread[]>([])
  /** null 表示「适应窗口」，数字表示手动缩放后的比例 */
  const [manualZoom, setManualZoom] = useState<number | null>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  /** 查看时的旋转角度（顺时针），不改文件也不写库 */
  const [rotation, setRotation] = useState(0)
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(
    null
  )
  const imageRef = useRef<HTMLImageElement>(null)
  /** 框选模式：开着的时候拖画面是画框，不是平移 */
  const [drawing, setDrawing] = useState(false)
  /** 已框好、还没落库的区域；保存笔记后清空，避免和已存笔记的框重叠 */
  const [region, setRegion] = useState<NoteRegion | null>(null)
  /** 拖拽中的临时框；ref 给指针事件读最新值，state 只负责渲染 */
  const [draft, setDraft] = useState<NoteRegion | null>(null)
  const draftRef = useRef<NoteRegion | null>(null)
  const drawStartRef = useRef<{ x: number; y: number } | null>(null)
  const [hint, setHint] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)
  /** 全屏状态：Esc 先退全屏再关灯箱 */
  const [fullscreen, setFullscreen] = useState(false)
  /** 幻灯片是否在放；间隔只有 3 秒 / 5 秒两档 */
  const [slideshow, setSlideshow] = useState(false)
  const [slideDelay, setSlideDelay] = useState<3000 | 5000>(3000)
  /** 任何键鼠操作都让计时重新开始 */
  const [slideTick, setSlideTick] = useState(0)
  /** 沉浸（Tab）/ 幻灯片静止 / 指针唤回带：三个状态源各自只有一个写入者 */
  const [immersive, setImmersive] = useState(false)
  const [slideIdle, setSlideIdle] = useState(false)
  const [peekY, setPeekY] = useState<number | null>(null)
  const lastUserInputRef = useRef(Date.now())
  /** 只有本灯箱自己进的全屏才负责退出，别动用户原本就有的全屏 */
  const ownFullscreenRef = useRef(false)
  const peekBand = peekY !== null && (peekY < 68 || peekY > window.innerHeight - 68)
  const chromeVisible = isChromeVisible({ immersive, peekBand, slideIdle })
  const chromeCls =
    immersive || slideIdle
      ? `transition-opacity ${slideIdle ? 'duration-[60ms]' : 'duration-200'} ${
          chromeVisible ? 'opacity-100' : 'opacity-0'
        }`
      : 'opacity-100'

  /** 旋转 90/270 度后，图像的横向和纵向尺寸互换 */
  const upright = rotation % 180 === 0
  const shownW = upright ? natural.w : natural.h
  const shownH = upright ? natural.h : natural.w

  /**
   * 比例 = 一个图像像素对应多少 CSS 像素。
   * 适应窗口时不让小图被放大糊掉，所以上限压到 1。
   */
  const fitScale = useMemo(() => {
    if (!shownW || !viewport.w) return 0
    const raw = Math.min((viewport.w - FIT_PADDING) / shownW, (viewport.h - FIT_PADDING) / shownH)
    return Math.min(1, Math.max(MIN_ZOOM, raw))
  }, [shownW, shownH, viewport.w, viewport.h])

  /** 手动缩放允许小于「适应窗口」，方便整图缩小对比；下限仍是 MIN_ZOOM */
  const zoom = manualZoom === null ? fitScale : Math.max(MIN_ZOOM, manualZoom)
  /**
   * 屏幕缩放比；100% 指 1 个图像像素铺满 1 个物理像素，高分屏上才不会看着发虚。
   * 拖到另一块不同缩放的显示器时要跟着更新。
   */
  const [dpr, setDpr] = useState(() => window.devicePixelRatio || 1)
  const maxZoom = MAX_ZOOM / dpr

  useEffect(() => {
    const query = window.matchMedia(`(resolution: ${dpr}dppx)`)
    const onChange = (): void => setDpr(window.devicePixelRatio || 1)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [dpr])

  useEffect(() => {
    void window.api.isFullScreen().then((value) => {
      setFullscreen(value)
      // 用户本来就开着全屏时，关灯箱不该顺手把人家的全屏退掉
      ownFullscreenRef.current = false
    })
  }, [])

  const toggleFullscreen = useCallback(async (): Promise<void> => {
    const next = await window.api.setFullScreen()
    ownFullscreenRef.current = next
    setFullscreen(next)
  }, [])

  const exitFullscreen = useCallback(async (): Promise<void> => {
    ownFullscreenRef.current = false
    setFullscreen(await window.api.setFullScreen(false))
  }, [])

  useEffect(() => {
    return () => {
      if (!ownFullscreenRef.current) return
      ownFullscreenRef.current = false
      void window.api.setFullScreen(false)
    }
  }, [])

  // 幻灯片：到末张就停住，别在最后一张上反复空转
  useEffect(() => {
    if (!slideshow) return
    if (index >= items.length - 1) {
      setSlideshow(false)
      setHint('已经是最后一张')
      return
    }
    const timer = setTimeout(() => onNavigate(index + 1), slideDelay)
    return () => clearTimeout(timer)
  }, [slideshow, slideDelay, slideTick, index, items.length, onNavigate])

  // 任何键鼠操作都把计时器拨回起点（键盘在 onKey 里处理，这里管指针与滚轮）
  useEffect(() => {
    if (!slideshow) {
      setSlideIdle(false)
      return
    }
    const bump = (): void => {
      lastUserInputRef.current = Date.now()
      setSlideIdle(false)
      setSlideTick((value) => value + 1)
    }
    window.addEventListener('pointerdown', bump, true)
    window.addEventListener('wheel', bump, true)
    return () => {
      window.removeEventListener('pointerdown', bump, true)
      window.removeEventListener('wheel', bump, true)
    }
  }, [slideshow])

  // 幻灯片静止：唯一允许的 idle 判定；自动翻页不更新 lastUserInputRef
  useEffect(() => {
    if (!slideshow) {
      setSlideIdle(false)
      return
    }
    const timer = window.setInterval(() => {
      const quiet = Date.now() - lastUserInputRef.current > 3000
      setSlideIdle(quiet && !drawing && !helpOpen && !immersive)
    }, 500)
    return () => window.clearInterval(timer)
  }, [slideshow, drawing, helpOpen, immersive])

  // 沉浸态：只在 window 上听一次 pointermove，passive
  useEffect(() => {
    if (!immersive) {
      setPeekY(null)
      return
    }
    const onMove = (event: PointerEvent): void => setPeekY(event.clientY)
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [immersive])

  // 关闭查看器时重置沉浸，避免用户忘了自己按过 Tab
  useEffect(() => () => setImmersive(false), [])

  const clampPan = useCallback(
    (next: { x: number; y: number }, scale: number) => {
      const maxX = Math.max(0, (shownW * scale - viewport.w) / 2)
      const maxY = Math.max(0, (shownH * scale - viewport.h) / 2)
      return {
        x: Math.min(maxX, Math.max(-maxX, next.x)),
        y: Math.min(maxY, Math.max(-maxY, next.y))
      }
    },
    [shownW, shownH, viewport.w, viewport.h]
  )

  // 滚轮监听挂在原生事件上，需要随时读到最新的 zoom / pan
  const liveRef = useRef({ zoom, pan })
  liveRef.current = { zoom, pan }

  /** 以光标位置为锚点缩放：锚点下方的画面对应同一个图像像素 */
  const zoomAt = useCallback(
    (target: number, clientX: number, clientY: number) => {
      const stage = stageRef.current
      if (!stage || !natural.w) return
      const rect = stage.getBoundingClientRect()
      const { zoom: prev, pan: prevPan } = liveRef.current
      if (prev <= 0) return
      const next = Math.min(maxZoom, Math.max(MIN_ZOOM, target))
      if (Math.abs(next - prev) < 1e-4) return
      const mx = clientX - rect.left - rect.width / 2
      const my = clientY - rect.top - rect.height / 2
      const ix = (mx - prevPan.x) / prev
      const iy = (my - prevPan.y) / prev
      const nextPan = clampPan({ x: mx - ix * next, y: my - iy * next }, next)
      // 立刻同步到 liveRef：同一帧内的连续滚轮事件不会被 React 的批量渲染拖慢
      liveRef.current = { zoom: next, pan: nextPan }
      setManualZoom(next)
      setPan(nextPan)
    },
    [clampPan, maxZoom, natural.w]
  )

  const zoomCenter = useCallback(
    (target: number) => {
      const stage = stageRef.current
      if (!stage) return
      const rect = stage.getBoundingClientRect()
      zoomAt(target, rect.left + rect.width / 2, rect.top + rect.height / 2)
    },
    [zoomAt]
  )

  const zoomStep = useCallback(
    (factor: number) => zoomCenter(liveRef.current.zoom * factor),
    [zoomCenter]
  )

  const resetFit = useCallback(() => {
    setManualZoom(null)
    setPan({ x: 0, y: 0 })
  }, [])

  /** 旋转 90 度（delta 为负则逆时针）；旋转后先回正位置，避免照片飘出画面 */
  const rotateBy = useCallback((delta: number) => {
    setRotation((prev) => (prev + delta + 360) % 360)
    setPan({ x: 0, y: 0 })
    // 转起来以后坐标系跟着转，没画完的框直接作废，别留一个歪的
    drawStartRef.current = null
    draftRef.current = null
    setDraft(null)
    setDrawing(false)
  }, [])

  /**
   * 开关框选。旋转后照片的包围盒和画面不一致，硬算旋转矩阵容易出玄学，
   * 所以文档里的做法：转正了才让框。
   */
  const changeDrawing = useCallback(
    (next: boolean) => {
      if (next && rotation !== 0) {
        setHint('画面转着不好框，先按 Shift+R 转正')
        return
      }
      if (!next) {
        drawStartRef.current = null
        draftRef.current = null
        setDraft(null)
      }
      setDrawing(next)
    },
    [rotation]
  )

  useEffect(() => {
    if (!hint) return
    const timer = setTimeout(() => setHint(''), 2800)
    return () => clearTimeout(timer)
  }, [hint])

  /** 展开档案并落到指定 Tab；token 递增，PhotoInspector 收到后切一次 */
  const openInspector = useCallback((tab: InspectorTab) => {
    tabTokenRef.current += 1
    setTabRequest({ tab, token: tabTokenRef.current })
    setInspectorOpen(true)
  }, [])

  /** 点图上的框：展开档案 → 研读 → 滚到那条线程 */
  const focusThread = useCallback(
    (rootId: number) => {
      openInspector('study')
      setFocusThreadId(rootId)
    },
    [openInspector]
  )

  // 舞台尺寸（窗口缩放时要重算适应比例）
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const sync = (): void => setViewport({ w: stage.clientWidth, h: stage.clientHeight })
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  // 滚轮缩放：React 的 onWheel 是 passive 的，拦不住页面滚动，这里用原生监听
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const onWheel = (event: WheelEvent): void => {
      if (!natural.w) return
      event.preventDefault()
      const factor = Math.exp(-event.deltaY * 0.0016)
      zoomAt(liveRef.current.zoom * factor, event.clientX, event.clientY)
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [natural.w, zoomAt])

  // 切换照片时回到「适应窗口」，并且清掉上一张的旋转与框选
  useEffect(() => {
    setManualZoom(null)
    setPan({ x: 0, y: 0 })
    setRotation(0)
    setDrawing(false)
    setRegion(null)
    setDraft(null)
    draftRef.current = null
    drawStartRef.current = null
    setFocusThreadId(null)
    setHint('')
  }, [item?.id])

  // 圈选框来自笔记本身：侧栏没开也要能画出来，所以灯箱自己读一份
  useEffect(() => {
    if (!itemId) {
      setThreads([])
      return
    }
    let cancelled = false
    void window.api.notes
      .list(itemId)
      .then((list) => {
        if (!cancelled) setThreads(list)
      })
      .catch(() => {
        if (!cancelled) setThreads([])
      })
    return () => {
      cancelled = true
    }
  }, [itemId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // 内层（输入框、弹窗）已经处理掉的键不要再抢
      if (e.defaultPrevented) return
      // 任何按键都算一次操作，把幻灯片的计时拨回起点
      lastUserInputRef.current = Date.now()
      setSlideIdle(false)
      if (slideshow) setSlideTick((value) => value + 1)
      const target = e.target as HTMLElement | null
      const typing =
        !!target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)

      if (e.key === 'Escape') {
        if (typing) {
          // 正在写笔记时 Esc 只退出输入，别把整个灯箱关掉
          e.preventDefault()
          e.stopPropagation()
          target.blur()
          return
        }
        // 先退全屏，再按一次才关灯箱
        if (immersive) {
          e.preventDefault()
          e.stopPropagation()
          setImmersive(false)
          return
        }
        if (fullscreen) {
          e.preventDefault()
          e.stopPropagation()
          void exitFullscreen()
          return
        }
        if (drawing) {
          e.preventDefault()
          e.stopPropagation()
          changeDrawing(false)
          return
        }
        if (inspectorOpen) {
          e.preventDefault()
          e.stopPropagation()
          setInspectorOpen(false)
          return
        }
        // 剩下交给外层：关闭灯箱
        return
      }
      if (typing) return

      if (e.key === '`') {
        e.preventDefault()
        setImmersive((value) => !value)
        return
      }
      if (e.key === '?') {
        e.preventDefault()
        setHelpOpen((value) => !value)
        return
      }
      if (e.key === 'F11') {
        e.preventDefault()
        void toggleFullscreen()
        return
      }
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault()
        setSlideshow((value) => !value)
        return
      }
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        if (inspectorOpen) setInspectorOpen(false)
        else openInspector('study')
        return
      }
      if (e.key === 'f' || e.key === 'F') {
        // 框选只对研读有意义：侧栏展开且停在研读 Tab
        if (!inspectorOpen || inspectorTab !== 'study') return
        e.preventDefault()
        changeDrawing(!drawing)
        return
      }
      // 灯箱只认左右键：按当前顺序翻页；J/K 是别名
      if (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J') {
        e.preventDefault()
        if (index > 0) onNavigate(index - 1)
        return
      }
      if (e.key === 'ArrowRight' || e.key === 'k' || e.key === 'K') {
        e.preventDefault()
        if (index < items.length - 1) onNavigate(index + 1)
        return
      }
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        rotateBy(e.shiftKey ? -90 : 90)
        return
      }
      if (e.key === '+' || e.key === '=') {
        zoomStep(1.25)
        return
      }
      if (e.key === '-' || e.key === '_') {
        zoomStep(1 / 1.25)
        return
      }
      if (e.key === '0') resetFit()
    }
    // 捕获阶段先拿到键：Esc 取消框选/关侧栏要在「关闭灯箱」之前处理
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [
    changeDrawing,
    drawing,
    exitFullscreen,
    fullscreen,
    index,
    inspectorOpen,
    inspectorTab,
    immersive,
    items.length,
    onNavigate,
    openInspector,
    resetFit,
    rotateBy,
    slideshow,
    toggleFullscreen,
    zoomStep
  ])

  if (!item) return null

  const ready = natural.w > 0 && zoom > 0
  const canPan = zoom > fitScale + 1e-4
  const percent = ready ? `${Math.round(zoom * dpr * 100)}%` : '—'
  /**
   * 显示尺寸与偏移都对齐到「整物理像素」：
   * CSS 像素宽度取整会在 1.75 倍屏上变成 2999.5 物理像素，浏览器就会把图整体重采样一遍，
   * 100% 查看时反而变糊；这里换算成整数物理像素再折回 CSS。
   */
  const snap = (value: number): number => Math.round(value * dpr) / dpr
  /** 旋转后要占的画面尺寸 */
  const displayW = ready ? Math.round(shownW * zoom * dpr) / dpr : 0
  const displayH = ready ? Math.round(shownH * zoom * dpr) / dpr : 0
  /** 照片自身的布局尺寸（旋转前），90/270 度时与 displayW/H 互换 */
  const layerW = ready ? Math.round(natural.w * zoom * dpr) / dpr : 0
  const layerH = ready ? Math.round(natural.h * zoom * dpr) / dpr : 0
  const layerLeft = snap((displayW - layerW) / 2)
  const layerTop = snap((displayH - layerH) / 2)
  const offsetX = ready ? snap((viewport.w - displayW) / 2 + pan.x) : 0
  const offsetY = ready ? snap((viewport.h - displayH) / 2 + pan.y) : 0

  const onDoubleClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    // 双击左右箭头是"翻页"，不该被当成缩放开关；框选时也别乱缩放
    if (drawing) return
    if ((event.target as HTMLElement).closest('button')) return
    if (manualZoom === null) zoomAt(1 / dpr, event.clientX, event.clientY)
    else resetFit()
  }

  /** 屏幕坐标 → 照片内的归一化坐标；只取照片实际显示的那块（旋转时禁用框选） */
  const pointInImage = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const rect = imageRef.current?.getBoundingClientRect()
    if (!rect || !rect.width || !rect.height) return null
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
    }
  }

  const pushDraft = (start: { x: number; y: number }, end: { x: number; y: number }): void => {
    const next = {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      w: Math.abs(end.x - start.x),
      h: Math.abs(end.y - start.y)
    }
    draftRef.current = next
    setDraft(next)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    if (drawing) {
      const start = pointInImage(event.clientX, event.clientY)
      if (!start) return
      drawStartRef.current = start
      pushDraft(start, start)
      // 拖到画面外也要继续收事件，否则框会断在半路
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
      moved: false
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const start = drawStartRef.current
    if (start) {
      const end = pointInImage(event.clientX, event.clientY)
      if (end) pushDraft(start, end)
      return
    }
    const drag = dragRef.current
    if (!drag) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    // 超过阈值才算拖动，否则留给「点空白关闭」
    if (!drag.moved && Math.hypot(dx, dy) > 4) {
      drag.moved = true
      setDragging(true)
    }
    if (!drag.moved) return
    setPan(clampPan({ x: drag.panX + dx, y: drag.panY + dy }, zoom))
  }

  /** 画框收尾：太小算误触；成功就留作待提交区域并退出框选 */
  const finishDraw = (): void => {
    drawStartRef.current = null
    const rect = draftRef.current
    draftRef.current = null
    setDraft(null)
    if (!rect) return
    if (rect.w < 0.02 || rect.h < 0.02) {
      setHint('框太小了，拖大一点再松手')
      return
    }
    setRegion(rect)
    setDrawing(false)
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (drawStartRef.current) {
      finishDraw()
      return
    }
    const drag = dragRef.current
    dragRef.current = null
    setDragging(false)
    if (drag && !drag.moved && event.target === event.currentTarget) onClose()
  }

  /** 指针被系统打断（比如切窗口）时，框到一半的作废，别留个半截框 */
  const cancelDrag = (): void => {
    drawStartRef.current = null
    draftRef.current = null
    setDraft(null)
    dragRef.current = null
    setDragging(false)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="照片查看器"
      className="fixed inset-0 z-50 overflow-hidden bg-[var(--lightbox)]"
    >
      <div
        className={`absolute left-1/2 top-2 z-20 flex h-11 -translate-x-1/2 items-center gap-3 rounded-full border border-[var(--lb-rule)] bg-[var(--lb-chrome)] px-4 text-[13.5px] backdrop-blur-[18px] ${chromeCls}`}
        style={{ width: 620, maxWidth: '62%', left: inspectorOpen ? 'calc(50% - 160px)' : '50%' }}
        inert={!chromeVisible}
        aria-hidden={!chromeVisible}
      >
        <span className="truncate text-[15px] font-bold text-[var(--lb-text)]">{item.name}</span>
        <span className="min-w-[62px] shrink-0 text-[12px] tabular-nums text-[var(--lb-faint)]">
          {index + 1} / {items.length}
        </span>
        <button
          className="ml-auto grid h-7 w-7 place-items-center rounded-full text-[var(--lb-faint)] hover:bg-[var(--lb-hover)] hover:text-[var(--lb-text)]"
          onClick={() => setHelpOpen((open) => !open)}
          title="快捷键"
          aria-label="快捷键"
        >
          <CircleHelp size={16} strokeWidth={1.75} />
        </button>
        <button
          className={`inline-flex h-7 items-center gap-1 rounded-full px-2 text-[12px] ${
            inspectorOpen
              ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]'
              : 'text-[var(--lb-faint)] hover:bg-[var(--lb-hover)] hover:text-[var(--lb-text)]'
          }`}
          onClick={() => setInspectorOpen((open) => !open)}
          title="照片档案"
        >
          <Info size={16} strokeWidth={1.75} /> 档案
        </button>
        <button
          className="grid h-7 w-7 place-items-center rounded-full text-[var(--lb-faint)] hover:bg-[var(--lb-hover)] hover:text-[var(--lb-text)]"
          onClick={onClose}
          title="关闭 (Esc)"
          aria-label="关闭"
          autoFocus
        >
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>

      {helpOpen && (
        <div
          className="absolute right-4 top-16 z-30 w-[240px] rounded-2xl border border-[var(--lb-rule)] bg-[var(--lb-chrome)] p-3 text-[12px] shadow-xl backdrop-blur-[18px]"
          onMouseLeave={() => setHelpOpen(false)}
        >
          {[
            ['滚轮', '缩放'],
            ['双击', '100%'],
            ['0', '适应窗口'],
            ['R / Shift+R', '旋转'],
            ['← →', '上一张 / 下一张'],
            ['S', '幻灯片'],
            ['F11', '全屏'],
            ['`', '沉浸模式'],
            ['?', '快捷键'],
            ['N', '档案面板'],
            ['F', '框选'],
            ['Esc', '关闭']
          ].map(([key, value]) => (
            <div key={key} className="flex justify-between py-[3px]">
              <span className="text-[var(--lb-faint)]">{key}</span>
              <span className="text-[var(--lb-text)]">{value}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex h-full min-h-0">
        <div
          ref={stageRef}
          className="relative min-h-0 flex-1 overflow-hidden select-none"
          style={{
            cursor: drawing ? 'crosshair' : dragging ? 'grabbing' : canPan ? 'grab' : 'default'
          }}
          onDoubleClick={onDoubleClick}
          onContextMenu={(event) => {
            event.preventDefault()
            // 框选时右键可能是想取消，不弹菜单
            if (drawing) return
            onContextMenu(item.id, event.clientX, event.clientY)
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={cancelDrag}
        >
        {/* 照片按目标物理像素尺寸渲染，浏览器按这个尺寸重新采样，放大时才不糊；
            旋转放在内层照片上，外层盒子用旋转后的尺寸参与居中与平移 */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute left-0 top-0"
            style={
              ready
                ? {
                    width: `${displayW}px`,
                    height: `${displayH}px`,
                    transform: `translate3d(${offsetX}px, ${offsetY}px, 0)`
                  }
                : { width: '100%', height: '100%' }
            }
          >
            <img
              ref={imageRef}
              src={photoUrl(item.id)}
              alt={item.name}
              draggable={false}
              onLoad={(event) => {
                const img = event.currentTarget
                setNatural({ w: img.naturalWidth, h: img.naturalHeight })
              }}
              className="absolute select-none pointer-events-auto"
              style={
                ready
                  ? {
                      left: `${layerLeft}px`,
                      top: `${layerTop}px`,
                      width: `${layerW}px`,
                      height: `${layerH}px`,
                      maxWidth: 'none',
                      maxHeight: 'none',
                      transform: `rotate(${rotation}deg)`
                    }
                  : {
                      maxWidth: '100%',
                      maxHeight: '100%',
                      left: '50%',
                      top: '50%',
                      transform: 'translate(-50%, -50%)'
                    }
              }
            />
            {ready && (
              <RegionLayer
                threads={threads}
                selection={region}
                draft={draft}
                left={layerLeft}
                top={layerTop}
                width={layerW}
                height={layerH}
                rotation={rotation}
                drawing={drawing}
                onFocus={focusThread}
              />
            )}
          </div>
        </div>

        {index > 0 && (
          <button
            className={`absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/8 hover:bg-white/16 grid place-items-center text-white/80 transition-opacity duration-200 ${
              chromeVisible ? 'opacity-40 hover:opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            onClick={() => onNavigate(index - 1)}
            title="上一张"
            aria-label="上一张"
            tabIndex={chromeVisible ? 0 : -1}
            aria-hidden={!chromeVisible}
          >
            <ChevronLeft size={24} strokeWidth={1.5} />
          </button>
        )}
        {index < items.length - 1 && (
          <button
            className={`absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/8 hover:bg-white/16 grid place-items-center text-white/80 transition-opacity duration-200 ${
              chromeVisible ? 'opacity-40 hover:opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            onClick={() => onNavigate(index + 1)}
            title="下一张"
            aria-label="下一张"
            tabIndex={chromeVisible ? 0 : -1}
            aria-hidden={!chromeVisible}
          >
            <ChevronRight size={24} strokeWidth={1.5} />
          </button>
        )}

        {(drawing || hint) && (
          <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-[12px] text-white/85">
            {/* 提示优先：框太小时框选模式还开着，别把提示盖掉 */}
            {hint || '在画面上拖拽，框出一块区域'}
          </div>
        )}
        </div>

        {inspectorOpen && (
          <aside className="flex min-h-0 w-[320px] shrink-0 flex-col border-l border-white/10 bg-[var(--panel)]">
            <PhotoInspector
              item={item}
              host="lightbox"
              compact
              showPreview={false}
              tabRequest={tabRequest ?? undefined}
              onTabChange={setInspectorTab}
              info={{ tags, folders, onRefresh, onPushUndo }}
              facet={{ onChanged: onRefresh }}
              study={{
                aiReady,
                canAsk: canAsk && !scopeBlocked,
                scopeBlocked,
                scopeHint,
                onNotesChange: setThreads,
                region,
                drawing,
                onRegionChange: setRegion,
                onDrawingChange: changeDrawing,
                focusThreadId,
                onThreadFocused: () => setFocusThreadId(null)
              }}
            />
          </aside>
        )}
      </div>

      <div
        className={`absolute bottom-3 left-4 z-20 flex h-11 items-center gap-3 rounded-full border border-[var(--lb-rule)] bg-[var(--lb-chrome)] px-4 text-[12px] text-[var(--lb-faint)] backdrop-blur-[18px] ${chromeCls}`}
        inert={!chromeVisible}
        aria-hidden={!chromeVisible}
      >
        <span className="inline-block w-[40px] tabular-nums">{item.exif?.aperture ?? 'f/—'}</span>
        <span className="inline-block w-[56px] tabular-nums">{item.exif?.shutter ?? '—'}</span>
        <span className="inline-block w-[56px] tabular-nums">
          {item.exif?.iso ? `ISO ${item.exif.iso}` : 'ISO —'}
        </span>
        {!inspectorOpen && (
          <>
            <span className="h-4 w-px bg-[var(--lb-rule)]" />
            <span className="w-[240px] shrink-0 truncate text-[11px]">
              {[item.exif?.camera, item.exif?.lens].filter(Boolean).join(' · ') || '没有器材信息'}
            </span>
          </>
        )}
      </div>

      <div
        className={`absolute bottom-3 z-20 flex h-11 items-center gap-1 rounded-full border border-[var(--lb-rule)] bg-[var(--lb-chrome)] px-2 text-[12px] text-[var(--lb-faint)] backdrop-blur-[18px] ${
          inspectorOpen ? 'right-[336px]' : 'right-4'
        } ${chromeCls}`}
        inert={!chromeVisible}
        aria-hidden={!chromeVisible}
      >
        <button
          className={`grid h-7 w-7 place-items-center rounded-full hover:bg-[var(--lb-hover)] ${
            slideshow ? 'text-[var(--accent-2)]' : 'text-[var(--lb-faint)] hover:text-[var(--lb-text)]'
          }`}
          onClick={() => setSlideshow((value) => !value)}
          title="幻灯片 (S)"
          aria-label={slideshow ? '暂停幻灯片' : '播放幻灯片'}
        >
          {slideshow ? <Pause size={16} strokeWidth={1.75} /> : <Play size={16} strokeWidth={1.75} />}
        </button>
        <button
          className={`h-7 rounded-full px-1.5 tabular-nums hover:bg-[var(--lb-hover)] ${
            slideshow ? 'text-[var(--lb-text)]' : 'text-[var(--lb-faint)]'
          }`}
          onClick={() => setSlideDelay((value) => (value === 3000 ? 5000 : 3000))}
          title="切换幻灯片间隔"
        >
          {slideDelay / 1000} 秒
        </button>
        <button
          className="grid h-7 w-7 place-items-center rounded-full text-[var(--lb-faint)] hover:bg-[var(--lb-hover)] hover:text-[var(--lb-text)]"
          onClick={() => void toggleFullscreen()}
          title="全屏 (F11)"
          aria-label={fullscreen ? '退出全屏' : '全屏'}
        >
          {fullscreen ? <Minimize size={16} strokeWidth={1.75} /> : <Maximize size={16} strokeWidth={1.75} />}
        </button>
        <span className="mx-1 h-4 w-px bg-[var(--lb-rule)]" />
        <button
          className="grid h-7 w-7 place-items-center rounded-full text-[var(--lb-faint)] hover:bg-[var(--lb-hover)] hover:text-[var(--lb-text)]"
          onClick={() => rotateBy(-90)}
          title="向左旋转 (Shift+R)"
          aria-label="向左旋转"
        >
          <RotateCcw size={16} strokeWidth={1.75} />
        </button>
        <button
          className="grid h-7 w-7 place-items-center rounded-full text-[var(--lb-faint)] hover:bg-[var(--lb-hover)] hover:text-[var(--lb-text)]"
          onClick={() => rotateBy(90)}
          title="向右旋转 (R)"
          aria-label="向右旋转"
        >
          <RotateCw size={16} strokeWidth={1.75} />
        </button>
        <span className="w-[34px] text-center tabular-nums text-[var(--lb-faint)]">{rotation}°</span>
        <button
          className="grid h-7 w-7 place-items-center rounded-full text-[var(--lb-faint)] hover:bg-[var(--lb-hover)] hover:text-[var(--lb-text)]"
          onClick={() => zoomStep(1 / 1.25)}
          title="缩小 (-)"
          aria-label="缩小"
        >
          <Minus size={16} strokeWidth={1.75} />
        </button>
        <span className="min-w-[46px] text-center tabular-nums text-[var(--lb-text)]">{percent}</span>
        <button
          className="grid h-7 w-7 place-items-center rounded-full text-[var(--lb-faint)] hover:bg-[var(--lb-hover)] hover:text-[var(--lb-text)]"
          onClick={() => zoomStep(1.25)}
          title="放大 (+)"
          aria-label="放大"
        >
          <Plus size={16} strokeWidth={1.75} />
        </button>
        <button
          className="h-7 rounded-full px-2 text-[var(--lb-faint)] hover:bg-[var(--lb-hover)] hover:text-[var(--lb-text)]"
          onClick={resetFit}
          title="适应窗口 (0)"
        >
          适应
        </button>
      </div>
    </div>
  )
}

/**
 * 圈选层：必须复制 img 的定位样式并与它并排，缩放/平移/旋转全靠同一个盒子带过来。
 * 放进外层用百分比定位会在缩放后错位。
 */
function RegionLayer({
  threads,
  selection,
  draft,
  left,
  top,
  width,
  height,
  rotation,
  drawing,
  onFocus
}: {
  threads: NoteThread[]
  /** 已框好、还没落库的区域 */
  selection: NoteRegion | null
  /** 正在拖拽的临时框 */
  draft: NoteRegion | null
  left: number
  top: number
  width: number
  height: number
  rotation: number
  /** 框选时框不接收点击，免得抢走拖拽 */
  drawing: boolean
  /** 点框跳到对应的研读线程 */
  onFocus: (rootId: number) => void
}) {
  const marked = useMemo(
    () =>
      threads.flatMap((thread) =>
        [thread.root, ...thread.replies]
          .filter(
            (note): note is PhotoNote & { region: NoteRegion } =>
              Boolean(note.region && note.region.w > 0 && note.region.h > 0)
          )
          .map((note) => ({ note, rootId: thread.root.id }))
      ),
    [threads]
  )
  if (!marked.length && !selection && !draft) return null
  const place = (region: NoteRegion) => ({
    left: `${region.x * 100}%`,
    top: `${region.y * 100}%`,
    width: `${region.w * 100}%`,
    height: `${region.h * 100}%`
  })
  return (
    <div
      className="absolute pointer-events-none"
      style={{ left, top, width, height, transform: `rotate(${rotation}deg)` }}
    >
      {marked.map(({ note, rootId }) => (
        <div
          key={note.id}
          data-region-id={note.id}
          className="absolute rounded-[3px] border"
          onClick={() => onFocus(rootId)}
          onPointerDown={(event) => event.stopPropagation()}
          title="看这条研读笔记"
          style={{
            ...place(note.region),
            borderColor: '#F2F5F8',
            background: 'rgba(0,0,0,0.16)',
            boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.45)',
            pointerEvents: drawing ? 'none' : 'auto',
            cursor: drawing ? 'crosshair' : 'pointer'
          }}
        />
      ))}
      {/* 待提交的框用虚线，和已经存进笔记的实线框区分开 */}
      {selection && (
        <div
          data-region-draft="selection"
          className="absolute rounded-[3px] border border-dashed"
          style={{
            ...place(selection),
            borderColor: '#F2F5F8',
            background: 'rgba(0,0,0,0.10)',
            boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.45)'
          }}
        />
      )}
      {draft && (
        <div
          data-region-draft="drawing"
          className="absolute rounded-[3px] border border-dashed border-[#F2F5F8] bg-black/15"
          style={{ ...place(draft), boxShadow: '0 0 0 1px rgba(0,0,0,.45)' }}
        />
      )}
    </div>
  )
}
