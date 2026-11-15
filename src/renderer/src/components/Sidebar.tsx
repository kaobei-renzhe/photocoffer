import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent, ReactNode } from 'react'
import {
  Archive,
  ArrowLeftRight,
  Camera,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  FileSpreadsheet,
  Folder,
  FolderPlus,
  Images,
  Layers,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Send,
  Settings as SettingsIcon,
  Sparkles,
  Tag as TagIcon,
  Trash2,
  TriangleAlert,
  Upload,
  UserCheck,
  Wrench,
  X
} from 'lucide-react'
import type {
  AppUseCase,
  ClipStatus,
  Facet,
  FilterState,
  Folder as FolderType,
  GrownFeature,
  ImportDirNode,
  SmartFolder,
  Stats,
  Tag
} from '@shared/types'
import { folderName, samePath, thumbUrl } from '../lib/format'

interface DirRowsProps {
  nodes: ImportDirNode[]
  depth: number
  current: string | null | undefined
  expanded: string[]
  onToggle: (path: string) => void
  onPick: (path: string) => void
}

function DirRows({ nodes, depth, current, expanded, onToggle, onPick }: DirRowsProps) {
  return (
    <>
      {nodes.map((node) => {
        const open = expanded.includes(node.path)
        return (
          <div key={node.path}>
            <div
              className={`side-item ${current === node.path ? 'active' : ''}`}
              style={{ paddingLeft: 8 + depth * 12 }}
              onClick={() => onPick(node.path)}
              title={node.path}
            >
              {node.children.length > 0 ? (
                <button
                  className="shrink-0 text-[var(--faint)] hover:text-[var(--text)]"
                  onClick={(event) => {
                    event.stopPropagation()
                    onToggle(node.path)
                  }}
                >
                  {open ? <ChevronDown size={14} strokeWidth={1.75} /> : <ChevronRight size={14} strokeWidth={1.75} />}
                </button>
              ) : (
                <span className="w-[12px] shrink-0" />
              )}
              <Folder size={14} strokeWidth={1.75} />
              <span className="truncate">{node.name}</span>
              <span className="count">{node.total}</span>
            </div>
            {open && node.children.length > 0 && (
              <DirRows
                nodes={node.children}
                depth={depth + 1}
                current={current}
                expanded={expanded}
                onToggle={onToggle}
                onPick={onPick}
              />
            )}
          </div>
        )
      })}
    </>
  )
}

interface SidebarProps {
  library: string
  /** 图库的显示名（可在启动页重命名） */
  libraryName: string
  stats: Stats
  tags: Tag[]
  /** 人像维度：作为统一多级筛选树的父节点，取值挂在它下面 */
  facets: Facet[]
  folders: FolderType[]
  smarts: SmartFolder[]
  dirTree: ImportDirNode[]
  filter: FilterState
  onFilter: (filter: FilterState) => void
  /** 首启使用方式：manage 时摄影功能收进「更多」 */
  useCase: AppUseCase
  /** 已经用过、应常驻主导航的摄影功能 */
  grownFeatures: GrownFeature[]
  onGrowFeature: (feature: GrownFeature) => void
  onImportFiles: () => void
  onImportFolder: () => void
  /** 打开人像工作台（独立三栏视图） */
  onPortrait: () => void
  onSync: () => void
  onRescan: () => void
  onDuplicates: () => void
  onSwitch: () => void
  onBackup: () => void
  onRestore: () => void
  onExport: () => void
  onAutoBackup: () => void
  clipStatus: ClipStatus | null
  onIndexClip: () => void
  onAutoTag: () => void
  onRelocate: () => void
  /** 打开「选片交付」工作区 */
  onPickDelivery: () => void
  lastRelocateDir: string | null
  onEquipment: () => void
  onSettings: () => void
  onCreateFolder: (name: string, parentId?: number | null) => void
  onRenameFolder: (id: number, name: string) => void
  /** 移动文件夹：可换父级，也可在同级里调整顺序 */
  onMoveFolder: (id: number, parentId: number | null, index: number) => void
  /** 把当前选中的照片设为文件夹封面 */
  onSetFolderCover: (id: number) => void
  onDropItems: (ids: number[], target: { folderId?: number; tagId?: number }) => void
  onDeleteFolder: (id: number) => void
  onDeleteTag: (id: number) => void
  /** 调整标签层级：parentId 为 null 时移回顶层 */
  onTagNest: (childId: number, parentId: number | null) => Promise<void>
  onDeleteSmart: (id: number) => void
}

