# 存照 · 界面主题对齐规范（Theme Alignment Spec）

> 产出者：frontend-design-architect（Phase 1，仅视觉规范，不改代码）
> 日期：2026-11-15
> 依据：`design/final-spec.md`（PA2 定稿色板，不可改）+ `design/brand-audit.md`（旧审计，部分采纳部分推翻）+ `src/renderer/src/styles.css` 现状
> 执行者：frontend-engineer（Phase 3）。所有色值为最终定稿值，禁止「略深一点」式发挥。

---

## 一、设计主张

**界面是匣，功能色是照片。**

新 Logo 的结构是「冷白匣壁 + 深色底板 + 内凹 + 三张彩色照片」——容器无彩，内容有彩。界面主题直接继承这个结构：**全部 chrome（背景、面板、文字、边框）取自匣子的材料**（底板 #14161B、内凹 #2A2E36、匣壁冷白系），做到全站无彩；而 Logo 里的三张照片颜色**只作为语义信号色**进入界面，每一个彩色的出现都意味着「你正在触达照片级别的东西」。这样，屏幕上大面积永远是无彩的匣，唯一的饱和度留给用户的照片缩略图——「照片是屏幕上最饱和的东西」由结构保证，而不是靠克制。

### 裁决：accent 采用三色之一——天蓝 #5B9FE8（部分推翻旧审计）

旧审计主张「品牌色 = 纯无彩色 #8B8FA3」，理由成立但前提已失效：那是「月相」时代的审计，当时品牌确实没有任何彩色资产。现在 Logo 定稿为三色照片，若界面 accent 仍用纯灰，UI 与新品牌标之间将出现色彩断层——用户看任务栏是彩色匣子，进应用却是全灰。

**裁决与理由：**

1. **accent = 天蓝 #5B9FE8**。三色里它的角色最退后（Logo 中位于左后），色相本身低攻击性，是最适合做「系统反馈色」的一张；且蓝色在照片缩略图中天然常见度最低饱和干扰最小（多数照片的天空/水面蓝会在缩略图里被压暗，小面积 UI 蓝不会形成大面积同频）。
2. **珊瑚红 #F2604A 与暖黄 #F5C344 不进入交互层**，只做破坏性确认与星标两个信号（见第五节）。红色是 Logo 的「前面主体」——最高注意力位，对应「不可逆操作」语义天然成立。
3. 采纳旧审计的：主按钮反色（见第六节）、`--faint` 达标 WCAG 4.5（本表已达标）、三色「一色一职」纪律。
4. 推翻旧审计的：纯灰品牌色 #8B8FA3。它是无 Logo 彩色资产时代的替代方案，现已被 PA2 取代。

**三条设计原则：**

- **P1 大面积无彩**：任何页面中彩色 UI 元素（不含照片缩略图）的面积占比应 <5%。违反即回退到无彩方案。
- **P2 一色一职**：天蓝=系统回应你，暖黄=你标记的照片，珊瑚红=不可逆操作。三个动词之外不允许出现品牌三色。
- **P3 材料一致**：界面色值必须能在 PA2 色板（含其明度变体）中找到出处，不引入新色相。

---

## 二、Dark 默认主题 token 表（`:root`，styles.css 第 8-58 行逐变量替换）

