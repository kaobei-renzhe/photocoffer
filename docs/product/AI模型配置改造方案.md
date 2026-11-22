# AI 模型配置改造方案

> 触发问题：APP 内部用到的模型是否需要改进？自己配的 AI 模型设置是否需要优化？
>
> 结论：
> - **本地嵌入模型（Chinese-CLIP）不用换**，换了收益不抵代价，理由见 §6
> - **大模型设置需要改**，而且里面有个**真 bug**：设置页的温度和最大输出，调了完全不生效
> - 改造方向参照 WorkBuddy / Cherry Studio 这类客户端的「模型列表 + 能力绑定」，而不是继续用一套全局配置

---

## 0. 现状：三个真问题 + 一个不要动的

| # | 问题 | 严重度 | 证据 |
| --- | --- | --- | --- |
| 1 | 设置页「温度」「最大输出」**改了不生效** | **高**（欺骗用户） | `buildRequest` 里 `options.temperature ?? config.temperature`，四个能力全都自带值 → config 永远不被取 |
| 2 | 研读对话的 explain 阶段 **400 token 偏紧** | 中 | `socratic.ts:79`，JSON 外壳吃掉 20–30 token，中文剩约 250 字 |
| 3 | 圈选提问，模型**看不到圈选区域的细节** | 中 | `prepareImage` 固定送整图长边 1024，区域只在提示词里用文字描述 |
| 4 | （不要动）本地嵌入模型 | — | 见 §6 |

### 现在做对了的，别推翻

- **按能力设参数**：评分 0.2/400、建议 0.4/800、筛选 0.2/600、研读 0.65/400
- **测试连接**：发 8 token 极短请求，只验链路
- **调用记录**：最近 50 次，只记模型/耗时/重试，不记密钥和图片
- **换厂商自动跟 baseUrl**
- **重试策略**：只对网络错误 / 429 / 5xx 重试，指数退避 + 尊重 `Retry-After`
- **密钥只走系统加密**：DPAPI / Keychain，拿不到加密能力就拒绝保存明文

---

## 1. 参考对象：WorkBuddy 的模型条目

它的 `models.json` 每个模型长这样（隐去密钥）：

```json
{
  "id": "deepseek-flash",
  "name": "DeepSeek-V4.1 Flash",
  "vendor": "DeepSeek",
  "url": "https://api.deepseek.com/chat/completions",
  "apiKey": "***",
  "supportsToolCall": true,
  "supportsImages": true,
  "supportsReasoning": true,
  "reasoning": { "defaultEffort": "high", "supportedEfforts": ["low", "high", "max"] },
  "maxInputTokens": 1000000,
  "maxOutputTokens": 384000
}
```

值得抄的四点：

| 设计 | 为什么好 |
| --- | --- |
| `id` 与 `name` 分开 | id 稳定不变，改名不影响引用 |
| **能力标签**显式声明 | 界面能提前判断「这个模型能不能用」，而不是等调用失败 |
| `vendor` 独立 | 按厂商分组显示，比一堆 URL 好认 |
| 上下文 / 输出长度显式写 | 能算「这张图 + 这段 prompt 会不会超」，也能在界面上显示 |

不要抄的一点：**`apiKey` 存在 json 里**。image-nest 用 DPAPI 加密存，这个做法更安全，保持。

---

## 2. 数据结构

### 2.1 模型条目

```ts
interface LlmModelEntry {
  id: string                 // 'm_' + uuid，稳定标识
  name: string               // 显示名「DeepSeek V4.1 Flash」
  vendor: string             // 'DeepSeek' | '智谱' | '自定义'
  provider: 'openai-compatible' | 'anthropic'
  baseUrl: string            // 允许填 baseUrl，也允许填完整 url（见 §3.2）
  model: string              // 请求体里的 model 字段
  /** 能力标签：决定哪些功能能用它 */
  vision: boolean            // 支持看图 —— 本应用的硬门槛
  jsonMode: boolean          // 可靠支持 response_format
  maxOutputTokens?: number   // 模型上限，用于校验
  contextTokens?: number
  /** 高级：留空则用各能力的推荐值 */
  temperature?: number | null
  maxRetries?: number
  timeoutMs?: number
}
```

### 2.2 配置本体