export default function Sidebar({
  library,
  libraryName,
  stats,
  tags,
  facets,
  folders,
  smarts,
  dirTree,
  filter,
  onFilter,
  useCase,
  grownFeatures,
  onGrowFeature,
  onImportFiles,
  onImportFolder,
  onPortrait,
  onSync,
  onRescan,
  onDuplicates,
  onSwitch,
  onBackup,
  onRestore,
  onExport,
  onAutoBackup,
  clipStatus,
  onIndexClip,
  onAutoTag,
  onRelocate,
  onPickDelivery,
  lastRelocateDir,
  onEquipment,
  onSettings,
  onCreateFolder,
  onRenameFolder,
  onMoveFolder,
  onSetFolderCover,
  onDropItems,
  onDeleteFolder,
  onDeleteTag,
  onTagNest,
  onDeleteSmart
}: SidebarProps) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  /** 标签树里被折叠的父标签 */
  const [collapsedTags, setCollapsedTags] = useState<number[]>([])
  /** 顶层标签超过 10 个时默认只露前 10 个 */
  const [tagsExpanded, setTagsExpanded] = useState(false)
  /** 人像维度：默认收起，展开后才列出该维度的取值 */
  const [expandedFacets, setExpandedFacets] = useState<string[]>([])
  const [expandedDirs, setExpandedDirs] = useState<string[]>([])
  const [dirsOpen, setDirsOpen] = useState(true)
  /** 三个筛选区各自折叠，避免侧栏被长列表占满 */
  const [openSections, setOpenSections] = useState({ folders: true, tags: true, smarts: true })
  /** 工具区默认收起：装备、备份、语义索引这些低频入口不再占视线 */
  const [toolsOpen, setToolsOpen] = useState(false)
  /** manage 模式下被收起的摄影功能 */
  const [moreFeaturesOpen, setMoreFeaturesOpen] = useState(false)
  /** 底部「更多」菜单 */
  const [moreOpen, setMoreOpen] = useState(false)
  /** 右键菜单：替代原先悬停 × 直接删除 */
  const [menu, setMenu] = useState<{ x: number; y: number; kind: string; onDelete: () => void } | null>(
    null
  )
  /** 文件夹树：展开的父文件夹、新建到哪个父级、正在重命名的文件夹 */
  const [expandedFolders, setExpandedFolders] = useState<number[]>([])
  const [addingParent, setAddingParent] = useState<number | null>(null)
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null)
  const [folderMenu, setFolderMenu] = useState<{ x: number; y: number; folder: FolderType } | null>(
    null
  )
  /** 文件夹拖拽落点：before/after 排序，into 变成子文件夹 */
  const [folderDrop, setFolderDrop] = useState<{
    id: number
    zone: 'before' | 'into' | 'after'
  } | null>(null)
  const seededDirs = useRef(false)

  const toggleSection = (key: keyof typeof openSections): void =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))

  // 目录树首次加载时展开根节点，之后尊重用户的折叠状态
  useEffect(() => {
    if (seededDirs.current || dirTree.length === 0) return
    seededDirs.current = true
    setExpandedDirs(dirTree.map((node) => node.path))
  }, [dirTree])

  // 换库后标签与文件夹都是全新的，折叠/展开状态回到默认，别把上一个库的状态带过去
  useEffect(() => {
    setTagsExpanded(false)
    setExpandedFolders([])
    setAddingParent(null)
    setRenaming(null)
    setFolderMenu(null)
    setFolderDrop(null)
  }, [library])

  const toggleDir = (path: string): void => {
    setExpandedDirs((prev) =>
      prev.includes(path) ? prev.filter((item) => item !== path) : [...prev, path]
    )
  }

  const isLibraryDrag = (e: ReactDragEvent): boolean =>
    e.dataTransfer.types.includes('application/x-imagenest-items')

  const dragOver = (key: string) => (e: ReactDragEvent) => {
    if (!isLibraryDrag(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    if (dropTarget !== key) setDropTarget(key)
  }

  const dragLeave = (key: string) => () => {
    setDropTarget((current) => (current === key ? null : current))
  }

  const drop = (target: { folderId?: number; tagId?: number }) => (e: ReactDragEvent) => {
    if (!isLibraryDrag(e)) return
    e.preventDefault()
    e.stopPropagation()
    setDropTarget(null)
    try {
      const ids = JSON.parse(e.dataTransfer.getData('application/x-imagenest-items')) as number[]
      if (Array.isArray(ids) && ids.length) onDropItems(ids, target)
    } catch {
      /* 不是库内拖拽就忽略 */
    }
  }

  /* ── 文件夹树 ── */

  const folderChildren = useMemo(() => {
    const ids = new Set(folders.map((folder) => folder.id))
    const children = new Map<number, FolderType[]>()
    for (const folder of folders) {
      // 父级被删或不存在时按顶层处理，别让孤儿节点从侧栏消失
      const parent = folder.parentId != null && ids.has(folder.parentId) ? folder.parentId : 0
      const list = children.get(parent) ?? []
      list.push(folder)
      children.set(parent, list)
    }
    return children
  }, [folders])
  const foldersOf = (parentId: number | null): FolderType[] =>
    folderChildren.get(parentId ?? 0) ?? []

  const isFolderDrag = (event: ReactDragEvent): boolean =>
    event.dataTransfer.types.includes('application/x-imagenest-folder')

  /** 行的上 1/3 排到前面，下 1/3 排到后面，中间变成子文件夹 */
  const folderZoneAt = (event: ReactDragEvent): 'before' | 'into' | 'after' => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const ratio = (event.clientY - rect.top) / Math.max(1, rect.height)
    return ratio < 0.3 ? 'before' : ratio > 0.7 ? 'after' : 'into'
  }

  const dragOverFolder = (folderId: number) => (event: ReactDragEvent) => {
    if (!isFolderDrag(event)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    const zone = folderZoneAt(event)
    setFolderDrop((current) =>
      current?.id === folderId && current.zone === zone ? current : { id: folderId, zone }
    )
  }

  const dropFolderOn = (folder: FolderType) => (event: ReactDragEvent) => {
    if (!isFolderDrag(event)) return
    event.preventDefault()
    event.stopPropagation()
    setFolderDrop(null)
    const dragId = Number(event.dataTransfer.getData('application/x-imagenest-folder'))
    if (!Number.isFinite(dragId) || !dragId || dragId === folder.id) return
    const zone = folderZoneAt(event)
    if (zone === 'into') {
      onMoveFolder(dragId, folder.id, foldersOf(folder.id).filter((f) => f.id !== dragId).length)
      return
    }
    const parentId = folder.parentId
    const siblings = foldersOf(parentId).filter((f) => f.id !== dragId)
    const at = siblings.findIndex((f) => f.id === folder.id)
    if (at < 0) return
    onMoveFolder(dragId, parentId, zone === 'before' ? at : at + 1)
  }

  /** 拖到「文件夹」分区标题上：移回顶层末尾 */
  const dragOverFolderRoot = (event: ReactDragEvent): void => {
    if (!isFolderDrag(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const dropFolderRoot = (event: ReactDragEvent): void => {
    if (!isFolderDrag(event)) return
    event.preventDefault()
    event.stopPropagation()
    const dragId = Number(event.dataTransfer.getData('application/x-imagenest-folder'))
    if (!Number.isFinite(dragId) || !dragId) return
    onMoveFolder(dragId, null, foldersOf(null).filter((f) => f.id !== dragId).length)
  }

  const renderFolderTree = (folder: FolderType, depth: number): ReactNode => {
    const children = foldersOf(folder.id)
    const open = expandedFolders.includes(folder.id)
    const active = filter.folderId === folder.id
    const isRenaming = renaming?.id === folder.id
    const zone = folderDrop?.id === folder.id ? folderDrop.zone : null
    return (
      <div key={folder.id}>
        <div
          className={`side-item group ${active ? 'active' : ''} ${
            zone === 'into' ? 'ring-1 ring-[var(--accent)] bg-[var(--panel-3)]' : ''
          } ${zone === 'before' ? 'shadow-[inset_0_2px_0_var(--accent)]' : ''} ${
            zone === 'after' ? 'shadow-[inset_0_-2px_0_var(--accent)]' : ''
          }`}
          style={{ paddingLeft: 6 + depth * 12 }}
          data-folder-id={folder.id}
          draggable={!isRenaming}
          onDragStart={(event) => {
            event.dataTransfer.setData('application/x-imagenest-folder', String(folder.id))
            event.dataTransfer.effectAllowed = 'move'
          }}
          onDragOver={(event) => {
            if (isFolderDrag(event)) dragOverFolder(folder.id)(event)
            else dragOver(`folder-${folder.id}`)(event)
          }}
          onDragLeave={() => {
            setFolderDrop((current) => (current?.id === folder.id ? null : current))
            dragLeave(`folder-${folder.id}`)()
          }}
          onDrop={(event) => {
            if (isFolderDrag(event)) dropFolderOn(folder)(event)
            else drop({ folderId: folder.id })(event)
          }}
          onClick={() => {
            if (isRenaming) return
            onFilter({ sort: filter.sort, folderId: folder.id })
          }}
          title={`${folder.name}${
            folder.note ? ` · ${folder.note}` : ''
          }（右键更多操作；拖动可排序或改层级）`}
          onContextMenu={(event) => {
            event.preventDefault()
            setFolderMenu({ x: event.clientX, y: event.clientY, folder })
          }}
        >
          {children.length > 0 ? (
            <button
              className="w-3 h-3 grid place-items-center text-[var(--faint)] shrink-0"
              onClick={(event) => {
                event.stopPropagation()
                setExpandedFolders((prev) =>
                  prev.includes(folder.id)
                    ? prev.filter((id) => id !== folder.id)
                    : [...prev, folder.id]
                )
              }}
              title={open ? '折叠子文件夹' : '展开子文件夹'}
            >
              {open ? <ChevronDown size={14} strokeWidth={1.75} /> : <ChevronRight size={14} strokeWidth={1.75} />}
            </button>
          ) : (
            <span className="w-3 shrink-0" />
          )}
          {folder.coverItemId ? (
            <img
              src={thumbUrl(folder.coverItemId, 'low')}
              alt=""
              draggable={false}
              className="h-[15px] w-[15px] shrink-0 rounded-[3px] object-cover"
              onError={(event) => {
                event.currentTarget.style.visibility = 'hidden'
              }}
            />
          ) : (
            <Folder size={14} strokeWidth={1.75} />
          )}
          {isRenaming ? (
            <input
              autoFocus
              className="input h-5 min-w-0 flex-1 text-[12px]"
              value={renaming.name}
              onChange={(event) => setRenaming({ id: folder.id, name: event.target.value })}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitRename()
                if (event.key === 'Escape') setRenaming(null)
              }}
              onBlur={commitRename}
            />
          ) : (
            <span className="truncate">{folder.name}</span>
          )}
          <span className={`count ${active ? 'group-hover:hidden' : ''}`}>{folder.count}</span>
          {active && (
            <button
              className="hidden group-hover:block ml-auto text-[var(--faint)] hover:text-[var(--accent-2)]"
              title="取消选中（不删除文件夹）"
              onClick={(event) => {
                event.stopPropagation()
                onFilter({ sort: filter.sort })
              }}
            >
              <X size={14} strokeWidth={1.75} />
            </button>
          )}
        </div>
        {open && children.map((child) => renderFolderTree(child, depth + 1))}
      </div>
    )
  }

  const tagIds = filter.tagIds ?? []
  const facetPicked = filter.facets ?? {}
  const hasFacetFilter = Object.values(facetPicked).some((list) => list.length > 0)
  const isAll =
    !filter.folderId &&
    tagIds.length === 0 &&
    !hasFacetFilter &&
    !filter.missing &&
    !filter.dir &&
    !filter.errors &&
    !filter.trashed &&
    !filter.pickAction

  /** 只比较筛选条件本身（忽略排序），用来判断哪个智能文件夹正生效 */
  const filterKey = (value: FilterState | SmartFolder['filter']): string =>
    JSON.stringify({
      query: value.query ?? '',
      folderId: value.folderId ?? null,
      dir: value.dir ?? null,
      tagIds: [...(value.tagIds ?? [])].sort((a, b) => a - b),
      // 维度筛选也纳入比较，否则同一张智能文件夹在不同维度下都会亮
      facets: Object.fromEntries(
        Object.entries(value.facets ?? {})
          .map(([key, list]) => [key, [...list].sort((a, b) => a - b)] as const)
          .sort(([a], [b]) => a.localeCompare(b))
      ),
      orientation: value.orientation ?? null,
      colorFamily: value.colorFamily ?? null,
      minRating: value.minRating ?? 0,
      flag: value.flag ?? 0,
      pickAction: value.pickAction ?? null,
      pickSessionId: value.pickSessionId ?? null,
      missing: Boolean(value.missing),
      errors: Boolean(value.errors)
    })

  const activeSmartId =
    smarts.find((smart) => filterKey(smart.filter) === filterKey(filter))?.id ?? null

  const commitFolder = (): void => {
    const value = name.trim()
    const parentId = addingParent
    if (value) onCreateFolder(value, parentId)
    // 建在某个父级下时把它展开，否则新文件夹藏在收起的分支里看不见
    if (value && parentId !== null) {
      setExpandedFolders((prev) => (prev.includes(parentId) ? prev : [...prev, parentId]))
    }
    setName('')
    setAdding(false)
    setAddingParent(null)
  }

  const cancelFolder = (): void => {
    setName('')
    setAdding(false)
    setAddingParent(null)
  }

  const commitRename = (): void => {
    if (!renaming) return
    const value = renaming.name.trim()
    const current = folders.find((folder) => folder.id === renaming.id)?.name
    if (value && value !== current) onRenameFolder(renaming.id, value)
    setRenaming(null)
  }

  const toggleTag = (id: number): void => {
    const next = tagIds.includes(id) ? tagIds.filter((t) => t !== id) : [...tagIds, id]
    onFilter({ ...filter, tagIds: next, folderId: null })
  }

  const unselectTag = (id: number): void => {
    onFilter({ ...filter, tagIds: tagIds.filter((t) => t !== id) })
  }

  /** 选中/取消某个维度的取值；同一维度内多选取 OR，跨维度取 AND */
  const toggleFacetValue = (facetId: string, valueId: number): void => {
    const current = facetPicked[facetId] ?? []
    const next = current.includes(valueId)
      ? current.filter((id) => id !== valueId)
      : [...current, valueId]
    const facets = { ...facetPicked }
    if (next.length > 0) facets[facetId] = next
    else delete facets[facetId]
    onFilter({ ...filter, facets, folderId: null })
  }

  const toggleFacetOpen = (facetId: string): void =>
    setExpandedFacets((prev) =>
      prev.includes(facetId) ? prev.filter((id) => id !== facetId) : [...prev, facetId]
    )

  /**
   * 统一的多级筛选树：维度不是单独开关，而是树上的父节点；
   * 维度取值本身就是标签，所以和普通标签共用同一套展开、选中与嵌套规则。
   */
  const { childrenOf, facetTags } = useMemo(() => {
    const known = new Set(tags.map((tag) => tag.id))
    const children = new Map<number, Tag[]>()
    for (const tag of tags) {
      const parent = tag.parentId != null && known.has(tag.parentId) ? tag.parentId : 0
      const list = children.get(parent) ?? []
      list.push(tag)
      children.set(parent, list)
    }
    const byFacet = new Map<string, Tag[]>()
    for (const tag of tags) {
      if (!tag.facetId) continue
      const list = byFacet.get(tag.facetId) ?? []
      list.push(tag)
      byFacet.set(tag.facetId, list)
    }
    return { childrenOf: children, facetTags: byFacet }
  }, [tags])

  /** 普通标签的子节点；维度取值只挂在所属维度下面，避免重复出现 */
  const subTagsOf = (id: number): Tag[] =>
    (childrenOf.get(id) ?? []).filter((tag) => !tag.facetId)

  const isTagDrag = (event: ReactDragEvent): boolean =>
    event.dataTransfer.types.includes('application/x-imagenest-tag')

  const dragOverTag = (key: string) => (event: ReactDragEvent) => {
    if (!isTagDrag(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (dropTarget !== key) setDropTarget(key)
  }

  /** 把拖起的标签挂到 parentId 下；null 表示移回顶层 */
  const dropTagOn = (parentId: number | null) => (event: ReactDragEvent) => {
    if (!isTagDrag(event)) return
    event.preventDefault()
    event.stopPropagation()
    setDropTarget(null)
    const childId = Number(event.dataTransfer.getData('application/x-imagenest-tag'))
    if (Number.isFinite(childId) && childId && childId !== parentId) {
      void onTagNest(childId, parentId)
    }
  }

  const renderTagTree = (tag: Tag, depth: number): ReactNode => {
    const children = subTagsOf(tag.id)
    const collapsed = collapsedTags.includes(tag.id)
    const active = tagIds.includes(tag.id)
    const key = `tag-${tag.id}`
    return (
      <div key={tag.id}>
        <div
          className={`side-item group ${active ? 'active' : ''} ${
            dropTarget === key ? 'ring-1 ring-[var(--accent)] bg-[var(--panel-3)]' : ''
          }`}
          style={{ paddingLeft: 6 + depth * 12 }}
          onClick={() => toggleTag(tag.id)}
          title={`${tag.name}（右键删除；拖到另一个标签上可归为子级）`}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData('application/x-imagenest-tag', String(tag.id))
            event.dataTransfer.effectAllowed = 'move'
          }}
          onContextMenu={(event) => {
            event.preventDefault()
            setMenu({
              x: event.clientX,
              y: event.clientY,
              kind: '标签',
              onDelete: () => onDeleteTag(tag.id)
            })
          }}
          onDragOver={(event) => {
            if (isTagDrag(event)) dragOverTag(key)(event)
            else dragOver(key)(event)
          }}
          onDragLeave={dragLeave(key)}
          onDrop={(event) => {
            if (isTagDrag(event)) dropTagOn(tag.id)(event)
            else drop({ tagId: tag.id })(event)
          }}
        >
          {children.length > 0 ? (
            <button
              className="w-3 h-3 grid place-items-center text-[var(--faint)] shrink-0"
              onClick={(event) => {
                event.stopPropagation()
                setCollapsedTags((prev) =>
                  prev.includes(tag.id) ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]
                )
              }}
              title={collapsed ? '展开子标签' : '折叠子标签'}
            >
              {collapsed ? <ChevronRight size={14} strokeWidth={1.75} /> : <ChevronDown size={14} strokeWidth={1.75} />}
            </button>
          ) : (
            <span className="w-3 shrink-0" />
          )}
          <span className="truncate">{tag.name}</span>
          <span className={`count ${active ? 'group-hover:hidden' : ''}`}>{tag.count}</span>
          {active && (
            <button
              className="hidden group-hover:block ml-auto text-[var(--faint)] hover:text-[var(--accent-2)]"
              title="取消选中（不删除标签）"
              onClick={(event) => {
                event.stopPropagation()
                unselectTag(tag.id)
              }}
            >
              <X size={14} strokeWidth={1.75} />
            </button>
          )}
        </div>
        {!collapsed && children.map((child) => renderTagTree(child, depth + 1))}
      </div>
    )
  }

  /** 维度节点：和普通标签在同一棵树上，展开后列出取值，取值下面还能继续挂子标签 */
  const renderFacetNode = (facet: Facet): ReactNode => {
    const picked = facetPicked[facet.id] ?? []
    const open = expandedFacets.includes(facet.id)
    const values = facetTags.get(facet.id) ?? []
    return (
      <div key={facet.id}>
        <div
          className={`side-item ${picked.length > 0 ? 'active' : ''}`}
          style={{ paddingLeft: 6 }}
          onClick={() => toggleFacetOpen(facet.id)}
          title={
            picked.length > 0
              ? `${facet.name}：已选 ${picked.length} 个取值，点一下收起`
              : `${facet.name}：展开后按取值筛选`
          }
        >
          <button
            className="w-3 h-3 grid place-items-center text-[var(--faint)] shrink-0"
            onClick={(event) => {
              event.stopPropagation()
              toggleFacetOpen(facet.id)
            }}
            title={open ? '收起取值' : '展开取值'}
          >
            {open ? <ChevronDown size={14} strokeWidth={1.75} /> : <ChevronRight size={14} strokeWidth={1.75} />}
          </button>
          <Layers size={14} strokeWidth={1.75} />
          <span className="truncate">{facet.name}</span>
          <span className={`count ${picked.length > 0 ? 'text-[var(--accent-2)]' : ''}`}>
            {picked.length > 0 ? `${picked.length}/${values.length}` : values.length}
          </span>
        </div>
        {open &&
          values.map((value) => {
            const active = picked.includes(value.id)
            const children = subTagsOf(value.id)
            const collapsed = collapsedTags.includes(value.id)
            return (
              <div key={value.id}>
                <div
                  className={`side-item ${active ? 'active' : ''}`}
                  style={{ paddingLeft: 18 }}
                  onClick={() => toggleFacetValue(facet.id, value.id)}
                  title={`${facet.name}：${value.name}（同一分类多选取并集）`}
                >
                  {children.length > 0 ? (
                    <button
                      className="w-3 h-3 grid place-items-center text-[var(--faint)] shrink-0"
                      onClick={(event) => {
                        event.stopPropagation()
                        setCollapsedTags((prev) =>
                          prev.includes(value.id)
                            ? prev.filter((id) => id !== value.id)
                            : [...prev, value.id]
                        )
                      }}
                      title={collapsed ? '展开子标签' : '折叠子标签'}
                    >
                      {collapsed ? <ChevronRight size={14} strokeWidth={1.75} /> : <ChevronDown size={14} strokeWidth={1.75} />}
                    </button>
                  ) : (
                    <span className="w-3 shrink-0" />
                  )}
                  <span className="truncate">{value.name}</span>
                  <span className="count">{value.count}</span>
                </div>
                {!collapsed && children.map((child) => renderTagTree(child, 2))}
              </div>
            )
          })}
        {open && values.length === 0 && (
          <div className="px-2 py-1 pl-[18px] text-[12px] text-[var(--faint)]">
            还没有取值，可在人像工作台里添加
          </div>
        )}
      </div>
    )
  }

  /** 摄影功能：manage 模式下没长出来的收进「更多」，点开一次后常驻主导航 */
  const photoNav = [
    {
      key: 'clientPicked' as GrownFeature,
      label: '浏览页已选',
      title: '最近一次浏览页里「要的 + 要修的」照片',
      icon: <UserCheck size={14} strokeWidth={1.75} />,
      count: stats.clientPicked,
      active: Boolean(filter.pickAction),
      visible: stats.clientPicked > 0,
      open: () => onFilter({ sort: filter.sort, pickAction: filter.pickAction ? undefined : 'any' })
    },
    {
      key: 'delivery' as GrownFeature,
      label: '选片交付',
      title: '从选片到交付在一屏走完：生成浏览页、粘贴反馈、导出成品',
      icon: <Send size={14} strokeWidth={1.75} />,
      count: 0,
      active: false,
      visible: true,
      open: onPickDelivery
    }
  ].filter((entry) => entry.visible)
  const isGrown = (key: GrownFeature): boolean =>
    useCase === 'pro' || grownFeatures.includes(key)
  const primaryNav = photoNav.filter((entry) => isGrown(entry.key))
  const moreNav = photoNav.filter((entry) => !isGrown(entry.key))
  /** manage 模式且没长出来时，标签区不再混排人像分类 */
  const showFacets = isGrown('facets')
  /** 顶层标签默认只露前 10 个，避免侧栏被长标签列表占满 */
  const topTags = subTagsOf(0)
  const shownTags = tagsExpanded ? topTags : topTags.slice(0, 10)

  return (
    <aside
      className="shrink-0 border-r border-[var(--border)] bg-[var(--chrome)] flex flex-col min-h-0 overflow-x-hidden"
      style={{ width: 'var(--sidebar-w, 236px)' }}
    >
      <div className="px-4 pt-3.5 pb-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-bold" title={library}>
              {libraryName}
            </div>
            {filter.dir && !samePath(filter.dir, library) && (
              <div className="mt-0.5 truncate text-[11px] text-[var(--faint)]" title={filter.dir}>
                {folderName(filter.dir)}
              </div>
            )}
          </div>
          <button className="btn btn-ghost h-6 px-1.5 shrink-0" title="切换图库" onClick={onSwitch}>
            <ArrowLeftRight size={14} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        <div
          className={`side-item ${isAll ? 'active' : ''}`}
          onClick={() => onFilter({ sort: filter.sort })}
        >
          <Images size={14} strokeWidth={1.75} />
          全部照片
          <span className="count">{stats.total}</span>
        </div>
        <div
          className="side-item"
          onClick={onPortrait}
          title="按景别、光线、氛围等人像分类筛选与打标"
        >
          <Camera size={14} strokeWidth={1.75} />
          人像
        </div>

        {primaryNav.map((entry) => (
          <div
            key={entry.key}
            className={`side-item ${entry.active ? 'active' : ''}`}
            onClick={entry.open}
            title={entry.title}
          >
            {entry.icon}
            {entry.label}
            {entry.count > 0 && <span className="count">{entry.count}</span>}
          </div>
        ))}

        {stats.missing > 0 && (
          <div
            className={`side-item ${filter.missing ? 'active' : ''}`}
            onClick={() => onFilter({ sort: filter.sort, missing: true })}
            title="原文件已经不在记录里的路径了，可以重新定位接回"
          >
            <TriangleAlert size={14} strokeWidth={1.75} />
            文件丢失
            <span className="count">{stats.missing}</span>
          </div>
        )}

        {stats.errors > 0 && (
          <div
            className={`side-item ${filter.errors ? 'active' : ''}`}
            onClick={() => onFilter({ sort: filter.sort, errors: true })}
            title="损坏或无法识别的文件，修好后重新导入即可"
          >
            <TriangleAlert size={14} strokeWidth={1.75} />
            导入异常
            <span className="count">{stats.errors}</span>
          </div>
        )}

        {stats.trashed > 0 && (
          <div
            className={`side-item ${filter.trashed ? 'active' : ''}`}
            onClick={() => onFilter({ sort: filter.sort, trashed: true })}
            title="软删除的照片还能恢复；彻底删除只删记录和缩略图，不动原图"
          >
            <Trash2 size={14} strokeWidth={1.75} />
            回收站
            <span className="count">{stats.trashed}</span>
          </div>
        )}

        {/* 导航段结束：下面开始是库内容，两段之间用分隔线断开 */}
        <div className="my-2.5 border-t border-[var(--border)]" />

        {moreNav.length > 0 && (
          <>
            <div
              className="section-title cursor-pointer select-none hover:text-[var(--muted)]"
              onClick={() => setMoreFeaturesOpen((open) => !open)}
              title={moreFeaturesOpen ? '收起更多功能' : '展开：选片交付等'}
            >
              {moreFeaturesOpen ? <ChevronDown size={14} strokeWidth={1.75} /> : <ChevronRight size={14} strokeWidth={1.75} />}
              <span className="ml-1">更多</span>
              <span className="ml-auto text-[11px]">{moreNav.length}</span>
            </div>
            {moreFeaturesOpen &&
              moreNav.map((entry) => (
                <div
                  key={entry.key}
                  className="side-item"
                  onClick={() => {
                    onGrowFeature(entry.key)
                    entry.open()
                  }}
                  title={`${entry.title}（点开后会固定在导航里）`}
                >
                  {entry.icon}
                  {entry.label}
                  {entry.count > 0 && <span className="count">{entry.count}</span>}
                </div>
              ))}
          </>
        )}

        <div
          className="section-title cursor-pointer select-none hover:text-[var(--muted)]"
          onClick={() => setDirsOpen((open) => !open)}
          title={dirsOpen ? '折叠源目录' : '展开源目录'}
        >
          {dirsOpen ? <ChevronDown size={14} strokeWidth={1.75} /> : <ChevronRight size={14} strokeWidth={1.75} />}
          <span className="ml-1">源目录</span>
          <span className="ml-auto text-[11px]">{dirTree.length}</span>
        </div>
        {dirsOpen &&
          (dirTree.length === 0 ? (
            <div className="px-2 py-1 text-[12px] text-[var(--faint)]">
              导入文件夹后按原目录归档
            </div>
          ) : (
            <DirRows
              nodes={dirTree}
              depth={0}
              current={filter.dir}
              expanded={expandedDirs}
              onToggle={toggleDir}
              onPick={(path) => onFilter({ sort: filter.sort, dir: path })}
            />
          ))}

        <div
          className="section-title mt-3 cursor-pointer select-none hover:text-[var(--muted)]"
          onClick={() => toggleSection('folders')}
          title={
            openSections.folders
              ? '折叠文件夹；把文件夹拖到这里可移回顶层'
              : '展开文件夹；把文件夹拖到这里可移回顶层'
          }
          onDragOver={dragOverFolderRoot}
          onDrop={dropFolderRoot}
        >
          {openSections.folders ? <ChevronDown size={14} strokeWidth={1.75} /> : <ChevronRight size={14} strokeWidth={1.75} />}
          <span className="ml-1">文件夹</span>
          <span className="ml-auto text-[11px]">{folders.length}</span>
          <button
            className="btn btn-ghost h-5 px-1 ml-1"
            onClick={(event) => {
              event.stopPropagation()
              setAdding(true)
              setAddingParent(null)
            }}
            title="新建文件夹"
          >
            <Plus size={14} strokeWidth={1.75} />
          </button>
        </div>

        {openSections.folders && adding && (
          <div className="px-1 pb-1">
            <input
              autoFocus
              className="input w-full h-7 text-[12px]"
              placeholder={
                addingParent !== null
                  ? `在「${folders.find((folder) => folder.id === addingParent)?.name ?? ''}」下新建，回车确认`
                  : '文件夹名称，回车确认'
              }
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitFolder()
                if (e.key === 'Escape') cancelFolder()
              }}
              onBlur={commitFolder}
            />
            {addingParent !== null && (
              <button
                className="mt-1 text-[11px] text-[var(--faint)] hover:text-[var(--text)]"
                onMouseDown={(event) => {
                  // 别让输入框先 blur 提交，再取消
                  event.preventDefault()
                  cancelFolder()
                }}
              >
                取消，建到顶层
              </button>
            )}
          </div>
        )}

        {openSections.folders && foldersOf(null).map((folder) => renderFolderTree(folder, 0))}

        {openSections.folders && folders.length === 0 && !adding && (
          <div className="px-2 py-1 text-[12px] text-[var(--faint)]">还没有文件夹</div>
        )}

        <div
          className={`section-title mt-3 cursor-pointer select-none hover:text-[var(--muted)] ${
            dropTarget === 'tag-root' ? 'ring-1 ring-[var(--accent)]' : ''
          }`}
          onClick={() => toggleSection('tags')}
          title={
            openSections.tags
              ? '折叠标签；把标签拖到这里可移回顶层'
              : '展开标签；把标签拖到这里可移回顶层'
          }
          onDragOver={dragOverTag('tag-root')}
          onDragLeave={dragLeave('tag-root')}
          onDrop={dropTagOn(null)}
        >
          {openSections.tags ? <ChevronDown size={14} strokeWidth={1.75} /> : <ChevronRight size={14} strokeWidth={1.75} />}
          <span className="ml-1">标签</span>
          <span className="ml-auto text-[11px]">
            {(showFacets ? facets.length : 0) + subTagsOf(0).length}
          </span>
        </div>

        {/* 同一棵筛选树：普通标签与维度节点混在一起，层级一致、交互一致 */}
        {openSections.tags && shownTags.map((tag) => renderTagTree(tag, 0))}
        {openSections.tags && topTags.length > 10 && (
          <button
            className="mt-1 w-full px-2 py-0.5 text-left text-[12px] text-[var(--faint)] hover:text-[var(--accent-2)]"
            onClick={() => setTagsExpanded((open) => !open)}
            title={tagsExpanded ? '收起标签' : '展开全部标签'}
          >
            {tagsExpanded ? '收起标签' : `全部 ${topTags.length} 个标签 →`}
          </button>
        )}
        {openSections.tags && showFacets && facets.map((facet) => renderFacetNode(facet))}
        {openSections.tags && !showFacets && facets.length > 0 && (
          <div className="px-2 py-1 text-[12px] text-[var(--faint)]">
            人像分类已收进「更多」
          </div>
        )}
        {openSections.tags && tags.length === 0 && facets.length === 0 && (
          <div className="px-2 py-1 text-[12px] text-[var(--faint)]">在右侧详情里给照片打标签</div>
        )}

        <div
          className="section-title mt-3 cursor-pointer select-none hover:text-[var(--muted)]"
          onClick={() => toggleSection('smarts')}
          title={openSections.smarts ? '折叠智能文件夹' : '展开智能文件夹'}
        >
          {openSections.smarts ? <ChevronDown size={14} strokeWidth={1.75} /> : <ChevronRight size={14} strokeWidth={1.75} />}
          <span className="ml-1">智能文件夹</span>
          <span className="ml-auto text-[11px]">{smarts.length}</span>
        </div>
        {openSections.smarts &&
          smarts.map((smart) => (
            <div
              key={smart.id}
              className={`side-item group ${activeSmartId === smart.id ? 'active' : ''}`}
              title={`${smart.name}（右键可删除）`}
              onClick={() => onFilter({ ...smart.filter, sort: smart.filter.sort ?? filter.sort })}
              onContextMenu={(event) => {
                event.preventDefault()
                setMenu({
                  x: event.clientX,
                  y: event.clientY,
                  kind: '智能文件夹',
                  onDelete: () => onDeleteSmart(smart.id)
                })
              }}
            >
              <Sparkles size={14} strokeWidth={1.75} />
              <span className="truncate">{smart.name}</span>
              {activeSmartId === smart.id && (
                <button
                  className="hidden group-hover:block ml-auto text-[var(--faint)] hover:text-[var(--accent-2)]"
                  title="取消选中（不删除智能文件夹）"
                  onClick={(event) => {
                    event.stopPropagation()
                    onFilter({ sort: filter.sort })
                  }}
                >
                  <X size={14} strokeWidth={1.75} />
                </button>
              )}
            </div>
          ))}
        {openSections.smarts && smarts.length === 0 && (
          <div className="px-2 py-1 text-[12px] text-[var(--faint)]">筛选后可在顶部保存</div>
        )}
        {/* 工具段：低频入口全部收在这里，默认不展开 */}
        <div className="my-2.5 border-t border-[var(--border)]" />
        <div
          className="section-title cursor-pointer select-none hover:text-[var(--muted)]"
          onClick={() => setToolsOpen((open) => !open)}
          title={toolsOpen ? '收起工具' : '展开工具：装备、备份、语义索引等'}
        >
          {toolsOpen ? <ChevronDown size={14} strokeWidth={1.75} /> : <ChevronRight size={14} strokeWidth={1.75} />}
          <span className="ml-1">工具</span>
          <Wrench size={14} strokeWidth={1.75} className="ml-auto opacity-70" />
        </div>
        {toolsOpen && (
          <>
            <div
              className="side-item"
              onClick={onEquipment}
              title="管理机身、镜头、三脚架等设备，按拍摄场景挑搭配"
            >
              <Camera size={14} strokeWidth={1.75} />
              设备与搭配
            </div>
            <div
              className="side-item"
              onClick={onIndexClip}
              title="为照片建立本地语义向量，用于自然语言搜图和找相似"
            >
              <Sparkles size={14} strokeWidth={1.75} />
              语义索引
              <span className="ml-auto text-[11px] text-[var(--faint)] tabular-nums">
                {!clipStatus
                  ? ''
                  : !clipStatus.modelReady
                    ? '未下载模型'
                    : clipStatus.running
                      ? '进行中…'
                      : `${clipStatus.indexed}/${clipStatus.total}`}
              </span>
            </div>
            <div
              className="side-item"
              onClick={onAutoTag}
              title="用本地模型把照片自动归到风景、人像等分类标签"
            >
              <TagIcon size={14} strokeWidth={1.75} />
              自动分类
            </div>
            <div
              className="side-item"
              onClick={onRelocate}
              title={
                lastRelocateDir
                  ? `上次定位：${lastRelocateDir}`
                  : '文件搬家后，按目录结构和内容接回丢失的照片'
              }
            >
              <TriangleAlert size={14} strokeWidth={1.75} />
              重新定位
              {lastRelocateDir && (
                <span className="ml-auto max-w-[96px] truncate text-[11px] text-[var(--faint)]">
                  {folderName(lastRelocateDir)}
                </span>
              )}
            </div>
            <div className="side-item" onClick={onBackup} title="把图库的数据文件打包成 zip">
              <Archive size={14} strokeWidth={1.75} />
              备份图库
            </div>
            <div className="side-item" onClick={onRestore} title="从 zip 备份恢复到一个新文件夹">
              <RefreshCw size={14} strokeWidth={1.75} />
              从备份恢复
            </div>
            <div className="side-item" onClick={onAutoBackup} title="设置定时自动备份">
              <Clock size={14} strokeWidth={1.75} />
              自动备份
            </div>
            <div className="side-item" onClick={onExport} title="导出 CSV 素材清单">
              <FileSpreadsheet size={14} strokeWidth={1.75} />
              导出素材清单
            </div>
          </>
        )}
      </div>

      <div className="relative flex items-center gap-1.5 p-2 border-t border-[var(--border)]">
        <button
          className={`btn flex-1 justify-center ${stats.total === 0 ? 'btn-primary' : ''}`}
          onClick={onImportFiles}
          title={stats.total === 0 ? '导入第一张照片' : '继续导入照片'}
        >
          <Upload size={16} strokeWidth={1.75} /> 导入照片
        </button>
        <button
          className={`btn px-2 ${moreOpen ? 'border-[var(--accent)] text-[var(--accent-2)]' : ''}`}
          onClick={() => setMoreOpen((open) => !open)}
          title="更多操作"
        >
          <MoreHorizontal size={16} strokeWidth={1.75} />
        </button>

        {moreOpen && (
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setMoreOpen(false)} />
            <div className="absolute bottom-[46px] left-2 right-2 z-[61] rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-1 shadow-2xl">
              {[
                {
                  key: 'sync',
                  label: '刷新图库',
                  title: '重新扫描源目录：补上新照片、标记已删除、刷新被覆盖修改的照片',
                  icon: <RefreshCw size={14} strokeWidth={1.75} />,
                  run: onSync
                },
                {
                  key: 'folder',
                  label: '导入文件夹',
                  title: '选择一个文件夹导入',
                  icon: <FolderPlus size={14} strokeWidth={1.75} />,
                  run: onImportFolder
                },
                {
                  key: 'rescan',
                  label: '扫描',
                  title: '重新扫描当前图库',
                  icon: <RefreshCw size={14} strokeWidth={1.75} />,
                  run: onRescan
                },
                {
                  key: 'duplicates',
                  label: '查找重复',
                  title: '按内容找出重复照片',
                  icon: <Copy size={14} strokeWidth={1.75} />,
                  run: onDuplicates
                },
                {
                  key: 'settings',
                  label: '设置',
                  title: '外观、大模型、语义索引与存储位置',
                  icon: <SettingsIcon size={14} strokeWidth={1.75} />,
                  run: onSettings
                }
              ].map((entry) => (
                <button
                  key={entry.key}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
                  onClick={() => {
                    setMoreOpen(false)
                    entry.run()
                  }}
                  title={entry.title}
                >
                  {entry.icon}
                  {entry.label}
                </button>
              ))}
              <div className="mt-1 border-t border-[var(--border)] px-2.5 py-1.5 text-[11px] text-[var(--faint)]">
                {stats.tags} 个标签 · {stats.folders} 个文件夹
              </div>
            </div>
          </>
        )}
      </div>

      {/* 文件夹菜单：新建子级、重命名、封面与删除 */}
      {folderMenu && (
        <div
          className="fixed inset-0 z-[70]"
          onClick={() => setFolderMenu(null)}
          onContextMenu={(event) => {
            event.preventDefault()
            setFolderMenu(null)
          }}
        >
          <div
            className="absolute min-w-[172px] rounded-2xl border border-[var(--border)] bg-[var(--panel)] py-1 shadow-2xl"
            style={{
              left: Math.min(folderMenu.x, Math.max(8, window.innerWidth - 188)),
              top: Math.min(folderMenu.y, Math.max(8, window.innerHeight - 176))
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-3 py-1 text-[11px] text-[var(--faint)]">{folderMenu.folder.name}</div>
            <button
              className="w-full text-left px-3 py-1.5 text-[12px] text-[var(--text)] hover:bg-[var(--panel-2)]"
              onClick={() => {
                setAdding(true)
                setAddingParent(folderMenu.folder.id)
                setFolderMenu(null)
              }}
            >
              新建子文件夹
            </button>
            <button
              className="w-full text-left px-3 py-1.5 text-[12px] text-[var(--text)] hover:bg-[var(--panel-2)]"
              onClick={() => {
                setRenaming({ id: folderMenu.folder.id, name: folderMenu.folder.name })
                setFolderMenu(null)
              }}
            >
              重命名…
            </button>
            <button
              className="w-full text-left px-3 py-1.5 text-[12px] text-[var(--text)] hover:bg-[var(--panel-2)]"
              onClick={() => {
                const id = folderMenu.folder.id
                setFolderMenu(null)
                onSetFolderCover(id)
              }}
            >
              把当前照片设为封面
            </button>
            <div className="my-1 h-px bg-[var(--border)]" />
            <button
              className="w-full text-left px-3 py-1.5 text-[12px] text-[var(--danger-text)] hover:bg-[var(--panel-2)]"
              onClick={() => {
                const id = folderMenu.folder.id
                setFolderMenu(null)
                onDeleteFolder(id)
              }}
            >
              删除文件夹
            </button>
          </div>
        </div>
      )}

      {/* 右键菜单：删除入口从悬停的 × 挪到这里，× 只负责取消选中 */}
      {menu && (
        <div
          className="fixed inset-0 z-[70]"
          onClick={() => setMenu(null)}
          onContextMenu={(event) => {
            event.preventDefault()
            setMenu(null)
          }}
        >
          <div
            className="absolute min-w-[150px] rounded-2xl border border-[var(--border)] bg-[var(--panel)] py-1 shadow-2xl"
            style={{ left: menu.x, top: menu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-3 py-1 text-[11px] text-[var(--faint)]">× 只取消选中</div>
            <button
              className="w-full text-left px-3 py-1.5 text-[12px] text-[var(--danger-text)] hover:bg-[var(--panel-2)]"
              onClick={() => {
                const run = menu.onDelete
                setMenu(null)
                run()
              }}
            >
              删除{menu.kind}
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
