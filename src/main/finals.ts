import { existsSync, mkdirSync } from 'node:fs'
import { copyFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import sharp from 'sharp'
import { getItemFile, getItemsByIds } from './repo'
import { log } from './logger'
import { loadLogo, textWidth, watermarkBlockSvg, type LogoAsset } from './watermark'
import type {
  FinalsExportFailure,
  FinalsExportInput,
  FinalsExportMode,
  FinalsExportProgress,
  FinalsExportResult,
  PickWatermarkStyle
} from '../shared/types'

const MAX_ITEMS = 2000

const EXT_OF: Record<FinalsExportMode, string> = {
  jpeg: '.jpg',
  png: '.png',
  webp: '.webp',
  copy: ''
}

/** 一张待导出的照片：原文件用于复制，file 是可解码的那份（RAW 取导入时抽出的预览） */
export interface FinalsSource {
  id: number
  name: string
  path: string
  file: string | null
}

/** Windows 文件名禁用字符 + 结尾的点/空格，清掉免得写不进去 */
function safeBase(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
  return cleaned || 'photo'
}

/** 同名文件不覆盖，直接加序号 */
function uniquePath(dir: string, base: string, ext: string): { path: string; renamed: boolean } {
  let candidate = join(dir, `${base}${ext}`)
  let n = 2
  while (existsSync(candidate)) {
    candidate = join(dir, `${base}-${n}${ext}`)
    n += 1
  }
  return { path: candidate, renamed: n > 2 }
}

/**
 * 重新编码一张照片。
 * 水印要按缩放后的实际像素算尺寸，所以先按 EXIF 方向算出最终宽高，
 * 再在同一条管线里 resize + composite，避免 raw 往返把 EXIF 弄丢。
 */
async function renderImage(
  file: string,
  mode: Exclude<FinalsExportMode, 'copy'>,
  maxEdge: number | null,
  quality: number,
  label: string,
  style: PickWatermarkStyle,
  logo: LogoAsset | null,
  keepMetadata: boolean
): Promise<Buffer> {
  const meta = await sharp(file, { failOn: 'none' }).metadata()
  const oriented = meta.autoOrient ?? { width: meta.width ?? 0, height: meta.height ?? 0 }
  const longest = Math.max(oriented.width, oriented.height)
  const scale = maxEdge && longest > maxEdge ? maxEdge / longest : 1
  const width = Math.max(1, Math.round(oriented.width * scale))
  const height = Math.max(1, Math.round(oriented.height * scale))

  let pipeline = sharp(file, { failOn: 'none' })
    .rotate()
    .flatten({ background: '#ffffff' })
    .toColourspace('srgb')
  if (maxEdge) {
    pipeline = pipeline.resize(maxEdge, maxEdge, { fit: 'inside', withoutEnlargement: true })
  }
  if (label) {
    let fontSize = Math.max(10, Math.round(Math.min(width, height) * style.fontScale))
    const maxWidth = Math.round(Math.min(width, height) * 0.62)
    while (fontSize > 9 && textWidth(label, fontSize) > maxWidth) fontSize -= 1
    const logoWidth = logo
      ? Math.max(40, Math.min(Math.round(width * 0.5), Math.round(width * style.logoScale)))
      : 0
    pipeline = pipeline.composite([
      {
        input: watermarkBlockSvg(label, fontSize, style, logo, logoWidth),
        gravity: style.position
      }
    ])
  }
  // keepMetadata 时整份 EXIF/GPS 跟着走，方向已转正由 sharp 写成 1；
  // 关闭时只挂 sRGB 配置，读不到任何拍摄信息
  pipeline = keepMetadata ? pipeline.withMetadata() : pipeline.withIccProfile('srgb')

  if (mode === 'jpeg') return pipeline.jpeg({ quality }).toBuffer()
  if (mode === 'webp') return pipeline.webp({ quality }).toBuffer()
  return pipeline.png().toBuffer()
}

/** 先写 .part 再改名：中途崩了或断电，目标目录里不会留半截文件 */
async function writeAtomic(target: string, write: (temp: string) => Promise<void>): Promise<void> {
  const temp = `${target}.part`
  try {
    await write(temp)
    await rename(temp, target)
  } catch (error) {
    await unlink(temp).catch(() => undefined)
    throw error
  }
}

/**
 * 真正干活的版本：不碰数据库，传入照片清单即可，方便单独测。
 * 同名按 collision 策略处理：rename 自动加序号，skip 直接跳过。
 */
export async function exportFinalsTo(
  input: FinalsExportInput,
  dir: string,
  sources: FinalsSource[],
  onProgress?: (progress: FinalsExportProgress) => void
): Promise<FinalsExportResult> {
  const mode: FinalsExportMode =
    input.mode === 'copy' || input.mode === 'png' || input.mode === 'webp' ? input.mode : 'jpeg'
  mkdirSync(dir, { recursive: true })

  const label = mode === 'copy' ? '' : String(input.watermark ?? '').trim()
  const style = input.watermarkStyle
  const logo = label ? await loadLogo(style.logo) : null
  const quality = Math.min(95, Math.max(60, Math.round(Number(input.quality) || 90)))
  const maxEdge =
    mode !== 'copy' && Number.isFinite(Number(input.maxEdge)) ? Number(input.maxEdge) : null
  const prefix = safeBase(String(input.prefix ?? '').trim() || 'export')
  const keepMetadata = input.keepMetadata === true
  const collision = input.collision === 'skip' ? 'skip' : 'rename'

  const failed: FinalsExportFailure[] = []
  let count = 0
  let bytes = 0
  let renamed = 0
  let skipped = 0
  let done = 0

  for (const [position, source] of sources.entries()) {
    onProgress?.({ done, total: sources.length, current: source.name })
    try {
      const file = mode === 'copy' ? source.path : source.file
      if (!file || !existsSync(file)) throw new Error('原文件不在了')

      const base =
        input.naming === 'prefix'
          ? `${prefix}-${String(position + 1).padStart(3, '0')}`
          : safeBase(basename(source.name, extname(source.name)))
      const ext = mode === 'copy' ? extname(file) : EXT_OF[mode]
      let target = join(dir, `${base}${ext}`)
      let targetRenamed = false

      if (collision === 'skip') {
        if (existsSync(target)) {
          skipped += 1
          done += 1
          onProgress?.({ done, total: sources.length, current: source.name })
          continue
        }
      } else {
        const unique = uniquePath(dir, base, ext)
        target = unique.path
        targetRenamed = unique.renamed
      }

      await writeAtomic(target, async (temp) => {
        if (mode === 'copy') {
          await copyFile(file, temp)
          return
        }
        const buffer = await renderImage(
          file,
          mode,
          maxEdge,
          quality,
          label,
          style,
          logo,
          keepMetadata
        )
        await writeFile(temp, buffer)
      })

      bytes += (await stat(target)).size
      count += 1
      if (targetRenamed) renamed += 1
    } catch (error) {
      failed.push({ id: source.id, name: source.name, message: (error as Error).message })
      void log.warn('finals', '导出跳过一张', { id: source.id, error: (error as Error).message })
    }
    done += 1
    onProgress?.({ done, total: sources.length, current: source.name })
  }

  // 全部重名被跳过是正常结果，不算失败；真的全军覆没才报错
  if (count === 0 && skipped === 0) throw new Error('所有照片都没能导出')
  return { dir, count, bytes, renamed, skipped, failed }
}

/** 导出成品：从图库取照片清单，再交给 exportFinalsTo */
export async function exportFinals(
  input: FinalsExportInput,
  dir: string,
  onProgress?: (progress: FinalsExportProgress) => void
): Promise<FinalsExportResult> {
  const ids = [...new Set((input.itemIds ?? []).filter((id) => Number.isFinite(id)))]
  if (ids.length === 0) throw new Error('没有选中照片')
  if (ids.length > MAX_ITEMS) throw new Error(`一次最多导出 ${MAX_ITEMS} 张`)

  const items = getItemsByIds(ids)
  if (items.length !== ids.length) throw new Error('有照片已经不在图库里，请刷新后再试')

  return exportFinalsTo(
    input,
    dir,
    items.map((item) => ({
      id: item.id,
      name: item.name,
      path: item.path,
      file: getItemFile(item.id)
    })),
    onProgress
  )
}
