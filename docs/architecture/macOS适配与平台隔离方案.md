# macOS 适配与平台隔离方案

> 触发问题：macOS 兼容要考虑吗？怎么保证分享 EXE 或 dmg 给别人时不出错？
>
> 两个结论先放在前面：
>
> 1. **平台隔离的真正保证不是打包配置，而是「在哪台机器上 `npm install`」。** 依赖安装时按平台过滤，所以 Windows 上装出来的 `node_modules` 天生只有 win32 二进制，mac 上也只有 darwin。一旦交叉拷贝 `node_modules`，包就会被污染。
> 2. **打包层已经考虑了 mac**（`mac: { target: ['dmg'] }` + `dist:mac` 脚本都在），但**运行环境里缺一个致命件**：没有 `setApplicationMenu`，导致 mac 上所有输入框的 ⌘C / ⌘V 全部失效。

---

## 0. 实测：当前的 Windows 包是干净的

```
release/win-unpacked/resources/app.asar.unpacked/
  node_modules/onnxruntime-node/bin/napi-v6/
    win32/x64            ← 64 MB，只有这一个
  node_modules/@img/
    colour
    sharp-win32-x64      ← 只有这一个
```

**没有 darwin、没有 linux。** 所以现在发出去的 EXE 不会因为"混进别的平台二进制"而出错。

原因不是打包配置写得好，而是 electron-builder **不会跨平台重新解析 optionalDependencies**：

| 依赖 | 机制 |
| --- | --- |
| `sharp` | `@img/sharp-<platform>-<arch>` 是 optionalDependencies，按目标平台过滤 |
| `onnxruntime-node` | 安装脚本只下当前平台的 `bin/napi-v*/<platform>/` |
| `better-sqlite3` | N-API prebuild，单个二进制全平台通用（`**/*.node` 已在 asarUnpack） |

### 由此推出的铁律

> **分享 EXE → 必须在 Windows 上 `npm install` + 打包**
> **分享 dmg → 必须在 macOS 上 `npm install` + 打包**
>
> **绝对不能**把 Windows 上的 `node_modules` 拷到 mac 上打包。那样 mac 包里会有 `sharp-win32-x64` 而没有 `sharp-darwin-arm64`，**app 一启动就崩**（图片处理是核心路径）。

这条比任何打包配置都重要，也是"分享出去不出错"的根本。

---

## 1. 三层隔离

### 第一层：依赖与构建环境（根本）

| 场景 | 做法 | 验证 |
| --- | --- | --- |
| 发 Windows | Windows 上 `npm ci` → `npm run dist` | 检查产物只含 win32 |
| 发 mac | mac 上 `npm ci` → `npm run dist:mac` | 检查产物只含 darwin |
| 两个都要 | 两台机器各跑一遍，或上 GitHub Actions 的 `windows-latest` / `macos-latest` | 同上 |

**不要用共享的 `node_modules`。** 如果做 CI，两个 job 各自 checkout + 各自 install，不要缓存跨平台。

### 第二层：打包配置（防御性，对称）

现在 `mac.files` 排除了 win32 / linux，但 `win` 完全没有 `files`。虽然实测干净，但不对称，将来用 CI 或做 universal 包时容易漏。

建议改成对称：

```json
"win": {
  "target": ["nsis"],
  "icon": "build/icon.png",
  "files": [
    "out/**/*",
    "package.json",
    "build/icon.png",
    "!**/node_modules/onnxruntime-node/bin/napi-*/darwin/**",
    "!**/node_modules/onnxruntime-node/bin/napi-*/linux/**",
    "!**/node_modules/@img/sharp-darwin-*/**",
    "!**/node_modules/@img/sharp-linux-*/**"
  ]
},
"mac": {
  "target": [{ "target": "dmg", "arch": ["arm64", "x64"] }],
  "category": "public.app-category.photography",
  "icon": "build/icon.png",
  "files": [
    "out/**/*",
    "package.json",
    "build/icon.png",
    "!**/node_modules/onnxruntime-node/bin/napi-*/win32/**",
    "!**/node_modules/onnxruntime-node/bin/napi-*/linux/**",
    "!**/node_modules/@img/sharp-win32-*/**",
    "!**/node_modules/@img/sharp-linux-*/**"
  ]
}
```

**两个要点**：

