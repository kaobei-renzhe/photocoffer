/**
 * 导入吞吐基准：生成 N 张同尺寸 JPEG，走真实 IPC 导入流程，输出总耗时与单张耗时。
 * --profile 会给主进程做一次 CPU 采样，打印自耗时最高的函数，方便定位瓶颈。
 *
 * 用法：node scripts/bench-import.mjs [--count 40] [--batches 2] [--width 1200] [--height 800]
 *                                  [--noise] [--no-dedupe] [--profile]
 */
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import sharp from 'sharp'

const args = process.argv.slice(2)
const argValue = (name, fallback) => {
  const index = args.indexOf(name)
  return index >= 0 ? Number(args[index + 1]) : fallback
}
const COUNT = argValue('--count', 40)
const BATCHES = argValue('--batches', 2)
const WIDTH = argValue('--width', 1200)
const HEIGHT = argValue('--height', 800)
const PROFILE = args.includes('--profile')
const NOISE = args.includes('--noise')
const DEDUPE = !args.includes('--no-dedupe')

const root = process.cwd()
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const runDir = join(root, '.smoke', `import-bench-${stamp}`)
const userData = join(runDir, 'userData')
const library = join(userData, 'Library')
const incoming = join(runDir, 'incoming')
const electron = join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
const report = { count: COUNT, profile: PROFILE }

for (const dir of [userData, incoming]) mkdirSync(dir, { recursive: true })

/** 生成接近真实照片熵水平的 JPEG：--noise 用噪点，否则用纯色+圆形的低熵图 */
async function makeImages(from, count) {
  const files = []
  for (let index = 0; index < count; index++) {
    const file = join(incoming, `bench-${from + index}.jpg`)
    if (NOISE) {
      await sharp({
        create: {
          width: WIDTH,
          height: HEIGHT,
          channels: 3,
          noise: { type: 'gaussian', mean: 128, sigma: 26 }
        }
      })
        .jpeg({ quality: 82 })
        .toFile(file)
    } else {
      const svg = Buffer.from(
        `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
          <rect width="${WIDTH}" height="${HEIGHT}" fill="rgb(${(index * 37) % 255},${(index * 71) % 255},${(index * 113) % 255})"/>
          <circle cx="${(index * 53) % WIDTH}" cy="${(index * 97) % HEIGHT}" r="${Math.round(WIDTH / 4.6)}" fill="rgb(${(index * 17) % 255},${(index * 151) % 255},${(index * 29) % 255})"/>
          <text x="60" y="120" font-size="64" fill="#ffffff">bench ${from + index}</text>
        </svg>`
      )
      await sharp(svg).jpeg({ quality: 80 }).toFile(file)
    }
    files.push(file)
  }
  return files
}

async function freePort() {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      server.close(() => resolve(port))
    })
  })
}

class Cdp {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data)
      if (!message.id || !this.pending.has(message.id)) return
      const { resolve, reject } = this.pending.get(message.id)
      this.pending.delete(message.id)
      if (message.error) reject(new Error(message.error.message))
      else resolve(message.result)
    }
  }

  send(method, params = {}, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
      const id = ++this.id
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`${method} 超时`))
      }, timeoutMs)
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        }
      })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  async eval(expression, timeoutMs = 180000) {
    const result = await Promise.race([
      this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
      delay(timeoutMs).then(() => {
        throw new Error(`页面脚本超时（${timeoutMs}ms）`)
      })
    ])
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? '页面脚本异常'
      )
    }
    return result.result.value
  }
}

async function connectWs(url, attempts = 160) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const list = await (await fetch(url)).json()
      const target = list.find((item) => item.webSocketDebuggerUrl)
      if (target) {
        const ws = new WebSocket(target.webSocketDebuggerUrl)
        await new Promise((resolve, reject) => {
          ws.onopen = resolve
          ws.onerror = reject
        })
        return new Cdp(ws)
      }
    } catch {
      /* 继续等 */
    }
    await delay(200)
  }
  throw new Error('CDP 连接超时')
}

