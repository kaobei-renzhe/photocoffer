import { readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import type { AppConfig } from './settings'
import { readConfig, updateConfig } from './settings'
import { listGear, saveGear } from './gear'
import { readKey } from './llm/keyring'
import { normalizeLlmSettings, saveLlmSettings } from './llm/config'
import { buildSettingsFile, parseSettingsFile } from '../shared/settingsTransfer'
import type { GearSpec, SettingsExportResult, SettingsImportResult } from '../shared/types'
import type { LlmStoredSettings } from '../shared/llm'

const MAX_IMPORT_BYTES = 2 * 1024 * 1024

export function exportSettings(file: string): SettingsExportResult {
  const gear = listGear()
  const { json } = buildSettingsFile(readConfig() as unknown as Record<string, unknown>, gear)
  const temp = `${file}.part`
  writeFileSync(temp, json, 'utf8')
  renameSync(temp, file)
  return { path: file, bytes: Buffer.byteLength(json), gear: gear.length }
}

export async function importSettings(file: string): Promise<SettingsImportResult> {
  let size = 0
  try {
    const stat = statSync(file)
    if (!stat.isFile()) throw new Error('不是文件')
    size = stat.size
  } catch {
    throw new Error('配置文件不存在或无法读取')
  }
  if (size > MAX_IMPORT_BYTES) {
    throw new Error('配置文件超过 2 MB，可能不是存照的配置')
  }
  const { config, gear: incoming, skipped } = parseSettingsFile(readFileSync(file, 'utf8'))

  const importedKeys = Object.keys(config).length
  if (importedKeys > 0) {
    // llm 走归一化与旧结构镜像，避免外部 JSON 写坏模型配置
    const { llm, ...rest } = config
    if (Object.keys(rest).length > 0) updateConfig(rest as Partial<AppConfig>)
    if (llm) saveLlmSettings(normalizeLlmSettings(llm as LlmStoredSettings))
  }

  // 设备按 id 合并：同一台设备更新参数，新设备追加，不复制整套图库记录
  let gear = 0
  const existing = new Set(listGear().map((item) => item.id))
  for (const item of incoming) {
    if (!item || typeof item !== 'object') continue
    const entry = item as Record<string, unknown>
    const spec = entry as unknown as GearSpec & { id?: string }
    try {
      if (typeof entry.id === 'string' && existing.has(entry.id)) {
        saveGear({ ...spec, id: entry.id })
      } else {
        saveGear(spec)
      }
      gear++
    } catch {
      skipped.push(`设备：${String(entry.model ?? '未知')}`)
    }
  }

  // 导入后判断有没有可用模型但缺 Key；只读归一化后的配置，不信任外部 JSON
  const llmSettings = normalizeLlmSettings(readConfig().llm)
  const hasModel = llmSettings.models.some((model) => Boolean(model.model.trim()))
  const modelId = llmSettings.defaultModelId || llmSettings.models[0]?.id || 'm_legacy'
  const needsKey = hasModel && !(await readKey(modelId))
  return { imported: importedKeys, gear, skipped, needsKey }
}