| 变量 | 新值 | 出处（PA2） |
|---|---|---|
| `--bg` | `#14161B` | 底板（exact） |
| `--chrome` | `#191C22` | 底板抬一档（侧栏/工具栏） |
| `--panel` | `#1D2026` | 底板抬两档 |
| `--panel-2` | `#22262D` | 底板抬三档 |
| `--panel-3` | `#2A2E36` | 内凹（exact，最上层表面/内嵌控件底） |
| `--card` | `#191D23` | 底板抬一档 |
| `--canvas` | `#101216` | 底板压暗一档（看图区需要比 chrome 更深的衬底） |
| `--stage` | `#0C0E12` | 底板压暗两档（大图/灯箱衬底） |
| `--overlay` | `rgba(10, 12, 16, 0.82)` | 底板系半透明 |
| `--lightbox` | `rgba(8, 9, 12, 0.97)` | 底板系近黑 |
| `--border` | `#262B33` | 底板 + 冷灰 |
| `--border-strong` | `#343A44` | 同上加深 |
| `--text` | `#E8EEF4` | 匣壁 P1 冷白（exact）——「文字即匣壁」 |
| `--muted` | `#A7B2C2` | 匣壁降明度 |
| `--faint` | `#8590A2` | 匣壁降明度（≈5.6:1 on --bg，≈5.0:1 on --panel，≥4.5 ✓） |
| `--accent` | `#5B9FE8` | 天蓝（exact；≈6.4:1 on --bg ✓） |
| `--accent-2` | `#7CB3F2` | 天蓝亮变体（hover/次强调） |
| `--accent-soft` | `#1D2A3D` | 天蓝 12% 叠加底板（选中行/选中态底） |
| `--accent-border` | `#2E4360` | 天蓝 30% 边（选中态描边） |
| `--accent-text` | `#A9C9F2` | 天蓝亮变体作正文色 |
| `--on-accent` | `#14161B` | 底板（exact）——天蓝上压底板色字 ≈6.4:1，禁用白字（白 on #5B9FE8 仅 2.78:1） |
| `--danger` | `#F2604A` | 珊瑚红（exact；≈5.6:1 on --bg ✓） |
| `--danger-text` | `#F58E7F` | 珊瑚红亮变体 |
| `--danger-soft` | `#2A1B17` | 珊瑚红 12% 叠加底板 |
| `--danger-border` | `#5C3128` | 珊瑚红 30% 边 |
| `--success` | `#7CBF94` | 语义绿（非品牌色，冷调化对齐匣壁） |
| `--success-soft` | `#16221B` | 语义绿叠加底板 |
| `--success-border` | `#3A6650` | 语义绿 30% 边 |
| `--warn` | `#D9A54A` | 旧审计琥珀金（警告文字；与星标黄刻意拉开） |
| `--warn-soft` | `#221D11` | 琥珀叠加底板 |
| `--warn-border` | `#4A3F22` | 琥珀 30% 边 |
| `--star` | `#F5C344` | 暖黄（exact；≈10.9:1 on --bg，星标图形对比远超 3:1 ✓） |
| `--scroll-thumb` | `#2A2E36` | 内凹（exact）——滚动条就是「凹槽」 |
| `--scroll-thumb-hover` | `#3B414C` | 内凹亮变体 |
| `--input-focus-border` | `#3D5B85` | 天蓝 40% 边 |
| `--input-focus-bg` | `#171A20` | 底板抬一档 |
| `--btn-primary-bg` ⭐新增 | `#F7FAFC` | 匣壁亮（exact） |
| `--btn-primary-text` ⭐新增 | `#14161B` | 底板（exact） |
| `--btn-primary-hover` ⭐新增 | `#FFFFFF` | 匣壁亮提纯 |
| `--btn-primary-active` ⭐新增 | `#D3DCE6` | 匣壁暗（exact） |

⭐ 新增 4 个主按钮 token，命名可由前端调整，但值与语义不可变。注意主按钮三态恰好是匣壁的亮/纯/暗三档——按钮就是「匣壁的一块」。

不改变的 dark token：`--radius-control/--radius-panel/--elev-1/--elev-2/--motion/--fs-*`（本轮不动，见第八节）。

---

## 三、Light 主题 token 表（`:root[data-theme='light']`，第 60-99 行逐变量替换）

基调：冷白纸感。**文字用底板色、容器用匣壁色——与 dark 模式完美互逆**（dark：文字=匣壁、底=底板；light：文字=底板、底=匣壁）。

