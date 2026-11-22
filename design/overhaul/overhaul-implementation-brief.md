# 存照 · 体验重塑施工单（Phase 3 · 给 Trae 执行）

> 产出者：frontend-engineer（前端工程）
> 日期：2026-11-14
> 上游规范：`design/overhaul-visual-spec.md`（1280 行，第七案 G + **1B.12 G-neutral 定稿**）、`design/overhaul-ux-spec.md`（1111 行）
> 本单性质：**文档与技术判断**。不含业务代码实现、不做 git 提交。
> 所有行号均为**本人开文件逐一核实**的结果（复核时间 2026-11-14 19:30 前后），与两份规范里标注的行号有 ±3 行漂移时，**以本单为准**。

---

# 0. 给 Trae 的执行须知（必读，先于一切）

## 0.1 一句话目标

把界面从「一台器材」改成「一张托底的桌子」：**中性近黑桌面 + 一盏暖黄的灯（accent `#FDC75D`）+ 照片占大头**，同时修掉三个真实 bug（人像 fail-open、查看器 chrome 闪烁、主窗口无快捷键/无标题栏），而不是重做功能。

## 0.2 技术栈与运行方式（不要自行升级）

| 项 | 值 | 备注 |
|---|---|---|
| Electron | **45.x** | `BrowserWindow`、`titleBarOverlay`、`trafficLightPosition` 均可用 |
| React | **19.3**（`react` / `react-dom` ^19.3.1） | **原生支持 `inert` 属性**，无需 polyfill |
| Tailwind | **4.3**（`@tailwindcss/vite`） | 用 `@theme` 定义圆角 token；用 `@layer components/utilities` 写组件类 |
| 构建 | electron-vite 6 / vite 8 | `npm run dev` / `npm run build` |
| DB | better-sqlite3 **13**（同步 API） | 迁移机制在 `src/main/db.ts` |
| TS | typescript 7 | `npm run typecheck` = `tsc --noEmit` |
| 测试 | vitest 5 | `npm test` = `vitest run` |

**基线（我已实测）**：`npm test` → **26 个测试文件 / 156 个测试，全绿**；`npx tsc --noEmit` → 0 错误；单次测试耗时 ~2.5s。

## 0.3 绝对不能破坏的既有资产（改之前先背下来）

| 资产 | 位置（已核实） | 红线 |
|---|---|---|
| **156 个测试** | `src/**/*.test.ts`（26 文件） | 每个阶段结束必须全绿；**允许新增，不允许改断言来"通过"** |
| **旧数据目录迁移链** | `src/main/index.ts:161` `LEGACY_APP_DIRS = ['砚白','片匣','月相','lunaris','月巢','moonnest','image-nest']` | 数组顺序与内容一个字符都不能动 |
| **配置文件格式标识** | `src/shared/settingsTransfer.ts:6` `SETTINGS_APP_TAG = 'lunaris'` | 不改。改了旧备份包直接判为「不是存照的配置文件」（`:105`） |
| **XMP 命名空间** | `src/main/xmp.ts:113` `xmlns:moonphoto="https://lunaris.app/ns/1.0/"` | 不改，也不新增命名空间（人工判定**不写 XMP**，见 §2 第 5 条） |
| **localStorage 键** | `lunaris:theme` / `lunaris:skin`（`src/renderer/src/lib/theme.ts:5-6`、`src/renderer/public/theme-boot.js:10,15`） | 不改键名；`theme-boot.js` 里还有 `moonnest:*` 旧键回退，一并保留 |
| **skin id 四套** | `classic / night / paper / contrast`（`src/shared/skins.ts:15-48`） | id 不改（localStorage 残值兼容，`skins.test.ts` 已断言被砍 id 不再合法） |
| **人像 upsert 的列清单** | `src/main/portrait.ts:187-195` | 只写 `has_person/score/model/updated_at` 四列。**这正是"人工判定天然不被覆盖"的实现基础，不要"顺手"把它改成 `INSERT OR REPLACE`** |
| **schema 版本机制** | `src/main/db.ts:16` `CURRENT_SCHEMA`、`:332-337` `MIGRATION_STEPS`、`:340-355` `migrate()` | 只允许**追加** `{version:5, up:migrationV5}`，不允许改 1–4 步 |
| **`design/` / `docs/`** | 仓库根 | 只读。`design/` 下两份规范是本单的上游，**不要改它们** |
| **`.workbuddy`** | 仓库根 | **我已核实：当前工作树里不存在该目录**。若 Trae 环境里出现（工具链生成），一律只读、不提交、不写入 |
| **`build/icon-mono.png`** | `build/` | 已存在，是"小尺寸单色图标"的现成资产（视觉 3.5 第 4 条要用它） |

## 0.4 工作方式（违反会导致返工）

1. **先读规范再做**：`design/overhaul-visual-spec.md` 的 **1B.12 全表**（19 个色值 + 3 条纯黑阴影）与 **1B.4–1B.8**（圆角/阴影/字阶/密度/胶囊/面积纪律）是本单的视觉唯一来源；UX 规范 §1/§2/§3/§4 是交互与文案唯一来源。**两者与旧注释冲突时，以规范为准；规范与本单冲突时，以本单为准**（本单已按代码现状校准）。
2. **一次只做一个阶段**：S1→S5 每阶段独立提交（Trae 侧可以独立 review / 独立回滚）。不要跨阶段顺手改。
3. **每阶段收尾必跑**：`npm run typecheck && npm test`。两条都过了再进下一阶段。
4. **机械替换必须一次性完成**：字阶/圆角/图标这类"全量替换"不允许只改一半（视觉 1B.11 第 5 条：只改 accent 会得到最难看的中间态）。见 S1 的替换脚本约定。
5. **不确定就标**：本单里写了「需人工验证」的地方，先按写的方法验证一遍再落代码，不要猜。

## 0.5 已由 team-lead 拍板的两个决策（不要再讨论，直接实现）

**决策 A｜标题栏菜单做 5 个**：`文件 / 编辑 / 照片 / 视图 / 帮助`。
- Windows：窗内菜单（36px 条内），同时保留原生菜单（`autoHideMenuBar: true`，**不得 `setApplicationMenu(null)`**，否则 `Ctrl+Z/C/V` 失去加速键来源——`src/main/platform.ts:16-18` 的注释已说明）。
- macOS：窗内**无菜单**，走 `Menu.setApplicationMenu`（`platform.ts:19-29` 现只装 mac，需扩展到两平台但内容不同）。

**决策 B｜人工纠错永久优先**：`person_flags` 增加 **三列**
```sql
override        INTEGER   -- NULL=无人工结论 / 1=确认人像 / 0=不是人像
override_at     INTEGER   -- 判定时间戳（ms）
override_model  TEXT      -- 做人工判定时生效的模型 tag（用于"模型已更新，N 张人工判定仍保留"提示）
```
- **模型升级保留人工结论**；`portraitStatus().detected` 把 override **单列**统计，不混入"已扫"口径。
- **我已核实**：`src/main/portrait.ts:187-195` 的 upsert 列清单固定为 `has_person/score/model/updated_at`，`ON CONFLICT ... DO UPDATE SET` 里没有 `override*`，因此**重扫 / 换模型 / 重新导入都不会覆盖这三列，不需要额外保护逻辑**。这条要在代码注释里写明，防止后人"优化"成整行替换。
- 读路径权威值：**`COALESCE(override, has_person)`**（唯一权威值，全仓库只允许在这一处口径上判断"到底算不算人像"）；对外同时给 `verdict`（见 §2 第 2 条）。

### ⛔ 决策 B 的硬约束（team-lead 追加，必须写进代码注释 + 测试）

**不得把 `override` / `override_at` / `override_model` 加进 `scanPortrait()` 的 upsert SET 清单**（`src/main/portrait.ts` 的 `ON CONFLICT(item_id) DO UPDATE SET`）。加进去，「人工结论天然防覆盖」立刻失效，而且**破坏是静默的**——要等下一次模型升级（`MODEL_TAG` 变化触发全量重扫）才会暴露，届时用户会看到自己点过的判定全部消失，且没有任何报错可查。

**要求 1（注释）**：在 `portrait.ts` 的 upsert SQL 常量上方写中文注释，明确三列不可被引擎写入。可直接用：

```ts
/**
 * ⛔ 这三列永远不进 SET 清单：override / override_at / override_model
 *   它们是"人"的领地，本语句只写"模型"的领地（has_person/score/model/updated_at）。
 *   一旦把 override 加进 SET，重扫与模型升级会静默清掉人工判定，
 *   而且只在下次换模型时才被发现（no error, no log）。
 *   守卫测试见 portrait.test.ts「upsert 不得触碰人工结论三列」。
 */
export const PORTRAIT_UPSERT_SQL = `INSERT INTO person_flags(item_id, has_person, score, model, updated_at)
   VALUES (?, ?, ?, ?, ?)
   ON CONFLICT(item_id) DO UPDATE SET
     has_person = excluded.has_person,
     score      = excluded.score,
     model      = excluded.model,
     updated_at = excluded.updated_at`
```
（导出成常量是为了让测试能 dump SET 清单；`scanPortrait` 里改成 `db.prepare(PORTRAIT_UPSERT_SQL)`。）

**要求 2（可测验收）**：测试里 dump 该 SQL 的 SET 清单并断言不含三列 —— 见 §3.2 第 7 条，已写成两条：① 对导出的 SQL 常量做 `DO UPDATE SET` 之后的段做正则断言；② 对 `portrait.ts` 源码文本做整文件扫描，防止有人绕过常量另写一份。

**要求 3（统计口径）**：`portraitStatus()` 返回**四项单列统计**，主进程一次算清，**UI 不做减法**：

| 字段 | 含义 | SQL 口径 |
|---|---|---|
| `confirmedByModel` | 模型确认的人像（未被人工作废） | `override IS NULL AND model = @tag AND score >= 0.80` |
| `confirmedByHuman` | 人工确认为人像 | `override = 1` |
| `excludedByHuman` | 人工排除（不是人像） | `override = 0` |
| `staleOverrides` | 人工结论来自旧模型（`override_model <> 当前 MODEL_TAG`） | `override IS NOT NULL AND IFNULL(override_model,'') <> @tag` |

**要求 4（stale 的呈现是"告知"，不是"警告"）**：`staleOverrides > 0` 时，状态卡下方显示一行告知级文案：
- 文案：`模型已更新，{n} 张人工判定仍保留`
- 规格：`--fs-1` / `--muted` 字 / **无底色** / **无边框** / **不弹 toast** / 无图标（不要三角警告图标——它不是异常，是正常演进）
- 位置：状态卡内部最后一行，`padding-top 8px`；点击 → 把筛选切到「人工判定」视图（可选，若 S3 不实现则纯文本）

> 为什么强调"非警告"：`--warn` 在本轮已降级为 `--text + 三角图标`（视觉裁决 4），凡是挂三角图标的东西用户都会读成"出事了"。模型升级保留人工结论是**我们做对了**，不该长成告警的样子。


## 0.6 token 命名纪律（最容易踩的一条）

**既有 token 名一律保留，只改值或重指向**。原因：组件里已经有大量 `bg-[var(--warn-soft)]`、`text-[var(--success)]` 这类引用（实测 `warn-soft` 3 处、`warn-border` 4 处、`success-soft` 3 处、`success-border` 2 处、`danger-soft` / `danger-border` 各 18 处）。**删 token = 立刻掉色 / 变透明**。

| 旧 token | 新处理 |
|---|---|
| `--warn` | → `var(--text)`（视觉裁决 4：警告降级为「白字 + 三角图标」） |
| `--warn-soft` | → `var(--panel-3)` |
| `--warn-border` | → `var(--border-strong)` |
| `--success` | → `var(--accent)`（裁决 5，`✓` 图标强制，见 S1 风险） |
| `--success-soft` | → `var(--accent-soft)` |
| `--success-border` | → `var(--accent-border)` |
| `--star` | → `var(--accent)`（裁决 3，星标靠深描边区分） |
| `--danger` | **保留值**，但**只做前景**（文字/描边/图标）；⚠ **禁止作 background**（白字仅 3.13:1） |
| `--danger-soft` | **保留 token 名**，值 → `var(--panel-2)`（错误条一律 panel-2 底；19 文件 30 处引用，删了会静默变透明） |
| `--danger-border` | **保留 token 名**，值 → `var(--border)`（错误语义由三角图标承担，不靠描边） |
| `--radius-control` | 保留，值 → `var(--r-2)`（12px） |
| `--radius-panel` | 保留，值 → `var(--r-3)`（16px） |
| `--elev-1` / `--elev-2` | 保留，值 → `var(--shadow-1)` / `var(--shadow-2)` |
| `--fs-xs` / `--fs-sm` / `--fs-base` | 保留为别名：`var(--fs-1)` / `var(--fs-2)` / `var(--fs-3)` |
| `--lightbox` | 保留（S1），值 → `#0B0B0B`；S4 起改用 `--lb-stage-bg` |
| `--input-focus-border` | 保留，值 → `var(--accent-border)` |

新增 token（**只增不删**）：`--r-1..4`、`--r-pill`、`--shadow-1..3`、`--fs-1..6`、`--fw-400..700`、`--focus-ring`、`--accent-strong`、**`--danger-fill`**（G1 `#B33A2B` / G2 `#A62A21`，红实底唯一合法色）、`--lb-stage-bg`、`--lb-chrome`、`--lb-rule`、`--lb-text`、`--lb-faint`、`--lb-hover`、`--lb-matte`、`--icon-deco/inline/control/tool/hero`、`--titlebar-h`、`--titlebar-pad-win`、`--titlebar-pad-mac`。

## 0.7 命令速查

```bash
npm run typecheck            # tsc --noEmit
npm test                     # vitest run
npm test -- --reporter=dot   # 看总数用这个
npm run dev                  # 手动验收
npm run dist                 # Windows 出包（危险，只在 S5 收尾用）
```

---

# 1. 分阶段实施计划

## 1.0 顺序、依赖与规模总览

```
S1 视觉基础层 ──┬──▶ S3 人像工作台结构 ──┐
（token/字阶/图标）│                       ├──▶ S5 平台层与文案
                └──▶ S4 查看器 ──────────┘
S2 识别正确性 ──────▶ S3（verdict 是状态卡与队列的数据源）
```

| 阶段 | 主题 | 文件数 | 大致行数 | 依赖 | 可独立回滚 |
|---|---|---|---|---|---|
| **S1** | 视觉基础层（色/圆角/阴影/字阶/字重/图标） | 30–40 | **~1300 处机械替换** + styles.css ≈ 250 行 | 无 | ✅ 纯样式 |
| **S2** | 人像识别正确性（四态 + 双阈值 + migration + IPC） | 8 | ≈ 180 行 | 无 | ✅ 但 migration 只有前滚 |
| **S3** | 人像工作台三层结构 + 待确认队列 + 右栏动作卡 | 7 | ≈ 600 行 | **S1、S2** | ✅ 单文件为主 |
| **S4** | 查看器 chrome 状态模型 + 悬浮胶囊 + EXIF 三级 | 3–4 | ≈ 280 行 | **S1**（lb token） | ✅ |
| **S5** | 自定义标题栏 + 菜单单一来源 + 快捷键 + 37 条文案 | 10–14 | ≈ 700 行 | **S1、S3、S4** | ⚠️ 文案部分建议单独提交 |

**为什么是这个顺序（理由，不是偏好）**：
1. **S1 最先**：它是其余四个阶段的"词表"。S3 的卡片、S4 的胶囊、S5 的标题栏全都要引用 `--r-*` / `--shadow-*` / `--fs-*` / `--lb-*`。先做 S1，后面的新代码一次写对，不用二次返工。
2. **S1 也是风险最集中、最容易"看起来全变了其实没改对"的阶段**，先做可以先跑一次全量视觉回归（配色/密度/可读性），把问题挡在行为改动之前。
3. **S2 必须在 S3 之前**：状态卡（已确认/可能/待确认 + `staleOverrides` 告知行）与待确认队列都消费 `verdict` 与那四项单列统计；先改 UI 再改数据契约 = 写两遍。
4. **S4 与 S2 无耦合**，可与 S3 并行；但两者都要改 `styles.css`，**不要同时动同一个文件**（顺序建议 S3 → S4，或至少 S4 只动 `--lb-*` 段）。
5. **S5 最后**：标题栏要包住 `App.tsx` 的**所有**分支（booting / welcome / portrait / 主界面，见 `App.tsx:1487-1522`），文案替换又会横扫 S3/S4 刚改过的文件。放在最后，冲突最少。

---

## S1 · 视觉基础层（styles.css / skins.ts / 首帧底色 / 图标）

### S1.1 目标
把视觉规范的 **1B.12（G-neutral 中性黑定稿）** 与 **1B.4–1B.6** 落进 token 层，并把 1300 处字面值（字号/圆角/图标尺寸）机械归一。**这一阶段不改变任何交互行为**。

### S1.2 改动文件清单

