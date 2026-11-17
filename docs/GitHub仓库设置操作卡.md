# GitHub 仓库设置 · 操作卡

> 为什么需要你手动做：这台机器**无法通过 HTTPS 访问 GitHub**（curl 与 winget 都被代理挡下，报 `502 CONNECT tunnel failed` / `0x80072efd`），
> 而 git push 能通是因为走 SSH。GitHub 的写操作（改简介、加 topics、传 Release）都走 HTTPS API，因此只能你在浏览器里完成。
> 下面每一项都备好了文案，复制粘贴即可。**全部做完约 10 分钟。**

---

## 1️⃣ 填仓库简介（2 分钟）

**路径**：仓库首页右上 ⚙️ **Settings** → 最上方 **Description**

现在这里是空的（GitHub API 返回 `description: null`），搜索结果里只有仓库名。

**复制这段**：

```
本地优先的摄影图片库：中文语义搜图、打星挑片、客户选片交付，原图始终留在你的硬盘上
```

**同页往下一点 Website 框**，可以填：

```
https://github.com/kaobei-renzhe/photocoffer/releases
```

> 有落地页后再换成真正的官网。

---

## 2️⃣ 加 Topics（2 分钟）

**路径**：仓库首页右侧 About 栏 → 齿轮图标 → **Topics**（或 Settings 页里的 Topics）

**复制这一整段**（回车会自动变成标签，共 20 个，正好是上限）：

```
photography photo-management image-organizer photo-culling raw exif electron typescript desktop-app local-first offline-first privacy semantic-search clip sqlite windows macos chinese lightroom-alternative photographer-tools
```

**为什么是这些**：

| 分组 | 标签 | 作用 |
| --- | --- | --- |
| 用户会逛的 | `photography` `photo-management` `image-organizer` `photo-culling` `photographer-tools` | `github.com/topics/photography` 这类页面有真实流量 |
| 核心差异化 | `local-first` `offline-first` `privacy` | 你的立身之本，也是当下热门话题 |
| 蹭竞品搜索 | `lightroom-alternative` | 转化率最高——搜这个词的人正在找替代品 |
| 技术差异化 | `semantic-search` `clip` `chinese` `sqlite` | 吸引开发者和 AI 圈 |
| 技术栈流量 | `electron` `typescript` `desktop-app` | 开发者会逛 |
| 格式相关 | `raw` `exif` | 摄影用户的精确需求词 |
| 平台 | `windows` `macos` | 平台筛选 |

---

## 3️⃣ 建第一个 Release（5 分钟）

**这是最要紧的一项**：README 现在写「⬇ 下载最新版」指向 Releases，但 Releases 是空的（`There aren't any releases here`）。用户点进去会看到空白页。

**路径**：仓库首页右侧 **Releases** → **Draft a new release**

| 字段 | 填什么 |
| --- | --- |
| **Choose a tag** | 输入 `v0.5.0` → 点「Create new tag: v0.5.0 on publish」 |
| **Release title** | `存照 v0.5.0` |
| **Describe this release** | 把 `docs/release-notes-0.5.0.md` 的内容全部复制进去 |
| **Attach binaries** | 上传下面两个文件（见下） |

**要上传的文件**（在本机 `release/` 目录）：

```
E:\trae_projects\image-nest\release\存照 Setup 0.5.0.exe          (131 MB)
E:\trae_projects\image-nest\release\存照 Setup 0.5.0.exe.blockmap (142 KB)
```

> `latest.yml` **不要**传到 Release（那是给 generic 更新源用的，不是给用户下载的）。
> 131 MB 上传视网速可能要几分钟，传完别关页面。

**注意**：不要勾 "Set as a pre-release"（0.5.0 是正式版）。

---

## 4️⃣ 上传社交预览图（3 分钟）

**路径**：Settings → 最下方 **Social preview** → Upload an image

**规格**：1280 × 640 px，PNG 或 JPG，建议 < 1 MB

这是别人在微信 / X / 掘金分享链接时显示的卡片图。没设的话显示的是默认灰卡片。

**构图建议**：深色底（`#0B0B0B`）+ 左侧产品名「存照 photocoffer」+ 一句话 + 右侧一张界面截图。
可以直接用 `design/` 里的素材拼：

- 底图：`design/cunzhao-dark-gallery.png`
- 或灯箱：`design/cunzhao-lightbox-预览图.png`

---

## 5️⃣ 开启 Discussions（1 分钟）

**路径**：Settings → Features → 勾选 **Discussions**

好处：用户问「怎么用」「能不能支持 xx」不用开 issue（心理门槛高），讨论区还能被搜索引擎索引，带来长尾流量。

---

## 6️⃣ 核对一下（1 分钟）

做完后刷一下仓库首页，应该看到：

```
[ ] About 栏有简介 + 20 个 topics 标签
[ ] 右侧 Releases 显示 v0.5.0
[ ] language 从 HTML 变成 TypeScript（.gitattributes 已推上去，GitHub 异步重算，可能要几分钟）
[ ] 分享链接时预览卡片是自己的图
```

---

## 我这边已经做完的（无需你操作）

| 已完成 | 位置 |
| --- | --- |
| `.gitattributes`：把 2.97 MB 的 design 稿排除出语言统计 | 已 push |
| README 首屏加下载入口，修掉「打开仓库里的 release 目录」的错误指引 | 已 push |
| README 标题补英文名 `存照 · photocoffer` | 已 push |
| Release notes 全文（含 Windows 下载说明、本次改动、已知限制） | `docs/release-notes-0.5.0.md` |
| GitHub 曝光优化完整方案（含 13 条建议与执行清单） | `docs/GitHub曝光优化方案.md` |

---

## 如果以后能开代理

装了代理之后告诉我，我可以直接用 GitHub API 把上面 6 项一次性做完（需要你给一个 Personal Access Token，`repo` 权限即可，用完你可以立刻删）。
