import { existsSync } from 'node:fs'
import { parse } from 'node:path'
import { powerMonitor } from 'electron'
import type { VolumeStatus } from '../shared/types'
import { getLibraryPath } from './db'
import { listSources } from './repo'

/**
 * 轻量磁盘在线探测：不监听系统卷事件（Electron/Windows 上不可靠），
 * 每 5 秒 stat 一次「图库根 / 导入目录根」的盘符，只在状态变化时通知。
 * 这样移动硬盘拔掉时不会把每张照片都当成丢失，插回后也能自动触发接回。
 */
const POLL_MS = 5000

const EMPTY: VolumeStatus = {
  libraryOffline: false,
  libraryRecovered: false,
  offlineSources: [],
  recoveredSources: []
}

let status: VolumeStatus = EMPTY
let offlineSourcesBefore = new Set<string>()
let libraryOfflineBefore = false
let timer: NodeJS.Timeout | null = null
let listeners = new Set<(next: VolumeStatus) => void>()

function driveRoot(path: string): string {
  return parse(path).root
}

/** 盘符根都不存在才算「磁盘离线」；目录被删但盘还在，仍走原来的丢失/重定位流程 */
function driveOnline(path: string): boolean {
  const root = driveRoot(path)
  return !root || existsSync(root)
}

function scan(): VolumeStatus {
  let libraryOffline = false
  try {
    const library = getLibraryPath()
    libraryOffline = Boolean(library) && !driveOnline(library)
  } catch {
    /* 图库没打开时 getLibraryPath 返回空串，这里按在线处理 */
  }

  let sources: string[] = []
  try {
    sources = listSources()
      .map((source) => source.path)
      .filter(Boolean)
  } catch {
    /* 数据库还没就绪：本轮跳过，下个周期再算 */
  }

  const offlineSources = sources.filter((path) => !driveOnline(path))
  const libraryRecovered = libraryOfflineBefore && !libraryOffline
  const recoveredSources = [...offlineSourcesBefore].filter(
    (path) => !offlineSources.includes(path) && existsSync(path)
  )

  offlineSourcesBefore = new Set(offlineSources)
  libraryOfflineBefore = libraryOffline

  return { libraryOffline, libraryRecovered, offlineSources, recoveredSources }
}

function sameStatus(a: VolumeStatus, b: VolumeStatus): boolean {
  return (
    a.libraryOffline === b.libraryOffline &&
    a.libraryRecovered === b.libraryRecovered &&
    a.offlineSources.length === b.offlineSources.length &&
    a.recoveredSources.length === b.recoveredSources.length
  )
}

function tick(): void {
  const next = scan()
  const changed = !sameStatus(status, next)
  status = next
  if (changed) {
    for (const listener of listeners) {
      try {
        listener(next)
      } catch {
        /* 单个监听器出错不影响轮询 */
      }
    }
  }
}

export function volumeStatus(): VolumeStatus {
  return status
}

export function startVolumeWatch(onChange: (next: VolumeStatus) => void): void {
  listeners.add(onChange)
  if (timer) return
  timer = setInterval(tick, POLL_MS)
  powerMonitor.on('resume', tick)
}

export function stopVolumeWatch(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  powerMonitor.removeListener('resume', tick)
  listeners.clear()
  status = EMPTY
  offlineSourcesBefore = new Set()
  libraryOfflineBefore = false
}
