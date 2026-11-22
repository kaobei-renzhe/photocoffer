/** 大模型接入的共享类型：主进程与渲染层共用，渲染层不接触密钥与原始请求 */

export type LlmProviderId = 'openai-compatible' | 'anthropic'

export interface LlmConfig {
  /** 配置结构版本：2 = 温度/长度已改为可空；老版本留下的 0.3 / 1200 视为没配过 */
  llmVersion?: number
  provider: LlmProviderId
  /** 接口根地址，不含具体路径；openai 兼容默认 https://api.openai.com/v1 */
  baseUrl: string
  model: string
  /** 留空（null）表示用各能力自己的推荐值；只有填了才覆盖 */
  temperature: number | null
  /** 留空（null）表示用各能力自己的推荐值；只有填了才覆盖 */
  maxTokens: number | null
  /** 单次请求超时（毫秒） */
  timeoutMs: number
  /** 失败后的最大重试次数（不含首次） */
  maxRetries: number
  /** 总开关：关掉后所有能力调用直接返回未启用 */
  enabled: boolean
  /** 每个能力自己的开关；关掉后对应入口消失，直接调用会被拒绝 */
  capabilities: LlmCapabilitySwitch
}

/** 一个用户添加的模型：接口、能力与调用参数整份存下来 */
export interface LlmModelEntry {
  id: string
  /** 显示名，例如「DeepSeek V3」 */
  name: string
  /** 厂商名，仅用于展示与预设识别 */
  vendor: string
  provider: LlmProviderId
  baseUrl: string
  model: string
  /** 是否能看图；关掉后视觉类能力会被拦下 */
  vision: boolean
  /** 是否支持 response_format json_object */
  jsonMode: boolean
  /** 留空 = 用能力推荐值 */
  maxOutputTokens: number | null
  contextTokens: number | null
  /** 留空 = 用能力推荐值 */
  temperature: number | null
  maxRetries: number
  timeoutMs: number
}

/** 能力 → 模型 id 的覆盖；没写的走默认模型 */
export type LlmRouting = Partial<Record<LlmCapabilityId, string>>

export interface LlmSettings {
  version: 3
  enabled: boolean
  models: LlmModelEntry[]
  defaultModelId: string
  routing: LlmRouting
  /** 每个能力自己的开关；关掉后对应入口消失 */
  capabilities: LlmCapabilitySwitch
}

/** 落盘结构：兼容老版本的单模型字段，读取时迁移成 models[] */
export interface LlmStoredSettings extends Partial<Omit<LlmSettings, 'version'>> {
  version?: number
  /** 老结构里的配置版本 */
  llmVersion?: number
  provider?: LlmProviderId
  baseUrl?: string
  model?: string
  temperature?: number | null
  maxTokens?: number | null
  timeoutMs?: number
  maxRetries?: number
}

/** 设置页「添加模型」的厂商预设 */
export interface LlmModelPreset {
  id: string
  label: string
  vendor: string
  provider: LlmProviderId
  baseUrl: string
  model: string
  vision: boolean
  jsonMode: boolean
}

export const LLM_MODEL_PRESETS: LlmModelPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    vendor: 'OpenAI',
    provider: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    vision: true,
    jsonMode: true
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    vendor: 'DeepSeek',
    provider: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    vision: false,
    jsonMode: true
  },
  {
    id: 'kimi',
    label: 'Kimi（Moonshot）',
    vendor: 'Moonshot',
    provider: 'openai-compatible',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k-vision-preview',
    vision: true,
    jsonMode: true
  },
  {
    id: 'qwen',
    label: '通义千问',
    vendor: '阿里云',
    provider: 'openai-compatible',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-vl-max',
    vision: true,
    jsonMode: true
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    vendor: '智谱',
    provider: 'openai-compatible',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4v-plus',
    vision: true,
    jsonMode: true
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    vendor: 'Anthropic',
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-3-5-sonnet-latest',
    vision: true,
    jsonMode: false
  },
  {
    id: 'ollama',
    label: 'Ollama（本地）',
    vendor: 'Ollama',
    provider: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'llava',
    vision: true,
    jsonMode: false
  }
]