| 变量 | 新值 | 出处（PA2） |
|---|---|---|
| `--bg` | `#F0F3F7` | 匣壁冷白系（P1 与亮档之间） |
| `--chrome` | `#E8EEF4` | 匣壁 P1 冷白（exact） |
| `--panel` | `#FFFFFF` | 匣壁提纯 |
| `--panel-2` | `#F4F7FA` | 匣壁亮变体 |
| `--panel-3` | `#E4E9F0` | 匣壁压暗一档 |
| `--card` | `#FFFFFF` | 匣壁提纯 |
| `--canvas` | `#F7FAFC` | 匣壁亮（exact）——照片摆在最亮的纸上 |
| `--stage` | `#E9EDF2` | 匣壁压暗 |
| `--overlay` | `rgba(16, 20, 27, 0.35)` | 底板系半透明 |
| `--lightbox` | `rgba(10, 12, 16, 0.97)` | 底板系近黑（浅色下看大图同样要近黑衬底，维持现状行为） |
| `--border` | `#D8DEE7` | 匣壁暗方向 |
| `--border-strong` | `#C2CCD9` | 同上加深 |
| `--text` | `#1A1D23` | 底板（≈15:1 on --bg ✓） |
| `--muted` | `#4A5464` | 底板 + 冷灰（≈6.9:1 ✓） |
| `--faint` | `#5A6472` | 底板 + 冷灰（≈5.4:1 on --bg，≥4.5 ✓） |
| `--accent` | `#2F6CB8` | 天蓝加深至正文可用（白底上 ≈5.3:1 ✓） |
| `--accent-2` | `#24589C` | 天蓝再加深 |
| `--accent-soft` | `#E3EDF9` | 天蓝 12% 叠加匣壁 |
| `--accent-border` | `#B7D2F0` | 天蓝 35% 边 |
| `--accent-text` | `#1D4E8F` | 天蓝深度变体作正文 |
| `--on-accent` | `#FFFFFF` | 白 on #2F6CB8 ≈5.3:1 ✓ |
| `--danger` | `#C93A2A` | 珊瑚红加深（on --bg ≈4.6:1，on #FFFFFF ≈5.1:1 ✓） |
| `--danger-text` | `#A82E20` | 珊瑚红深度变体 |
| `--danger-soft` | `#FBEAE7` | 珊瑚红 10% 叠加纸白 |
| `--danger-border` | `#EFC3BB` | 珊瑚红 30% 边 |
| `--success` | `#2F7D4F` | 语义绿（保留现值） |
| `--success-soft` | `#E6F4EA` | 保留现值 |
| `--success-border` | `#B9DDC6` | 保留现值 |
| `--warn` | `#8A5B14` | 琥珀金加深 |
| `--warn-soft` | `#FBF2DE` | 琥珀叠加纸白 |
| `--warn-border` | `#E3D2AC` | 琥珀 30% 边 |
| `--star` | `#B88010` | 暖黄加深（图形对比 ≈3.1:1，满足非文本 3:1 ✓） |
| `--scroll-thumb` | `#C2CBD8` | 匣壁暗方向 |
| `--scroll-thumb-hover` | `#A8B3C3` | 同上加深 |
| `--input-focus-border` | `#7FA8DE` | 天蓝 60% 边 |
| `--input-focus-bg` | `#FFFFFF` | 保留 |
| `--btn-primary-bg` | `#14161B` | 底板（exact） |
| `--btn-primary-text` | `#F7FAFC` | 匣壁亮（exact） |
| `--btn-primary-hover` | `#2A2E36` | 内凹（exact） |
| `--btn-primary-active` | `#0F1115` | 底板压暗 |

浅色模式中 lightbox/overlay 维持近黑，属于既有正确行为，仅把色相校准到底板系。

---

## 四、主按钮策略（采纳旧审计的反色方案）

**结论：主按钮采用反色，不用任何彩色。** Dark 模式 = 匣壁亮底 + 底板色字；Light 模式 = 底板色底 + 匣壁亮字。

理由：1) 摄影器材的设计语言（Leica 菜单白底黑字、Nikon 机身黑底白字），表达「这是工具，不是互联网 App」；2) 主操作靠明度反转建立层级，天蓝 accent 全部省下来给「系统反馈」，彩色不承担「哪个按钮重要」的职责；3) 与「界面是匣」的材料叙事一致——主按钮就是匣壁本身。

**Token 用法（前端执行标准）：**