```ts
interface LlmSettings {
  enabled: boolean
  models: LlmModelEntry[]
  /** 默认模型；能力没单独指定时用它 */
  defaultModelId: string | null
  /** 能力 → 模型 id。只存「被覆盖」的，其余走默认 */
  routing: Partial<Record<LlmCapabilityId, string>>
  /** 能力级开关，保持现状 */
  capabilities: LlmCapabilitySwitch
}
```

**`routing` 只存覆盖项**，不是四个都存。这样换默认模型时，没被单独指定的能力会自动跟过去，不会留下四条旧 id。

### 2.3 迁移（老配置 → 新结构）

```ts
// 只要 config.llm.models 不存在，就走迁移
if (!stored.models) {
  const legacy = { ...stored }               // 老的单对象
  const first: LlmModelEntry = {
    id: 'm_legacy',
    name: legacy.model || '未命名模型',
    vendor: '自定义',
    provider: legacy.provider,
    baseUrl: legacy.baseUrl,
    model: legacy.model,
    vision: true,                            // 老配置能跑通就说明是能看图的
    jsonMode: true,
    temperature: null,                       // ← 关键：老的全局值不再生效，见 §3.1
    timeoutMs: legacy.timeoutMs,
    maxRetries: legacy.maxRetries
  }
  // 老的 llm-key.bin 直接给第一个模型复用，用户不用重填
}
```

**迁移只发生一次，且不改任何已有字段的含义**。老用户的 `capabilities` 开关原样保留。

---

## 3. 三个硬约束

### 3.1 温度 / 最大输出：留空才是正解

**这是修 bug 的核心决定。**

```ts
temperature?: number | null    // null 或 undefined = 用能力的推荐值
maxOutputTokens?: number | null
```

合并逻辑改成（三档优先级）：

```ts
options.temperature ?? config.model.temperature ?? 能力默认值
```

界面上写清楚：

```
温度（留空则用各功能的推荐值：评分 0.2 / 研读 0.65）
```

**为什么不是"全局值覆盖能力值"**：四个能力的温度差异是**功能设计**，不是用户偏好。让用户一个 0.3 盖掉全部，研读会变得又呆又像评分。

**为什么不是删掉**：偶尔真的需要（比如某个模型对 JSON 输出要求低温），留一个高级字段即可。

### 3.2 baseUrl 兼容两种写法

```ts
function endpointFor(base: string, path: '/chat/completions' | '/messages'): string {
  const clean = base.replace(/\/+$/, '')
  // 用户直接贴了完整 url → 原样用
  if (/\/(chat\/completions|messages)$/.test(clean)) return clean
  return clean + path
}
```

理由：网关地址可能长得离谱（`https://gw.example.com/v1/openai/chat/completions`），强制拆成 baseUrl + 固定路径会填不进去。

### 3.3 视觉门槛必须硬拦

**本应用的四个 AI 能力全部要发图**，所以 `vision: false` 的模型（比如纯文本的 GLM-5.3）**一个功能都用不了**。

处理方式：

| 场景 | 处理 |
| --- | --- |
| 添加模型时 | 默认勾上「支持看图」，取消勾选时立刻提示：本应用所有 AI 功能都需要看图 |
| 模型列表里 | `vision: false` 的卡片**灰显 + 标「不可用」**，不允许设为默认 |
| 测试连接 | 除了发文本，再发一张 32×32 的小图，真正验证视觉链路 |
| 调用前 | `readyState` 里检查 `vision`，给出**明确原因**而不是等 400 |

第 3 条最有价值：现在的"测试连接"只发文本，一个纯文本模型能测通，然后用户点评分才失败——**这就是最典型的困惑来源**。

---

## 4. 界面结构

### 4.1 模型列表（设置 → AI）

```
┌─────────────────────────────────────────────────────┐
│  AI 功能                                    [总开关] │
│                                                     │
│  模型                                               │
│  ┌───────────────────────────────────────────────┐  │
│  │ ● DeepSeek V4.1 Flash          默认    视觉 ✓ │  │
│  │   DeepSeek · api.deepseek.com · 输出 384K     │  │
│  │                            [测试] [编辑] [删除]│  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │ ○ GLM-5.3                    不可用  视觉 ✗   │  │
│  │   智谱 · open.bigmodel.cn                     │  │
│  │   纯文本模型，看不了图，本应用的 AI 功能都用不了│  │
│  └───────────────────────────────────────────────┘  │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐  │
│    + 添加模型                                       │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘  │
│                                                     │
│  功能分配                              [默认跟随]   │
│    照片评分      DeepSeek V4.1 Flash                │
│    后期建议      DeepSeek V4.1 Flash                │
│    智能筛选      DeepSeek V4.1 Flash                │
│    照片研读      [DeepSeek V4.1 Flash ▾]  ← 可改    │
└─────────────────────────────────────────────────────┘
```