| 文件 | 位置（已核实） | 改什么 |
|---|---|---|
| `src/renderer/src/styles.css` | `:8-63`（`:root` dark） | 整块替换为 G-neutral 全表（见 S1.3） |
| 同上 | `:65-110`（`[data-theme='light']`） | 整块替换为 G2 纸感表（见 S1.3） |
| 同上 | `:116-158`（`[data-skin='night']`） | 替换为 G1 中性黑同值（与 `:root` 一致） |
| 同上 | `:161-205`（`[data-skin='paper']`） | 替换为 G2 纸感同值 |
| 同上 | `:208-251`（`[data-skin='contrast']`） | 替换为「G1 语言 + 高对比值」：`--bg #0A0A0A`、`--text #FFFFFF`、`--accent #FFD97A`、`--accent-strong #FFD97A` |
| 同上 | `:3-6` `@theme` | `--radius-xl` 11px → **12px**；新增 `--radius-2xl: 16px`、`--radius-3xl: 20px` |
| 同上 | `:22-30` | 删 `--radius-control/panel` 的字面值改指 `--r-2/--r-3`；`--elev-1/2` 改指 `--shadow-1/2`；`--fs-xs/sm/base` 改别名 |
| 同上 | `:274-277` `.settings-nav-active` | R2 四件套 → **R2′**（填充 `--accent-soft` + `--accent-text` + 600 字 + ✓，取消 1px 描边与 2px 指示条） |
| 同上 | `:293` body 字体栈 | → `'Noto Sans SC','PingFang SC','Microsoft YaHei UI','Microsoft YaHei',system-ui,sans-serif` |
| 同上 | `:294` body `font-size: 13px` | → 13.5px |
| 同上 | `:321-328` focus-visible | `var(--accent)` → `var(--focus-ring)`；`.input:focus-visible` 的 box-shadow 用 `--accent-strong` | 
| 同上 | `:337-351` `.btn` | 高 30→**34**、圆角 `--r-2`、**删 border**、`--panel-2` 底、13.5px/500 |
| 同上 | `:361-380` `.btn-primary` | 反色 → **暖黄实底 `--accent` + `--on-accent` 字**（视觉 1B.2 #7）；hover `--accent-2`；disabled `--panel-2` + `--faint` |
| 同上 | `:408-430` `.input` | 高 34、圆角 `--r-2`、无描边、`--panel-2` 底 |
| 同上 | `:432-465` `.side-item` | 高 32→**38**、padding `0 12`、圆角 `--r-2`、选中 R2′ |
| 同上 | `:467-477` `.section-title` | **删 `letter-spacing: 0.08em`**（中文禁止字距，视觉 1B.5）、删 `text-transform: uppercase`、11px/500 `--faint` |
| 同上 | `:479-501` `.card-thumb` | 圆角 16、**无描边**、`--shadow-1`；hover `--shadow-2` + `translateY(-1px)`（现在 `:488` 是 `-2px`，改 -1）；选中 → 2.5px `--accent` 外环 + 1px `rgba(0,0,0,.20)` |
| `src/shared/skins.ts` | `:15-48` | 四套 `base` / `swatches` 换值（见 S1.4） |
| `src/main/index.ts` | `:109-114` `windowBackground()` | 硬编码 `#14161B`/`#F0F3F7` → `#171818` / `#FAF6EE`（**漏改这里首帧会闪旧色**） |
| `src/main/ipc.ts` | `:302-313` `applySkinNative()` | `:306-311` 同样两处硬编码 → 新 base；此函数是 S5 同步 `setTitleBarOverlay` 的挂点 |
| `src/renderer/src/**/*.tsx` | 全量 | 字号 ~750 处、圆角 ~408 处、图标 ~171 处（见 S1.5/S1.6） |

### S1.3 直接可粘的 token（G-neutral 定稿 + G2 纸感）

```css
:root {
  color-scheme: dark;
  /* 表面（严格中性：R=G=B，唯一例外 --bg 的 1 单位差） */
  --bg: #171818;
  --chrome: #1B1B1B;
  --panel: #1F1F1F;
  --panel-2: #242424;
  --panel-3: #2C2C2C;
  --card: #1E1E1E;
  --canvas: #141414;
  --stage: #0F0F0F;
  --border: #2A2A2A;          /* 仅装饰，不承担识别 */
  --border-strong: #383838;
  --overlay: rgba(10,10,10,.62);
  --lightbox: #0B0B0B;        /* S4 起改用 --lb-stage-bg */

  /* 文字 */
  --text: #F2F2F2;
  --muted: #A6A6A6;
  --faint: #8A8A8A;

  /* accent（暖黄 = 唯一的暖色） */
  --accent: #FDC75D;
  --accent-2: #FFDB92;
  --accent-soft: #50442D;
  --accent-border: #6B5629;
  --accent-text: #FFD87E;
  --on-accent: #141414;
  --accent-strong: #FDC75D;
  --focus-ring: #FDC75D;

  /* 语义重指向（视觉裁决 3/4/5） */
  --star: var(--accent);
  --success: var(--accent);
  --success-soft: var(--accent-soft);
  --success-border: var(--accent-border);
  --warn: var(--text);
  --warn-soft: var(--panel-3);
  --warn-border: var(--border-strong);
  /* 危险：--danger 只做前景（文字/描边/图标），禁止当填充底 */
  --danger: #F0664E;               /* ⚠ 白字 on 它只有 3.13:1（#F2F2F2 更低 2.79）→ 不得作 background */
  --danger-text: #F79A86;
  --danger-fill: #B33A2B;          /* 唯一允许的红实底（白字 5.90:1） */
  --danger-soft: var(--panel-2);   /* 保留 token 名，只重指向：错误条一律 panel-2 底 */
  --danger-border: var(--border);  /* 保留 token 名，只重指向：错误语义由三角图标承担，不靠描边 */

  /* 形状：只允许 5 档，禁止 4/6/10/14 */
  --r-1: 8px; --r-2: 12px; --r-3: 16px; --r-4: 20px; --r-pill: 999px;
  --radius-control: var(--r-2);
  --radius-panel: var(--r-3);

  /* 阴影：必须纯黑（中性底上用暖黑会泛脏棕，1B.12 裁决 2） */
  --shadow-1: 0 1px 2px rgba(0,0,0,.45), 0 3px 12px rgba(0,0,0,.30);
  --shadow-2: 0 8px 24px rgba(0,0,0,.45), 0 20px 48px rgba(0,0,0,.30);
  --shadow-3: 0 12px 32px rgba(0,0,0,.55), 0 32px 72px rgba(0,0,0,.40);
  --elev-1: var(--shadow-1);
  --elev-2: var(--shadow-2);

  /* 字阶六档 + 字重四档 */
  --fs-1: 11px; --fs-2: 12px; --fs-3: 13.5px; --fs-4: 15px; --fs-5: 18px; --fs-6: 26px;
  --fs-xs: var(--fs-1); --fs-sm: var(--fs-2); --fs-base: var(--fs-3);
  --fw-400: 400; --fw-500: 500; --fw-600: 600; --fw-700: 700;

  /* 图标阶梯 */
  --icon-deco: 12px; --icon-inline: 14px; --icon-control: 16px; --icon-tool: 18px; --icon-hero: 24px;

  /* 查看器（不随主题变） */
  --lb-stage-bg: #0B0B0B;
  --lb-chrome: rgba(22,22,22,.86);
  --lb-rule: rgba(255,255,255,.10);   /* 取 1B.8 的 .10；5.3 的 .12 是 G 之前的旧值 */
  --lb-text: #F2F2F2;
  --lb-faint: #A6A6A6;
  --lb-hover: rgba(255,255,255,.10);
  --lb-matte: #FFFFFF;

  /* 标题栏 */
  --titlebar-h: 36px; --titlebar-pad-win: 16px; --titlebar-pad-mac: 78px;

  --motion: 150ms cubic-bezier(0.2,0,0,1);
  --scroll-thumb: #2C2C2C;
  --scroll-thumb-hover: #3A3A3A;
  --input-focus-border: var(--accent-border);
  --input-focus-bg: #242424;
  /* 主按钮改为暖黄实底后，这 4 个旧 token 保留但不再被 .btn-primary 使用 */
  --btn-primary-bg: var(--accent);
  --btn-primary-text: var(--on-accent);
  --btn-primary-hover: var(--accent-2);
  --btn-primary-active: #E9B24D;
}

:root[data-theme='light'] {  /* G2 纸感 */
  color-scheme: light;
  --bg: #FAF6EE; --chrome: #FFFDF9; --panel: #F4EEE3; --panel-2: #EFE7D9; --panel-3: #E5DAC8;
  --card: #FFFFFF; --canvas: #F6F1E7; --stage: #F2ECE1;
  --border: #E6DCCB; --border-strong: #D3C5AE; --overlay: rgba(60,48,30,.35);
  --lightbox: #F4EEE4;
  --text: #1E1B16; --muted: #655D4E; --faint: #716A5A;
  --accent: #FFC44D; --accent-2: #F5B02F; --accent-soft: #F9E3B6; --accent-border: #E5C07A;
  --accent-text: #7A5200; --on-accent: #1E1B16;
  --accent-strong: #A66C00;   /* 关键：细形状在浅底上只能用它 */
  --focus-ring: #A66C00;
  --star: var(--accent); --success: var(--accent-strong);
  --success-soft: var(--accent-soft); --success-border: var(--accent-border);
  --warn: var(--text); --warn-soft: var(--panel-3); --warn-border: var(--border-strong);
  --danger: #C0342A; --danger-text: #A62A21; --danger-fill: #A62A21;   /* 白字 7.06:1 */
  --danger-soft: var(--panel-2); --danger-border: var(--border);
  --shadow-1: 0 1px 2px rgba(122,96,56,.10), 0 4px 14px rgba(122,96,56,.10);
  --shadow-2: 0 8px 24px rgba(122,96,56,.14), 0 20px 48px rgba(122,96,56,.10);
  --shadow-3: 0 12px 32px rgba(110,86,48,.18), 0 32px 72px rgba(110,86,48,.12);
  --lb-stage-bg: #F4EEE4;
  --lb-chrome: rgba(255,253,249,.94);
  --lb-rule: rgba(0,0,0,.08);
  --lb-text: #1E1B16; --lb-faint: #6E6656; --lb-hover: rgba(0,0,0,.06);
  --scroll-thumb: #D3C5AE; --scroll-thumb-hover: #BFAE93;
  --input-focus-bg: #FFFDF9;
}
/* night / paper / contrast 三套：把上面两块整表复制过去改 id 即可（night≡:root，paper≡light） */
:root[data-skin='contrast'] {
  color-scheme: dark;
  --bg: #0A0A0A; --chrome: #101010; --panel: #141414; --panel-2: #1A1A1A; --panel-3: #232323;
  --card: #141414; --canvas: #0A0A0A; --stage: #060606;
  --border: #3A3A3A; --border-strong: #545454;
  --text: #FFFFFF; --muted: #CCCCCC; --faint: #B0B0B0;
  --accent: #FFD97A; --accent-2: #FFE7AC; --accent-soft: #40361F; --accent-border: #7A6636;
  --accent-text: #FFE3A3; --on-accent: #0A0A0A; --accent-strong: #FFD97A; --focus-ring: #FFD97A;
  --danger: #FF7A66; --danger-text: #FFA390;
  --danger-fill: #A62A21;   /* 高对比 skin 目标是 AAA：白字 7.06:1，不要用 #B33A2B（只有 5.90） */
  --danger-soft: var(--panel-2); --danger-border: var(--border);
  --lb-stage-bg: #050505;
}
```

> **高 DPI 硬约束**：所有圆角/间距用偶数 px；阴影只允许 `spread 0`（视觉 1B.9-5）。12/16 在 125% 下会出 0.5px 毛边，偶数化后消失。

### S1.4 `skins.ts`（四套，id 与顺序不变）

```ts
{ id: 'classic',  name: '默认',   hint: '跟随系统深浅 · 匣色',  mode: 'auto',  base: '#171818', swatches: ['#171818', '#242424', '#FDC75D'] },
{ id: 'night',    name: '深色',   hint: '常驻深色 · 底板与匣壁', mode: 'dark',  base: '#171818', swatches: ['#171818', '#242424', '#FDC75D'] },
{ id: 'paper',    name: '浅色',   hint: '常驻浅色 · 暖纸感',    mode: 'light', base: '#FAF6EE', swatches: ['#FAF6EE', '#F4EEE3', '#7A5200'] },
{ id: 'contrast', name: '高对比', hint: '无障碍 · 高辨识度',     mode: 'dark',  base: '#0A0A0A', swatches: ['#0A0A0A', '#141414', '#FFD97A'] }
```
`SKINS[0].id === DEFAULT_SKIN`、三色 swatch、`base` 为合法 6 位 hex —— `skins.test.ts` 现有三条断言全部继续成立（**无需改测试**）。

### S1.5 字号 / 字重机械映射（**750 处，必须一次做完**）

实测字面量分布（`grep -rho "text-\[Npx\]"`）：`9.5px×19`、`10px×55`、`10.5px×173`、`11px×155`、`11.5px×205`、`12px×73`、`12.5px×41`、`13px×7`、`13.5px×15`、`14px×5`、`16px×2`、`26px×1`。

| 现值 | 归到 | token |
|---|---|---|
| 9 / 9.5 / 10 / 10.5 | **11** | `--fs-1` |
| 11 / 11.5 / 12 | **12** | `--fs-2` |
| 12.5 / 13 / 13.5 | **13.5** | `--fs-3` |
| 14 / 15 | **15** | `--fs-4` |
| 16 / 18 | **18** | `--fs-5` |
| 26 | 26（不变） | `--fs-6` |

**不要用 `text-[length:var(--fs-2)]`**（Tailwind 4 对 `text-[var(...)]` 有颜色/长度歧义）。在 `styles.css` 加 utility，然后替换成类名：

```css
@layer utilities {
  .fs-1 { font-size: var(--fs-1); line-height: 1.5; }
  .fs-2 { font-size: var(--fs-2); line-height: 1.5; }
  .fs-3 { font-size: var(--fs-3); line-height: 1.55; }
  .fs-4 { font-size: var(--fs-4); line-height: 1.4; }
  .fs-5 { font-size: var(--fs-5); line-height: 1.3; }
  .fs-6 { font-size: var(--fs-6); line-height: 1.2; }
  .fw-400 { font-weight: 400 } .fw-500 { font-weight: 500 }
  .fw-600 { font-weight: 600 } .fw-700 { font-weight: 700 }
}
```

**替换脚本（一次性、单遍、映射表驱动）**——禁止链式 `sed`（`11→12` 之后再 `12→13.5` 会把刚改的又推一级）：

```js
// 临时脚本，跑完即删；不要提交
import { readFileSync, writeFileSync } from 'node:fs'
const MAP = { '9px': '11px', '9.5px': '11px', '10px': '11px', '10.5px': '11px',
  '11px': '12px', '11.5px': '12px', '12px': '12px', '12.5px': '13.5px',
  '13px': '13.5px', '13.5px': '13.5px', '14px': '15px', '15px': '15px',
  '16px': '18px', '18px': '18px', '26px': '26px' }
// 单次 replace，回调里查表；只匹配 text-[...px]，不碰 text-[var(...)]
content = content.replace(/text-\[(\d+(?:\.\d+)?px)\]/g, (m, v) =>
  MAP[v] ? `text-[${MAP[v]}]` : m)
```
**跑完必须 `grep -c "text-\[10.5px\]"` 归零**，且 `npm test` 仍 156 绿。

**字重（方案 B 已拍板，见 §2 ⑬——照表执行，不许自己发明）**：

| 现值 | 场景 | 改成 |
|---|---|---|
| `font-semibold` / `font-weight: 600`（6 处） | 区块标题、面板标题、表单标题、**选中态** | **`font-bold` / 700** |
| `font-medium`（30 处） | **标题类**、按钮、chip、菜单项（控件档） | **`font-bold` / 700** |
| `font-medium`（30 处） | **辅助说明、状态条、分组标题（弱化用）** | **`font-normal` / 400** |
| 无（正文） | 列表项、EXIF 数值、正文 | 显式写 `font-normal` / 400 |
| `font-bold` | 页面标题、空状态标题 | 不动 |

**判定口诀**（写进 `styles.css` 注释）：`700 只给"这是标题"和"这是你选中的"，其余一律 400。`
**收尾断言**：S1 结束时 `grep -rn "font-weight: 500\|font-weight: 600\|font-medium\|font-semibold" src/renderer/src` 必须只剩「英文/数字专用」的极少数处（理想是 0 处）；不为 0 的每一处都要在提交说明里给出理由。
**层级补偿**：600→700 后若与相邻标题"撞重"，用**字号差 ≥1.5px** 或 `--muted` 区分（R-G5 双通道），**不要**调回 500。

**中文排印三条硬规则**（视觉 1B.5）：
1. 中文 `letter-spacing` 一律 **0** → 删除 `tracking-[0.08em]`、`tracking-wider`、`tracking-wide`（`.section-title` 的 `.08em` 必删）。
2. 中文行高 ≥ 1.4（已含在上面 utility 里）。
3. 数字/拉丁保留 `tabular-nums`（已有 `.num` 与 `tabular-nums` 类，不动）。

