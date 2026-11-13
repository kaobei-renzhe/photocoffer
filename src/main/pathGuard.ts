import { extname, isAbsolute, normalize, relative } from 'node:path'
import { SUPPORTED_EXT } from '../shared/formats'

/**
 * 主进程的路径白名单。渲染层能传路径的 IPC 只接受：
 * - 主进程系统弹窗刚返回的路径（10 分钟内有效）
 * - 图库注册表里已经存在的路径
 * 这样即使渲染层被注入，也不能拿任意路径去读写/删除。
 */
const PICK_TTL_MS = 10 * 60_000
const picked = new Map<string, number>()

function key(path: string): string {
  return normalize(path).replace(/[\\/]+$/, '').toLowerCase()
}

function prune(now: number): void {
  for (const [path, expiresAt] of picked) {
    if (expiresAt <= now) picked.delete(path)
  }
}

/** 系统弹窗返回路径后登记；只登记主进程自己拿到的路径 */
export function rememberPickedPath(path: string): void {
  if (!path) return
  const now = Date.now()
  prune(now)
  picked.set(key(path), now + PICK_TTL_MS)
}

/** 精确命中一个弹窗路径 */
export function isPickedPath(path: string): boolean {
  if (!path) return false
  prune(Date.now())
  return picked.has(key(path))
}

/** 是否位于某个弹窗目录下面（重新定位时用） */
export function isInsidePickedPath(path: string): boolean {
  if (!path) return false
  prune(Date.now())
  const target = key(path)
  for (const dir of picked.keys()) {
    if (target === dir || target.startsWith(`${dir}\\`) || target.startsWith(`${dir}/`)) {
      return true
    }
  }
  return false
}

/** target 是否在 root 目录内；Windows 下大小写不敏感由 path.relative 处理 */
export function isInside(root: string, target: string): boolean {
  if (!root || !target) return false
  const rel = relative(normalize(root), normalize(target))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

const BLOCKED_EXT = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.scr',
  '.msi',
  '.ps1',
  '.vbs',
  '.js',
  '.mjs',
  '.cjs',
  '.lnk',
  '.url',
  '.reg'
])

/** 重新定位/拖拽等入口只接受真正的图片或 RAW */
export function isSafeImagePath(path: string): boolean {
  const ext = extname(path).toLowerCase()
  if (BLOCKED_EXT.has(ext)) return false
  return SUPPORTED_EXT.has(ext)
}

/** 打开目录时拒绝可执行文件；目录本身（无扩展名）放行 */
export function isBlockedExecutable(path: string): boolean {
  return BLOCKED_EXT.has(extname(path).toLowerCase())
}