export interface LlmUsage {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

export type LlmErrorCode =
  | 'not_configured'
  | 'auth'
  | 'rate_limit'
  | 'timeout'
  | 'network'
  | 'bad_request'
  | 'bad_response'
  | 'cancelled'
  /** 今日 AI 额度用完或服务商连续失败熔断 */
  | 'quota_exceeded'
  | 'unknown'

export interface LlmCallSummary {
  at: number
  capabilityId: string
  ok: boolean
  attempts: number
  latencyMs: number
  errorCode?: LlmErrorCode
  usage?: LlmUsage
}

export interface LlmCapabilityInfo {
  id: LlmCapabilityId
  title: string
  description: string
  maxItems?: number
  /** 该能力是否被用户开启（总开关之外的第二层） */
  enabled: boolean
  /** 实际会用的模型；null 表示还没有可用模型 */
  modelId: string | null
  modelName: string | null
  /** 实际模型是否能看图；视觉类能力为 false 时入口要灰显 */
  vision: boolean
}

export interface LlmStatus {
  settings: LlmSettings
  /** 每个模型是否存了 Key 以及掩码（只暴露头尾，不返回明文） */
  keyHints: Record<string, string | null>
  /** os = 系统加密可用；unavailable = 无法安全保存，需先解决 */
  encryption: 'os' | 'unavailable'
  lastCall: LlmCallSummary | null
  recent: LlmCallSummary[]
  capabilities: LlmCapabilityInfo[]
  /** 总开关开着、默认模型填了、并且有 Key */
  ready: boolean
}

export interface LlmTestResult {
  ok: boolean
  message: string
  latencyMs: number
  model?: string
  /** 文本连通但看图失败时为 false */
  vision?: boolean
}

/**
 * 能力调用结果信封。
 * 走 IPC 时抛出的 Error 只保留 message、会丢掉 code，所以错误码必须放进返回值里。
 */
export type LlmRunOutcome<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; code: LlmErrorCode; message: string }

export const LLM_CAPABILITY_IDS = [
  'photo.quality',
  'photo.advice',
  'photo.smartFilter',
  'photo.socratic',
  'photo.autoTag'
] as const
export type LlmCapabilityId = (typeof LLM_CAPABILITY_IDS)[number]
/** 每个能力独立开关：关掉后入口消失，直接调用也会被拒绝 */
export type LlmCapabilitySwitch = Record<LlmCapabilityId, boolean>

export const LLM_CAPABILITY_DEFAULTS: LlmCapabilitySwitch = {
  'photo.quality': true,
  'photo.advice': true,
  'photo.smartFilter': true,
  'photo.socratic': true,
  'photo.autoTag': true
}

/** 照片质量评分：构图/曝光/色彩/清晰度 + 总分，0-100 */
export interface PhotoQualityScore {
  itemId: number
  composition: number
  exposure: number
  color: number
  sharpness: number
  overall: number
  comment: string
}

export interface PhotoQualityResult {
  results: PhotoQualityScore[]
  failed: Array<{ itemId: number; message: string }>
}

/** 评分接口的返回值：在能力结果上补一个"实际落库条数" */
export interface PhotoQualitySaved extends PhotoQualityResult {
  persisted: number
}

/** 后期建议：方向、参数、风格参考 */
export interface PhotoAdviceParameter {
  name: string
  value: string
  why: string
}

export interface PhotoAdvice {
  itemId: number
  summary: string
  directions: string[]
  parameters: PhotoAdviceParameter[]
  styleRefs: string[]
}

/** 智能筛选：按自然语言规则挑图 */
export interface SmartFilterResult {
  matchedIds: number[]
  reasons: Array<{ itemId: number; reason: string }>
  evaluated: number
  /** 某一批识别失败时的说明；不影响其它批次的结果 */
  errors?: string[]
}