### S1.6 圆角与图标

**圆角**：实测 `rounded`(4px)×276、`rounded-md`(6)×30、`rounded-lg`(8)×102、`rounded-xl`(11)×35、`rounded-2xl`(16)×1。
因 `@theme` 已把 `--radius-xl` 从 11 改成 12、`--radius-2xl` 改成 16，**大部分类名不用动**：

| 现值 | 目标 | 操作 |
|---|---|---|
| `rounded`(4) / `rounded-md`(6) | 8px（`--r-1`） | 类名 → `rounded-lg`（**306 处**） |
| `rounded-lg`(8) | 12px（`--r-2`） | 类名 → `rounded-xl`（102 处） |
| `rounded-xl`(11) | 12px | 不动（@theme 已改） |
| 卡片/缩略图/面板/右侧模块卡 | 16px（`--r-3`） | 点名改 `rounded-2xl`（约 30 处：`.card-thumb`、PortraitWorkspace 卡片 `:726`、PhotoInspector 卡片等） |
| `rounded-full` | pill | 不动 |

> ⚠️ `rounded`→`rounded-lg` 与 `rounded-lg`→`rounded-xl` **同一个文件里不能链式做**。用同一个单遍脚本 + 负向断言（`/\brounded-md?\b/` 归零后再跑第二遍）。

**图标**（视觉第 3 章）：实测 `size={12}` **109**、`13` 54、`11` 45、`15` 36、`14` 31、`10` 14、`9` 3 → **≤12px 共 171 处**（规范写 168，代码已漂移 3 处；以 171 为准）。

| 位置 | 现状 | 改为 |
|---|---|---|
| `Toolbar.tsx` 工具栏按钮 | 12/11 | **16**（热区 32 已达标，只换图标） |
| `.btn` 内图标（h-7/h-8） | 12 | **16** |
| `h-5/h-6` ghost 小按钮 | 12 | **14**，热区**必须升到 24**（`h-5 px-1` 现在不达标） |
| 菜单项 / 右键菜单 | 12 | **14**，行高 28，图标↔文字 8px |
| `Lightbox` 底条（`w-6 h-6` + 13px） | 13 / 24 热区 | **16 / 28×28**（S4 一起做） |
| `Lightbox` 顶条 `size={15}` + h-7 | 15 / 28 | **16 / 28**（S4） |
| 卡片角标 `size={10}` | 10 | **12 仅装饰**；若可点 → 14 + 24 热区 |
| 空状态 / 欢迎 | 不一 | **24 起** |

描边：14–16px → `strokeWidth={1.75}`；18–24px → `1.5`；**禁止默认 2**（Lucide 默认 2，在 12px 上糊成一团，这是「小图标看不清」的一半原因）。建议新建 `components/Icon.tsx`：

```tsx
// 统一入口，禁止调用点自写 size / strokeWidth 数字
import type { LucideIcon } from 'lucide-react'
type Size = 'deco' | 'inline' | 'control' | 'tool' | 'hero'
const PX: Record<Size, number> = { deco: 12, inline: 14, control: 16, tool: 18, hero: 24 }
export function Icon({ as: C, size = 'control', ...rest }:
  { as: LucideIcon; size?: Size } & Omit<React.ComponentProps<LucideIcon>, 'size'>) {
  const px = PX[size]
  return <C size={px} strokeWidth={px <= 16 ? 1.75 : 1.5} {...rest} />
}
```
> 迁移期可以只替换 `size={n}` 数值 + 补 `strokeWidth`，**不必**一次全换 `Icon` 组件（171 处全换风险高）；但新增代码必须用 `Icon`。

### S1.7 新增的「面积纪律」守卫

`styles.css` 里加三条注释级规则（供 review）：
- 一屏最多 **1 个实底主按钮 + 1 组实底 chip**；accent 填充 >4% 视为 bug（视觉 1B.3 面积账：最满一屏实测 1.70%）。
- 星标（`--star` = `--accent`）**必须**带 `0.75px rgba(0,0,0,.45)` 描边 + 1px 投影，否则压在白色照片上只有 1.56:1 会消失。
- 缩略图选中环（2.5px `--accent`）**必须**外套 1px `rgba(0,0,0,.20)`，理由同上。
- ⭐ **例外：瀑布流卡（人像工作台 masonry）选中不加环、不加描边、不加位移、无 transition**——唯一信号是 26px 勾徽标；hover 只提 `--shadow-2`，禁止 `translateY`（主人 2026-11-14 定稿，见视觉 1B §组件基准表「瀑布流卡」行）。网格（`Gallery.tsx` 的 `.card-thumb`）保留外环。**两条规则不要互相套用**：一个是多列瀑布（300 张，任何位移都会让整屏呼吸），一个是网格（12 张，环是必要身份信号）。

> 🔍 **验证结论（2026-11-15，效果图 / 规范已改；代码由 Trae 执行，本条不要跳过）**：`design/mockups/overhaul-mockup.html` 的 G1/G2 已做到「选中无外环、无描边、无位移、无 transition，仅 26px 勾徽标」，放大核对见 `design/mockups/overview/选中态放大核对.png`；视觉 1B 组件表与本节规则同步。**真实代码 `src/renderer/src/PortraitWorkspace.tsx:726-730` 目前仍是 `border + transition-colors + ring-2 ring-[var(--accent)]`，由 Trae 在 S3 改为固定 className + 选中时渲染 26px 勾徽标**（lucide `Check`，`--accent` 实底 / `--on-accent` 勾）。网格选中态不在此规则内。

面积纪律没有自动化测试，靠人工验收（§3.3 第 9 条）。

### S1.7b danger 语义收敛（新增 `--danger-fill`，`--danger` 禁止作底）

**硬数据（视觉实测）**：白字 on `--danger #F0664E` = **3.13:1 ❌**，`#F2F2F2` 更低（**2.79**）。`--danger` 原本是为**前景文字**调的亮珊瑚——它被当成按钮底色时，会得到一个"看起来很危险、实际看不清"的按钮。

**三条落地规则**：

1. **新增 `--danger-fill`**：G1（中性黑）`#B33A2B`（白字 **5.90:1**）、G2（纸感）`#A62A21`（白字 **7.06:1**）、contrast 用 `#A62A21`（该 skin 目标 AAA 7:1，所以不用 `#B33A2B`）。**红实底按钮只准用 `--danger-fill`**。
2. **`--danger-soft` / `--danger-border` 两个 token 名一律保留，只重指向**（`--panel-2` / `--border`），**绝不删除**。见下方「为什么不能删」。
3. **红实底场景穷举（只有两处）**：① 「永久删除」的最终确认 ② 「清空回收站」。其余一切"危险但可撤销"的动作（淘汰、移出文件夹、取消星标、撤销入片）**一律只用 `--danger-text`**，不用底色。

**为什么不能删 `--danger-soft` / `--danger-border`（team-lead 已独立核实）**：
`grep -rn "danger-soft\|danger-border" src` → **19 个文件 / 30 行命中**（`styles.css` 10 处、`inspector/InfoTab.tsx` 3 处，其余 17 个文件各 1 处）。组件里写的是 `bg-[var(--danger-soft)]` 这种**任意值类**：token 一旦不存在，CSS 变量解析失败 → **背景静默变透明**，错误条看起来"不报错了"。这类 bug 不会抛异常、不会被测试抓到、上线后也没人当 bug 报。所以：**保留 token 名是最小风险路径**。

**逐处替换映射（即使本轮只重指向，也先登记好；若日后要收敛，按此表做独立提交）**：

| 现状写法 | 改成 | 处数/位置 |
|---|---|---|
| `bg-[var(--danger-soft)]` | `bg-[var(--panel-2)]` | 分布在各弹窗/错误条 |
| `border-[var(--danger-border)]` | **去掉描边**（错误语义由三角图标承担） | 同上 |
| `hover:bg-[var(--danger-soft)]` | `hover:bg-[var(--panel-3)]` | `ContextMenu.tsx:90`（**唯一一处 hover 用法**） |
| `text-[var(--danger-text)]` | **全部保留**（前景色继续用它） | 同上 |

> 收敛若要做，必须**独立提交 + 单列验收**：19 个文件全部替换完 + 视觉回归确认"错误条仍然显眼"（靠三角图标与 `--danger-text`，不靠底色）。

**「淘汰 / 留用」的选中态（人像工作台右栏卡的关键一条）**：
```
淘汰选中 = --panel-3 底 + --danger-text 字 + 700   （实测 6.60:1）
留用选中 = --accent-soft 底 + --accent-text 字 + 700
清除     = --panel-2 底 + --muted 字 + 400
```
**不要**用红实底表示"淘汰已选中"——淘汰是可撤销的，红实底只属于不可逆确认（规则 3）。

### S1.8 验收

```bash
npm run typecheck     # 0 error
npm test              # 26 文件 / 156 测试（若已加 S1 守卫测试则更多，见 §3.2）
```
手工：四套 skin 各截一张图（暗/亮/高对比/跟随系统）；确认① 无任何蓝色残留（`grep -rn "5B9FE8\|2F6CB8\|82B4F2" src` 应为 0）② 首帧不闪旧色（`npm run dev` 后立刻看）③ `--faint` 在 panel 上仍可读（4.50 临界，11px 元数据合规）。

### S1.9 风险

| 风险 | 缓解 |
|---|---|
| 1300 处替换漏改 → 中间态（部分 10.5px + 部分 11px）最难看 | 每个映射做「归零断言」（grep 计数为 0）再进下一个 |
| `--success` 指向 accent 后，「已复制」「导出成功」变成黄色文字（`EquipmentDialog.tsx:429,509,603`、`FinalsExportDialog.tsx:148-149`） | **必须**同时补 `✓` 图标（R3 冗余），否则语义丢失。此项列入 §3.3 人工清单 |
| 浅色下 `--accent #FFC44D` 对 bg 仅 **1.47:1** | 浅色细形状（进度条/slider/聚焦环）**只准**用 `--accent-strong #A66C00`；不允许"统一用 accent" |
| `rounded`→`rounded-lg` 与 `rounded-lg`→`rounded-xl` 互相踩 | 单遍脚本 + 分两步 + 每步后 typecheck |
| 中文 500/600 在 Windows 微软雅黑上是合成加粗（笔画不齐） | **已拍板走方案 B**（只用 400/700，不内置字体），映射表见 §2 ⑬ 与 S1.5；S1 收尾断言 `font-medium/font-semibold/font-weight:500|600` 归零 |
| `--danger` 被当成按钮底色 → 红底白字只有 3.13:1 | 红实底**只准** `--danger-fill`（S1.7b）；加静态守卫断言 `--danger` 不出现在 `background`/`bg-[var(...)]` 位置（§3.2 第 14 条） |
| `--danger-soft`/`--danger-border` 被误删 → 19 文件 30 处背景静默变透明 | **保留 token 名只重指向**（S1.7b）+ 静态守卫断言两者在 `styles.css` 中仍有定义（§3.2 第 15 条） |

**回滚**：S1 全部是 CSS/token 与类名，`git revert` 单次提交即可。

---

## S2 · 人像识别正确性（四态 + 双阈值 + migration + IPC）

### S2.1 目标
把「检测失败 / 取不到源」从「人像」里彻底拿出来（这是主人截图里天空/街道/汽车/建筑混入的**根因**，不是精度问题），并让人工纠错落库且永不被重扫覆盖。

### S2.2 改动文件清单

| 文件 | 位置（已核实） | 改什么 |
|---|---|---|
| `src/shared/types.ts` | `:1152-1156` `PortraitFlag` | 加 `verdict: PortraitVerdict`、`reason?: 'error' \| 'no-source'`、`override?: 0 \| 1 \| null`；**保留** `hasPerson`、`score` |
| 同上 | `:1143-1150` `PortraitStatus` | 加四项单列 `confirmedByModel / confirmedByHuman / excludedByHuman / staleOverrides` + 附加两项 `likely / unresolved`（全部必填，主进程算，见 S2.3） |
| 同上 | `:988-991` `Api` | 加 `portraitOverride: (ids: number[], value: 0\|1\|null) => Promise<number>` |
| `src/main/db.ts` | `:16` `CURRENT_SCHEMA = 4` | → **5** |
| 同上 | `:311-337` | 新增 `migrationV5` 并追加 `{ version: 5, up: migrationV5 }` |
| `src/main/portrait.ts` | `:19-25` 常量 | 新增 `PERSON_CONFIRM = 0.80`；`PERSON_THRESHOLD = 0.5` **不变** |
| 同上 | `:141-145` `sourceFor()` | 建议加 `existsSync` 守卫（见 S2.5「与规范的偏差」） |
| 同上 | `:147-174` `portraitStatus()` | 加**四项单列统计** `confirmedByModel / confirmedByHuman / excludedByHuman / staleOverrides`（口径见 §0.5 要求 3，主进程一次算清，UI 不做减法） |
| 同上 | `:182-225` `scanPortrait()` | 删 `:206` `let hasPerson = true`；`:208` source 为 null 时保持 `unresolved`；catch 填 `reason:'error'`；cached 分支带 override；**upsert SQL 抽成 `PORTRAIT_UPSERT_SQL` 常量 + 加中文禁止注释**（§0.5 要求 1） |
| 同上 | 新增 | 导出纯函数 `verdictFromScore()` 与 `setPortraitOverride()` |
| `src/main/ipc.ts` | `:1445-1460` | 新增 `ipcMain.handle('portrait:override', ...)`；`portrait:status` 不变（返回值扩展） |
| `src/preload/index.ts` | `:289-296` | 加 `portraitOverride` 一行 |
| `src/renderer/src/PortraitWorkspace.tsx` | `:64` | `Record<number, boolean>` → `Record<number, PortraitFlag>` |
| 同上 | `:166-170` | `next[flag.id] = flag.hasPerson` → `next[flag.id] = flag` |
| 同上 | `:191-195` `shownItems` | 过滤改四态（见 S2.6），**`unresolved` 永不进主网格** |

### S2.3 类型与三行核心改动

```ts
// src/shared/types.ts
export type PortraitVerdict = 'person' | 'likely' | 'no-person' | 'unresolved'

export interface PortraitFlag {
  id: number
  verdict: PortraitVerdict      // 权威结论
  score: number                 // 保留（现状有，渲染层之前把它丢了）
  hasPerson: boolean            // 保留兼容：仅 person/likely 为 true
  override?: 0 | 1 | null       // 人工结论，最高优先级
  reason?: 'error' | 'no-source'// 仅 unresolved 有意义
}
```

```ts
// src/main/portrait.ts —— scanPortrait() 的三行
// ① 删掉 `let hasPerson = true`（原 :206）
let verdict: PortraitVerdict = 'unresolved'
let reason: 'error' | 'no-source' | undefined
let score = 0
if (!source) {
  reason = 'no-source'            // ② 取不到源：保持 unresolved
} else {
  try {
    score = await detectFile(source)
    verdict = verdictFromScore(score)
  } catch (error) {
    reason = 'error'              // ③ 抛错：unresolved + reason
    void log.warn('portrait', '人像检测失败，本轮记为待确认', { id, error: String((error as Error)?.message ?? error) })
  }
}
```

**必须导出的纯函数**（供测试，避免测 onnx）：

```ts
export function verdictFromScore(score: number): PortraitVerdict {
  if (score >= PERSON_CONFIRM) return 'person'
  if (score >= PERSON_THRESHOLD) return 'likely'
  return 'no-person'
}
```

落库条件放宽为「有可信分数才写」（`resolved` 语义保留）：`if (verdict !== 'unresolved') upsert.run(...)` —— 与现状 `if (resolved)` 等价，**unresolved 仍不落库**（下次重试），这一点是对的，别改。

**`PortraitStatus` 扩展（四项单列统计 + 两项既有）**：

```ts
// src/shared/types.ts
export interface PortraitStatus {
  modelReady: boolean
  modelBytes: number
  /** 语义不变：当前模型扫过多少张（WHERE model = MODEL_TAG） */
  detected: number
  /** 库内可检测的照片总数 */
  total: number
  /** ↓ 主进程一次算清的四项，UI 只渲染、不做减法（§0.5 要求 3） */
  confirmedByModel: number   // override IS NULL AND model = tag AND score >= 0.80
  confirmedByHuman: number   // override = 1
  excludedByHuman: number    // override = 0
  staleOverrides: number     // override IS NOT NULL AND IFNULL(override_model,'') <> tag
  /** ↓ 附加两项：状态卡要显示「可能人像 / 待确认」，同样由主进程算出，禁止 UI 用减法凑 */
  likely: number             // override IS NULL AND model = tag AND 0.50 <= score < 0.80
  unresolved: number         // total - flagged（**在主进程里减**，不在渲染层减）
}
```

**读路径唯一权威值**（全仓库只允许这一处口径判断"算不算人像"）：

