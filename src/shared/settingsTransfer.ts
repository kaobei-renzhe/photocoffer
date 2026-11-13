/**
 * 配置导出 / 导入的纯逻辑：不碰 electron，方便单测。
 * 主进程只负责文件读写、系统弹窗与设备落库。
 */

export const SETTINGS_APP_TAG = 'lunaris'
export const SETTINGS_FORMAT = 1

/** 跟着配置文件走的字段：都是偏好 */
export const SETTINGS_EXPORT_KEYS = [
  'theme',
  'skin',
  'layout',
  'thumbQuality',
  'thumbCacheLimitMB',
  'importOptions',
  'autoTag',
  'aiScoreMinRating',
  'aiFolderIds',
  'xmp',
  'embeddingModel',
  'clipAutoIndex',
  'useCase',
  'grownFeatures',
  'pick',
  'finals',
  'llm'
] as const

/** 明确不跟着走的字段：导入时如果出现，记进 skipped */
export const SETTINGS_BLOCKED_KEYS = ['library', 'libraries', 'libraryIndex', 'relocate']

export interface SettingsFilePayload {
  app: typeof SETTINGS_APP_TAG
  format: number
  exportedAt: number
  config: Record<string, unknown>
  gear: unknown[]
}

/** 机器相关的绝对路径不跟着配置走：换机后这些路径不存在，留着只会误导 */
function stripMachinePaths(config: Record<string, unknown>): void {
  for (const key of ['pick', 'finals']) {
    const value = config[key]
    if (!value || typeof value !== 'object') continue
    const copy = { ...(value as Record<string, unknown>) }
    delete copy.lastDir
    config[key] = copy
  }
  if (config.autoBackup && typeof config.autoBackup === 'object') {
    const copy = { ...(config.autoBackup as Record<string, unknown>) }
    delete copy.directory
    config.autoBackup = copy
  }
}

/** 组装要写进文件的 JSON；发现疑似密钥直接抛错 */
export function buildSettingsFile(
  config: Record<string, unknown>,
  gear: unknown[],
  now = Date.now()
): { json: string; payload: SettingsFilePayload } {
  const exported: Record<string, unknown> = {}
  for (const key of SETTINGS_EXPORT_KEYS) {
    if (config[key] !== undefined) exported[key] = config[key]
  }
  if (config.autoBackup && typeof config.autoBackup === 'object') {
    const backup = { ...(config.autoBackup as Record<string, unknown>) }
    delete backup.lastRunAt
    exported.autoBackup = backup
  }
  stripMachinePaths(exported)

  const payload: SettingsFilePayload = {
    app: SETTINGS_APP_TAG,
    format: SETTINGS_FORMAT,
    exportedAt: now,
    config: exported,
    gear
  }
  const json = JSON.stringify(payload, null, 2)
  if (/sk-[A-Za-z0-9_-]{8,}/.test(json)) {
    throw new Error('导出内容里检测到疑似密钥，已中止')
  }
  return { json, payload }
}

/** 解析并校验配置文件；返回白名单内的配置与被跳过的字段 */
export function parseSettingsFile(text: string): {
  config: Record<string, unknown>
  gear: unknown[]
  skipped: string[]
} {
  let payload: {
    app?: unknown
    format?: unknown
    config?: unknown
    gear?: unknown
  }
  try {
    payload = JSON.parse(text) as typeof payload
  } catch {
    throw new Error('这不是有效的 JSON 文件')
  }
  if (payload.app !== SETTINGS_APP_TAG) throw new Error('这不是月相的配置文件')
  if (payload.format !== SETTINGS_FORMAT) throw new Error('配置文件版本不支持')

  const source = (payload.config ?? {}) as Record<string, unknown>
  const config: Record<string, unknown> = {}
  for (const key of SETTINGS_EXPORT_KEYS) {
    if (source[key] !== undefined) config[key] = source[key]
  }
  if (source.autoBackup && typeof source.autoBackup === 'object') {
    config.autoBackup = source.autoBackup
  }
  stripMachinePaths(config)
  const skipped = SETTINGS_BLOCKED_KEYS.filter((key) => source[key] !== undefined)
  return { config, gear: Array.isArray(payload.gear) ? payload.gear : [], skipped }
}
