# photocoffer · GitHub 曝光优化方案

> 仓库：https://github.com/kaobei-renzhe/photocoffer
> 体检时间：2026-11-17 · 数据来自 GitHub API 与仓库页面
> 目标：让**需要这个工具的中文摄影师**能找到它、点进来、看得懂、下得到

---

## 0. 现状体检（硬数据）

| 项 | 现状 | 严重度 | 影响 |
| --- | --- | --- | --- |
| `description` | **null** | 🔴 极高 | GitHub 搜索结果里只有仓库名，没有一句话说明 |
| `topics` | **空数组** | 🔴 极高 | 完全不会被 `/topics/` 页面和 Explore 推荐命中 |
| Releases | **"There aren't any releases here"** | 🔴 极高 | **用户下不到软件**，且 README 让用户"打开仓库里的 release 目录"——那个目录不在仓库里 |
| `language` | **HTML**（应 TypeScript） | 🔴 极高 | 被判定为网页项目，搜 TS/Electron 的开发者完全看不到；点进来的人也会以为是网页模板 |
| `homepage` | null | 🟡 中 | 没有落地页，About 栏是空的 |
| `has_discussions` | false | 🟡 中 | 没有讨论区，用户反馈只能开 issue（心理门槛高） |
| `stargazers_count` | **2** | 🟡 中 | 几乎没有社会证明，新访客缺乏"这东西靠谱"的信号 |
| README | 317 行，内容扎实 | 🟡 中 | **但零截图**——一个图片管理软件没有界面图 |
| 仓库体积 | 31 MB（`design/` 占 30 MB） | 🟢 低 | 克隆慢；也是 language 误判的根因 |

**一句话诊断**：内容是好内容，但**门面全是空的**。现在等于一家餐厅菜做得好，可门口没招牌、没菜单、没开门。

---

## P0 · 半小时内能做完，但影响力最大

### 1. 填仓库简介（5 分钟，最高优先级）

现在的 `description` 是 `null`。GitHub 搜索结果、仓库页面顶部、分享卡片全靠它。

**操作**：仓库首页右上角 ⚙️ Settings → 顶部 Description 框

**建议文案**（择一，控制在 120 字符内，搜索结果只显示约 100 字符）：

```
给摄影师的本地图片库：中文语义搜图、打星挑片、客户选片交付，照片始终留在你的硬盘上
```

短版（更保险，不会被截断）：

```
本地优先的摄影图片库：中文搜图、挑片、客户选片交付，原图不动
```

**同时填 Website**：如果暂时没有落地页，可以填夸克网盘分享链接或 Releases 页面，别留空。

---

### 2. 加 Topics（5 分钟，第二优先级）

现在 `topics: []`。Topics 决定了你的仓库会不会出现在这些页面：

`github.com/topics/photography`、`/topics/electron`、`/topics/local-first` …

**操作**：Settings → Topics（或仓库首页 About 栏右侧 ⚙️）

**建议 20 个**（GitHub 上限 20，全部小写+连字符）：

```
photography
photo-management
image-organizer
photo-culling
raw
exif
electron
typescript
desktop-app
local-first
offline-first
privacy
semantic-search
clip
sqlite
windows
macos
chinese
lightroom-alternative
photographer-tools
```

**挑选逻辑**：
- `photography` / `photo-management` / `image-organizer` → 用户会真的去 topics 页逛
- `local-first` / `offline-first` / `privacy` → 你的核心差异化，也是当下热门话题
- `lightroom-alternative` → 蹭竞品搜索词，转化率最高的一个
- `chinese` / `semantic-search` / `clip` → 技术差异化，吸引开发者和 AI 圈
- `electron` / `typescript` / `sqlite` → 开发者流量

**别加**：`awesome`、`hacktoberfest`、`beginner-friendly` 这类蹭流量但与项目无关的标签，会显得不专业且被举报。

---

### 3. 修正 language 判定（15 分钟，解决"被当成网页项目"）

**根因**：GitHub 用 linguist 按**字节数**统计语言。你的 `design/` 有 30 MB（9 个 html 设计稿，单个 40 万字节），而 `src/` 只有 1.8 MB —— HTML 直接碾压 TypeScript。

**后果有多严重**：
- 搜「TypeScript 图片管理」→ 命中不了
- 搜「Electron 摄影」→ 命中不了
- 有人从别的渠道点进来，看到语言是 HTML，会以为是网页模板直接关掉

**解决**：新建 `.gitattributes`（仓库根目录）

```gitattributes
# ── 语言统计：设计稿不算进项目语言，否则 30MB 的 design/ 会把 TypeScript 盖掉 ──
design/** linguist-documentation
*.html    linguist-detectable=false

# ── 行尾符统一：避免 Windows/macOS 双端 diff 噪音 ──
* text=auto
*.ts    text eol=lf
*.tsx   text eol=lf
*.css   text eol=lf
*.json  text eol=lf
*.md    text eol=lf
*.yml   text eol=lf

# ── 二进制文件不要做文本转换 ──
*.png   binary
*.jpg   binary
*.jpeg  binary
*.ico   binary
*.onnx  binary
*.exe   binary
*.dmg   binary
```