```ts
// src/main/portrait.ts —— 所有对外输出统一走它，不要在别处再写一遍三元表达式
/** 与 SQL 的 COALESCE(override, has_person) 完全等价：人工结论 > 模型结论 */
export function authoritativeHasPerson(flag: {
  verdict: PortraitVerdict
  override?: 0 | 1 | null
}): boolean {
  if (flag.override === 1) return true
  if (flag.override === 0) return false
  return flag.verdict === 'person' || flag.verdict === 'likely'
}
```
> `override === null | undefined` 时回落到模型结论（= `has_person`）；`unresolved` 在两侧都为 `false`。若将来要写原生 SQL 而不用 TS 判断，**必须**写 `COALESCE(f.override, f.has_person)`，不允许 `f.has_person OR f.override = 1`（后者在 `override = 0` 且 `has_person = 1` 时给出错答案，正是人工否决被吃掉的场景）。

### S2.4 SQL（可直接复制）

**migration V5**（`src/main/db.ts`，风格照抄 `migrationV4` 的 `subStep` 写法）：

```ts
/** v5：人像人工纠错（override 三列）——人工结论永久优先，重扫不覆盖 */
function migrationV5(db: Database.Database): void {
  subStep('补人工纠错列', () => {
    // 老库若在 v4 之后被手工删过表，先补建（幂等），再补列
    db.exec(`
      CREATE TABLE IF NOT EXISTS person_flags (
        item_id    INTEGER PRIMARY KEY,
        has_person INTEGER NOT NULL DEFAULT 0,
        score      REAL NOT NULL DEFAULT 0,
        model      TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_person_flags_model ON person_flags(model);
    `)
    // NULL = 无人工结论 / 1 = 确认人像 / 0 = 不是人像
    ensureColumn(db, 'person_flags', 'override', 'override INTEGER')
    ensureColumn(db, 'person_flags', 'override_at', 'override_at INTEGER')
    ensureColumn(db, 'person_flags', 'override_model', 'override_model TEXT')
    db.exec(`CREATE INDEX IF NOT EXISTS idx_person_flags_override ON person_flags(override)`)
  })
}

const MIGRATION_STEPS: MigrationStep[] = [
  { version: 1, up: migrationV1 },
  { version: 2, up: migrationV2 },
  { version: 3, up: migrationV3 },
  { version: 4, up: migrationV4 },
  { version: 5, up: migrationV5 }   // ← 只追加
]
```
> `ensureColumn`（`db.ts:116-126`）已经是幂等的，**不要**写裸 `ALTER TABLE`（老库可能重复执行到这一步）。迁移机制：`migrate()` 每步一个事务 + `db.pragma('user_version = N')`（`db.ts:344-353`），版本号跟着步骤走，所以只要 `CURRENT_SCHEMA` 与 `MIGRATION_STEPS` 同时改就不会漏。迁移前自动 `VACUUM INTO` 快照（`backupBeforeMigrate`，`db.ts:475-492`），失败自动还原。

**scanPortrait 的 upsert（行为不变，只抽常量 + 加禁止注释）**：

```ts
/**
 * ⛔ 这三列永远不进 SET 清单：override / override_at / override_model
 *   它们是"人"的领地；本语句只写"模型"的领地（has_person/score/model/updated_at）。
 *   一旦把 override 加进 SET，重扫与模型升级会静默清掉人工判定，
 *   而且只在下次换 MODEL_TAG 时才被发现（no error, no log, no toast）。
 *   守卫：portrait.test.ts「upsert 的 SET 清单不得含 override 三列」。
 */
export const PORTRAIT_UPSERT_SQL = `INSERT INTO person_flags(item_id, has_person, score, model, updated_at)
   VALUES (?, ?, ?, ?, ?)
   ON CONFLICT(item_id) DO UPDATE SET
     has_person = excluded.has_person,
     score      = excluded.score,
     model      = excluded.model,
     updated_at = excluded.updated_at`
```
> 除「抽成常量」外，**这段 SQL 一个字都不要改**（列顺序、`excluded.*` 写法都保持现状）。改动它的唯一合法理由是新增"模型领地"的列，且必须在同一次提交里更新守卫测试。

**写 override（`setPortraitOverride`）**：

```ts
export function setPortraitOverride(ids: number[], value: 0 | 1 | null): number {
  const db = getDb()
  const list = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))]
  if (!list.length) return 0
  const clear = db.prepare(
    'UPDATE person_flags SET override = NULL, override_at = NULL, override_model = NULL WHERE item_id = ?'
  )
  // 关键：model 写空串而不是 MODEL_TAG —— 这样「从未被模型扫过、只被人工判过」的照片
  // 不会被 portraitStatus().detected（WHERE model = MODEL_TAG）误算成「已扫」。
  const set = db.prepare(
    `INSERT INTO person_flags(item_id, has_person, score, model, updated_at, override, override_at, override_model)
     VALUES(?, ?, 0, '', ?, ?, ?, ?)
     ON CONFLICT(item_id) DO UPDATE SET
       override = excluded.override,
       override_at = excluded.override_at,
       override_model = excluded.override_model`
  )
  const tx = db.transaction((rows: number[]) => {
    for (const id of rows) {
      if (value === null) clear.run(id)
      else set.run(id, value, Date.now(), value, Date.now(), MODEL_TAG)
    }
  })
  tx(list)
  return list.length
}
```
> ☑️ 这段 upsert **只写 override 三列**，不碰 `has_person/score/model/updated_at`（那是模型的领地）。与 `scanPortrait` 的 upsert（只写那四列）形成互不侵犯的两半——这就是决策 B 的全部实现，不需要锁、不需要优先级比较。

**读（`scanPortrait` 的 cached 查询 + override）**：

```ts
const cached = db.prepare(
  `SELECT has_person, score, model, override FROM person_flags WHERE item_id = ?`
)
// 命中条件从「行存在」改为「当前模型扫过」
const row = cached.get(id) as { has_person: number; score: number; model: string; override: 0 | 1 | null } | undefined
const override = row?.override ?? null
if (row && row.model === MODEL_TAG) {
  const verdict = verdictFromScore(row.score)
  flags.push({ id, verdict, score: row.score, hasPerson: authoritativeHasPerson({ verdict, override }), override })
  continue
}
```
> `hasPerson` 一律由 `authoritativeHasPerson()`（= `COALESCE(override, has_person)` 的 TS 等价物）产出，**不要在调用点手写三元表达式**。

**统计（`portraitStatus`）—— 四项单列，主进程一次算清，UI 不做减法**：

```sql
-- detected（语义不变：当前模型扫过多少张）
SELECT COUNT(*) AS c FROM person_flags f JOIN items i ON i.id = f.item_id
 WHERE f.model = @tag AND i.trashed = 0 AND i.missing = 0;

-- 四项单列 + 附加两项，一次聚合拿全（全部在 SUM 里算，渲染层零计算）
SELECT
  -- 模型确认的人像（且未被人工作废）
  SUM(CASE WHEN f.override IS NULL AND f.model = @tag AND f.score >= 0.80
           THEN 1 ELSE 0 END) AS confirmedByModel,
  -- 人工确认为人像（覆盖模型结论，无论模型怎么说）
  SUM(CASE WHEN f.override = 1 THEN 1 ELSE 0 END) AS confirmedByHuman,
  -- 人工排除（不是人像）
  SUM(CASE WHEN f.override = 0 THEN 1 ELSE 0 END) AS excludedByHuman,
  -- 人工结论来自旧模型（驱动「告知级」提示，见 §0.5 要求 4）
  SUM(CASE WHEN f.override IS NOT NULL
            AND IFNULL(f.override_model, '') <> @tag
           THEN 1 ELSE 0 END) AS staleOverrides,
  -- 附加：可能人像 / 已判定总数（unresolved 由主进程用 total - flagged 得出）
  SUM(CASE WHEN f.override IS NULL AND f.model = @tag AND f.score >= 0.50 AND f.score < 0.80
           THEN 1 ELSE 0 END) AS likely,
  COUNT(*) AS flagged
FROM person_flags f JOIN items i ON i.id = f.item_id
WHERE i.trashed = 0 AND i.missing = 0;
```
```ts
// 主进程里减（不是渲染层）：分页 PAGE_LIMIT = 500，渲染层只见到当前页，减出来一定是错的
return { ...base, confirmedByModel, confirmedByHuman, excludedByHuman, staleOverrides, likely,
         unresolved: Math.max(0, total - flagged) }
```
> ⚠️ **禁止降级**为「只返回 detected + overridden，其余由渲染层用 `portraitFlags` 聚合」——我把上一版的可选降级删掉了：渲染层只有当前 500 条（`PAGE_LIMIT`，`PortraitWorkspace.tsx:29`），聚合结果在**任何**超过 500 张的库里都是错的，而"数字不对"比"数字没有"更伤信任。
> ⚠️ 也**禁止**用 `f.has_person OR f.override = 1` 表达"算人像"：`override = 0` 且 `has_person = 1` 时它给 `true`，正好吃掉人工否决。唯一正确写法是 `COALESCE(f.override, f.has_person)`。

### S2.5 与规范的偏差（**重要，我核实后的更正**）

UX 规范 §1.3.1 说「路径 B：取不到源 —— 频次**高**，因为新导入还没生成缩略图 / 文件被移走」。**代码实际不是这样**：

- `sourceFor()`（`portrait.ts:141-145`）：先找 `mid` 缩略图，没有就 `getItemFile(id)`。
- `getItemFile()`（`repo.ts:498-508`）：**直接返回 `row.path`，不检查文件是否存在**（只有 RAW/TIFF 分支会试 `previewPathFor` 并 `existsSync`）。
- 所以「文件被移走 / 缩略图没生成」时 `source` **不是 null**，而是「一个不存在的路径」→ `sharp(...)` 抛 ENOENT → 落到 catch → 现状同样 fail-open 成「有人」，但分类上是 `error` 而不是 `no-source`。

**结论**：两条 fail-open（`:206` 默认 true + `:213` catch 不落库但返回 true）**都已经在本次修复范围内**，`no-source` 分支反而很少命中。**修复本身不受影响**（`unresolved` 覆盖全部失败）。

**建议（可选，标「需人工验证」）**：给 `sourceFor()` 加守卫，让 `no-source` 名副其实：
```ts
function sourceFor(id: number): string | null {
  const thumb = thumbPathFor(id, 'mid')
  if (existsSync(thumb)) return thumb
  const file = getItemFile(id)
  return file && existsSync(file) ? file : null
}
```
**风险**：把「文件缺失」从 `error` 改判为 `no-source` 会改变队列里的原因文案（「这张检测失败了」→「这张取不到缩略图」）。若不做这个改动，请在 `PortraitReview` 的 reason 文案里把两者都写成「这张没能检测」，避免误导。**默认建议做**（一次 `existsSync` 的成本可忽略，且能省掉一次 sharp 启动）。

### S2.6 渲染层过滤（`PortraitWorkspace.tsx:191-195`）

```ts
const shownItems = useMemo(() => {
  return items.filter((item) => {
    const f = portraitFlags[item.id]
    if (!f) return false                                   // 未扫描 → 不进网格（进待确认）
    if (f.override === 1) return true                      // 人工确认，最高优先级
    if (f.override === 0) return false                     // 人工否决
    return f.verdict === 'person' || f.verdict === 'likely'
  })
}, [items, portraitFlags])
```
> `portraitOnly` 这个 state 在 S3 会被整体删除；S2 阶段**先保留它**以免一次改太多（S2 只保证 `unresolved` 不进网格，S3 再删开关）。

### S2.7 验收

```bash
npm run typecheck && npm test        # 期望 156 + 新增（见 §3.2），全绿
```
手工三步：
1. 找一个**从未扫描过**的照片（新导入），确认它不出现在人像网格里，且计入「待确认」。
2. 把一张照片的文件临时改名（制造读取失败），重进工作台 → 该照片不进网格（`unresolved`）。
3. 人工判「不是人像」→ 退出工作台 → 重进（触发重扫）→ 该照片**仍然**不在人像里（override 未被覆盖）。

### S2.8 风险

| 风险 | 缓解 |
|---|---|
| 老库（v4）升级到 v5 失败 | `ensureColumn` 幂等 + 迁移前自动快照 + 失败自动还原（`db.ts:575-598` 已有） |
| `PortraitFlag` 加字段 → IPC 序列化 | 纯 JSON 结构，**加字段向后兼容**；`preload` 只是 `invoke` 透传，无需改签名 |
| `override` 写入用 `model=''` | 任何 `WHERE model = ?` 的旧查询都不会命中空串；`portrait.test.ts` 不涉及 DB，**不会红** |
| 待确认数突然变成几千（首次全 unresolved） | 规范已裁决：**扫描中的照片不计入待确认**（S3 落地），S2 先不做计数 UI |
| 状态卡三个数之和不自洽 | 用 `§3.2` 的「计数自洽」测试守住（`confirmed + likely + noPersonOut + unresolved === total`） |

---

## S3 · 人像工作台三层结构与待确认队列

### S3.1 目标
把「范围 / 维度 / 状态」拆开，删掉自我否定的「仅人像 / 全部」开关，用常驻状态卡 + 可折叠维度 + 待确认队列，让页面变成「专注人像的工作台」。

### S3.2 改动文件清单

| 文件 | 位置（已核实） | 改什么 |
|---|---|---|
| `src/renderer/src/PortraitWorkspace.tsx` | `:62` | 删 `portraitOnly` state |
| 同上 | `:59-60,116-129` | `thumbSize` → `columns`（2/3/4），读 `getPortraitColumns` |
| 同上 | `:144-189` | 扫描 effect 去掉 `portraitOnly` 依赖；**扫描中不重排**（append-only） |
| 同上 | `:191-195` | 见 S2.6 |
| 同上 | `:248-258` `toggleFilter` | 保留；新增 `clearFacet(facetId)` |
| 同上 | `:260-269` `selectCard` | **加 Shift 范围选择**（`anchorRef` + `shownItems` 索引区间） |
| 同上 | `:351-448` header | 重写为 48px 工具条：`← 图库` / `人像 342 张 · 已选 2` / **范围下拉** / `2\|3\|4` / `⌕ 待确认 12 →` / 图标刷新。**删 Camera 图标（:356）、删开关（:397-428）、删「大小」滑杆（:429-440）、删「刷新」文字（:441-447）** |
| 同上 | `:458-605` 左栏 | 宽 228 → **264**；结构改为「状态卡（sticky）+ 8 维度（可折叠、记忆）+ 我的维度 + 新建维度 + 被判无人」；**删文件夹列表（改范围下拉）**；删每组标题的 `+`/垃圾桶常驻按钮（`:514-530`）→ 右键菜单 + 底部「新建维度」 |
| 同上 | `:609-690` 空状态 | 6 种状态按 §4 文案 + 骨架屏 |
| 同上 | `:692-762` 网格 | `columnWidth: thumbSize, columnGap: 10`（`:716`）→ `columnCount: columns, columnGap: 16`；卡片圆角 16、无描边、`--shadow-1`、选中 R2′；**维度标签只在 hover/选中显示**（`:742-757` 现在常驻吃 24px） |
| 同上 | `:767-811` 右栏 | 宽 306 → **252**；`PhotoInspector` 之上插入**动作卡**（三态 0/1/≥2） |
| 同上 | 新增 | 队列模式：`reviewOpen` 时中栏替换为 `<PortraitReview />` |
| **新建** `src/renderer/src/components/PortraitReview.tsx` | — | 约 150–180 行（规范估 120，实际要含键盘/原因文案/撤销，给 180 的预算） |
| **新建** `src/renderer/src/components/PortraitStatusCard.tsx` | — | 约 70 行：已确认 / 可能 / 待确认 三个**可点行**（`aria-label` 含数字）+ 底部 `staleOverrides` 的**告知行**（§0.5 要求 4：`--fs-1`/`--muted`/无底色/无边框/无图标/toast 禁用） |
| `src/shared/layout.ts` | `:22-33` | 新增 `PORTRAIT_COLUMNS = { default: 3, min: 2, max: 4 }` + `normalizePortraitColumns()`；**保留** `PORTRAIT_THUMB`（旧键迁移用） |
| `src/main/settings.ts` | `:53`、`:262-269` | 新增 `portraitColumns?: number` + `getPortraitColumns` / `savePortraitColumns`；一次性迁移映射（见 §2 第 6 条） |
| `src/main/ipc.ts` | `:1355-1357` | 新增 `settings:portraitColumns:get/save`（旧的两个 handler 保留，别删） |
| `src/preload/index.ts` | `:215-216` | 加两行 |
| `src/renderer/src/components/Sidebar.tsx` | 侧栏「更多」内的人像入口 | 把「人像工作台」提到主导航固定组（标题「人像」），不再依赖 `useCase === 'pro'`（UX 4.4） |

### S3.3 三层结构的 DOM 骨架（可直接照着写）

```
<div h-full flex flex-col>
  <TitleBar/>                                   ← S5 加，本阶段先不动
  <header h-12 shrink-0>                        ← 48px 工具条（视觉 1B.7）
    [← 图库] 人像  342 张 · 已选 2
    [范围：整个图库 ▾]                          ← 范围层
    [2|3|4]                                     ← 列数（记忆到 portraitColumns）
    [⌕ 待确认 12 →]                             ← 仅 N>0 时出现，--accent-soft 底
    [⟳]                                          ← 图标按钮，tooltip「重新读取照片与维度」
  </header>
  <div flex-1 flex min-h-0>
    <aside w-[264px] overflow-y-auto>
      <PortraitStatusCard sticky top-0/>         ← 状态层（不可折叠）
      <FacetSection ×8  collapsible/>            ← 维度层（景别/光线默认展开，其余折叠+badge）
      <div my-[26px]/>                           ← 26px 组间距
      <我的维度 + 新建维度/>
      <被判无人 128 · 抽查 →/>                   ← 11px --faint，置底
    </aside>
    <main flex-1>                               ← 网格 或 <PortraitReview/>
    </main>
    <aside w-[252px]>                           ← 动作卡 + PhotoInspector
    </aside>
  </div>
</div>
```

**维度顺序与默认展开**（改渲染顺序，**不改 `facets.sort` 数据**——`Facet` 有 `sort` 字段，但重排数据会影响图库视图与 XMP，风险高）：

```ts
const FACET_ORDER = ['shot_size','light','angle','tone','emotion','mood','scene','weather']
const DEFAULT_OPEN = new Set(['shot_size','light'])
// 排序：按 FACET_ORDER 取 index，未知维度（用户自建）排最后、保持原相对顺序
```
展开状态记忆到 `localStorage: portraitFacetsOpen`（JSON 字符串数组），与现有机制一致；**折叠时显示已选数量 badge（不显示 0）**。

### S3.4 待确认队列（新组件）

```tsx
// src/renderer/src/components/PortraitReview.tsx —— 只做判定，不复用 Lightbox（991 行、耦合 zoom/pan/region，复用成本 > 新建）
interface PortraitReviewProps {
  items: Item[]                       // 已按待确认顺序排好
  flags: Record<number, PortraitFlag>
  onJudge: (id: number, value: 0 | 1) => Promise<void>   // → portraitOverride([id], value)
  onSkip: (id: number) => void
  onExit: () => void
  onOpenLightbox: (id: number) => void
}
```
- 布局：48px 工具条（`← 退出队列` / `待确认 3 / 12` / `跳过全部 →`）+ 大图（`max-height: 56vh`、圆角 16、`--shadow-2`）+ 一行 11px 元数据 + 三个按钮（高 40）。
- 键盘：`Y`=是人像、`N`=不是人像、`→`/`Space`=跳过、`←`=上一张、`Esc`=退出。**三个按钮本身必须是普通 `button`**（键盘可达是 a11y 底线，Y/N 只是加速）。
- 判定即时生效，**不弹 toast、不要二次确认**；右上角一个「撤回上一次」（或 `Ctrl/Cmd+Z`）。
- 原因文案（`reason` 驱动）：
  | reason | 文案 |
  |---|---|
  | `no-source` | 这张取不到缩略图，没能检测 |
  | `error` | 这张检测失败了 |
  | 无（未扫描） | 这张还没检测 |

### S3.5 右栏动作卡（252px，三态）

| 选中 | 内容 | 主按钮（一屏唯一实底） |
|---|---|---|
| 0 张 | 本场人像：已确认 214 / 可能 6 / 待确认 12 → 去确认 + 「下一步」三步清单 | `开始过待确认`（仅当待确认 > 0） |
| 1 张 | 文件名 + 尺寸 + 判定三 chip + 星级 5 键 + 留用/淘汰/清除 + 景别 chip 行 + 放进文件夹 | `加入选片` |
| ≥2 张 | 已选 N 张 + 星级 + 去留 + 景别 + 放进文件夹 | `加入选片` |

- **全部动作都有现成 IPC**：`bulkUpdate`（rating/flag）、`bulkSetFacetValue`（`PortraitWorkspace.tsx:294`）、`addSelectedToFolder`（`App.tsx:1658`）、`savePickDraft`（`App.tsx:1669`）。
- **不出现「保存」按钮**（打标即时落库）。
- **去留三态的颜色**（§1.5.1 的落地细则，视觉已实测）：留用选中 = `--accent-soft` 底 + `--accent-text` 字 + 700；**淘汰选中 = `--panel-3` 底 + `--danger-text` 字 + 700（6.60:1）**；清除 = `--panel-2` 底 + `--muted` 字 + 400。**淘汰不用红实底**——它可撤销，红实底只属于「永久删除最终确认 / 清空回收站」（S1.7b）。
- 卡内动作区 `sticky bottom-0`（主按钮永远在手边）。
- ⚠️ **不要照搬 mockup 里的磨皮/肤色/眼神光滑杆**（`design/mockups/overhaul-mockup.html:719-750`）：存照全库没有一处写回图片像素，那是像素蛋糕的本职（UX 1.5.0 已裁决，视觉也同意）。

### S3.6 Shift 范围选择（补桌面上最缺的肌肉记忆）

```ts
const anchorRef = useRef<number | null>(null)
const selectCard = (item: Item, e: ReactMouseEvent): void => {
  const ids = shownItems.map((it) => it.id)
  if (e.shiftKey && anchorRef.current !== null) {
    const a = ids.indexOf(anchorRef.current)
    const b = ids.indexOf(item.id)
    if (a >= 0 && b >= 0) {
      const [lo, hi] = a < b ? [a, b] : [b, a]
      setSelection(ids.slice(lo, hi + 1))
      setActiveId(item.id)
      return                                   // 注意：Shift 不移动 anchor
    }
  }
  anchorRef.current = item.id
  setActiveId(item.id)
  if (e.ctrlKey || e.metaKey) {
    setSelection((prev) => prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id])
  } else {
    setSelection([item.id])
  }
}
```
> **瀑布流顺序的坑（已核实）**：网格用 CSS multi-column（`:716` `columnWidth`），`column-fill` 默认 `balance`，DOM 顺序 = **列优先**（先填满第一列）。所以 `shownItems` 索引区间在视觉上就是「沿当前列向下，再进入下一列」，可预测、可用；但**不要**把它写成「同一行左右扩展」（那需要 layout 坐标，本阶段不做）。这条写进代码注释，免得以后有人以为是 bug。

### S3.7 验收

```bash
npm run typecheck && npm test
```
手工（对应 UX §7.2）：① 开关已消失 ② 左栏只有「状态卡 + 维度」两层 ③ 8 维度顺序为 景别→光线→视角→色调→情绪→氛围→场景→天气 ④ 首次只展开前两组 ⑤ 折叠显示 badge ⑥ 组标题旁无 `+`/垃圾桶 ⑦ 工具条无 Camera / 无滑杆 / 无「刷新」文字 ⑧ 右栏三态切换、一屏 1 个实底按钮 ⑨ Shift 范围选择可用 ⑩ 维度标签仅 hover/选中显示。

### S3.8 风险

| 风险 | 缓解 |
|---|---|
| 左栏重排后用户找不到文件夹 | 「范围」下拉第一项是「整个图库」，其后是文件夹树；`folderId` 语义不变（`listItems` 入参照旧） |
| 折叠状态写坏 localStorage | `JSON.parse` 失败 → 回落 `DEFAULT_OPEN`（照抄现有 `openSections` 的容错写法） |
| 右栏 306→252 挤压 PhotoInspector | 先只压缩容器宽度，内部 `overflow-y: auto`；若 inspector 内部有固定宽，改 `min-w-0` + flex |
| 动作卡与 PhotoInspector 抢垂直空间 | 动作卡 `shrink-0` + inspector `flex-1 min-h-0`（现有结构已经是 `:794-808`，只需在它前面插卡片） |
| 队列模式与 Lightbox 同时打开 | 双击大图才开 Lightbox；`reviewOpen && lightboxOpen` 时 Lightbox 覆盖（z-50 已有） |

---

## S4 · 查看器（chrome 状态模型 + 悬浮胶囊 + EXIF 三级）

### S4.1 目标
**删除一切「系统猜你不看」的计时器**：常规浏览 chrome 恒可见；只有幻灯片静止与用户主动 `Tab` 沉浸才隐藏。把占位横条改成不占布局的悬浮胶囊。

### S4.2 改动文件清单

| 文件 | 位置（已核实） | 改什么 |
|---|---|---|
| `src/renderer/src/components/Lightbox.tsx` | `:26,125-127` | **删 `useIdle` 与 `chrome` 变量**，换三状态源（S4.3） |
| 同上 | `:116-123` | 新增 `immersive`、`slideIdle`、`peekBand` 状态 |
| 同上 | `:188-197` | 幻灯片计时器：**自动翻页不更新 `lastUserInput`**（写注释） |
| 同上 | `:199-209` | `bump()` 拆成「用户输入 → `lastUserInput = Date.now()`」 |
| 同上 | `:382-493` keydown | 插入两级 Esc（沉浸→全屏）；`Tab` 开关沉浸；`0` 改「清除星级」、`Ctrl/⌘+0` 适应；新增 `1–5`/`P`/`X`/`U`/`I`/`Z`/`?`；mac `⌃⌘F`、`⌘W` |
| 同上 | `:449-457` | 保留 `←→`，加 `J/K` 别名 |
| 同上 | `:472` | `0` 不再 `resetFit()` |
| 同上 | `:621-647` 顶条 | `h-[46px]` → **悬浮胶囊 44px**（不占布局）；文件名 **15/700**（方案 B）、计数 12 tabular、`min-width: 62px`；宽度 **`width: 620px; max-width: 62%`**（UX 最终值：固定 620 + 上限 62%，两条都要写，缺一条都会换图跳宽）；Windows 右内边距 148 |
| 同上 | `:649-672` 帮助浮层 | 改成从**单一快捷键表**渲染（`shared/shortcuts.ts`），不再硬编码 10 行 |
| 同上 | `:674-784` stage | `inset 24px`；照片圆角 2–4px + 2px 白 matte（`--lb-matte`）+ `--shadow-3`；**禁止 `-webkit-app-region: drag`** |
| 同上 | `:755-776` 箭头 | 恒 `opacity: .35`，hover `.1` 底 + `opacity 1`，**删 `opacity-15` 那段** |
| 同上 | `:815-891` 底条 | `h-[34px]` → 两颗胶囊（EXIF 左 / 工具右），44px、pill、`--lb-chrome` + `blur(18px)` |
| 同上 | `:818-825` EXIF | 三级重排：L1 `f/ · 快门 · ISO`（固定宽 40/56/56），L2 器材一行（`max-width 320`、可点→档案·信息），**L3 尺寸/时间移出底条** |
| 同上 | `:826-890` 工具组 | 全部热区 **28×28**、图标 **16**、组间 1px `--lb-rule`；百分比 `min-width: 46px` |
| 同上 | `:900-991` `RegionLayer` | **`:961-962` 的 `var(--accent)` 边框 + 14% accent 填充必须改**：照片上的圈选框不得用 accent（视觉 1.4 硬禁），改 `#F2F5F8` 框 + `rgba(0,0,0,.45)` 外描边 |
| `src/renderer/src/hooks/useIdle.ts` | 整文件 | 改完后**无调用方**。保留文件并加 `@deprecated` 注释（不要删，避免与其它分支冲突），或确认无引用后删除 |
| `src/renderer/src/styles.css` | `:20` `--lightbox` | 根节点背景改 `var(--lb-stage-bg)` |

### S4.3 状态模型（精确代码，照抄即可）

```tsx
// ── 三个独立状态源，每个只有一个写入者 ────────────────────────
const [immersive, setImmersive] = useState(false)   // 只由 Tab / Esc 写
const [slideIdle, setSlideIdle] = useState(false)   // 只由幻灯片计时器写
const [peekY, setPeekY] = useState<number | null>(null) // 只由 window pointermove 写

// ── 唯一可见性判定（纯函数，无副作用；**参数里没有 itemId**，结构上保证换图不影响） ──
const peekBand = peekY !== null && (peekY < 68 || peekY > window.innerHeight - 68)
const chromeVisible = immersive ? peekBand : !slideIdle

// ── 常规浏览：opacity 恒 1，没有任何 transition 被触发 ──
const chromeCls = immersive || slideIdle
  ? `transition-opacity ${slideIdle ? 'duration-[60ms]' : 'duration-200'} ${chromeVisible ? 'opacity-100' : 'opacity-0'}`
  : 'opacity-100'

// ── 指针几何：只在 window 上听一次，passive ──
useEffect(() => {
  if (!immersive) { setPeekY(null); return }
  const onMove = (e: PointerEvent): void => setPeekY(e.clientY)
  window.addEventListener('pointermove', onMove, { passive: true })
  return () => window.removeEventListener('pointermove', onMove)
}, [immersive])

// ── 幻灯片 idle：唯一允许的静态判定 ──
const lastUserInputRef = useRef(Date.now())
useEffect(() => {
  if (!slideshow) { setSlideIdle(false); return }
  const timer = window.setInterval(() => {
    const quiet = Date.now() - lastUserInputRef.current > 3000
    setSlideIdle(quiet && !drawing && !helpOpen && !immersive)
  }, 500)
  return () => window.clearInterval(timer)
}, [slideshow, drawing, helpOpen, immersive])

// 用户输入只在这一处更新；**自动翻页（onNavigate）绝不更新它**
const markUserInput = (): void => { lastUserInputRef.current = Date.now() }
```

**隐藏时必须 `inert`**（UX 6.4）：`opacity:0` 的元素仍在可访问树与 Tab 序列里。

```tsx
<div className={chromeCls} inert={!chromeVisible} aria-hidden={!chromeVisible}>…顶胶囊…</div>
```
React 19 原生支持 `inert`（`@types/react@19` 已带类型），**不需要 polyfill，也不要用 `opacity-0 pointer-events-none` 冒充**。

**关闭查看器重置**：`useEffect(() => () => setImmersive(false), [])`（用户可能忘了自己按过 Tab，下次打开必须是常规态）。

### S4.4 换图不抖动（逐条可测）

1. 顶胶囊 **`width: 620px; max-width: 62%`**（UX 最终值），内部文件名 `truncate`。
   - **两条都要有**：只写 `width: 620px` → 窄窗压到原生三键；只写 `max-width: 62%` → 短文件名时胶囊变窄，**换图时宽度跳变**（这正是要修的抖动）。
   - 620px 的来历：既够放 `2026-11-08_婚礼_第一机位_精修候选_0042.CR3` 这类长名（截断后仍可读），又能在 1080 宽窗口（62% = 670px）下让 620 生效。
2. 计数 `min-width: 62px`；百分比 46px；角度 34px；间隔 40px；全部 `tabular-nums`。
3. `useEffect [item?.id]` **只重置** zoom/pan/rotation/region/hint，**不碰** `immersive/slideIdle/peekY`（这是问题 3 的根因，写进注释）。
4. L1 缺失值保留空位：`f/—`、`—`、`ISO —`，**不塌陷**。
5. 换图期间 `transition: none`（`[data-navigating]` 属性）。

### S4.5 验收

```bash
npm run typecheck && npm test
```
手工（对应 UX §7.3）：
1. 连续按 `→` 20 次 → DevTools Performance **无 opacity 动画帧**，chrome 一次都不闪。
2. `Tab` → 胶囊/箭头隐藏且**用键盘 Tab 遍历不进隐藏按钮**（`inert` 生效）；指针移到顶部 68px 内 → 200ms 淡入。
3. 幻灯片：静止 3s → 60ms 淡出；**自动翻页不唤回**；任意键/滚轮 → 0ms 显示。
4. 换一张没有 EXIF 的图（截图）→ 底条不横向滑动。
5. 1080 与 1480 两个宽度下，顶胶囊与右上 140×36 禁区不重叠。

### S4.6 风险

| 风险 | 缓解 |
|---|---|
| 沉浸态用户不知道怎么退出 | 进入时 1.5s 中央提示「已隐藏工具栏 · 按 Tab 恢复」（`aria-live="polite"`，`prefers-reduced-motion` 下静态 3s）+ `?` 浮层第一行 + 68px 唤回带 + Esc |
| 顶胶囊固定 62% 在窄窗下压到三键 | <900px（窗口 minWidth 1080，实际不可达）改左对齐 + `padding-right: 152` |
| 浅色（paper）查看器暗部判断偏亮 | `--lb-stage-bg #F4EEE4` 是规范裁决；逃生门是「G2b」：只把 `--lb-stage-bg` 换 `#121110`、`--lb-chrome` 换 `rgba(28,25,21,.86)` |
| `inert` 与拖拽/指针事件冲突 | `inert` 会屏蔽子树事件；只在 `!chromeVisible` 时加，可见时 `inert={false}` |
| 圆圈选改色后与照片里的浅色背景混 | 用 `#F2F5F8` + `rgba(0,0,0,.45)` 外描边（双通道），并在 11px 提示里保留「框选」文字 |

---

## S5 · 平台层（标题栏 / 菜单 / 快捷键）与文案

### S5.1 目标
去掉原生标题栏的应用图标（Electron 无 API 单独隐藏，**只能换自定义标题栏**），补齐 Windows/macOS 各自习惯的入口与快捷键，并把「工程师语」文案换成「话不多的摄影助理」。

### S5.2 改动文件清单

| 文件 | 位置（已核实） | 改什么 |
|---|---|---|
| `src/main/index.ts` | `:122-148` `createWindow()` | 加 `titleBarStyle: 'hidden'`；win → `titleBarOverlay: { color, symbolColor, height: 36 }`；mac → `trafficLightPosition: { x: 16, y: 12 }`；`:131` `title` 保留（任务栏/窗口列表要用） |
| 同上 | `:110-114` `windowBackground()` | 已由 S1 改为新 base（确认） |
| 同上 | `:227` `installAppMenu()` | 改为「两平台都装，模板来自 `shared/menu.ts`」 |
| `src/main/platform.ts` | `:19-29` | 保留 `isMac` 判断，但菜单模板改为 import `buildMenuTemplate()`；**Windows 分支不得 `setApplicationMenu(null)`** |
| **新建** `src/shared/menu.ts` | — | 菜单**唯一来源**：`buildMenuTemplate({ isMac, actions })` → `MenuItemConstructorOptions[]`；同时导出 `MENU_SECTIONS`（Win 窗内菜单渲染用同一份数据） |
| **新建** `src/renderer/src/components/TitleBar.tsx` | — | 约 170 行：36px、`--chrome` 底、无阴影、整条 `-webkit-app-region: drag`；品牌字 13/600/.06em + `user-select:none`；Win 5 菜单 chip / mac 78px 死区 + 图库名 + 1 个视图下拉 |
| **新建** `src/renderer/src/hooks/useGlobalKeys.ts` | — | 约 90 行：主窗口快捷键（渲染层 keydown，**不用 `globalShortcut`**） |
| `src/renderer/src/App.tsx` | `:1487-1522` | 把 `<TitleBar />` 作为**所有分支**的第一行（booting / welcome / portrait / 主界面）；主界面根 `:1523` 的 `flex flex-col` 里插 `<TitleBar/>` 前 |
| 同上 | `:102` 起 | 挂 `useGlobalKeys`（视图切换 `Ctrl/⌘+1/2/3`、搜索、设置、F5） |
| `src/main/ipc.ts` | `:302-313` | `applySkinNative` 里追加 `win.setTitleBarOverlay({ color, symbolColor })`（Windows） |
| 同上 | 新增 | `window:minimize/maximize/close` **不需要**（用原生 overlay/红绿灯）；但要给 mac `⌘W` 一个 `close` role（在菜单模板里） |
| 文案 | 见 §5.6 表格 | 37 条 + 三处系统性文案 |

### S5.3 窗口创建（可直接粘）

```ts
// src/main/index.ts
const win = new BrowserWindow({
  width: 1480, height: 920, minWidth: 1080, minHeight: 680,
  backgroundColor: windowBackground(),
  autoHideMenuBar: true,              // 保留：Windows 靠它隐藏原生菜单但保住加速键
  title: '存照',
  titleBarStyle: 'hidden',
  ...(isMac
    ? { trafficLightPosition: { x: 16, y: 12 } }
    : { titleBarOverlay: { color: titleBarColor(), symbolColor: titleBarSymbol(), height: 36 } }),
  show: !headless,
  paintWhenInitiallyHidden: true,
  ...(existsSync(iconPath) ? { icon: iconPath } : {}),
  webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: true }
})
```
```ts
// 与 S1 的 skin 表同源，避免第三处硬编码
function titleBarColor(): string {
  const skin = currentSkin()
  const dark = skin.mode === 'auto' ? nativeTheme.shouldUseDarkColors : skin.mode === 'dark'
  return dark ? '#1B1B1B' : '#FFFDF9'      // = --chrome
}
function titleBarSymbol(): string { return titleBarColor() === '#1B1B1B' ? '#A6A6A6' : '#4A5464' }
```
> `backgroundColor` / `titleBarOverlay.color` / `applySkinNative()` **三处必须同源**（现在 `index.ts:110-114` 与 `ipc.ts:306-311` 各硬编码一次，S1 已统一到 `skin.base`；S5 再加 `titleBarColor()` 时抽成一个 `themeSurface()` 工具，放在 `src/main/theme-surface.ts`，避免第三份）。

### S5.4 标题栏布局（36px）

```
Windows
┌───────────────────────────────────────────────────────────────────────────┐
│ 16  存照 │  文件  编辑  照片  视图  帮助              [⚙]    ─  □  ✕       │ 36
└───────────────────────────────────────────────────────────────────────────┘
   品牌字      5 chip（左起，13/500，高 26，圆角 12，间距 2）  齿轮28   原生 overlay 140×36 禁区

macOS
┌───────────────────────────────────────────────────────────────────────────┐
│ ● ● ●   78px  存照 │ 婚礼_2026-11-08                        [▤]           │ 36
└───────────────────────────────────────────────────────────────────────────┘
   红绿灯（原生）  品牌字 --muted   图库名 12/--faint/260 截断/可点   视图下拉
```

**硬规则**：
- 整条 `-webkit-app-region: drag`；**每个** chip / 齿轮 / 图库名 / 视图下拉加 `-webkit-app-region: no-drag`（drag 区里的 click 会被 Electron 吞掉）。
- 品牌字 `user-select: none`（否则会拖出蓝色选区但不移动窗口）。
- **右起 148px 内不放任何 DOM**（原生三键 overlay 绘制在网页之上，放了也点不到）。
- **工具条、侧栏、内容区、查看器内一律不设 drag**（会吞掉拖拽导入/排序，以及查看器里的平移）。
- **不要自己写 `onDoubleClick` 最大化**（Windows 双击 drag 区由系统处理；macOS 是缩放）。
- 全屏：Windows 条 `display: none`；mac 条保留（视觉 4.4）。

### S5.5 菜单唯一来源（`src/shared/menu.ts`）

```ts
export interface MenuAction { id: string; label: string; accelerator?: string; enabled?: boolean }
export interface MenuSection { id: 'file'|'edit'|'photo'|'view'|'help'; label: string; items: (MenuAction|'---')[] }

/** 唯一数据源：原生菜单（Menu.buildFromTemplate）与 Windows 窗内下拉都从这里渲染 */
export const MENU_SECTIONS: MenuSection[] = [
  { id: 'file',  label: '文件', items: [
    { id: 'import.files', label: '导入照片…', accelerator: 'CmdOrCtrl+O' },
    { id: 'import.folder', label: '导入文件夹…', accelerator: 'CmdOrCtrl+Shift+O' },
    { id: 'folder.new', label: '新建文件夹', accelerator: 'CmdOrCtrl+Shift+N' },
    '---',
    { id: 'library.switch', label: '切换图库…', accelerator: 'CmdOrCtrl+Shift+L' },
    { id: 'library.backup', label: '备份图库…' },
    { id: 'library.restore', label: '从备份恢复…' },
    { id: 'library.export', label: '导出素材清单…' },
    '---',
    { id: 'app.settings', label: '设置…', accelerator: 'CmdOrCtrl+,' },
    '---',
    { id: 'app.quit', label: '退出', accelerator: 'CmdOrCtrl+Q' }
  ]},
  // edit / photo / view / help 见 UX 3.3 表（逐项照抄，不要自行增删）
]
```
- Windows 窗内菜单：直接渲染 `MENU_SECTIONS` 的 chip + 下拉；**同一个 `accelerator` 字符串**由 `Menu.buildFromTemplate` 注册到原生菜单（`autoHideMenuBar: true` 下不可见但生效）→ `Ctrl+Z/C/V` 不会失效。
- macOS：`Menu.setApplicationMenu` 用同一份 section 表 + `{ role: 'appMenu' }` 打头。
- 菜单项 → 渲染层的执行通道：`win.webContents.send('menu:action', id)` + preload `onMenuAction`，或直接复用已有的 IPC。**不要**在窗内菜单里手写第二套动作实现（那正是快捷键不一致的来源）。
- **反向约束（WCAG 2.1.1）**：表里 accelerator 为「—」的项，界面上必须有可点入口（备份在侧栏工具组、加进文件夹在右栏卡、导出在右栏卡）。落表时逐项对照。

### S5.6 快捷键实现位置（裁决见 §2 第 8 条）

```ts
// src/renderer/src/hooks/useGlobalKeys.ts —— 集中一处，绝不散落
export function useGlobalKeys(handlers: {
  onSelectAll(): void
  onClearSelection(): void
  onSearch(): void
  onSettings(): void
  onView(view: 'gallery'|'portrait'|'delivery'): void
  onReload(): void
  onRate(n: number): void       // 1–5
  onClearRating(): void         // 0
  onFlag(f: 1|-1|0): void       // P / X / U
  onTrash(): void               // Delete / ⌫
  enabled: boolean              // Lightbox/弹窗打开时 false
}): void
```
规则：
- **主窗口不劫持 `Tab`**（只做焦点遍历，WCAG 2.1.1）。
- 打开 Lightbox / 任意 Dialog 时 `enabled=false`（避免与查看器内 `1–5`/`P/X/U` 抢键）。
- 输入框内（`INPUT/TEXTAREA/isContentEditable`）直接 return。
- **不用** Electron `globalShortcut`（会抢其它 App 的键，且需要主进程焦点管理）。菜单里有项的用 `accelerator`（主进程），没有菜单项的（网格方向键、Shift 扩展、Enter 打开）用渲染层 keydown。

### S5.7 文案（37 条 + 3 处系统性）

按 UX §4.3 的 34 条 + §1.6 的 3 条状态文案 + 3 处系统性文案（toast 过 `errorText()`、危险确认模板、撤销 10s）。**只列改动点与文件，逐条文案照抄规范表，不要自己润色。**

| 文件 | 位置 | 改动 |
|---|---|---|
| `PortraitWorkspace.tsx` | `:395`、`:656` | 「读取中…」→ 骨架屏（3 个圆角 16 的 `--panel-2` 占位块） |
| 同上 | `:411`、`:425` | 「仅人像 / 全部」→ 删（S3） |
| 同上 | `:430` | 「大小」→ 删（S3） |
| 同上 | `:446` | 「刷新」→ 图标 + tooltip「重新读取照片与维度」 |
| 同上 | `:476` | 「全部照片」→「整个图库」（进范围下拉） |
| 同上 | `:501` | 「还没有文件夹，可在图库里新建」→「还没有文件夹」 |
| 同上 | `:513` | 「多选 / 单选」→「可多选 / 单选」 |
| 同上 | `:555` | 「还没有取值」→「还没有选项」 |
| 同上 | `:564` | placeholder「新取值」→「新增选项」 |
| 同上 | `:586` | placeholder「分类名，如 道具」→「维度名，如 服装」 |
| 同上 | `:602` | 「新建分类」→「新建维度」 |
| 同上 | `:330-331` | 删除确认：「删除维度「x」？」+「照片上的标记会保留，之后还能再建一个同名维度。」（`confirm` 第二参） |
| 同上 | `:612-614` | 模型空状态：标题「人像识别需要一个本地模型」/ 正文「下载后只在这台电脑上运行，照片不外传。41 MB，只需下载一次。」（**`41 MB` 必须用 `MODEL_SIZE` 插值**，见 `portrait.ts:19`） |
| 同上 | `:641` | 「下载人像模型」→「下载模型（41 MB）」 |
| 同上 | `:651` | 「先看全部照片」→「回图库」 |
| 同上 | `:668` | 「读取人像模型状态…」→「没能读到模型状态。」+「重试」+「打开设置」 |
| 同上 | `:685` | 「正在识别人像 3 / 12…」→「正在辨认人像 3 / 12」 |
| 同上 | `:687` | 「当前筛选下没有识别到人像，可以切到「全部」看看。」→「这个范围里还没有人像。」+ 副行「换个范围，或去「被判无人」抽查。」+ 两按钮 |
| 同上 | `:660-662` | 「当前条件下没有照片。换几个分类取值…」→「这个条件下没有照片。」+「清空条件」+「导入照片」 |
| 同上 | `:770` | 「点一张照片查看细节，Ctrl 点可选多张。选中后在下方按分类打标，多选时批量生效。」→「点一张看细节；Ctrl 点选多张。」+「选中后这里会出现可选的动作。」 |
| `Gallery.tsx` | 空状态/加载/读不出 | 4 条（#23–#27） |
| `Toolbar.tsx` | `:331` | 「加载中…」→ 骨架屏 / `342 张` |
| `App.tsx` | `:1489` | 「正在唤醒存照…」→「正在打开图库…」 |
| `App.tsx` | `:1843`、`:1860` | 「准备中…」→「正在准备识图」/「识图 12 / 240」 |
| `Sidebar.tsx` | 工具组 | 「未下载模型」→「识图模型未下载」 |
| `LibrarySwitcher.tsx` | `:166` | 「读取中…」→「正在读取图库列表」 |
| `SettingsDialog.tsx` | 5 处（`1497/1566/1620/1734/1915/1921`） | 骨架屏 |
| `AutoTagDialog.tsx` | `:125` | → 骨架屏 |
| `PickDelivery.tsx` | `:273`、`:290` | → 骨架屏 / 具体动作 |
| 全局 | 所有 toast | 一律过 `errorText()`，句式「没能 XX。{原因}」；**禁止把 `Error invoking remote method` 原文透给用户** |
| 全局 | `notify()` | 加 **10s 撤销时限** |
| 全局 | 命名 | 「图片」→「照片」（实测 47 处 `图片`，逐条判断）；「分类」→「维度」（**但 `AutoTagDialog` 的「自动分类」保留为「归类」**，这是有意的区分） |

### S5.8 验收

```bash
npm run typecheck && npm test
npm run dev     # 两平台各手动一遍
```
手工（对应 UX §7.5/§7.4/§7.6）：① 应用小图标消失 ② Win 5 菜单 + 齿轮 + 原生三键，右起 148px 无 DOM ③ mac 红绿灯 + 存照 + 图库名（可点切换）+ 1 个视图下拉、窗内无菜单 ④ 菜单只有一份定义 ⑤ 侧栏「工具」组里的「设置」行已删 ⑥ 拖拽区正确（工具条/侧栏/查看器内无 drag）⑦ 双击标题栏最大化/缩放由系统处理 ⑧ `Ctrl+Z/C/V` 在 Windows 仍生效 ⑨ 37 条文案落地、「读取中…」全站归零 ⑩ 快捷键表 16 + 14 项逐条按一遍。

### S5.9 风险

| 风险 | 缓解 |
|---|---|
| 换自定义标题栏后 Windows 拖拽失效 | 整条 `drag` + 每个可点元素 `no-drag`；**先只做拖拽与三键禁区，再做菜单**（可分两次提交） |
| `titleBarOverlay` 颜色与主题不同步 → 切换皮肤后三键看不清 | `applySkinNative()`（`ipc.ts:303`）里补 `setTitleBarOverlay`；**这是唯一同步点，别在渲染层改** |
| 查看器被原生三键盖住 | 顶胶囊居中 + 右上 140×36 禁区（S4 已做），S5 再测 1080/1480 两档 |
| 菜单 accelerator 与渲染层 keydown 双触发 | 同一动作只在一处注册：有菜单项 → `accelerator`；无菜单项 → 渲染层。**例外：数字键 `1–5`** 菜单里也有（「照片 → 星级」），所以主窗口 keydown 里要做 `if (e.defaultPrevented) return` |
| mac `⌘W` 关窗而不是关查看器 | 查看器打开时拦截 `⌘W` 走 `onClose()`，并 `preventDefault()`；关闭查看器后才交给 `role:'close'` |
| 文案批量替换改坏代码标识 | 只改 JSX 文本与字符串字面量；**不碰 className / IPC 通道名 / DB 字段**；一次一个文件，改完 typecheck |

---

# 2. 12 项待工程确认的答复

> 逐条给「技术裁决 + 依据 + 风险」。涉及 schema 的给 SQL。
> 前 12 条对应 UX §8.1 的 12 项；**⑬⑭ 是我追加的两项**（中文 500/600 字重、`sourceFor` 是否加 `existsSync`），因为它们会卡住 S1/S2 的落地，必须一并裁决。

### ① `person_flags` 加 `override` / `override_at` → **加，且加三列**
**裁决**：`override INTEGER`、`override_at INTEGER`、`override_model TEXT`（team-lead 决策 B 增加第三列）。
**依据**：upsert 只写四列（`portrait.ts:187-195`），新列天然不被覆盖，**不需要额外保护逻辑**——这是选"加列"而不是"单开一张 override 表"的唯一决定性理由（单表需要两处读写合并 + 事务，成本高 10 倍）。
**风险**：`override_model` 会在模型升级后过期，UI 必须明示（见 ③）。迁移走 `migrationV5`（SQL 见 S2.4），`ensureColumn` 幂等，老库任意版本都能收敛。

### ② `PortraitFlag` 加 `verdict` / `reason` → **加，`hasPerson` 保留**
**裁决**：`verdict: PortraitVerdict`（必填）、`reason?: 'error'|'no-source'`（可选）、`override?: 0|1|null`（可选）；`hasPerson`/`score` 保留。
**依据**：IPC 走 `ipcRenderer.invoke` → 结构化克隆，**加字段是向后兼容的**；`preload/index.ts:289-296` 只是透传，签名不用改。`portrait.test.ts` 只 import `personScoreFromLogits`，**不受影响（我已核实）**。
**影响面**：唯一必须改的消费方是 `PortraitWorkspace.tsx:64,166-170,191-195`（S2 清单已列）。
**风险**：`hasPerson` 语义要和 `verdict` 保持一致，否则两处判断打架 → 用单一 `hasPersonOf(verdict, override)` 函数，禁止散写布尔表达式。

### ③ 模型升级时人工结论是否保留 → **保留 + 四项单列统计 + 「告知级」提示**
**裁决**：保留。`portraitStatus()` 返回四项单列（`confirmedByModel / confirmedByHuman / excludedByHuman / staleOverrides`，口径见 §0.5 要求 3），主进程一次算清。
`staleOverrides > 0` 时状态卡底部显示一行**告知**（不是警告）：「模型已更新，{n} 张人工判定仍保留」——`--fs-1` / `--muted` / **无底色 / 无边框 / 无图标 / 不弹 toast**。
**依据**：清掉人工结论 = 用户"白点了"；但保留又确实与新模型结论冲突，所以必须"说一句"而不是"报个警"。挂三角图标会被读成"出事了"，而这件事其实是我们做对了。
**风险**：用户可能困惑「模型说不是人像，它还留在我的人像里」→ `override = 1` 的缩略图角标要给可解释标记（hover tooltip「你标记为人像」）。**需人工验证**：该角标与「可能人像」圆点是否会同时出现（建议 override 优先，只显示一个）。

### ④ `portraitStatus()` 统计口径 → **四项单列 + 附加两项，全在主进程算，UI 不做减法**
**裁决**：
- `confirmedByModel / confirmedByHuman / excludedByHuman / staleOverrides` 四项按 §0.5 要求 3 的 SQL 口径返回。
- `detected`（当前模型扫过多少张）与 `total` **语义不变**，保留原查询——数字的既有含义是"扫描进度"，改了会连带影响侧栏识图进度。
- 状态卡还要显示「可能人像 / 待确认」→ 追加 `likely`（模型 0.50–0.80 且未被人工覆盖）与 `unresolved`（`total - flagged`，**在主进程里减**）。这不是"多加了两个字段"，而是因为 UI 被禁止做减法、又必须显示这两个数字。
- **严禁**降级成"前端用 `portraitFlags` 聚合"：渲染层只有当前 `PAGE_LIMIT = 500` 条（`PortraitWorkspace.tsx:29`），任何 >500 张的库里聚合值都是错的。
- **严禁**用 `has_person OR override = 1` 表达"算人像"：`override = 0` 且 `has_person = 1` 时它给 `true`，正好吃掉人工否决。唯一正确口径是 `COALESCE(override, has_person)`。
**依据**：读路径唯一权威值必须只有一处（§0.5），否则"人工否决在人像列表里不生效"这类 bug 会以各种变体复发。
**风险**：`SUM(CASE...)` 一次聚合在 10 万级库上仍是毫秒级（走 `idx_person_flags_model` + `items` 主键 join），但如果将来加"按文件夹/维度过滤后的统计"，需要改成带 `WHERE` 的同构查询，**不要**在前端二次相减。

### ⑤ XMP 是否写人工判定 → **首版不写**
**裁决**：不写。`src/main/xmp.ts` **零改动**，`xmp.test.ts` 不动。
**依据**：人工判定是本机偏好；写进 XMP 会污染 Lightroom/Bridge 的标签体系，且需要新增命名空间（违反「`xmlns:moonphoto` 不改」）。UX §1.3.5-④ 同结论。
**风险**：用户换机/换库后人工结论丢失。缓解：备份包已带 `library.db`（`backup.ts`），所以随库迁移；换库不迁移是预期的。**需人工验证**：备份/恢复路径是否完整包含 `person_flags`（走整库 VACUUM，应为是）。

### ⑥ `PORTRAIT_THUMB`（140–320 连续值）→ 列数 2/3/4 → **新增 `portraitColumns`，旧键保留做一次性映射**
**裁决**：
```ts
// src/shared/layout.ts
export const PORTRAIT_COLUMNS = { default: 3, min: 2, max: 4 } as const
export function normalizePortraitColumns(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : PORTRAIT_COLUMNS.default
  return clamp(n, PORTRAIT_COLUMNS.min, PORTRAIT_COLUMNS.max)
}
// 一次性迁移：把旧的卡片宽度映射成列数（≤180→4、≤240→3、>240→2）
export function columnsFromThumbSize(size: number): number {
  return normalizePortraitColumns(size <= 180 ? 4 : size <= 240 ? 3 : 2)
}
```
`settings.ts` 里 `getPortraitColumns()`：优先读 `portraitColumns`；没有则读 `portraitThumbSize` 映射后**写回** `portraitColumns`（`updateConfig`），**不删除** `portraitThumbSize`（回滚安全：旧版本仍能读到旧键）。
**依据**：`shared/layout.ts` 是主进程与渲染层共用（`settings.ts:262`、`PortraitWorkspace.tsx:59`），直接改 `PORTRAIT_THUMB` 的语义会让两处不一致。旧键保留 = 一次纯增量迁移，任何方向回滚都不丢用户设置。
**风险**：`PORTRAIT_THUMB` 在 S3 之后成为死代码 → 保留但标 `@deprecated`，等 S5 收尾后再决定删（**不要在本轮删**）。

### ⑦ Windows 窗内菜单的 `Alt` 呼出序列 → **首版不做，靠原生 `autoHideMenuBar` 的 Alt**
**裁决**：不自己实现「按 Alt 高亮菜单 → ←→ 选择 → Enter」。保留 `autoHideMenuBar: true`，用户按 `Alt` 时 Electron 会显示**原生菜单条**（内容来自同一份模板），这已经满足"键盘可达"。
**依据**：自实现 Alt 序列需要焦点陷阱 + 与 drag 区冲突处理 + 无障碍状态机，工作量 ≥ 窗内菜单本身；而原生菜单已经提供了等价能力（WCAG 2.1.1 满足）。
**风险**：Windows 用户按 Alt 会看到一条**原生菜单**而不是窗内 5 个 chip → 视觉上"多了一条"，但有 `autoHideMenuBar` 平时不显示，可接受。**需人工验证**：`titleBarStyle:'hidden'` 后原生菜单弹出的位置（应在自定义标题栏下方，不与三键重叠）。

### ⑧ 主窗口全局快捷键实现位置 → **渲染层 `useGlobalKeys` + 菜单 accelerator，禁用 `globalShortcut`**
**裁决**：两类分开：
- 菜单里有的动作（导入/切换图库/设置/星级/旗标/视图切换/全屏）→ **`Menu.buildFromTemplate` 的 `accelerator`**（主进程注册，两平台一致）。
- 菜单里没有的（网格 `←→↑↓`、`Shift+方向` 扩展、`Enter/Space` 打开、`Esc` 清选择）→ **渲染层 `useGlobalKeys`**。
**依据**：`globalShortcut` 是**系统级**（抢其它 App、且 App 失焦也生效），桌面 App 不该用。`platform.ts:16-18` 的注释已指出"加速键来自菜单"这一机制。目前主窗口**完全没有任何快捷键**（全仓库只有 Lightbox 与弹窗注册 keydown），这是最大的平台习惯缺口。
**风险**：菜单 accelerator 与渲染层 keydown 双触发 → 规则：**同一动作只在一处注册**；渲染层统一 `if (e.defaultPrevented) return` 开头。数字键 `1–5` 是唯一"两处都有"的（菜单「照片→星级」+ 网格），所以渲染层必须尊重 `defaultPrevented`。

### ⑨ `inert` 兼容性 → **可用，React 19 原生支持**
**裁决**：隐藏的 chrome 用 `inert={!chromeVisible}` + `aria-hidden`，**不要**用 `opacity-0 pointer-events-none`。
**依据**：React 19 已支持 `inert` 布尔属性，`@types/react@19` 有类型；Electron 45 的 Chromium 版本（≥1xx）原生实现 `inert`。
**风险**：`inert` 子树内**所有**事件被屏蔽（含右键菜单、拖拽）→ 只在容器级加，且可见时显式 `inert={false}`；不要在单个按钮上加（会漏掉兄弟节点）。

### ⑩ 待确认队列组件 → **新建 `PortraitReview.tsx`，不复用 Lightbox**
**裁决**：新建。预算 **150–180 行**（规范估 120，我按「键盘 + 三种 reason 文案 + 撤回 + 双击打开查看器」估 180）。
**依据**：`Lightbox.tsx` 991 行，耦合 zoom/pan/rotation/region/notes/slideshow/inspector 七套状态；在它上面加"队列模式"会让两套互斥状态机并存，回归面 = 整个查看器。新建后队列只依赖 `Item` + `PortraitFlag` + 3 个回调。
**风险**：两处都要处理"双击打开大图" → 队列里双击调 `onOpenLightbox(item.id)`，由父组件设 `lightIndex`（现有 `:814-834` 的 Lightbox 渲染复用），不要复制 Lightbox。

### ⑪ `Shift` 范围选择 → **做，用 `shownItems` 索引区间**
**裁决**：网格与工作台都做（两者都是 `shownItems` / `items` 的数组顺序）。实现见 S3.6。
**依据**：CSS multi-column 的 DOM 顺序 = 列优先（先填满第一列），所以索引区间在视觉上是「沿列向下 → 进入下一列」，可预测。**主图库 `Gallery.tsx` 是自定义瀑布流布局（`layout.ts` 里按高度塞列），DOM 顺序 = 塞入顺序（也是列优先）**，同理可用。
**风险**：用户可能期望「同一行左右扩展」→ 在 tooltip/帮助浮层里写清「Shift 点选：按阅读顺序连续选中」。**需人工验证**：`Gallery.tsx` 的 `items` 顺序是否与视觉顺序一致（它是按高度塞列，视觉 = DOM，应一致；改前跑一遍）。

### ⑫ 撤销 toast 的 10s 时限 → **加**
**裁决**：`App.tsx` 的 `notify()` 统一加 `setTimeout(..., 10000)` 自动消失 + 撤销窗口关闭；`label` 统一为「动作 + 数量」（「移入回收站 8 张」）。
**依据**：现状无时限，长期挂着的 toast 会遮挡右栏动作卡的主按钮（S3 之后右栏更拥挤）。
**风险**：用户来不及点撤销 → 10s 是业界常见值（Gmail 是 5–30s）；危险操作（彻底删除/清空回收站）**本来就不走 toast 撤销**，走二次确认，所以不受影响。

### ⑬（补充）中文 500/600 字重 → **已拍板：方案 B（只用 400 / 700，不内置字体）**

**拍板记录（team-lead，2026-11-14）**：走 **方案 B**——不内置 `Noto Sans SC`，字重只用 **400 / 700** 两档。理由三条：

1. **本轮的收益不在字重数量**：G 语言的层级靠「26 / 18 / 15 的大标题 + 700」已经立得住；500 / 600 只影响「温和强调」这一层细粒度表达，**属于打磨，不是骨架**。先把骨架立住，打磨可以后补。
2. **风险不在 1.8MB 体积**（137MB 的安装包不差这点），**而在字体管线**：`@font-face` + Electron 资源路径（`asar` 内外两种路径）+ CSP（渲染层 `index.html` 走外链脚本，字体也要过 CSP）+ 中文子集化（3500 常用字怎么定、缺字怎么回落）+ 首屏 FOIT/FOUC。**任何一处出问题都会拖累 S1 的整体验收**，而 S1 是后面四个阶段的地基。
3. **可逆**：见下方「后续可选项」。B 不是终局，是把风险从地基挪到装修。

**后续可选项（S1 稳定后单独立项）**：做 `Noto Sans SC Variable` 子集（常用 3500 字 + 拉丁 + 标点，woff2 约 1.2–1.8MB）。届时**只需两步**：① 换 `body` 的 `--font-sans` 字体栈加 `'Noto Sans SC'`；② 加一条 `@font-face` + 打包资源声明。**不动任何 token 语义**（`--fw-500/600` 照旧定义着，只是届时能真的命中）——这是本次拍 B 的关键好处：语义层已经按四档写好了，将来只换"有没有真字体"。

**执行规则（Trae 必须照这张表做，不许自己发明映射）**：

| 现用字重 | 场景 | 方案 B 落到 | 依据 |
|---|---|---|---|
| `font-weight: 600` / `font-semibold` | 区块标题、面板标题、库名、查看器文件名、**选中态** | **700** | 600 在微软雅黑上是合成加粗；700 有真字形。选中态的"加粗通道"由 R2′（填充底 + `--accent-text` + 700 + ✓）承担 |
| `font-weight: 500` / `font-medium` | **标题类**、按钮文字、chip、菜单项（控件档） | **700** | 控件档宁可重一点，也不要"半粗不粗"的合成味 |
| `font-weight: 500` / `font-medium` | **辅助说明、状态条、分组标题（弱化用）** | **400** | 弱化本该靠字号与 `--muted` 做，不靠字重；400 在中文里更干净 |
| `font-weight: 400` | 正文、列表项、EXIF 数值 | **400**（不变） | — |
| `font-weight: 700` / `font-bold` | 页面标题、空状态标题 | **700**（不变） | — |

**加粗判定口诀（写在 `styles.css` 注释里）**：`700 只给"这是标题"和"这是你选中的"；其余一律 400。`
**禁止**：`font-weight: 500` / `600` 出现在任何中文文本上（`grep -rn "font-weight: 500\|font-medium\|font-semibold"` 在 S1 结束时必须只剩英文/数字场景，或直接归零）。
**层级补偿**：600 降级为 700 后，若与相邻标题"撞重"，用**字号差 ≥1.5px** 或 `--muted` 区分（视觉 R-G5 的双通道），**不要**靠"再调回 500"（那就回到合成加粗了）。

**风险**：视觉稿里的"温和强调"表达不出来（设计已承认）。**缓解**：`--fw-500/600` 两个 token **照常定义**，值就是 500/600，只是本轮不往中文上用；将来接真字体时，把用到它们的地方打开即可，不需要改 token。

### ⑭（补充）`sourceFor` 是否需要 `existsSync` → **建议加（可选）**
见 S2.5。**需人工验证**：改判后 `no-source` 的命中率是否真的上升（否则只是把 `error` 改了个名字）。默认建议做，因为它能省掉一次 sharp 启动（对批量扫描有实际收益）。

---

# 3. 验收与回归

## 3.1 每阶段期望结果

| 阶段 | `npm run typecheck` | `npm test` 期望 | 说明 |
|---|---|---|---|
| 改动前（基线，已实测） | 0 error | **26 文件 / 156 测试** | 2026-11-14 实测 |
| S1 | 0 error | ≥27 文件 / ≥159 测试 | +Skins/Token 守卫（§3.2 第 9、12 条） |
| S2 | 0 error | ≥29 文件 / ≥168 | +四态边界、迁移、override 不覆盖（第 1–7 条） |
| S3 | 0 error | ≥30 文件 / ≥171 | +列数映射（第 8 条） |
| S4 | 0 error | ≥31 文件 / ≥175 | +可见性纯函数（第 10 条） |
| S5 | 0 error | ≥32 文件 / ≥179 | +文案守卫（第 11 条） |

> 数字是**下界**（按 §3.2 的测试点算，新增测试可能拆成多个 `it`，实际会更多）。只要**全绿且总数 ≥ 期望**即可；**不允许为了让数字对上而删测试**。

## 3.2 新增测试建议（12 条 + 3 条 token/SQL 守卫，按可测性排序）

| # | 文件 | 测试点 | 为什么值得测 |
|---|---|---|---|
| 1 | `src/main/portrait.test.ts` | `verdictFromScore`：`0.4999→no-person`、`0.5→likely`、`0.7999→likely`、`0.8→person`、`1→person` | 双阈值的边界是这次修复的核心，且纯函数、零依赖 |
| 2 | 同上 | `verdictFromScore(0)` → `'no-person'`（**不是** `unresolved`） | 守住"检测成功但没人" ≠ "没检测" |
| 3 | `src/main/portrait.test.ts` | 抽出的 `flagsForScan({ source: null, score: 0, error: null })` → `verdict='unresolved'`、`reason='no-source'` | 把 fail-open 变成可回归的纯函数（建议 S2 顺手抽出 `flagsForScan`） |
| 4 | 同上 | `flagsForScan({ source: '/x.jpg', error: new Error('ENOENT') })` → `unresolved` + `reason='error'` | 同上 |
| 5 | `src/main/db.test.ts` | v4 → v5：`PRAGMA table_info(person_flags)` 含 `override/override_at/override_model`；`user_version === 5`；`idx_person_flags_override` 存在 | 迁移是唯一"错了就毁库"的改动 |
| 6 | `src/main/db.test.ts` | 老库（`createV0Library`）一路升到 v5 仍幂等（连开两次） | 已有 v0 测试的同类扩展，成本极低 |
| 7 | `src/main/portrait.test.ts` | **① upsert 的 SET 清单不得含 override 三列**（team-lead 指定）：dump `PORTRAIT_UPSERT_SQL.split('DO UPDATE SET')[1]`，断言 `/override/` 不匹配、且断言 `has_person/score/model/updated_at` 四个都在（防止"为了通过而把 SET 清空"）。**② override 不被重扫覆盖**：用 `new Database(':memory:')` 建 `person_flags`，手写一条 `override=0` → 执行 `PORTRAIT_UPSERT_SQL`（`has_person=1, score=1`）→ 断言 `override` 仍为 0、`has_person` 已变 1 | 决策 B 的**核心不变量**，且破坏是静默的（要等下次换模型才暴露）。`PORTRAIT_UPSERT_SQL` 从 `portrait.ts` 导出即可测——`portrait.test.ts` 现在就已经 `await import('./portrait')`（`:5`），onnx/sharp 能正常加载，**不需要**额外抽 store |
| 7b | **新建** `src/main/portrait.sql.test.ts`（读源码文本） | 读 `src/main/portrait.ts` 全文，断言 `ON CONFLICT` 之后到语句结束的片段不含 `override`；同时断言文件中**存在**那段中文禁止注释（`/这三列永远不进 SET 清单/`） | 防止有人绕过常量另写一份 upsert（常量守卫管不到新语句），同时把"注释必须存在"变成可测项——注释被删说明有人正在动这块 |
| 8 | `src/shared/layout.test.ts` | `columnsFromThumbSize`：140→4、180→4、190→3、240→3、241→2、320→2；`normalizePortraitColumns('x')→3`、`9→4`、`1→2` | 一次性迁移不能把用户设置映射错 |
| 9 | `src/shared/skins.test.ts` | `classic/night.base === '#171818'`；`swatches[2] === '#FDC75D'`；`paper.swatches[2] === '#7A5200'`；`contrast.base === '#0A0A0A'` | 皮肤残值迁移的直接断言 |
| 10 | **新建** `src/renderer/src/lib/chromeVisibility.test.ts` | `chromeVisible({immersive:false, peekBand:false, slideIdle:false})===true`；`{immersive:true,peekBand:false}===false`；`{slideIdle:true}===false`；**函数签名不含 itemId**（TS 层面即可保证） | 「换图不改 chrome」的唯一可自动化的部分 |
| 11 | **新建** `src/renderer/src/lib/copy.test.ts` | 读 `src/renderer/src/**/*.tsx`，断言 `/读取中…/` 计数 === 0；`/当前筛选下/` === 0；`/Error invoking remote method/` === 0 | 文案回归最容易复发，这类守卫测试很便宜 |
| 12 | **新建** `src/styles.tokens.test.ts`（读 `src/renderer/src/styles.css`） | 断言含 `--bg: #171818`、`--accent: #FDC75D`、`--on-accent: #141414`、`--lb-faint: #A6A6A6`；断言**不含** `5B9FE8`、`2F6CB8`；断言 3 条 shadow 均为 `rgba(0,0,0` | 防止 S3–S5 有人"顺手换回蓝"或把阴影改回暖黑 |
| 13 | `src/styles.tokens.test.ts` | **`--danger` 不被用作填充底**：扫 `src/renderer/src/**/*.tsx` + `styles.css`，断言没有 `bg-[var(--danger)]`、`background: var(--danger)`、`background-color: var(--danger)`（`var(--danger-fill)` 允许） | 红底白字只有 3.13:1；这是"最容易犯且肉眼不易察觉"的一类错 |
| 14 | `src/styles.tokens.test.ts` | **`--danger-soft` / `--danger-border` 仍有定义**：断言 `styles.css` 里两者各出现一次定义（`/--danger-soft\s*:/`、`/--danger-border\s*:/`） | 19 文件 30 处 `bg-[var(--danger-soft)]`，token 一删背景静默变透明，错误条"看起来不报错了" |
| 15 | `src/styles.tokens.test.ts` | 断言 `--danger-fill` 已定义且 G1/G2 两个值都在（`#B33A2B`、`#A62A21`）；断言**没有** `--danger-soft: #2A1B17` 这类旧暖红值残留 | 红实底只允许 `--danger-fill`；旧 soft 值在暖黑改中性黑后会泛脏 |

> **一条额外必做的人工动作**（测不到）：`staleOverrides` 的呈现必须目视确认是「告知」不是「警告」——**没有三角图标、没有底色、没有 toast**。做法：临时把 `override_model` 全改成旧 tag（SQL 见下），进工作台看状态卡底部那一行。
> ```sql
> UPDATE person_flags SET override_model = 'old-model-tag' WHERE override IS NOT NULL;
> -- 验证完记得改回来，或直接重扫
> ```

> **测试第 7 条的工程前提**：如果不想把 SQL 抽成新文件，可以退化成「在 `db.test.ts` 里手写同一条 upsert SQL」，**但那会失去与实现同步的能力**（实现改了测试不知道）。建议抽 `src/main/portraitStore.ts`（纯 db，不 import onnx/sharp），`portrait.ts` 只做 detect + 调 store。这是我在 S2 里唯一推荐的轻度重构。

## 3.3 必须人工点一遍的 15 条（从 UX §7 的 70+ 条里挑）

> 选标准：自动化测不到、且失败后果最重。

| # | 条目 | 出自 | 判据 |
|---|---|---|---|
| 1 | 从未检测过的照片**不出现**在人像网格里 | 7.1 | 新导入 20 张，进工作台，网格里没有"待确认"的照片 |
| 2 | 人工判「不是人像」→ 退出重进 → 仍不在人像里 | 7.1 | override 落库且未被 upsert 覆盖 |
| 3 | 扫描中网格 append-only，照片不跳动 | 7.1 | 下载模型后连扫 100 张，滚动位置不被顶走 |
| 4 | 「仅人像 / 全部」开关已消失，左栏只剩状态卡 + 维度 | 7.2 | 目视 |
| 5 | 8 维度顺序 + 默认只展开景别/光线 + 折叠 badge | 7.2 | 重开 App 后展开状态被记住 |
| 6 | 右栏三态（0/1/≥2）切换，一屏只有 1 个实底主按钮 | 7.2 | 三种选中数量各看一遍 |
| 7 | 连续按 `→` 20 次，chrome **一次都不闪** | 7.3 | DevTools Performance 搜 `opacity` 无动画 |
| 8 | `Tab` 沉浸 → 隐藏；键盘 Tab 遍历**进不到**隐藏按钮；指针进上/下 68px 唤回 | 7.3 | `inert` 真的生效 |
| 9 | 幻灯片自动翻页**不唤回** chrome | 7.3 | 开幻灯片，等 3 页，期间不动鼠标 |
| 10 | 换一张无 EXIF 的图，底条不横向滑动 | 7.3 | 截图 ↔ 相机原图来回切 5 次 |
| 11 | Windows 顶胶囊与右上 140×36 禁区不重叠（1080 / 1480 两档） | 7.3 | 两个宽度都看 |
| 12 | 标题栏：Win 5 菜单 + 齿轮 + 三键；mac 红绿灯 + 图库名可点 + 无窗内菜单 | 7.5 | 两平台各一遍 |
| 13 | Windows `Ctrl+Z / Ctrl+C / Ctrl+V` 仍生效 | 7.5 | 在搜索框里剪贴 |
| 14 | 键盘全程可达：打开 App → 人像 → 队列 Y/N → 加入选片，不碰鼠标 | 7.7 | 一次连续走完 |
| 15 | 「读取中…」全站归零；无 `Error invoking remote method` 原文 | 7.6 | `grep` + 手动制造一次错误 |

## 3.4 回归风险清单

| 风险 | 触发点 | 验证方法 |
|---|---|---|
| **XMP 往返** | S1/S2 都没动 `xmp.ts`，但「分类→维度」命名改动可能波及 | `xmp.test.ts` 必须全绿；再手动：写一次 XMP → 用文本编辑器看 `xmlns:moonphoto` 与 `lr:hierarchicalSubject` 仍在 |
| **旧库升级** | S2 的 migrationV5 | `db.test.ts` 的 v0 → v5 路径；再复制一份真实 `library.db`（若有）手动打开 |
| **皮肤 localStorage 残值** | S1 的 skins 换值 | 手动把 `localStorage['lunaris:skin']` 设成 `eclipse` → 应回落 `classic`（`findSkin` 已保证）；`skins.test.ts` 已断言 |
| **旧备份包读取** | `SETTINGS_APP_TAG` 未改 | 用旧版导出的 `settings.json` 导入一次（`settingsTransfer.test.ts` 覆盖格式，实际文件再验一次） |
| **Windows/macOS 差异** | S5 | 两平台各跑 §3.3 的 12/13 条；重点：`titleBarOverlay` 位置、`trafficLightPosition`、`⌘W` vs `Alt+F4` |
| **中文合成加粗** | S1 字重 | Windows 上看 600/700 段落，笔画是否一致（若选方案 B 则只出现 400/700，应无问题） |
| **面积失控（到处是黄）** | S1/S3 | 每屏截图，估 accent 填充面积 <4%；重点看右栏 + 网格 + 状态卡同屏 |
| **`rounded` 批量替换漏改** | S1 | `grep -rn "rounded-md\|rounded " src/renderer/src | wc -l` 应只剩 0（除 pill） |
| **性能** | S1 的 `backdrop-filter: blur(18px)`（胶囊） | 只在 2 个胶囊上用；不要在列表/卡片上用（Electron + 无 GPU 加速时会掉帧） |
| **主进程首帧闪色** | S1 的两处硬编码 | `npm run dev` 后从冷启动录屏，看首帧是否旧蓝黑 |

---

# 4. 给 Trae 的禁止事项

**不许做的事（违反即返工）**

1. **不要升级/新增依赖**。规范没有要求新依赖（`inert` 是 React 19 原生、`backdrop-filter` 是 Chromium 原生）。不许 `npm update`、不许装 UI 库/动画库/图标库（只允许 Lucide 一套，视觉 3.4）。
2. **不要重构未涉及的模块**。本单没列的文件一律不动（尤其 `pick.ts` / `finals.ts` / `backup.ts` / `clip/*` / `llm/*`）。
3. **不要改内部标识**：`appId com.silvermoon.cunzhao`、`SETTINGS_APP_TAG='lunaris'`、localStorage 键 `lunaris:*`、IPC 通道名（`portrait:scan` 等）、DB 表名/列名（`person_flags.has_person` 等）、`xmlns:moonphoto`、`LEGACY_APP_DIRS` 数组。
4. **不要动 `design/` 与 `docs/`**。两份规范是上游；`docs/` 是历史文档，不改、不删、不"顺手更新"。
5. **不要重命名既有 token**（`--fs-*` 之外的 `--panel-2` / `--warn-soft` / `--danger-border` 等）。只允许"改值/重指向"与"新增"。
6. **不要删 `PORTRAIT_THUMB`**（S3 之后它是死代码，但回滚需要它）。
7. **不要 `Menu.setApplicationMenu(null)`**（Windows 会失去 `Ctrl+Z/C/V`）。
8. **⛔ 绝对不要把 `override` / `override_at` / `override_model` 加进 `scanPortrait()` 的 upsert SET 清单**（`src/main/portrait.ts` 的 `ON CONFLICT(item_id) DO UPDATE SET`）。
   - 加进去 = 「人工结论天然防覆盖」当场失效，**而且破坏是静默的**：不报错、不写日志、UI 无异常，要等下一次模型升级（`MODEL_TAG` 变化）全量重扫时才暴露，届时用户看到的是"我点过的判定全没了"。
   - 同理**不要**把这段 SQL 改成 `INSERT OR REPLACE` / `REPLACE INTO`（那是整行替换，比加进 SET 更彻底地清掉三列）。
   - 必须在 SQL 常量上方保留中文禁止注释（模板见 §0.5 要求 1），并由 `portrait.test.ts` 的 SET 清单断言守护。
   - 这条的优先级等同于第 3 条（内部标识）与第 6 条（销毁数据类）。
9. **⛔ 不要用 `--danger` 作填充底配白字**（`bg-[var(--danger)]` / `background: var(--danger)`）。白字实测只有 **3.13:1**（`#F2F2F2` 更低 2.79），会做出「看着很红、字看不清」的按钮。红实底**只准** `--danger-fill`（G1 `#B33A2B` 5.90 / G2 `#A62A21` 7.06），且**只准出现在两处**：永久删除的最终确认、清空回收站。其余危险但可撤销的动作（淘汰/移出文件夹/取消星标/撤销入片）**只用 `--danger-text`**，不加底色。
10. **⛔ 不要删 `--danger-soft` / `--danger-border`**（team-lead 已 grep 核实：19 文件 / 30 行引用，`styles.css` 10 处 + `inspector/InfoTab.tsx` 3 处 + 其余 17 文件各 1 处）。组件写的是 `bg-[var(--danger-soft)]` 任意值类，token 一没 → 背景**静默变透明**，错误条"看起来不报错了"，不抛异常、不被测试抓到。正确做法：**保留 token 名，值重指向** `--panel-2` / `--border`（见 S1.7b）。若日后确要收敛成 `--panel-2`/去描边，必须按 S1.7b 的映射逐处替换（含 `ContextMenu.tsx:90` 的 hover），**独立提交 + 单列验收「19 个文件全替换完 + 错误条仍显眼」**。
11. **不要在工具条/侧栏/内容区/查看器内加 `-webkit-app-region: drag`**（会吞拖拽导入、拖拽排序、图片平移）。
12. **不要自绘窗口按钮**（最小化/最大化/关闭），用原生 overlay / 红绿灯。
13. **不要在主窗口绑 `Tab`**（破坏键盘可达，WCAG 2.1.1）。
14. **不要给查看器 chrome 加任何 idle 计时器**（除幻灯片）；**不要让自动翻页更新 `lastUserInput`**。
15. **不要用 `opacity: 0` 隐藏可交互元素**而不加 `inert`。
16. **不要把 `error.message` 原文透给用户**（必须过 `errorText()`）。
17. **不要在正文里出现机制名**（DETR / ONNX / facet / CLIP / 表名 / 字段名）——只允许在「设置 → 关于」与日志。
18. **不要为了实现"看起来能纠正"而让 override 只存在内存里**。要么落库，要么明确写「本次有效」（规范已判定这是降级，默认不做降级）。
19. **不要照搬 `design/mockups/overhaul-mockup.html` 的右栏滑杆**（磨皮/肤色/眼神光）——存照不写像素。
20. **不要在两个地方各写一份菜单/快捷键表**（必须来自 `shared/menu.ts` + `shared/shortcuts.ts`）。
21. **不要用 `has_person OR override = 1` 表达"算人像"**。唯一口径是 `COALESCE(override, has_person)`（TS 侧是 `authoritativeHasPerson()`）；前者在 `override = 0` 且 `has_person = 1` 时给出错答案。
22. **不要在前端做统计减法**（`unresolved = total - <前端能看到的数>`）。分页 `PAGE_LIMIT = 500`，前端减法必错；统计一律主进程给。
23. **不要把 `staleOverrides` 的提示做成警告**（不要 `--warn`、不要三角图标、不要底色、不要 toast）。它是"模型升级了，你的判定还在"的告知。
24. **不要给中文文本写 `font-weight: 500/600`**（方案 B 已拍板）：标题/控件/选中一律 700，辅助一律 400，映射表见 §2 ⑬。收尾时 `font-medium` / `font-semibold` / `font-weight: 5xx` 必须归零或给出逐处理由。
25. **不要改现有测试的断言来"通过"**。测试红了先查实现。
26. **不要在没有 `npm run typecheck && npm test` 全绿的情况下进入下一阶段**。
27. **不要一次提交跨两个阶段**（S1–S5 各一次提交，文案单独一次）。

---

## 附：一句话交接

**给 Trae**：先做 S1（token + 1300 处机械替换，跑归零断言），再做 S2（删 `portrait.ts:206` 的 `hasPerson = true`，加 v5 迁移），然后 S3（拆三层 + 删「全部」开关），S4（删 `useIdle` 驱动，chrome 常驻），最后 S5（自定义标题栏 + 菜单单一来源 + 文案）。**全程记住四件最容易做错的事：① `unresolved` 永不进主网格；② 常规浏览下 chrome 的 opacity 恒为 1；③ 菜单只有一份定义，Windows 不要 `setApplicationMenu(null)`；④ `scanPortrait` 的 upsert SET 清单里永远不能出现 `override` 三列——它坏了不报错，要等下次换模型才暴露。**

**给 team-lead**：本单已按代码现状校准了规范里的三处偏差——(a) `hasPerson = true` 在 `portrait.ts:206`（规范写 206，实际就是 206，✅）；(b) 规范说"取不到源频次高"，实际 `getItemFile` 不检查文件存在，失败主要落在 `error` 而非 `no-source`（已在 S2.5 更正）；(c) 图标 ≤12px 实测 **171** 处（规范 168）。另外 S1 的真实工作量是 **~1300 处机械替换**（字号 750 / 圆角 408 / 图标 171），这是本轮最大的一块，不是"换个色值"。