### 4.2 关键交互决定

| 决定 | 理由 |
| --- | --- |
| 功能分配**默认全跟随默认模型**，展开才能单独指定 | 95% 的人一个模型就够，四个下拉框平铺等于制造选择困难 |
| 只给「研读」预留单独指定的说服力 | 它是四个能力里唯一需要**表达力**的（要讲清光线、构图逻辑），其余三个需要的是"看准 + 稳定" |
| 添加模型用**厂商预设** | 选「DeepSeek」自动填 baseUrl 和常用 model 名，减少手打错字 |
| 删除模型前检查引用 | 被 routing 引用的模型不能静默删除，要提示「研读正在使用它，换成哪个？」 |
| 密钥单独存，不随模型 JSON 导出 | 导出的配置给别人时不该带上密钥 |

### 4.3 添加模型弹层（厂商预设）

```
厂商      [DeepSeek ▾]        ← 选中后自动填下面两项
接口地址   https://api.deepseek.com
模型名     deepseek-flash
显示名     DeepSeek V4.1 Flash
API Key    ••••••••••••              [测试]
─────────────────────────────────
☑ 支持看图（本应用必需）
☑ 支持 JSON 模式
□ 展开高级：温度 / 最大输出 / 超时 / 重试
```

厂商预设表（内置，不可删）：

| 厂商 | baseUrl | 常用模型名 |
| --- | --- | --- |
| DeepSeek | `https://api.deepseek.com` | `deepseek-flash` |
| 智谱 | `https://open.bigmodel.cn/api/paas/v4` | `glm-5.3`（纯文本，会提示不可用） |
| 通义 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-vl-max` |
| 月之暗面 | `https://api.moonshot.cn/v1` | `moonshot-v1-8k-vision-preview` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Anthropic | `https://api.anthropic.com/v1` | `claude-sonnet-4` |
| Ollama（本地） | `http://127.0.0.1:11434/v1` | `llava` / `qwen2-vl` |

> 这张表只是**填默认值**，用户可以改。不联网拉模型列表——各家的 `/models` 接口返回格式不统一，维护成本高于收益。

---

## 5. 另外两处顺带修掉

### 5.1 研读 explain 阶段的 token

```ts
// src/main/llm/capabilities/socratic.ts:79
{ json: true, maxTokens: mustExplain ? 800 : 400, temperature: mustExplain ? 0.35 : 0.65 }
```

只改这一行。反问阶段 400 够（就一句话），解释阶段要讲逻辑，800 才够说完。

### 5.2 圈选提问要送局部图

现在的问题：用户框住眼睛问「这里的补光怎么来的」，模型拿到的是整张 1024 的图，那块区域可能只有 80×80 像素。

改法：新增 `prepareRegionImage`，从**原图**（不是预览）裁出区域，和整图一起送。

```ts
// src/main/llm/image.ts
export async function prepareRegionImage(
  itemId: number,
  region: NoteRegion,      // 归一化 0-1 坐标
  maxEdge = 768
): Promise<PreparedImage> {
  // 1. 取原图，读宽高
  // 2. 按 region 换算出像素矩形（留 8% 外扩，避免裁太紧）
  // 3. sharp.extract() 裁出来，再 resize 到 maxEdge
  // 4. 同样走 previewPathFor 兜底（RAW 解不动时）
}
```

调用侧（`socratic.ts`）改成两张图：

```ts
const [whole, region] = await Promise.all([
  ctx.image(itemId, 1024),
  input.region ? ctx.regionImage(itemId, input.region, 768) : null
])
```

提示词里要说明哪张是哪张：

```
第一张是整图，第二张是学生圈出来的区域（放大后的局部）。
判断局部细节时以第二张为准，判断整体关系时以第一张为准。
```

**注意**：外扩 8% 很重要。裁太紧会让模型看不到区域与周围的**关系**，而摄影里"这块亮是因为旁边暗"这种判断全靠关系。

---

## 6. 本地嵌入模型：明确建议不换