提交后 GitHub 会重新统计，`language` 应变成 **TypeScript**。

> 如果想进一步瘦身，可以把 `design/` 移出仓库（它已经在 git 历史里，需要 `git filter-repo` 才能真瘦）。但这会重写历史、影响已有 clone，**建议暂缓**。先用 .gitattributes 解决可见问题。

---

### 4. 建 Release（20 分钟，解决"下不到软件"）

**这个问题最致命**：README 让用户"打开仓库里的 `release` 目录，双击 exe"，但 `git ls-files release/` 返回 **0 个文件** —— 用户点进去是空的，直接流失。

**做法**：

```bash
# 1. 用现有 tag 建 Release（你已经有 7 个 tag）
gh release create v0.4.4 \
  "release/存照 Setup 0.4.4.exe" \
  "release/latest.yml" \
  --title "存照 v0.4.4" \
  --notes-file docs/release-notes-0.4.4.md
```

或者网页操作：Releases → Draft a new release → 选 tag → 上传 exe / dmg / latest.yml。

**Release notes 建议结构**（用户和搜索引擎都吃这套）：

```markdown
## 存照 v0.4.4

给摄影师的本地图片库。照片留在你的硬盘上，找图、挑片、交付都在一个窗口里。

### 下载
- Windows：`存照 Setup 0.4.4.exe`（未签名，首启点"更多信息 → 仍要运行"）
- macOS：`存照 0.4.4-arm64.dmg` / `x64.dmg`（未签名，首启右键→打开）

### 这次改了什么
- 灯箱沉浸化：去掉常驻胶囊，鼠标移到上下边缘才唤出工具
- 语义搜索结果收敛：不再返回全库 3 万张，默认最相关的 200 张
- 导入性能优化

### 安装后
第一次打开会引导建图库，约 3 分钟。不需要联网。
```

**顺带修 README**：把「打开仓库里的 `release` 目录」改成 Releases 链接：

```markdown
## 安装

**[⬇ 下载最新版](https://github.com/kaobei-renzhe/photocoffer/releases/latest)**
```

> 有 Release 之后还有两个隐性好处：① 关注仓库的人会收到新版本通知；② Release 页面会被搜索引擎索引，形成"photocoffer 下载"的自然流量入口。

---

## P1 · 一两小时，决定"点进来之后会不会留下"

### 5. README 首屏：加截图（最关键的一条）

现在首屏是文字 + 分隔线，**一张图都没有**。而这是个图片管理软件——用户判断"好不好用"几乎全靠界面截图。

**现在的首屏**：

```markdown
# 存照
[logo 120px]
给摄影师的本地图片库：照片留在你的硬盘上，找票、挑片、交付都在一个窗口里完成。
Windows 10 / 11 · macOS 12+ · 免费开源（MIT）· 默认完全离线
---
```

**改成**：

```markdown
# 存照 · photocoffer

给摄影师的本地图片库：照片留在你的硬盘上，找图、挑片、交付都在一个窗口里完成。

[⬇ 下载最新版](https://github.com/kaobei-renzhe/photocoffer/releases/latest) · [快速上手](#第一次打开约-3-分钟) · [和 Lightroom 有什么不同](#和-lightroom-有什么不同)

![主界面](docs/images/screenshot-gallery.png)

Windows 10 / 11 · macOS 12+ · 免费开源（MIT）· 默认完全离线
```

**要点**：
- 下载按钮放在**第一屏**，别让用户滚到最后才找到
- 截图画质：`design/cunzhao-dark-gallery.png` 有 2.9 MB，**必须压到 300 KB 以内**再放（用 `sharp-cli` 或在线压缩），否则页面加载慢反而减分
- 至少放 3 张：**主界面 / 灯箱研读 / 客户选片页**——这三个最能体现差异化

**推荐取材**（`design/` 里现成的）：

| 用途 | 文件 | 说明 |
| --- | --- | --- |
| 主界面 | `cunzhao-light-gallery.png` / `cunzhao-dark-gallery.png` | 瀑布流 + 左侧栏 |
| 灯箱 | `cunzhao-lightbox-预览图.png` | 黑底沉浸态，视觉冲击强 |
| 人像工作台 | `cunzhao-dark-portrait.png` | 体现专业向 |
| 配色 | `cunzhao-palette.png` | 4 套皮肤 |

> 建议新建 `docs/images/` 目录放压缩版，别直接把 3 MB 原图塞进 README。

### 6. 社交预览图（10 分钟）

别人在微信/Twitter/掘金分享你的链接时，显示的就是这张图。现在大概率是默认的仓库名卡片。

**操作**：Settings → Social preview → 上传 **1280×640** PNG

**建议构图**：深色舞台 + 产品名 + 一句话 + 一张界面截图。可以直接用 `design/` 里的素材拼。

### 7. 开启 Discussions（2 分钟）

Settings → Features → 勾选 Discussions。

好处：用户提"怎么用""能不能支持 xx"这类问题不会去开 issue（心理门槛高），讨论区还能被搜索引擎索引，带来长尾流量。