1. **平台级 `files` 会覆盖顶层 `files`，不是合并**。所以每条都得把 `out/**/*`、`package.json`、`build/icon.png` 重新写一遍——现在 `mac.files` 就是这么写的，别以为可以省。
2. **`asarUnpack` 不要按平台写**。它只决定"进了包的文件里，哪些保持松散"，不会引入新文件。保持 `**/*.node`、`**/node_modules/onnxruntime-node/**`、`**/node_modules/@img/**` 通配即可。

### 第三层：代码（集中，不散落）

现在 `process.platform` 只在 `index.ts:189` 出现过一次，很干净。但加了菜单、窗口样式、快捷键文案之后会散落多处。

**新建 `src/main/platform.ts`，所有平台差异只在这里出现一次**：

```ts
import { Menu } from 'electron'

export const isMac = process.platform === 'darwin'
export const isWindows = process.platform === 'win32'

/** 界面文案里的修饰键，mac 用 ⌘ / ⌥，其余用 Ctrl / Alt */
export const modLabel = isMac ? '⌘' : 'Ctrl'
export const altLabel = isMac ? '⌥' : 'Alt'

/**
 * macOS 必须有应用菜单：编辑类快捷键（⌘C/⌘V/⌘A/⌘Z）依赖菜单的 edit role。
 * Windows 保持现状（autoHideMenuBar: true，按 Alt 可呼出），不要设成 null。
 */
export function installAppMenu(): void {
  if (!isMac) return
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' }
    ])
  )
}

/** 数据目录的用户可读说明，用于「关于」页 */
export function dataDirHint(): string {
  return isMac ? '~/Library/Application Support/lunaris' : '%APPDATA%\\lunaris'
}
```

业务代码里**不再出现 `process.platform`**，一律 import 这里的常量。

---

## 2. macOS 适配清单

### P0 · 应用菜单（不做等于不能用）

**现象**：mac 上没有 `setApplicationMenu`，所有文本输入框里 `⌘C` `⌘V` `⌘A` `⌘Z` 全部失效。

**为什么**：macOS 的编辑快捷键由**菜单的 `edit` role** 提供，不是由系统直接绑定到输入框。Electron 没有菜单 = 没有这些快捷键。

**影响面**：搜索框、目录命名、标签名、备注、研读对话、AI 模型配置、选片会话名——几乎每个功能都受影响。

**改法**：`app.whenReady()` 里、创建窗口之前调 `installAppMenu()`。就上面那段，十几行。

### P1 · 渲染层拿平台信息

现在 `App.tsx:823` 用的是：

```ts
const macDelete = e.key === 'Backspace' && navigator.platform.startsWith('Mac')
```

能用，但 `navigator.platform` 是废弃 API，而且渲染层拿不到 `process`。

**改法**：preload 暴露一个值，渲染层读它。

```ts
// src/preload/index.ts
contextBridge.exposeInMainWorld('env', {
  platform: process.platform          // 'darwin' | 'win32' | 'linux'
})
```

```ts
// 渲染层
const isMac = window.env.platform === 'darwin'
```

**同时要改的文案**（这些是给用户看的，写错就是指引错误）：

| 位置 | Windows | mac |
| --- | --- | --- |
| 复制图提示 | `Ctrl+C` | `⌘C` |
| 粘贴入库（功能重排 §7） | `Ctrl+V` | `⌘V` |
| 拖拽到外部 | `Alt 拖拽` | `⌥ 拖拽` |
| 撤销 | `Ctrl+Z` | `⌘Z` |

界面稿和文档里的「Ctrl+V」在 mac 上要显示成「⌘V」，**用 `modLabel` 拼，不要硬编码**。

### P2 · 窗口外观

```ts
// 只在 mac 上用，Windows 保持默认
...(isMac ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 14, y: 14 } } : {})
```

⚠️ **`hiddenInset` 会让内容顶到窗口顶部**，现有的顶栏必须给红绿灯留出左侧 ~78px 空间，否则按钮会被压住。**这一条建议放到界面重组之后做**，否则改完要再调一次布局。

### P3 · 双架构 dmg

```json
"target": [{ "target": "dmg", "arch": ["arm64", "x64"] }]
```

现在 `target: ["dmg"]` 只出当前机器的架构。加了 arch 数组会出两个 dmg（或一个 universal，但 universal 打包体积翻倍且对原生模块有额外要求，**不建议**）。

### P4 · 签名与公证（决定分享体验）

