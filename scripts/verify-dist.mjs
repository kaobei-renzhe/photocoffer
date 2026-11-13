// 用法：npm run verify:dist
// 打包后检查产物里有没有混进别的平台的二进制。
// 混进来的原因几乎只有一种：把别的平台装出来的 node_modules 拷了过来。
import { readdirSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

const isWin = process.platform === 'win32'
const wrong = isWin ? ['darwin', 'linux'] : ['win32', 'linux']

/** Windows: release/win-unpacked/resources/app.asar.unpacked
 *  macOS:   release/mac-arm64/月相.app/Contents/Resources/app.asar.unpacked
 *  两种结构不同，用递归查找，别硬编码路径 */
function findUnpacked(dir, depth = 0) {
  if (depth > 6) return null
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    try {
      if (!statSync(p).isDirectory()) continue
      if (name === 'app.asar.unpacked') return p
      const hit = findUnpacked(p, depth + 1)
      if (hit) return hit
    } catch {
      /* 权限/软链跳过 */
    }
  }
  return null
}

const releaseDir = join(process.cwd(), 'release')
if (!existsSync(releaseDir)) {
  console.error('没有 release 目录，先跑 npm run dist')
  process.exit(1)
}

const unpacked = findUnpacked(releaseDir)
if (!unpacked) {
  console.error('没找到 app.asar.unpacked，先完成一次打包')
  process.exit(1)
}

const res = join(unpacked, 'node_modules')
const problems = []

// onnxruntime 的平台目录
const ortBin = join(res, 'onnxruntime-node', 'bin')
if (existsSync(ortBin)) {
  for (const napi of readdirSync(ortBin)) {
    const p = join(ortBin, napi)
    if (!statSync(p).isDirectory()) continue
    for (const platform of readdirSync(p)) {
      if (wrong.includes(platform)) problems.push(`onnxruntime: ${napi}/${platform}`)
    }
  }
}

// sharp 的平台包
const imgDir = join(res, '@img')
if (existsSync(imgDir)) {
  for (const name of readdirSync(imgDir)) {
    if (wrong.some((p) => name.includes(p))) problems.push(`sharp: ${name}`)
  }
}

console.log(`检查目录：${unpacked}`)
if (problems.length) {
  console.error('✗ 包里混进了其他平台的二进制：')
  problems.forEach((p) => console.error('   ' + p))
  console.error('\n这通常是因为把别的平台装出来的 node_modules 拷了过来。')
  console.error('解决：删掉 node_modules，在当前机器上重新 npm ci 再打包。')
  process.exit(1)
}
console.log(`✓ 产物干净（只有 ${isWin ? 'win32' : 'darwin'}）`)
