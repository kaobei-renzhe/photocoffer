import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 打包后清理 release：保留最近两个版本，回滚和增量更新都靠上一版。
 * 由 `npm run dist` 自动调用。
 */
const dir = join(process.cwd(), 'release')
if (!existsSync(dir)) process.exit(0)

const versionOf = (name) => {
  const match = name.match(/(\d+)\.(\d+)\.(\d+)/)
  return match ? match.slice(1).map(Number) : [0, 0, 0]
}

const compare = (a, b) => {
  const left = versionOf(a)
  const right = versionOf(b)
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] - right[i]
  }
  return 0
}

const entries = readdirSync(dir)
// 不写死产品名：改名后（月相 → 片匣 → 砚白 → 存照）旧版本也要能被识别并清理
const installers = entries
  .filter((name) => /^.+ Setup \d+\.\d+\.\d+\.exe$/.test(name))
  .sort(compare)

if (installers.length <= 2) {
  process.exit(0)
}

const kept = installers.slice(-2)
const keepSet = new Set(kept)
const keepVersions = new Set(kept.map((name) => versionOf(name).join('.')))

for (const name of installers) {
  if (keepSet.has(name)) continue
  rmSync(join(dir, name), { force: true })
  rmSync(join(dir, `${name}.blockmap`), { force: true })
}

for (const name of entries) {
  if (!/^lunaris-\d+\.\d+\.\d+-x64\.nsis\.7z$/.test(name)) continue
  if (keepVersions.has(versionOf(name).join('.'))) continue
  rmSync(join(dir, name), { force: true })
}

console.log(`[release] 保留最近两个版本：${kept.join('、')}`)