- 主按钮（如「加入选片」「导出」「确认」等 primary 动作）：`background: var(--btn-primary-bg); color: var(--btn-primary-text);` hover → `--btn-primary-hover`，active → `--btn-primary-active`。圆角 `--radius-control`，无阴影或仅 `--elev-1`。
- 主按钮 **disabled**：`background: var(--panel-3); color: var(--faint);`，禁用态不反色。
- 主按钮 **focus ring**：`outline: 2px solid var(--accent); outline-offset: 2px`——蓝色聚焦环是「系统回应你」，合规。
- 次按钮：`background: var(--panel); border: 1px solid var(--border-strong); color: var(--text);`，hover 背景 `--panel-2`。
- **破坏性确认按钮**（最终确认弹层里那一个）：`background: var(--danger); color: var(--on-accent)` 仅限 dark 用底板字（`--on-accent: #14161B`），light 用白字（`--on-accent: #FFFFFF`）；其余弹层按钮一律中性。
- 现有使用 `--accent` 作实底按钮的组件，全部降级为：要么改用 `--btn-primary-*`（若为主操作），要么改为 `--accent-soft` 底 + `--accent-border` 边 + `--accent-text` 字（若为次要强调）。**禁止大面积 `--accent` 实底块**（呼应 P1 原则与审计指出的「42.7% accent 花在数据上」问题）。

---

## 五、三色功能分配（一色一职，禁用场景为硬约束）

| 品牌色 | 动词 | 允许的语义角色（枚举封闭） | 允许出现的组件 | 禁止出现的场景 |
|---|---|---|---|---|
| 天蓝 `#5B9FE8`（dark）/ `#2F6CB8`（light） | **系统回应你** | ① 选中态（行/卡片/导航项，用 soft/border/text 组合，实底仅 ≤2px 指示条）② 聚焦环与输入框 focus ③ 链接与可点文字 ④ 长任务反馈：导入进度条、索引建立中、AI 分析中 | 选中行、focus ring、进度条、导航指示条、链接 | 主按钮实底、星标/旗标、破坏性操作、纯装饰（渐变/光晕/插画）、文件夹或标签的类别配色（类别色另行无彩方案）、Logo 三色并置装饰 |
| 暖黄 `#F5C344`（dark）/ `#B88010`（light） | **你标记的照片** | 星级评分、旗标（Pick/Reject 中的 Pick）、收藏标记 | 星标 icon、旗标 icon、评分行 | 按钮、选中态、进度、警告文字（警告用 `--warn` 琥珀 #D9A54A/#8A5B14，与星标黄刻意分档）、大面积填充、hover 效果 |
| 珊瑚红 `#F2604A`（dark）/ `#C93A2A`（light） | **不可逆操作** | 破坏性操作的最终确认（永久删除、清空图库、移除原文件） | danger 家族四 token（danger/danger-text/danger-soft/danger-border） | 主按钮、关闭按钮（关闭一律中性灰）、普通删除入口的 hover（入口层中性，只有最终确认层变红）、非破坏场景的任何强调 |

补充裁决：

1. **普通删除（可撤销/进回收站）不算破坏性**——入口按钮中性，只有「永久删除/清空」的最终确认才允许珊瑚红。这样红色出现 = 必须停下来看。
2. **警告色与星标色必须分开**：`--warn`（琥珀 #D9A54A/#8A5B14）与 `--star`（暖黄 #F5C344/#B88010）是两个 token、两档观感，禁止互相借用。
3. **success 绿保留为语义色**，不与品牌三色混用，仅「已保存/已导出/完成」。
4. 三色**禁止**在同一视图内以装饰目的并排出现（那是 Logo 的构图，不是 UI 装饰）。唯一例外：启动画面与「关于」页可直接复用 Logo 资产。

---

## 六、Skin 取舍策略（6 → 4）

裁决：**保留 4 套**。比旧审计建议的 3 套多一套，因为 classic 是 `mode:'auto'`（跟随系统），用户仍需要「强制深/强制浅」的确定性选项——这四套实际是「跟随系统 / 深 / 浅 / 无障碍」的**模式选择**，不是主题商店。

