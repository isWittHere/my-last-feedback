/**
 * Zeven 2.0 SSE Client — fetch + ReadableStream SSE 解析器
 *
 * 用于与 Zeven 2.0 后端 SSE 流通信。
 * 协议参考: CBZWW_zeven_2.0/app/core/stream_handler.py
 */

import type { ContentBlock } from '@/components/zeven'
import { useAuthStore } from '@/store/authStore'

// ── 常量 ──

const AGENT_ID = 'zeven-financial-research-agent'
const API_BASE = '/api/v1'

/** 从 authStore 读取当前 token，构造 Authorization header */
function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// ── SSE 事件类型 ──

export type SSEEventType =
  // 控制事件
  | 'RunStarted'
  | 'RunCompleted'
  | 'RunError'
  // Block 事件 (protocol=block)
  | 'ContentBlockStart'
  | 'ContentBlockDelta'
  | 'ContentBlockEnd'
  // Legacy 事件 (protocol=legacy)
  | 'RunContent'
  | 'RunContentCompleted'
  | 'ToolCallStarted'
  | 'ToolCallCompleted'
  | 'ToolCallError'
  | 'ReasoningStarted'
  | 'ReasoningStep'
  | 'ReasoningContentDelta'
  | 'ReasoningCompleted'
  | 'ModelRequestStarted'
  | 'ModelRequestCompleted'

export interface SSEEvent {
  event: SSEEventType
  data: Record<string, unknown>
}

// ── 会话类型 ──

export interface ZevenSession {
  session_id: string
  session_name: string
  created_at: string | null
  updated_at: string | null
  summary?: string | null
}

export interface ZevenSessionDetail extends ZevenSession {
  agent_id: string
  user_id: string
  runs?: unknown[]
  messages?: ZevenBlockMessage[]
  todo_list?: Array<Record<string, unknown>>
  session_data: Record<string, unknown>
}

export interface ZevenBlockMessage {
  role: 'user' | 'assistant'
  content: string
  blocks?: ContentBlock[]
}

// ── SSE 流解析器 ──

async function* parseSSEStream(response: Response): AsyncGenerator<SSEEvent> {
  const body = response.body
  if (!body) return

  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n')
      buffer = parts.pop() ?? ''

      let currentEvent = 'message'
      let currentData = ''

      for (const line of parts) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim()
        } else if (line.startsWith('data: ')) {
          currentData = line.slice(6)
        } else if (line === '' && currentData) {
          try {
            const parsed = JSON.parse(currentData) as Record<string, unknown>
            yield { event: currentEvent as SSEEventType, data: parsed }
          } catch {
            console.warn('[SSE] Parse error:', currentData.slice(0, 100))
          }
          currentEvent = 'message'
          currentData = ''
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// ── Agent API ──

export interface SendMessageParams {
  message: string
  sessionId: string
  modelId?: string
  showThinking?: boolean
  signal?: AbortSignal
  onEvent: (event: SSEEvent) => void
}

/**
 * 发送消息到 Zeven Agent — 消费 SSE 流并通过 onEvent 回调逐事件分发。
 */
export async function sendToAgent({
  message,
  sessionId,
  modelId,
  showThinking,
  signal,
  onEvent,
}: SendMessageParams): Promise<void> {
  const url = `${API_BASE}/agents/${encodeURIComponent(AGENT_ID)}/runs`

  const formData = new FormData()
  formData.append('message', message)
  formData.append('stream', 'true')
  formData.append('session_id', sessionId)
  formData.append('protocol', 'block')

  // 构造 metadata: model_id + show_thinking
  const meta: Record<string, unknown> = {}
  if (modelId) meta.model_id = modelId
  if (showThinking !== undefined) meta.show_thinking = showThinking
  if (Object.keys(meta).length > 0) {
    formData.append('metadata', JSON.stringify(meta))
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
    signal,
  })

  if (!response.ok) {
    // SSE 请求也处理 401 token 过期
    if (response.status === 401) {
      const body = await response.json().catch(() => ({})) as Record<string, unknown>
      if (body.code === 'TOKEN_EXPIRED') {
        await useAuthStore.getState().refreshToken()
        // 重试一次
        const retry = await fetch(url, {
          method: 'POST',
          headers: authHeaders(),
          body: formData,
          signal,
        })
        if (retry.ok) {
          for await (const event of parseSSEStream(retry)) {
            onEvent(event)
          }
          return
        }
        useAuthStore.getState().logout()
      }
      throw new Error(`Zeven API error: 401 (auth)`)
    }
    const errText = await response.text()
    throw new Error(`Zeven API error: ${response.status} ${errText.slice(0, 200)}`)
  }

  for await (const event of parseSSEStream(response)) {
    onEvent(event)
  }
}

