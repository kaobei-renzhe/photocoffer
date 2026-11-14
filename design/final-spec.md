# 存照 · 最终定稿

> 项目：`D:\trae_projects\lunaris`
> 定稿日期：2026-11-14
> 命名沿革：月相 / Lunaris → 片匣 → 砚白 → **存照**

---

## 一、命名

| 项 | 值 |
|---|---|
| **中文名** | **存照**（cún zhào） |
| 命名路线 | **半描述性**：名字里带得出品类，但不做功能说明书 |
| 英文名 | 暂不设；候选 `Cunzhao`（拼音）或独立造词 |
| `package.json` → `name` | 保持 `lunaris`（**内部标识，见第三节**） |
| `productName` / `shortcutName` | `存照` |
| `appId` | `com.silvermoon.cunzhao` |

### 为什么是「存照」

- **类型感明确**：「照」锁定照片，「存」点明本地归档。看到名字就知道是照片类工具，不会误认成冥想、笔记或浏览器
- **与产品承诺同频**：核心卖点就是「照片不搬家、留在自己硬盘上」，「存」正是这件事
- **有纵深但不生僻**：成语「立此存照」，自带「留存凭证」的语感；两个字都是常用字，输入法好打
- **读音顺**：cún zhào，2–4 声，先扬后落（和之前你觉得顺口的「留片」同结构）
- **可用性**：GitHub 同名仓库 **0**；无同名 App；`cunzhao.app` / `.dev` / `.net` 未查到注册记录（`.com` 已注册）

### 中间走过的弯路

| 阶段 | 名字 | 为什么放弃 |
|---|---|---|
| 1 | 月相 / Lunaris | 语义指向「月亮摄影规划工具」，且已被同名摄影 App 占用 |
| 2 | 片匣 | ❌ GitHub `dengji85/avm`「片匣 · AVM」成人视频管理器，同为本地媒体库、功能高度重合 |
| 3 | 砚白 | 代号式（不解释功能），但**看不出是什么类型的 App** —— 对你这个产品，类型感不能丢 |
| 4 | **存照** | ✅ 半描述性，类型明确且未被同品类占用 |

**关键反思**：第 3 阶段把「撞车标准」定得太严，把不同品类的小 App 也算撞车，结果把好懂的词全部否光、逼出纯代号。真正要避的只有 **同品类 + 同平台 + 同名**。按这个标准重筛，才有「存照」。

### 完整否决记录（本轮共验证 30+ 个名字）

| 类别 | 候选 | 否决原因 |
|---|---|---|
| 描述性中文 | 留白 / 择片 / 挑片 / 片盒 / 存片 | 《留白相册》《择片》《光谱挑片》已占；片盒有饭盒联想 |
| 英文候选 | Trove / Capsa / Lumo / Vela | `trove.photo`、`lumomagic.com` 家庭照片 App（同品类）；Capsa 网络分析器；Vela 浏览器等 |
| 英文补充 | Pyxis / Cista / Theca / Pianova | Pyxis 旅行照片 App、`cista.app` 文档库、Pianova 钢琴 App |
| 中文意象词 | 方寸 / 一隅 / 青简 / 素页 / 停云 | 冥想、写信、阅读、输入法、图文记录 App 全部占用 |
| 中文造词 | 栖光 / 屿光 / 照夜 / 栖影 | NFC 徽章 App、拍照 App、胶片暗房 App、AI 图文工具 |
| 半描述性 | 影匣 | 抖音视频解析下载器 |
| 备选（未选） | 图匣 / 拣片 / 影格 | 均干净可用，留作备选 |

完整验证数据见 `design/name-verification.md`。

---

## 二、图标

### 图形

> **俯视一个打开的匣，里面扇形展开地装着一叠拍立得照片。**

俯视是关键：正面看封闭的匣子只是一块矩形，无法和饭盒区分；俯视能看见**匣壁、内凹、隔层、照片**，容器才被画出来。

名字从「片匣」几经变更后，图形保留下来：它现在是「**存起来的那些照片**」的视觉化，与「存照」仍然对得上（存 → 匣，照 → 照片）。

### 定稿色板（PA2）

| 角色 | 色值 |
|---|---|
| 底板 | `#14161B` |
| 匣壁 | `#E8EEF4`（亮 `#F7FAFC` / 暗 `#D3DCE6`）— **P1 冷白 / 月白** |
| 内凹 | `#2A2E36` |
| 左后照片 | `#5B9FE8`（天蓝） |
| 右后照片 | `#F5C344`（暖黄） |
| 前面主体 | `#F2604A`（珊瑚红） |

三色不绑任何三原色理论，只取好看且能互相区分：色相跨度 203°，主体与白边对比 2.78。

> **配色修订**：初版匣壁用暖米色 `#EDE3CE`，偏黄、像牛皮纸，压住了三张照片的明快感。
> 对比冷白 / 青瓷 / 中性灰 / 象牙白四版后改为 P1 冷白，黄调去掉，彩色照片明显更跳。
> 见 `design/icon-drafts/palette-compare.png`。

### 双平台容器

| 平台 | 容器 | 尺寸 |
|---|---|---|
| macOS | 超椭圆 `\|x/a\|⁵+\|y/b\|⁵=1`，1024 画布里内容占 824 | 1024/512/256/128/64/32/16 |
| Windows | 满铺 + 圆角 17% | 512/256/128/64/48/32/24/16 |

两平台**不能共用一张图**：满铺图在 Dock 里会大一圈，留白图在任务栏里会小一圈。

### 分档降级