| 现有 skin | 裁决 | 理由 |
|---|---|---|
| classic 经典 | **保留改名**「默认」 | 换新 token（dark=第二节表、light=第三节表） |
| eclipse 月蚀 | **砍** | 紫色 accent 是死掉的「月相」品牌残留 |
| aurora 夜航 | **砍** | 玻璃拟态+青绿光晕与新品牌无关，且有 backdrop-filter 性能成本 |
| graphite 墨岩 | **砍** | 新默认主题本身就是低饱和中性方向，它被吸收而非并存 |
| paper 柔光 | **保留改造**「浅色」（id 复用 `paper`） | 暖米色与冷白品牌相抵触，整表替换为第三节 light token；复用 id 让老用户无感迁移 |
| mist 雾蓝 | **砍** | 与新 light 主题高度重复，且蓝 accent 将由默认主题承担 |
| —（新增） | **新增** `night`「深色」 | 强制深色，token 同第二节 |
| —（新增） | **新增** `contrast`「高对比」 | 采纳旧审计的无障碍建议 |

**新 `SKINS` 定义（`src/shared/skins.ts` 整表替换）：**

```ts
export type SkinId = 'classic' | 'night' | 'paper' | 'contrast'

export const SKINS: SkinDefinition[] = [
  { id: 'classic',  name: '默认',   hint: '跟随系统深浅 · 匣色',   mode: 'auto',  base: '#14161B', swatches: ['#14161B', '#2A2E36', '#5B9FE8'] },
  { id: 'night',    name: '深色',   hint: '常驻深色 · 底板与匣壁', mode: 'dark',  base: '#14161B', swatches: ['#14161B', '#1E2127', '#5B9FE8'] },
  { id: 'paper',    name: '浅色',   hint: '常驻浅色 · 冷白纸感',   mode: 'light', base: '#F0F3F7', swatches: ['#F0F3F7', '#E8EEF4', '#2F6CB8'] },
  { id: 'contrast', name: '高对比', hint: '无障碍 · 高辨识度',     mode: 'dark',  base: '#0A0C0F', swatches: ['#0A0C0F', '#14171C', '#82B4F2'] }
]
```

说明：classic 的 swatches `[底板, 内凹, 天蓝]` 就是 Logo 的缩微——选中默认皮肤时用户看到的色卡即品牌标。

**`contrast`「高对比」token 表（dark 系全表）：**

| 变量 | 值 | 变量 | 值 |
|---|---|---|---|
| `--bg` | `#0A0C0F` | `--danger` | `#FF7A66` |
| `--chrome` | `#0F1116` | `--danger-text` | `#FFA390` |
| `--panel` | `#14171C` | `--danger-soft` | `#331915` |
| `--panel-2` | `#191D23` | `--danger-border` | `#7A3A30` |
| `--panel-3` | `#20252C` | `--success` | `#8FD0A8` |
| `--card` | `#14171C` | `--success-soft` | `#14241C` |
| `--canvas` | `#0A0C0F` | `--success-border` | `#2F6B4A` |
| `--stage` | `#060809` | `--warn` | `#E8C06A` |
| `--overlay` | `rgba(6, 8, 10, 0.9)` | `--warn-soft` | `#26200F` |
| `--lightbox` | `rgba(4, 5, 7, 0.98)` | `--warn-border` | `#5C4E28` |
| `--border` | `#3A414D` | `--star` | `#F5C344` |
| `--border-strong` | `#525B69` | `--scroll-thumb` | `#333A45` |
| `--text` | `#FFFFFF` | `--scroll-thumb-hover` | `#4A5361` |
| `--muted` | `#C6CFDC` | `--input-focus-border` | `#5B82B5` |
| `--faint` | `#AEB9C9` | `--input-focus-bg` | `#101318` |
| `--accent` | `#82B4F2` | `--accent-soft` | `#1C2A40` |
| `--accent-2` | `#A3C8F6` | `--accent-border` | `#3D5B85` |
| `--accent-text` | `#D3E4FA` | `--on-accent` | `#0A0C0F` |
| `--btn-primary-*` | 同 dark（反色按钮本身即最高对比） | | |

