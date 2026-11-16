/**
 * 3 万条图库的端到端检查：IPC 查询耗时、虚拟滚动、DOM/监听器、灯箱内存。
 * 先导入 40 张真实图片，再向同一个 library.db 插入 3 万条合成记录。
 */
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import Database from 'better-sqlite3'
import sharp from 'sharp'

const root = process.cwd()
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const runDir = join(root, '.smoke', `perf30-${stamp}`)
const userData = join(runDir, 'userData')
const library = join(userData, 'Library')
const incoming = join(runDir, 'incoming')
const shotsDir = join(root, '.trae', 'smoke-shots', `perf30-${stamp}`)
const electron = join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
const REAL_COUNT = 40
const SYNTHETIC = 30000

const report = {}
const js = (value) => JSON.stringify(value)
for (const dir of [userData, incoming, shotsDir]) mkdirSync(dir, { recursive: true })

const images = []
for (let index = 0; index < REAL_COUNT; index++) {
  const file = join(incoming, `perf-${String(index).padStart(3, '0')}.jpg`)
  await sharp({
    create: {
      width: 1200,
      height: 800,
      channels: 3,
      background: { r: (index * 41) % 255, g: (index * 83) % 255, b: (index * 127) % 255 }
    }
  })
    .jpeg({ quality: 78 })
    .toFile(file)
  images.push(file)
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

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  async eval(expression, timeoutMs = 60000) {
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

function processTreeMemory() {
  try {
    const out = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        "Get-CimInstance Win32_Process -Filter \"name='electron.exe'\" | Select-Object ProcessId,WorkingSetSize,CommandLine | ConvertTo-Json -Compress"
      ],
      { encoding: 'utf8', timeout: 15000 }
    ).trim()
    const parsed = out ? JSON.parse(out) : []
    const list = Array.isArray(parsed) ? parsed : [parsed]
    const result = { main: 0, renderer: 0, gpu: 0, other: 0, total: 0 }
    for (const item of list) {
      const mb = (item.WorkingSetSize || 0) / 1024 / 1024
      const command = item.CommandLine || ''
      if (command.includes('--type=renderer')) result.renderer += mb
      else if (command.includes('--type=gpu-process')) result.gpu += mb
      else if (command.includes('--type=')) result.other += mb
      else result.main += mb
      result.total += mb
    }
    for (const key of Object.keys(result)) result[key] = Math.round(result[key])
    return result
  } catch {
    return null
  }
}

