import { existsSync } from 'node:fs'
import sharp from 'sharp'
import type { NoteRegion } from '../../shared/types'
import { getItemFile, previewPathFor } from '../repo'
import { LlmError, type LlmContentPart } from './types'

export interface PreparedImage {
  part: LlmContentPart
  width: number
  height: number
  /** 实际送到模型的像素尺寸，便于提示词里说明 */
  maxEdge: number
}

async function render(file: string, maxEdge: number) {
  const result = await sharp(file, { failOn: 'none' })
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer({ resolveWithObject: true })
  return { buffer: result.data, width: result.info.width, height: result.info.height }
}

/**
 * 把一张图压到适合视觉模型的大小（默认长边 1024）。
 * RAW / TIFF / HEIF 优先用导入时生成的预览，避免 sharp 解不动原文件。
 */
export async function prepareImage(itemId: number, maxEdge = 1024): Promise<PreparedImage> {
  const file = getItemFile(itemId)
  if (!file || !existsSync(file)) {
    throw new LlmError('bad_request', `图片 ${itemId} 的源文件不可用`)
  }

  let rendered
  try {
    rendered = await render(file, maxEdge)
  } catch {
    const preview = previewPathFor(itemId)
    if (!existsSync(preview)) {
      throw new LlmError('bad_request', `图片 ${itemId} 无法解码，也没有可用预览`)
    }
    rendered = await render(preview, maxEdge)
  }

  return {
    part: { type: 'image', mime: 'image/jpeg', base64: rendered.buffer.toString('base64') },
    width: rendered.width,
    height: rendered.height,
    maxEdge
  }
}

/** 圈选区域外扩 8%：裁太紧模型看不到区域与周围的关系，摄影判断很依赖这个关系 */
function expandRegion(region: NoteRegion, pad = 0.08): NoteRegion {
  const left = Math.max(0, region.x - region.w * pad)
  const top = Math.max(0, region.y - region.h * pad)
  const right = Math.min(1, region.x + region.w * (1 + pad))
  const bottom = Math.min(1, region.y + region.h * (1 + pad))
  return { x: left, y: top, w: Math.max(0.001, right - left), h: Math.max(0.001, bottom - top) }
}

async function renderRegion(file: string, region: NoteRegion, maxEdge: number) {
  const meta = await sharp(file, { failOn: 'none' }).metadata()
  // EXIF 旋转过的照片要按「转正后」的尺寸折算坐标，否则裁出来的区域会偏 90°
  const width = meta.autoOrient?.width ?? meta.width
  const height = meta.autoOrient?.height ?? meta.height
  if (!width || !height) throw new Error('无法读取图片尺寸')

  const left = Math.max(0, Math.min(width - 1, Math.round(region.x * width)))
  const top = Math.max(0, Math.min(height - 1, Math.round(region.y * height)))
  const cropW = Math.max(1, Math.min(width - left, Math.round(region.w * width)))
  const cropH = Math.max(1, Math.min(height - top, Math.round(region.h * height)))

  const result = await sharp(file, { failOn: 'none' })
    .rotate()
    .extract({ left, top, width: cropW, height: cropH })
    .resize({ width: maxEdge, height: maxEdge, fit: 'inside' })
    .jpeg({ quality: 85 })
    .toBuffer({ resolveWithObject: true })
  return { buffer: result.data, width: result.info.width, height: result.info.height }
}

/**
 * 裁出圈选区域的局部图，和整图一起送给视觉模型。
 * 整图缩到 1024 后，一个 80×80 的局部只剩几十像素，模型根本看不清细节。
 */
export async function prepareRegionImage(
  itemId: number,
  region: NoteRegion,
  maxEdge = 768
): Promise<PreparedImage> {
  const file = getItemFile(itemId)
  if (!file || !existsSync(file)) {
    throw new LlmError('bad_request', `图片 ${itemId} 的源文件不可用`)
  }

  const target = expandRegion(region)
  let rendered
  try {
    rendered = await renderRegion(file, target, maxEdge)
  } catch {
    const preview = previewPathFor(itemId)
    if (!existsSync(preview)) {
      throw new LlmError('bad_request', `图片 ${itemId} 无法解码，也没有可用预览`)
    }
    rendered = await renderRegion(preview, target, maxEdge)
  }

  return {
    part: { type: 'image', mime: 'image/jpeg', base64: rendered.buffer.toString('base64') },
    width: rendered.width,
    height: rendered.height,
    maxEdge
  }
}