async function waitFor(cdp, expression, label, timeout = 30000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    try {
      if (await cdp.eval(expression)) return
    } catch {
      /* 重载中 */
    }
    await delay(150)
  }
  throw new Error(`等待超时：${label}`)
}

/** 把 V8 采样结果按「函数 + 位置」聚合成自耗时排行榜 */
function topFunctions(profile, limit = 25) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]))
  const self = new Map()
  for (let index = 0; index < profile.samples.length; index++) {
    const node = nodes.get(profile.samples[index])
    if (!node) continue
    const frame = node.callFrame
    const name = frame.functionName || '(anonymous)'
    const location = `${frame.url.replace(root, '')}:${frame.lineNumber + 1}`
    const key = `${name} @ ${location}`
    self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[index] ?? 0))
  }
  return [...self.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, micros]) => ({ name, ms: Math.round(micros / 1000) }))
}

async function quit(proc, cdp) {
  try {
    await cdp?.eval('window.close()')
  } catch {
    /* 已经关了 */
  }
  await Promise.race([new Promise((resolve) => proc.once('exit', resolve)), delay(8000)])
  if (proc.exitCode === null) proc.kill()
}

const batches = []
for (let index = 0; index < BATCHES; index++) {
  batches.push(await makeImages(index * 1000, COUNT))
}

let proc = null
let cdp = null
let mainCdp = null
try {
  const pagePort = await freePort()
  const inspectPort = await freePort()
  proc = spawn(
    electron,
    [
      `--inspect=${inspectPort}`,
      `--remote-debugging-port=${pagePort}`,
      '.',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows'
    ],
    {
      cwd: root,
      stdio: 'ignore',
      env: {
        ...process.env,
        IMAGENEST_USER_DATA: userData,
        IMAGENEST_DEBUG_PORT: String(pagePort)
      }
    }
  )
  cdp = await connectWs(`http://127.0.0.1:${pagePort}/json`)
  mainCdp = await connectWs(`http://127.0.0.1:${inspectPort}/json/list`, 120)
  await waitFor(cdp, `document.body.innerText.includes('新建图库')`, '欢迎页')
  await cdp.eval(`window.api.saveUseCase('pro')`)
  await cdp.eval(`window.api.createLibrary(${JSON.stringify(library)})`)
  await cdp.send('Page.reload')
  await waitFor(cdp, `!!document.querySelector('input[placeholder*="搜索文件名"]')`, '图库打开')

  const options = DEDUPE ? '{}' : '{ skipDuplicates: false }'
  const importBatch = async (files) => {
    const started = Date.now()
    const result = await cdp.eval(`window.api.importPaths(${JSON.stringify(files)}, ${options})`)
    return { ms: Date.now() - started, result }
  }

  report.batches = []
  for (const [index, files] of batches.entries()) {
    if (PROFILE && index === 0) {
      await mainCdp.send('Profiler.enable')
      await mainCdp.send('Profiler.setSamplingInterval', { interval: 500 })
      await mainCdp.send('Profiler.start')
    }
    const { ms, result } = await importBatch(files)
    if (PROFILE && index === 0) {
      const { profile } = await mainCdp.send('Profiler.stop')
      report.profileTop = topFunctions(profile)
    }
    report.batches.push({
      ms,
      perImage: Math.round((ms / COUNT) * 10) / 10,
      added: result.added,
      skipped: result.skipped,
      failed: result.failed
    })
  }
  report.cpu = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-Command', 'Get-CimInstance Win32_Processor | Select-Object -First 1 Name,NumberOfCores,NumberOfLogicalProcessors | ConvertTo-Json -Compress'],
    { encoding: 'utf8' }
  ).trim()

  console.log(JSON.stringify(report, null, 2))
  await quit(proc, cdp)
} catch (error) {
  report.error = error.message
  console.error('基准失败：', error.message)
  if (proc) await quit(proc, cdp)
} finally {
  writeFileSync(join(runDir, 'report.json'), JSON.stringify(report, null, 2))
  console.log(`\n结果目录：${runDir}`)
  process.exitCode = report.error ? 1 : 0
}