async function sampleMemory(cdp, mainCdp) {
  const main = await mainCdp.eval(`(async () => {
    const usage = process.memoryUsage()
    const info = await process.getProcessMemoryInfo()
    return {
      rss: Math.round(usage.rss / 1024 / 1024),
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
      private: Math.round(info.private / 1024)
    }
  })()`)
  const heap = await cdp.send('Runtime.getHeapUsage')
  const dom = await cdp.send('Memory.getDOMCounters')
  return {
    main,
    rendererHeapMB: Math.round((heap.usedSize / 1024 / 1024) * 10) / 10,
    documents: dom.documents,
    nodes: dom.nodes,
    listeners: dom.jsEventListeners,
    processTree: processTreeMemory()
  }
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
  await cdp.eval(`window.api.createLibrary(${js(library)})`)
  await cdp.send('Page.reload')
  await waitFor(cdp, `!!document.querySelector('input[placeholder*="搜索文件名"]')`, '图库打开')
  await cdp.eval(`window.api.importPaths(${js(images)})`)
  await waitFor(
    cdp,
    `(async () => (await window.api.listItems({ sort: 'added' }, 0, 10)).total === ${REAL_COUNT})()`,
    '真实图片导入'
  )

  // 直接向库文件补 3 万条合成记录（应用连接仍开着，WAL 下另一个连接可写）
  const dbFile = join(library, 'library.db')
  const db = new Database(dbFile)
  db.pragma('busy_timeout = 5000')
  const columns = db.prepare('PRAGMA table_info(items)').all()
  const required = columns
    .filter((column) => column.notnull === 1 && column.dflt_value === null && column.pk === 0)
    .map((column) => column.name)
  const values = {
    path: '',
    name: '',
    ext: '.jpg',
    added_at: 0
  }
  const names = required.map((name) => {
    if (name === 'path') return 'path'
    if (name === 'name') return 'name'
    if (name === 'ext') return 'ext'
    if (name === 'added_at') return 'added_at'
    return null
  })
  if (names.some((name) => name === null)) {
    throw new Error(`items 有未覆盖的必填列：${required.join(', ')}`)
  }
  const insert = db.prepare(
    `INSERT INTO items(${required.join(',')}) VALUES(${required.map(() => '?').join(',')})`
  )
  db.transaction(() => {
    for (let index = 0; index < SYNTHETIC; index++) {
      values.path = `C:\\synthetic\\photo-${index}.jpg`
      values.name = `photo-${index}.jpg`
      values.added_at = 1_700_000_000 + index
      insert.run(...names.map((name) => values[name]))
    }
  })()
  db.close()

  await cdp.send('Page.reload')
  await waitFor(
    cdp,
    `(async () => (await window.api.listItems({ sort: 'added' }, 0, 10)).total >= ${SYNTHETIC})()`,
    '3 万条生效',
    60000
  )
  await waitFor(cdp, `!!document.querySelector('[data-gallery-id]')`, '卡片渲染')
  await delay(1000)
  report.memory30k = await sampleMemory(cdp, mainCdp)

  report.queryLatency = await cdp.eval(`(async () => {
    const bench = async (fn, runs = 20) => {
      const times = []
      for (let i = 0; i < runs; i++) {
        const started = performance.now()
        await fn()
        times.push(performance.now() - started)
      }
      times.sort((a, b) => a - b)
      return {
        p50: Math.round(times[Math.floor(runs * 0.5)] * 10) / 10,
        p95: Math.round(times[Math.floor(runs * 0.95)] * 10) / 10,
        max: Math.round(times[runs - 1] * 10) / 10
      }
    }
    return {
      firstPage: await bench(() => window.api.listItems({ sort: 'added' }, 0, 200)),
      deepPage: await bench(() => window.api.listItems({ sort: 'added' }, 29600, 200)),
      search: await bench(() => window.api.listItems({ sort: 'added', query: 'photo-29' }, 0, 200)),
      aiSort: await bench(() => window.api.listItems({ sort: 'ai' }, 0, 200)),
      stats: await bench(() => window.api.stats()),
      facets: await bench(() => window.api.listFacets())
    }
  })()`)

  const domBefore = await cdp.send('Memory.getDOMCounters')
  report.scroll = await cdp.eval(`(async () => {
    const card = document.querySelector('[data-gallery-id]')
    const el = card?.closest('div.overflow-y-auto')
    if (!el) return null
    const started = performance.now()
    for (let step = 1; step <= 40; step++) {
      el.scrollTop = ((el.scrollHeight - el.clientHeight) * step) / 40
      await new Promise((resolve) => {
        let done = false
        const finish = () => {
          if (!done) {
            done = true
            resolve()
          }
        }
        requestAnimationFrame(finish)
        setTimeout(finish, 40)
      })
    }
    const ms = Math.round(performance.now() - started)
    const frames = await new Promise((resolve) => {
      let count = 0
      const t0 = performance.now()
      const tick = () => {
        count++
        if (performance.now() - t0 < 600) requestAnimationFrame(tick)
        else resolve(count)
      }
      requestAnimationFrame(tick)
      setTimeout(() => resolve(count), 800)
    })
    return { ms, frames, scrollHeight: el.scrollHeight, nodes: document.getElementsByTagName('*').length }
  })()`, 30000)
  report.scrollDom = { before: domBefore, after: await cdp.send('Memory.getDOMCounters') }
  report.afterScrollMemory = await sampleMemory(cdp, mainCdp)

  const lightbox = []
  for (let round = 0; round < 2; round++) {
    await cdp.eval(`(() => {
      const card = document.querySelector('[data-gallery-id]')
      if (!card) return false
      card.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      return true
    })()`)
    await delay(1200)
    const open = await cdp.send('Runtime.getHeapUsage')
    await cdp.eval(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
    await delay(500)
    const closed = await cdp.send('Runtime.getHeapUsage')
    lightbox.push({
      openMB: Math.round((open.usedSize / 1024 / 1024) * 10) / 10,
      closedMB: Math.round((closed.usedSize / 1024 / 1024) * 10) / 10
    })
  }
  report.lightbox = lightbox
  report.finalMemory = await sampleMemory(cdp, mainCdp)

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(shotsDir, 'gallery30k.png'), Buffer.from(shot.data, 'base64'))
  console.log(JSON.stringify(report, null, 2))
  await quit(proc, cdp)
} catch (error) {
  report.error = error.message
  console.error('测量失败：', error.message)
  if (proc) await quit(proc, cdp)
} finally {
  writeFileSync(join(shotsDir, 'report.json'), JSON.stringify(report, null, 2))
  console.log(`\n结果目录：${shotsDir}`)
  process.exitCode = report.error ? 1 : 0
}