### 8. 修 README 里的旧名残留（10 分钟）

对外仓库里还留着改名前的痕迹，会让人困惑：

| 位置 | 现在 | 改为 |
| --- | --- | --- |
| `README.md:157` | `%APPDATA%\lunaris` | `%APPDATA%\photocoffer`（改名前先确认代码侧已同步） |
| `README.md:264,278` | `LUNARIS_UPDATE_URL` | `PHOTOCOFFER_UPDATE_URL` |
| `README.md:290` | 留空 `LUNARIS_UPDATE_URL` | 同步 |

> 这属于批次 C（改名）的一部分，但如果 C 还没做，README 先别改——否则文档和代码不一致，用户设了变量不生效更糟。**顺序是：代码先改 → README 后改。**

---

## P2 · 长期，做的是"传播力"

### 9. 加一段「为什么做这个」

开源项目最容易被转发的是**动机**，不是功能列表。可以在「为什么用它」前面加 2–3 行：

> 拍完一场婚礼 2000 张照片，光是把「客户要的那 80 张」挑出来发过去，就要在文件名、微信、Excel 之间来回倒腾。市面上的工具要么让你把原图传上云，要么功能重到要学一周。
> 存照只解决一件事：**照片不离开你的硬盘，但从一堆原片到客户拿到成品，这条路走通。**

这类文字是被人截图转发的素材。

### 10. 加一张对比表

用户搜到你会先问"和 X 有什么不同"。给个诚实的对比表（不贬低竞品，只列差异）：

| | 存照 | Lightroom | Eagle | 网盘 |
| --- | --- | --- | --- | --- |
| 原图是否上传 | 否 | 否 | 否 | **是** |
| 中文语义搜图 | ✅ 本地 | ❌ | 部分 | 部分 |
| 客户选片交付 | ✅ 内置 | ❌ | ❌ | ❌ |
| RAW 显影 | ❌（只读预览） | ✅ | ❌ | ❌ |
| 价格 | 免费开源 | 订阅 | 买断 | 订阅 |

### 11. CONTRIBUTING.md

现在没有。至少写清：
- 怎么跑起来（`npm ci` / `npm run dev`，Node ≥ 22）
- 提交前必须过 `npm run typecheck` + `npm test`
- 原生模块不能跨平台复用（这条你 README 写了，搬到 CONTRIBUTING 更合适）
- issue 模板：bug / 功能建议各一个

### 12. CHANGELOG.md

你 commit message 写得很规范（`feat:` / `fix:` 带说明），可以直接从 tag 之间生成：

```bash
git log v0.4.3..v0.4.4 --oneline --no-merges
```

对外仓库有 CHANGELOG 会显得项目"活着"。

### 13. 英文摘要（可选，但能扩大圈层）

在中文 README 顶部加一段 3 行的英文 TL;DR，让非中文用户知道这是什么。不用写完整英文 README，摘要就够：

```markdown
> **photocoffer** — A local-first photo library for photographers.
> Chinese semantic search (CLIP), star-based culling, client proofing pages — all offline.
> Your originals never move, never upload.
```

---

## 明确不做

| 别做 | 原因 |
| --- | --- |
| 不买/互刷 star | 会被 GitHub 判为异常，且 star 数造假一眼能看出来，反噬信任 |
| 不堆无关 topics 蹭流量 | 降低专业感，还可能被举报 |
| 不把 README 改成英文为主 | 目标用户是中文摄影师，中文是优势不是短板 |
| 不为了语言统计删掉 `design/` | 那些稿子有留存价值，用 `.gitattributes` 标记就够了 |
| 不在 README 塞 3 MB 的原图 | 加载慢会直接劝退，必须压到 300 KB 内 |
| 不把安装包提交进 git | 撑大仓库、克隆变慢；用 Releases（你目前 `release/` 没进 git 是对的） |

---

## 执行清单

按顺序打勾，前四项半小时内能全部完成：

```
【5 分钟，影响力最大】
[ ] 填 Description（复制上面文案）
[ ] 加 20 个 Topics

【15 分钟，解决"被当成网页项目"】
[ ] 新建 .gitattributes（design/** linguist-documentation）
[ ] push 后确认仓库语言变成 TypeScript

【20 分钟，解决"下不到软件"】
[ ] 用 v0.4.4 建第一个 GitHub Release，上传 exe + latest.yml
[ ] README 的「安装」改成 Releases 下载链接

【一小时，决定"点进来会不会留下"】
[ ] 压缩 3 张截图到 docs/images/（每张 <300 KB）
[ ] README 首屏插入截图 + 下载按钮
[ ] 上传 Social preview（1280×640）
[ ] 开启 Discussions

【长期】
[ ] 加「为什么做这个」故事
[ ] 加竞品对比表
[ ] CONTRIBUTING.md + issue 模板
[ ] CHANGELOG.md
[ ] 英文 TL;DR
```

---

## 一句话总结

> 现在最该做的**不是改 README 文案**，而是把四个"空门面"填上：**description、topics、Release、语言判定**。
> 这四项加起来 40 分钟，但它们决定了有没有人能找到你；README 截图决定了找到之后会不会留下。