**迁移**：`eclipse/aurora/graphite/mist` 的 localStorage 残值无需清洗——`findSkin()` 找不到时已回落 `SKINS[0]`，删掉定义后老用户自动落到「默认」。`theme-boot.js` 无需改逻辑，只需 skins.ts 的 base 值随上表更新（首屏防闪底色即变为 #14161B）。

---

## 七、与 Logo / 品牌资产的呼应关系（供后续 Phase 引用）

| Logo 材料 | UI 中的化身 |
|---|---|
| 底板 `#14161B` | dark 的 --bg；light 的正文色与主按钮底 |
| 内凹 `#2A2E36` | dark 的 --panel-3 / --scroll-thumb；light 主按钮 hover |
| 匣壁 P1 `#E8EEF4` | dark 的正文色；light 的 --chrome |
| 匣壁亮 `#F7FAFC` | dark 主按钮底 / hover；light 的 --canvas |
| 匣壁暗 `#D3DCE6` | dark 主按钮 active |
| 天蓝照片 | accent（系统回应） |
| 暖黄照片 | star（用户标记） |
| 珊瑚红照片 | danger（不可逆警示） |

一处**有意偏离 Logo 字面**的地方需要说明：Logo 中照片所在的内凹 `#2A2E36` 比底板亮，但 UI 中照片画布（--canvas/--stage）反而比底板**暗**——因为屏幕上照片需要近黑衬底才能正确读影调，这是显示媒介的功能需求，匣子是印刷介质。内凹色值本身没有丢：它成了滚动条与内嵌控件底（「凹槽」语义忠实）。

---

## 八、明确不改动项

1. **PA2 色板本身与 `Logo.tsx`**：匣壁渐变已同步 P1 冷白，不再动。
2. **Token 变量名与架构**：只改值，不增删既有变量（例外：新增 4 个 `--btn-primary-*`）；`data-theme` / `data-skin` 双属性机制不变。
3. **圆角两档（8/11px）、阴影两级（--elev-1/2）、动效（--motion 150ms）**：已符合「两档」纪律，本轮不动。
4. **字阶与字体栈**（--fs-xs/sm/base、body 13px、系统字体栈）：属字体专项（旧审计 P0-3 的另一半），不在本次主题色对齐范围内，建议单独立项。
5. **语义绿 success**：保留语义职责与现值（dark 侧仅微调为冷调 #7CBF94 对齐匣壁灰阶）。
6. **灯箱近黑策略**：light 主题下 --lightbox 仍近黑，只校准色相到底板系。
7. **localStorage 键名**（`lunaris:theme` / `lunaris:skin`）与 `findSkin()` 回落逻辑：迁移依赖它，不改。
8. **`.btn/.input/.side-item` 统一圆角规则**（styles.css 第 339-346 行）：保留。

---

## 九、给前端工程师的执行摘要

1. `src/renderer/src/styles.css`：按第二、三、六节整表替换 `:root`、`:root[data-theme='light']`，删除 eclipse/aurora/graphite/paper(旧值)/mist 五段，新增 `night`（同 :root 值）、`paper`（同 light 值）、`contrast` 三段 `data-skin` 规则，新增 4 个 `--btn-primary-*` 变量（dark/light 两套值）。
2. `src/shared/skins.ts`：按第六节整表替换 `SkinId`/`SKINS`。
3. 主按钮组件：把现用 `--accent` 实底的 primary 类组件切到 `--btn-primary-*`（第四节用法）。
4. 选中态组件：`--accent-soft` 底 + `--accent-border` 边 + `--accent-text` 字 + ≤2px `--accent` 指示条，替换现有实底 accent 块。
5. 验证：本表所有对比度为约算（已按 WCAG 相对亮度公式手工核算，faint/text/accent/danger/star 均标注达标值），Phase 2 ux-ui-designer 需以自动化工具复核 `--faint`、`--muted`、`--text`、`--accent-text`、`--danger-text` 对各自实际背景 ≥4.5:1，`--star`/`--accent` 作图形色时 ≥3:1（高对比 skin 的 `--faint`/`--muted` 目标 ≥7:1）。
6. 注意 `data-theme` 与 `data-skin` 的组合优先级维持现状（skin 覆盖 theme），night/paper 直接写全套值即可。