// ── 会话管理 API ──

async function zevenFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...options?.headers,
    },
    ...options,
  })

  // 401 TOKEN_EXPIRED → 尝试刷新后重试一次
  if (res.status === 401) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>
    if (body.code === 'TOKEN_EXPIRED') {
      await useAuthStore.getState().refreshToken()
      const retry = await fetch(`${API_BASE}${path}`, {
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
          ...options?.headers,
        },
        ...options,
      })
      if (retry.ok) return retry.json() as Promise<T>
      // 刷新也失败 → 登出
      useAuthStore.getState().logout()
    }
    throw new Error(`Zeven API error: ${res.status} (auth)`)
  }

  if (!res.ok) {
    throw new Error(`Zeven API error: ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function listSessions(): Promise<ZevenSession[]> {
  return zevenFetch<ZevenSession[]>(
    `/agents/${encodeURIComponent(AGENT_ID)}/sessions`
  )
}

export async function getSession(sessionId: string): Promise<ZevenSessionDetail> {
  return zevenFetch<ZevenSessionDetail>(
    `/agents/${encodeURIComponent(AGENT_ID)}/sessions/${encodeURIComponent(sessionId)}?format=blocks`
  )
}

export async function deleteSession(sessionId: string): Promise<void> {
  await zevenFetch<{ deleted: boolean }>(
    `/agents/${encodeURIComponent(AGENT_ID)}/sessions/${encodeURIComponent(sessionId)}`,
    { method: 'DELETE' }
  )
}

export async function renameSession(sessionId: string, name: string): Promise<void> {
  await zevenFetch<Record<string, unknown>>(
    `/agents/${encodeURIComponent(AGENT_ID)}/sessions/${encodeURIComponent(sessionId)}/rename?name=${encodeURIComponent(name)}`,
    { method: 'PUT' }
  )
}

export async function cancelSessionRun(sessionId: string): Promise<void> {
  try {
    await zevenFetch<Record<string, unknown>>(
      `/agents/${encodeURIComponent(AGENT_ID)}/sessions/${encodeURIComponent(sessionId)}/cancel`,
      { method: 'POST' }
    )
  } catch {
    // Cancel is best-effort — don't throw
  }
}

// ── Daily Report API ──

export interface ReportSummary {
  session_id: string
  report_date: string | null
  tickers: string[]
  status: string
  created_at: string | null
}

export interface DailyReportDetail {
  session_id: string
  harness_id: string
  status: string
  data: Record<string, unknown>
  completed_at: string | null
  meta: Record<string, unknown>
}

/**
 * 触发盘前日报生成 — POST + SSE 流消费。
 * 返回 session_id (从响应头 X-Session-Id 读取)。
 */
export async function triggerDailyReport(
  tickers: string[],
  onEvent: (event: SSEEvent) => void,
  signal?: AbortSignal,
): Promise<string> {
  const url = `${API_BASE}/reports/daily/trigger`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({ tickers }),
    signal,
  })

  if (!response.ok) {
    if (response.status === 401) {
      await useAuthStore.getState().refreshToken()
      const retry = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ tickers }),
        signal,
      })
      if (retry.ok) {
        const sid = retry.headers.get('X-Session-Id') ?? ''
        for await (const event of parseSSEStream(retry)) { onEvent(event) }
        return sid
      }
      useAuthStore.getState().logout()
      throw new Error(`Daily report trigger error: 401 (auth)`)
    }
    const errText = await response.text()
    throw new Error(`Daily report trigger error: ${response.status} ${errText.slice(0, 200)}`)
  }

  const sessionId = response.headers.get('X-Session-Id') ?? ''

  for await (const event of parseSSEStream(response)) {
    onEvent(event)
  }

  return sessionId
}

export async function listDailyReports(limit = 20): Promise<ReportSummary[]> {
  const res = await zevenFetch<{ reports: ReportSummary[] }>(
    `/reports/daily?limit=${limit}`
  )
  return res.reports
}

export async function getDailyReport(sessionId: string): Promise<DailyReportDetail> {
  return zevenFetch<DailyReportDetail>(
    `/reports/daily/${encodeURIComponent(sessionId)}`
  )
}

export async function deleteDailyReport(sessionId: string): Promise<void> {
  await zevenFetch<{ status: string }>(
    `/reports/daily/${encodeURIComponent(sessionId)}`,
    { method: 'DELETE' }
  )
}

// ── BigBang API ──

export type BigBangSSEEventType =
  | 'BigBangStarted'
  | 'BigBangCompleted'
  | 'BigBangFailed'
  | 'AgentStarted'
  | 'AgentCompleted'
  | 'AgentTimeout'
  | 'AgentRetrying'
  | 'AgentFailed'
  | 'DecisionStarted'
  | 'DecisionCompleted'

export interface BigBangSSEEvent {
  event: BigBangSSEEventType
  data: Record<string, unknown>
}

export interface BigBangSummary {
  bigbang_id: string
  ticker: string | null
  status: string
  success_count: number
  error_count: number
  created_at: string | null
}

export interface BigBangDetail {
  bigbang_id: string
  meta: Record<string, unknown>
  agent_results: Record<string, unknown>
  decision_result: unknown
  created_at: string | null
}

/**
 * 触发大爆炸分析 — POST + SSE 自定义事件流。
 * 返回 bigbang_id (从响应头 X-BigBang-Id 或首个事件中读取)。
 */
export async function triggerBigBang(
  ticker: string,
  onEvent: (event: BigBangSSEEvent) => void,
  signal?: AbortSignal,
): Promise<string> {
  const url = `${API_BASE}/bigbang/trigger`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({ ticker }),
    signal,
  })

  if (!response.ok) {
    if (response.status === 401) {
      await useAuthStore.getState().refreshToken()
      const retry = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ ticker }),
        signal,
      })
      if (retry.ok) {
        const bbId = retry.headers.get('X-BigBang-Id') ?? ''
        for await (const event of parseSSEStream(retry)) { onEvent(event as BigBangSSEEvent) }
        return bbId
      }
      useAuthStore.getState().logout()
      throw new Error(`BigBang trigger error: 401 (auth)`)
    }
    const errText = await response.text()
    throw new Error(`BigBang trigger error: ${response.status} ${errText.slice(0, 200)}`)
  }

  const bigbangId = response.headers.get('X-BigBang-Id') ?? ''

  for await (const event of parseSSEStream(response)) {
    onEvent(event as BigBangSSEEvent)
  }

  return bigbangId
}

export async function listBigBangs(limit = 50): Promise<BigBangSummary[]> {
  const res = await zevenFetch<{ items: BigBangSummary[]; total: number }>(
    `/bigbang?limit=${limit}`
  )
  return res.items
}

export async function getBigBang(bbId: string): Promise<BigBangDetail> {
  return zevenFetch<BigBangDetail>(
    `/bigbang/${encodeURIComponent(bbId)}`
  )
}

export async function deleteBigBang(bbId: string): Promise<void> {
  await zevenFetch<{ status: string }>(
    `/bigbang/${encodeURIComponent(bbId)}`,
    { method: 'DELETE' }
  )
}
