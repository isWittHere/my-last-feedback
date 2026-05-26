export type ReasoningMode = 'field' | 'think_tag'

export interface Model {
  id: string
  label: string
  tag: string
  reasoning_mode: ReasoningMode
  context_window: number
}

export const MODELS: Model[] = [
  { id: 'minimax/minimax-m2.5', label: 'MiniMax M2.5', tag: 'MiniMax', reasoning_mode: 'field', context_window: 128_000 },
  { id: 'minimax/minimax-m2.5-highspeed', label: 'MiniMax M2.5 HS', tag: 'MiniMax', reasoning_mode: 'think_tag', context_window: 128_000 },
  { id: 'minimax/minimax-m2.7', label: 'MiniMax M2.7', tag: 'MiniMax', reasoning_mode: 'think_tag', context_window: 128_000 },
  { id: 'z-ai/glm-5', label: '智谱 GLM-5', tag: '智谱AI', reasoning_mode: 'field', context_window: 128_000 },
  { id: 'deepseek/deepseek-v3.2-251201', label: 'DeepSeek V3.2', tag: 'DeepSeek', reasoning_mode: 'field', context_window: 96_000 },
  { id: 'stepfun-ai/Step-3.5-Flash', label: '阶跃 Step-3.5', tag: '阶跃星辰', reasoning_mode: 'field', context_window: 64_000 },
]

export const DEFAULT_MODEL = MODELS[0]!

export const MODEL_PROVIDERS = [...new Set(MODELS.map((m) => m.tag))] as const
