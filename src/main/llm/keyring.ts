import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, safeStorage } from 'electron'
import { LlmError } from './types'

/**
 * 密钥管理：按模型分别存放，只以系统加密（Windows DPAPI / macOS Keychain）形式落盘。
 * 若当前系统拿不到加密能力，宁可不保存，也不写明文。
 * 老版本的单一 llm-key.bin 会在第一次读 m_legacy 时解密并复制过来。
 */
function keyDir(): string {
  return join(app.getPath('userData'), 'llm-keys')
}

function safeModelId(modelId: string): string {
  return modelId.replace(/[^\w.-]/g, '_') || 'default'
}

function keyFile(modelId: string): string {
  return join(keyDir(), `${safeModelId(modelId)}.bin`)
}

function legacyKeyFile(): string {
  return join(app.getPath('userData'), 'llm-key.bin')
}

export async function encryptionAvailable(): Promise<boolean> {
  try {
    return await safeStorage.isAsyncEncryptionAvailable()
  } catch {
    return false
  }
}

async function decrypt(file: string): Promise<string | null> {
  if (!existsSync(file)) return null
  try {
    const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(readFileSync(file))
    // 系统密钥轮换后建议重新加密，顺手更新，避免下次又走一遍
    if (shouldReEncrypt) {
      try {
        writeFileSync(file, await safeStorage.encryptStringAsync(result))
      } catch {
        /* 重新加密失败不影响本次读取 */
      }
    }
    return result
  } catch {
    // 换了机器/系统账户后旧密文解不开，按"没有密钥"处理
    return null
  }
}

/** 老版本的单密钥 → 模型的密钥文件；只在目标不存在时迁移一次 */
export async function migrateLegacyKey(modelId = 'm_legacy'): Promise<void> {
  const target = keyFile(modelId)
  if (existsSync(target)) return
  const legacy = legacyKeyFile()
  if (!existsSync(legacy)) return
  const key = await decrypt(legacy)
  if (!key) return
  try {
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, await safeStorage.encryptStringAsync(key))
  } catch {
    /* 迁移失败就继续走旧文件，读取时还有兜底 */
  }
}

export async function saveKey(modelId: string, key: string): Promise<void> {
  const trimmed = key.trim()
  if (!trimmed) throw new LlmError('not_configured', 'API Key 不能为空')
  if (!(await encryptionAvailable())) {
    throw new LlmError('not_configured', '系统加密不可用，已拒绝保存明文密钥')
  }
  const file = keyFile(modelId)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, await safeStorage.encryptStringAsync(trimmed))
}

export async function readKey(modelId: string): Promise<string | null> {
  const direct = await decrypt(keyFile(modelId))
  if (direct) return direct
  // 迁移过但复制失败时，至少让老模型还能用旧文件
  if (modelId === 'm_legacy') return decrypt(legacyKeyFile())
  return null
}

export function clearKey(modelId: string): void {
  try {
    rmSync(keyFile(modelId), { force: true })
  } catch {
    /* 删不掉也不影响：读不到就当作没密钥 */
  }
}

/** 只告诉界面「存没存」，不回传任何字符，避免掩码本身泄露密钥 */
export async function keyHint(modelId: string): Promise<string | null> {
  const key = await readKey(modelId)
  return key ? '已保存' : null
}
