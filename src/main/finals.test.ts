import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PICK_WATERMARK_DEFAULT } from '../shared/pick'

vi.mock('electron', () => ({ app: { getPath: () => process.cwd() } }))
vi.mock('./logger', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const { exportFinalsTo } = await import('./finals')

const sources = (file: string) => [{ id: 1, name: 'A.jpg', path: file, file }]
const baseInput = {
  itemIds: [1],
  mode: 'jpeg' as const,
  maxEdge: null,
  quality: 90,
  naming: 'original' as const,
  prefix: '',
  watermark: '',
  watermarkStyle: PICK_WATERMARK_DEFAULT,
  keepMetadata: false,
  collision: 'rename' as const
}

let root = ''
let source = ''

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'lunaris-finals-'))
  source = join(root, 'A.jpg')
  // 1200×800 的纯色图，够检查缩放和水印
  await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#4a6fa5' } })
    .jpeg({ quality: 92 })
    .toFile(source)
})

describe('exportFinalsTo', () => {
  it('按长边缩放，前缀序号命名', async () => {
    const dir = join(root, 'out')
    const result = await exportFinalsTo(
      { ...baseInput, maxEdge: 640, naming: 'prefix', prefix: '小林' },
      dir,
      sources(source)
    )

    expect(result.count).toBe(1)
    expect(result.failed).toHaveLength(0)
    expect(readdirSync(dir)).toEqual(['小林-001.jpg'])

    const meta = await sharp(join(dir, '小林-001.jpg')).metadata()
    expect(meta.width).toBe(640)
    expect(meta.height).toBe(427)
  })

  it('不缩放时保持原尺寸', async () => {
    const dir = join(root, 'out')
    await exportFinalsTo({ ...baseInput, maxEdge: null }, dir, sources(source))
    const meta = await sharp(join(dir, 'A.jpg')).metadata()
    expect(meta.width).toBe(1200)
    expect(meta.height).toBe(800)
  })

  it('同名文件不覆盖，自动加序号', async () => {
    const dir = join(root, 'out')
    const first = await exportFinalsTo(baseInput, dir, sources(source))
    const second = await exportFinalsTo(baseInput, dir, sources(source))

    expect(first.renamed).toBe(0)
    expect(second.renamed).toBe(1)
    expect(readdirSync(dir).sort()).toEqual(['A-2.jpg', 'A.jpg'])
  })

  it('原件复制逐字节一致，保留原扩展名', async () => {
    const dir = join(root, 'out')
    const result = await exportFinalsTo({ ...baseInput, mode: 'copy' }, dir, sources(source))
    expect(result.count).toBe(1)
    expect(readFileSync(join(dir, 'A.jpg')).equals(readFileSync(source))).toBe(true)
  })

  it('水印会改像素但不改尺寸', async () => {
    const plain = join(root, 'plain')
    const stamped = join(root, 'stamped')
    await exportFinalsTo(baseInput, plain, sources(source))
    await exportFinalsTo(
      { ...baseInput, watermark: '银月影像' },
      stamped,
      sources(source)
    )

    const a = readFileSync(join(plain, 'A.jpg'))
    const b = readFileSync(join(stamped, 'A.jpg'))
    expect(a.equals(b)).toBe(false)
    const meta = await sharp(b).metadata()
    expect(meta.width).toBe(1200)
    expect(meta.height).toBe(800)
  })

  it('某张读不出来只记失败，其余照常导出', async () => {
    const dir = join(root, 'out')
    const result = await exportFinalsTo(
      baseInput,
      dir,
      [
        { id: 1, name: 'A.jpg', path: source, file: source },
        { id: 2, name: 'B.jpg', path: join(root, 'missing.jpg'), file: join(root, 'missing.jpg') }
      ]
    )
    expect(result.count).toBe(1)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].name).toBe('B.jpg')
    expect(existsSync(join(dir, 'A.jpg'))).toBe(true)
  })

  it('全部失败时抛错，不留下空目录结果', async () => {
    await expect(
      exportFinalsTo(baseInput, join(root, 'out'), [
        { id: 9, name: 'X.jpg', path: join(root, 'none.jpg'), file: join(root, 'none.jpg') }
      ])
    ).rejects.toThrow('所有照片都没能导出')
  })

  it('PNG 与 WebP 输出对应扩展名与格式', async () => {
    const pngDir = join(root, 'png')
    await exportFinalsTo({ ...baseInput, mode: 'png', maxEdge: 640 }, pngDir, sources(source))
    expect(readdirSync(pngDir)).toEqual(['A.png'])
    const pngMeta = await sharp(join(pngDir, 'A.png')).metadata()
    expect(pngMeta.format).toBe('png')
    expect(pngMeta.width).toBe(640)

    const webpDir = join(root, 'webp')
    await exportFinalsTo({ ...baseInput, mode: 'webp', quality: 80 }, webpDir, sources(source))
    expect(readdirSync(webpDir)).toEqual(['A.webp'])
    expect((await sharp(join(webpDir, 'A.webp')).metadata()).format).toBe('webp')
  })

  it('关闭元数据时读不到 EXIF，开启时保留拍摄信息', async () => {
    const tagged = join(root, 'tagged.jpg')
    await sharp({ create: { width: 800, height: 600, channels: 3, background: '#2f4858' } })
      .jpeg({ quality: 92 })
      .withExif({ IFD0: { Make: 'LunarisCam', Model: 'Zf' } })
      .toFile(tagged)

    const plainDir = join(root, 'plain-meta')
    await exportFinalsTo({ ...baseInput, keepMetadata: false }, plainDir, sources(tagged))
    const plain = await sharp(join(plainDir, 'A.jpg')).metadata()
    expect(plain.exif).toBeFalsy()
    // 关闭元数据仍要带 sRGB 色彩配置，避免看图软件按设备色彩猜
    expect(plain.icc).toBeTruthy()

    const keepDir = join(root, 'keep-meta')
    await exportFinalsTo({ ...baseInput, keepMetadata: true }, keepDir, sources(tagged))
    const kept = await sharp(join(keepDir, 'A.jpg')).metadata()
    expect(kept.exif?.toString('latin1').includes('LunarisCam')).toBe(true)
  })

  it('同名跳过策略不覆盖已有文件', async () => {
    const dir = join(root, 'skip')
    const first = await exportFinalsTo(baseInput, dir, sources(source))
    const second = await exportFinalsTo({ ...baseInput, collision: 'skip' }, dir, sources(source))

    expect(first.skipped).toBe(0)
    expect(second.count).toBe(0)
    expect(second.skipped).toBe(1)
    expect(readdirSync(dir)).toEqual(['A.jpg'])
  })

  it('导出完成后不留下 .part 临时文件', async () => {
    const dir = join(root, 'atomic')
    await exportFinalsTo(baseInput, dir, sources(source))
    expect(readdirSync(dir).some((name) => name.endsWith('.part'))).toBe(false)
  })

  it('20 张逐张比对：尺寸按长边缩放，色彩不串', async () => {
    const inputs = [] as Array<{ id: number; name: string; path: string; file: string }>
    const tones: Array<[number, number, number, number, number]> = []
    for (let i = 0; i < 20; i += 1) {
      const width = 600 + (i % 4) * 200
      const height = 400 + (i % 3) * 100
      const r = 30 + i * 10
      const g = 60 + i * 5
      const b = 90 + i * 4
      const file = join(root, `batch-${i}.jpg`)
      await sharp({ create: { width, height, channels: 3, background: { r, g, b } } })
        .jpeg({ quality: 95 })
        .toFile(file)
      inputs.push({ id: i + 1, name: `batch-${i}.jpg`, path: file, file })
      tones.push([r, g, b, width, height])
    }

    const dir = join(root, 'batch-out')
    const result = await exportFinalsTo({ ...baseInput, maxEdge: 400 }, dir, inputs)
    expect(result.count).toBe(20)
    expect(result.failed).toHaveLength(0)

    for (const [index, tone] of tones.entries()) {
      const [r, g, b, width, height] = tone
      const file = join(dir, `batch-${index}.jpg`)
      const meta = await sharp(file).metadata()
      expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(400)
      expect(meta.width).toBe(width >= height ? 400 : Math.round((width / height) * 400))
      // 纯色图重新编码后中心像素仍应接近原色，避免色彩空间被搞乱
      const { data } = await sharp(file).raw().toBuffer({ resolveWithObject: true })
      const center = Math.floor(data.length / 2)
      expect(Math.abs(data[center] - r)).toBeLessThanOrEqual(6)
      expect(Math.abs(data[center + 1] - g)).toBeLessThanOrEqual(6)
      expect(Math.abs(data[center + 2] - b)).toBeLessThanOrEqual(6)
    }
  })

  it('EXIF 方向在导出时转正', async () => {
    const portrait = join(root, 'rotated.jpg')
    await sharp({ create: { width: 600, height: 800, channels: 3, background: '#8a5a44' } })
      .jpeg({ quality: 92 })
      .withMetadata({ orientation: 6 })
      .toFile(portrait)
    expect((await sharp(portrait).metadata()).orientation).toBe(6)

    const dir = join(root, 'rotated-out')
    await exportFinalsTo(baseInput, dir, sources(portrait))
    const meta = await sharp(join(dir, 'A.jpg')).metadata()
    // 原图宽 600 高 800，方向 6 表示要顺时针转 90 度 → 导出应为 800×600
    expect(meta.width).toBe(800)
    expect(meta.height).toBe(600)
    expect(meta.orientation ?? 1).toBe(1)
  })
})
