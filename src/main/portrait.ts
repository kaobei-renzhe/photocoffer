import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import * as ort from 'onnxruntime-node'
import sharp from 'sharp'
import type { PortraitFlag, PortraitStatus } from '../shared/types'
import { getDb } from './db'
import { getItemFile, thumbPathFor } from './repo'
import { log } from './logger'
import { downloadFiles, type DownloadProgress } from './clip/download'
import type { ModelFileSpec } from './clip/models'

/**
 * 人像检测：DETR-ResNet-50（COCO，Apache-2.0），只判断画面里有没有人。
 * 与语义索引用的 CLIP 完全独立，避免「风景分数更高就漏掉人像」的问题。
 */
const MODEL_FILE = 'detr-resnet-50-int8.onnx'
const MODEL_URL = 'https://hf-mirror.com/Xenova/detr-resnet-50/resolve/main/onnx/model_quantized.onnx'
const MODEL_SIZE = 43_102_531
const MODEL_TAG = 'detr-resnet-50-int8-640'
const INPUT_SIZE = 640
/** 实测人像 1.00、纯风景 0.27，取 0.5 留足安全边际 */
const PERSON_THRESHOLD = 0.5
/** COCO 里 person = 1；index 91 是 no-object */
const PERSON_CLASS = 1

const MODEL_FILES: ModelFileSpec[] = [{ name: MODEL_FILE, url: MODEL_URL, size: MODEL_SIZE }]

function modelDir(): string {
  return join(app.getPath('userData'), 'models', 'person-detr')
}

export function resolvePersonModel(): string | null {
  try {
    const file = join(modelDir(), MODEL_FILE)
    return existsSync(file) && statSync(file).size === MODEL_SIZE ? file : null
  } catch {
    return null
  }
}

export function resetPersonModel(): void {
  sessionPromise = null
}

let sessionPromise: Promise<ort.InferenceSession> | null = null

function session(): Promise<ort.InferenceSession> {
  if (sessionPromise) return sessionPromise
  const file = resolvePersonModel()
  if (!file) return Promise.reject(new Error('人像识别模型还没下载'))
  sessionPromise = ort.InferenceSession.create(file, {
    intraOpNumThreads: 2,
    interOpNumThreads: 1,
    executionMode: 'sequential'
  }).catch((error) => {
    sessionPromise = null
    throw error
  })
  return sessionPromise
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value))
}

/**
 * DETR 的检测结果按 query 取 argmax；只有 argmax 是 person 的 query 才算数。
 * person 分数高但 argmax 落到别的类目时不能算人像，否则风景会被误判。
 */
export function personScoreFromLogits(
  data: Float32Array,
  queries: number,
  classes: number
): number {
  let best = 0
  for (let q = 0; q < queries; q++) {
    const base = q * classes
    let argmax = 0
    let max = -Infinity
    for (let c = 0; c < classes; c++) {
      const value = data[base + c]
      if (value > max) {
        max = value
        argmax = c
      }
    }
    if (argmax === PERSON_CLASS) {
      const score = sigmoid(max)
      if (score > best) best = score
    }
  }
  return best
}

async function detectFile(file: string): Promise<number> {
  const { data } = await sharp(file, { failOn: 'none' })
    .resize(INPUT_SIZE, INPUT_SIZE, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const mean = [0.485, 0.456, 0.406]
  const std = [0.229, 0.224, 0.225]
  const floats = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE)
  for (let i = 0; i < INPUT_SIZE * INPUT_SIZE; i++) {
    for (let c = 0; c < 3; c++) {
      floats[c * INPUT_SIZE * INPUT_SIZE + i] = (data[i * 3 + c] / 255 - mean[c]) / std[c]
    }
  }

  const model = await session()
  const feeds: Record<string, ort.Tensor> = {
    pixel_values: new ort.Tensor('float32', floats, [1, 3, INPUT_SIZE, INPUT_SIZE])
  }
  if (model.inputNames.includes('pixel_mask')) {
    // DETR 导出把 mask 固化成 64×64；全 1 表示没有 padding
    const meta = model.inputMetadata.find((entry) => entry.name === 'pixel_mask')
    const shape = meta && 'shape' in meta ? meta.shape : []
    const height = Number(shape[1])
    const width = Number(shape[2])
    const maskHeight = Number.isFinite(height) && height > 0 ? height : 64
    const maskWidth = Number.isFinite(width) && width > 0 ? width : 64
    feeds.pixel_mask = new ort.Tensor(
      'int64',
      new BigInt64Array(maskHeight * maskWidth).fill(1n),
      [1, maskHeight, maskWidth]
    )
  }

  const output = await model.run(feeds)
  const logits = output.logits
  return personScoreFromLogits(
    logits.data as Float32Array,
    Number(logits.dims[1]),
    Number(logits.dims[2])
  )
}

/** 优先用已生成的中档缩略图：RAW 也能检测，速度也比解原图快 */
function sourceFor(id: number): string | null {
  const thumb = thumbPathFor(id, 'mid')
  if (existsSync(thumb)) return thumb
  return getItemFile(id)
}

export function portraitStatus(): PortraitStatus {
  const db = getDb()
  const total = (
    db.prepare('SELECT COUNT(*) AS c FROM items WHERE trashed = 0 AND missing = 0').get() as {
      c: number
    }
  ).c
  let detected = 0
  try {
    detected = (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM person_flags f
           JOIN items i ON i.id = f.item_id
           WHERE f.model = ? AND i.trashed = 0 AND i.missing = 0`
        )
        .get(MODEL_TAG) as { c: number }
    ).c
  } catch {
    /* 老库还没迁移完时先报 0 */
  }
  return {
    modelReady: resolvePersonModel() !== null,
    modelBytes: MODEL_SIZE,
    detected,
    total
  }
}

export function downloadPersonModel(
  onProgress: (progress: DownloadProgress) => void
): Promise<string> {
  return downloadFiles(modelDir(), MODEL_FILES, onProgress).finally(() => resetPersonModel())
}

export async function scanPortrait(ids: number[]): Promise<PortraitFlag[]> {
  if (!resolvePersonModel()) throw new Error('人像识别模型还没下载')
  const db = getDb()
  const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))]
  const cached = db.prepare('SELECT has_person, score FROM person_flags WHERE item_id = ? AND model = ?')
  const upsert = db.prepare(
    `INSERT INTO person_flags(item_id, has_person, score, model, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(item_id) DO UPDATE SET
       has_person = excluded.has_person,
       score = excluded.score,
       model = excluded.model,
       updated_at = excluded.updated_at`
  )

  const flags: PortraitFlag[] = []
  for (const id of unique) {
    const row = cached.get(id, MODEL_TAG) as { has_person: number; score: number } | undefined
    if (row) {
      flags.push({ id, hasPerson: row.has_person === 1, score: row.score })
    } else {
      const source = sourceFor(id)
      let score = 0
      // 失败时本次先按有人显示，但不落库：下次还能重试，避免把失败永久当成结论
      let hasPerson = true
      let resolved = false
      if (source) {
        try {
          score = await detectFile(source)
          hasPerson = score >= PERSON_THRESHOLD
          resolved = true
        } catch (error) {
          void log.warn('portrait', '人像检测失败，本次先按有人显示', {
            id,
            error: String((error as Error)?.message ?? error)
          })
        }
      }
      if (resolved) upsert.run(id, hasPerson ? 1 : 0, score, MODEL_TAG, Date.now())
      flags.push({ id, hasPerson, score })
    }
  }
  return flags
}