| 内容区尺寸 | 照片数 | 细节 |
|---|---|---|
| ≥64px | 3 张 | 匣壁投影与内高光、内凹阴影、照片白边与山形、日晕 |
| 32–48px | 2 张 | 保留投影，省略山形与高光 |
| ≤24px | 1 张 | 拟物归零，只留「匣框 + 内凹 + 照片」三层 |

### 文件清单

```
build/icon.png / icon.svg      → Windows 512（createWindow 运行时也用这张）
build/icon-win.png             → Windows 512（构建配置）
build/icon-mac.png             → macOS 1024（超椭圆 + 留白）
build/icon-mono.png / .svg     → 单色版（水印 / 黑白打印）
build/icons/{16..512}.png      → Windows 尺寸套件
build/icons-mac/{16..1024}.png → macOS 尺寸套件
scripts/gen-final-icons.mjs    → 一键重新生成图标
scripts/rename-product.py      → 一键换产品名（python scripts/rename-product.py 旧名 新名）
```

---

## 三、兼容性决策（重要）

**`lunaris` 作为内部数据标识一律不改**：

| 位置 | 用途 |
|---|---|
| `SETTINGS_APP_TAG = 'lunaris'` | 配置文件格式标签 |
| `app: 'lunaris'`（backup.ts） | 备份包格式标识与校验 |
| `xmlns:moonphoto="https://lunaris.app/ns/1.0/"` | XMP 命名空间 |
| `lunaris:theme` / `lunaris:skin` 等 | localStorage 键、日志文件名 |

改这些会让老配置、老备份、老 XMP 读不出来。所以只改**用户可见**的产品名，`name` 保持 `lunaris`（开发态 userData 目录也不变）。

### 迁移链

`src/main/index.ts` 的 `LEGACY_APP_DIRS` 按**由新到旧**排列：

```ts
const LEGACY_APP_DIRS = ['砚白', '片匣', '月相', 'lunaris', '月巢', 'moonnest', 'image-nest']
```

每一次改名都会把旧名插到最前，保证优先搬最近一次改名前的目录。迁移只搬 `config.json` / `gear.json` / `logs`（图库数据本来就在用户自选目录，不受影响）。

`dataDirHint()` 动态取 `app.getName()`，打包后显示「存照」，开发态显示 `lunaris`。

---

## 四、验证结果

```
npm run typecheck → 通过
npm test         → 26 files / 155 tests passed
```

`package.json` 最终值：

```
name         = lunaris          （内部标识）
productName  = 存照
shortcutName = 存照
appId        = com.silvermoon.cunzhao
mac.icon     = build/icon-mac.png
win.icon     = build/icon-win.png
```

---

## 五、剩余待办

1. **英文名**：如需出海，定 `Cunzhao` 或独立造词，并验证商标
2. **商标正式检索**：中国商标网 / USPTO —— 本轮只查了「有没有人在用」，未查注册
3. **域名**：`cunzhao.app` / `.dev` / `.net` 未查到注册记录，需要时可注册（`.com` 已被占）
4. **`docs/` 历史文档**里的「月相」刻意保留，作为改名追溯记录
5. **`publish.url`** 仍是占位符 `https://updates.invalid/lunaris`，正式分发前替换
6. ~~重新打包~~ **已完成（Windows）**，见下方「打包验证」
7. **macOS 打包**：需在本机 mac 上跑 `npm run dist:mac` 验证 Dock 图标

---

## 附：设计文档索引

| 文件 | 内容 |
|---|---|
| `design/logo-audit.html` | 9 个旧图标方案的 16px 存活审计 |
| `design/brand-audit.md` | 完整视觉审计（配色 / 字体 / 设计语言 / 优先级 P0–P2） |
| `design/naming-and-logo.md` | 命名与 logo 重做过程、撞车实证、状态语言分析 |
| `design/naming-final.md` | 「片匣」阶段过程稿（已被取代） |
| `design/name-verification.md` | 名称可用性验证报告（30+ 个候选） |
| **`design/final-spec.md`** | **本文件，最终交付** |
| `design/icon-drafts/` | 全部过程稿与对比图，`FINAL.png` 为双平台最终对照 |


---

## 六、打包验证（2026-11-14）

```
npm run dist → 退出码 0
产物：release/存照 Setup 0.4.0.exe（137,304,795 bytes）
      release/win-unpacked/存照.exe
      release/latest.yml / *.blockmap
```

构建日志确认 `executablePath=release\win-unpacked\存照.exe`、NSIS 目标 `存照 Setup 0.4.0.exe`，
说明新 `productName` 已生效。

**图标内嵌验证**（解析 electron-builder 生成的 `.ico`）：

| 检查 | 结果 |
|---|---|
| 新 ico 重新生成 | ✅ `release/.icon-ico/icon.ico`，54,932 bytes，14:17 |
| 新图标字节写入 exe | ✅ 在 `存照.exe` offset 248544864 找到 |
| 旧紫月亮残留 | ✅ 无 |
| 256px 内嵌图观感 | ✅ 冷白匣壁、深色内凹、三张照片层次清楚 |

图标演进对照：`design/icon-drafts/exe-icon-compare.png`（旧紫月亮 → 暖米色 → 冷白定稿）。

**顺手修的两处**：
- `scripts/clean-release.mjs` 原来写死 `月相 Setup`，改名后清理策略失效；已改为通用正则 `^.+ Setup x.y.z.exe$`
- `src/renderer/src/components/Logo.tsx` 的匣壁渐变同步换成 P1 冷白，保证 UI 品牌标与图标一致

**注意**：`release/` 里仍留有旧的 `月相 Setup 0.4.0.exe`（11-13 产物），未删除；分发前请确认只上传 `存照 Setup 0.4.0.exe`。
另有两份 ico 备份目录 `.icon-ico.backup-20261113` / `.icon-ico.backup-warm`，可随时清理。