| 维度 | 现在 | 换强模型的代价 |
| --- | --- | --- |
| 模型 | Chinese-CLIP ViT-B/16 int8，190 MB，512 维 | jina-clip-v2（0.9B）/ GME-Qwen2-VL（2B）/ BGE-VL（2B 级），int8 后约 0.9–2 GB |
| 现有索引 | **31892 条向量已全建好**（31894 张照片） | 全部作废，重建从半小时涨到几小时 |
| 推理 | 单张几十 ms | 单张 500 ms 以上 |
| 中文效果 | 已实测 SigLIP 2 更弱 | 换过去不一定更好，风险实打实 |

**真正拖后腿的不是模型，是"零样本分类"这个用法的上限**——`models.ts` 的注释里自己写了「Chinese-CLIP 零样本分类一般」。这是**方法的局限**，换更大的模型也只是把"一般"变成"稍好"。

要提升自动分类质量，正确路子是**用大模型批量分类**（一次 6–10 张、JSON 输出），3.2 万张全跑约 640 万输入 token。但这应该是**可选的后台任务**，不能默认跑。

> 附带一条：`models.ts` 里 SigLIP 2 的 note 写「建议只做对比」，说明第二个模型是半废的。要么把这条说清楚（界面上标注"仅用于对比测试，中文效果弱于默认"），要么干脆从选项里拿掉，别让用户切过去踩坑。

---

## 7. 施工顺序

| # | 做什么 | 依赖 | 验证 |
| --- | --- | --- | --- |
| 1 | **修死配置**：`temperature` / `maxOutputTokens` 改成可空，合并逻辑三档优先级 | 无 | 设置留空时，四个能力各用自己的值；填了才覆盖 |
| 2 | `socratic` explain 阶段 400 → 800 | 无 | 解释类回答不再被截断 |
| 3 | `prepareRegionImage` + socratic 送两张图 | 无 | 框住眼睛提问，回答能说出眼神光的具体形状/位置 |
| 4 | 数据结构：`LlmModelEntry` + `models[]` + `routing`，含老配置迁移 | 1 | 老用户升级后，原来的模型和 key 都在，功能照常 |
| 5 | keyring 改多 key（`llm-keys/<modelId>.bin`），迁移时把旧 key 复制给第一个模型 | 4 | 两个模型各存各的 key，互不影响 |
| 6 | 模型列表 UI + 添加弹层 + 厂商预设 | 4,5 | 能加第二个模型并切换 |
| 7 | 功能分配 UI（默认跟随 + 单独指定） | 6 | 研读换模型后，评分仍用默认模型 |
| 8 | 「测试连接」加一张小图，验证视觉链路 | 6 | 纯文本模型测试时明确报"看不了图" |

**1–3 是独立的**，不依赖数据结构改造，**今天就能做完**（半天到一天）。4–8 才是真正的改造。

建议先做 1–3 并跑一次真实使用，确认"研读看不清细节"这个问题真的消失了，再投入 4–8。

---

## 8. 明确不做的

| 别做 | 原因 |
| --- | --- |
| 把 `apiKey` 存进模型 JSON | 现在是 DPAPI/Keychain 加密存，安全性高一个量级。别为了"配置好导出"退回明文 |
| 联网拉 `/models` 列表 | 各家返回格式不统一，还有 CORS 和鉴权差异，维护成本高。厂商预设表够用 |
| 让四个能力各配一个模型下拉框（平铺） | 制造选择困难。默认跟随 + 按需覆盖 |
| 把 `vision: false` 的模型直接禁止添加 | 用户可能想先存着备用。灰显 + 标注「不可用」即可 |
| 换 Chinese-CLIP | 见 §6 |
| 自动跑"大模型批量分类" | 会烧钱，必须是用户主动触发的后台任务 |
| 做成"模型权重/参数"那种复杂配置 | 本应用只需要"能不能看图、能不能 JSON"，不需要推理档位这套 |

---

## 9. 验收

- [ ] 设置页不再有「改了没反应」的输入框
- [ ] 留空温度时，评分和研读的温度确实不同（看日志里发出的请求体）
- [ ] 研读的 explain 回答完整，不出现半句截断
- [ ] 框选局部提问，回答能描述该区域的具体细节（而不是泛泛而谈）
- [ ] 老配置升级后，模型名和 API Key 都还在，不用重填
- [ ] 能添加第二个模型，两个模型各自保存密钥
- [ ] 研读单独指定另一个模型后，评分仍走默认模型
- [ ] 添加一个纯文本模型，界面立刻标「不可用」，测试连接明确说"看不了图"
- [ ] 删除正在被 routing 引用的模型时，会提示先换掉