| 方案 | 效果 | 成本 |
| --- | --- | --- |
| **不签名**（现状） | 用户双击 dmg 后被 Gatekeeper 拦住，提示"无法打开，因为 Apple 无法验证" | 0，但每个用户要手动右键→打开 |
| 自签名（ad-hoc） | 仍然会被拦 | 0 |
| **Apple 开发者账号签名 + 公证** | 双击直接打开 | ¥688/年 + 配置流程 |

**如果暂时不买证书**，必须做两件事：

```json
"mac": {
  "identity": null        // 明确不签名，避免 electron-builder 报错
}
```

并在给别人的说明里写清楚：

> 首次打开：右键点「月相」→ 选「打开」→ 弹窗里再点「打开」。
> 或者终端执行：`xattr -cr /Applications/月相.app`

### P5 · 一处低风险但要知道

`libraryKey()` 把 `/` 统一成 `\` 再 `toLowerCase()`：

```ts
path.replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase()
```

作为 Map key 内部一致，**能工作**。但在大小写敏感的 APFS 卷上，`/Users/A` 和 `/Users/a` 会被当成同一个目录。普通用户碰不到，**不建议改**（改了就破坏了 Windows 的大小写不敏感兼容）。

---

## 3. Windows 分享出去要注意的

主人说"分享 EXE 或 dmg 时不至于出错"，Windows 这边目前的问题是：

| 问题 | 现象 | 解法 |
| --- | --- | --- |
| **没有代码签名** | SmartScreen 弹「Windows 已保护你的电脑」，要点「更多信息 → 仍要运行」 | 买证书（¥1000+/年）或写说明 |
| `appId` 变过 | 旧「月巢」不会自动升级成「月相」，两个共存 | 见数据安全方案 §风险 2 |
| 安装包 145 MB | 其中有 64 MB 是 onnxruntime win32 二进制，去不掉（语义搜索要用） | 接受 |

**给别人的一句话说明**（建议直接写进 README 和下载页）：

> Windows：首次运行会弹「Windows 已保护你的电脑」，点「更多信息」→「仍要运行」。
> macOS：首次打开请右键点图标 →「打开」。

---

## 4. 打包前自检脚本

分享之前跑一下，确认包里没有别的平台的二进制。加到 `package.json`：

```json
"verify:dist": "node scripts/verify-dist.mjs"
```

```js
// scripts/verify-dist.mjs
// 用法：npm run verify:dist
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
```

这个脚本的价值：**拷过 `node_modules` 或者用 CI 出过一次错，跑一下立刻知道。**

---

## 5. 明确不做的

| 别做 | 原因 |
| --- | --- |
| 做 universal 包（arm64 + x64 合一） | 体积翻倍，且对原生模块要求额外配置，收益是"少一个文件" |
| 把 `node_modules` 在平台间复用 | 这是唯一会真的让"分享出去的包启动即崩"的操作 |
| 在 Windows 上打 mac 包 | electron-builder 不支持跨平台出 mac 目标（除极少数免签场景） |
| 把平台判断散落在各组件里 | 一律走 `platform.ts`，否则以后加 Linux 或改文案要翻遍全项目 |
| 现在就上 `titleBarStyle: hiddenInset` | 会打乱现有顶栏布局，等界面重组做完再上 |
| 用 `navigator.platform` 判断平台 | 废弃 API，且 Electron 里将来可能被自定义 UA 影响 |

---

## 6. 验收

### 平台隔离

- [ ] Windows 产物里搜不到 `darwin` / `linux` 的 onnxruntime 目录
- [ ] Windows 产物里 `@img` 只有 `sharp-win32-x64`
- [ ] mac 产物里 `@img` 只有 `sharp-darwin-arm64`（或 `-x64`）
- [ ] `npm run verify:dist` 在两边都通过

### macOS 可用性

- [ ] mac 上打开 app，搜索框里能 `⌘V` 粘贴
- [ ] mac 上备注框里能 `⌘A` 全选、`⌘C` 复制
- [ ] mac 上菜单栏有「月相 / 编辑 / 显示 / 窗口」四项
- [ ] mac 上 `⌘Q` 能退出，`⌘W` 关窗但不退出（`index.ts:189` 已有）
- [ ] 界面上快捷键提示显示 `⌘` 而不是 `Ctrl`
- [ ] 拖拽照片到 Finder 能落成文件

### 分享

- [ ] EXE 在一台没装过 Node 的 Windows 上能装能跑
- [ ] dmg 在一台没装过 Node 的 mac 上，右键打开能跑
- [ ] 两边的说明文字（SmartScreen / Gatekeeper）都写进 README
