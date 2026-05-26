import { create } from 'zustand'
import type { ContentBlock } from '@/components/zeven'
import { DEFAULT_MODEL } from '@/constants/models'
import {
  sendToAgent,
  listSessions,
  getSession,
  deleteSession as apiDeleteSession,
  renameSession as apiRenameSession,
  cancelSessionRun,
  type SSEEvent,
  type ZevenSession,
} from '@/lib/sseClient'

// ── Types ──

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  blocks?: ContentBlock[]
  timestamp: Date
}

export interface ChatTask {
  title: string
  status: 'not-started' | 'in-progress' | 'completed'
}

export interface ChatState {
  // 会话
  sessions: ZevenSession[]
  activeSessionId: string | null

  // 当前会话消息
  messages: Message[]
  tasks: ChatTask[]

  // 模型选择 + 思考模式
  selectedModelId: string
  showThinking: boolean

  // 流状态
  isStreaming: boolean
  isLoadingSession: boolean
  abortController: AbortController | null

  // Actions
  sendMessage: (text: string) => Promise<void>
  stopStreaming: () => void
  setSelectedModelId: (modelId: string) => void
  setShowThinking: (show: boolean) => void
  loadSessions: () => Promise<void>
  switchSession: (sessionId: string) => Promise<void>
  createNewSession: () => void
  deleteSession: (sessionId: string) => Promise<void>
  renameSession: (sessionId: string, name: string) => Promise<void>
}

// ── Block 协议辅助函数 ──

/** 根据 block type 初始化一个空 ContentBlock */
function initBlock(blockData: Record<string, unknown>): ContentBlock {
  const type = blockData['type'] as string
  const origin = blockData['origin'] as ContentBlock['origin'] | undefined
  let block: ContentBlock
  switch (type) {
    case 'thinking':
      block = { type: 'thinking', content: '' }
      break
    case 'text':
      block = { type: 'text', content: '' }
      break
    case 'tool_call': {
      // 从 ContentBlockStart 的 tool_args 中提取初始参数 (FC 模式)
      const toolArgs = blockData['tool_args'] as Record<string, unknown> | undefined
      block = {
        type: 'tool_call',
        name: (blockData['tool_name'] as string) ?? '',
        args: toolArgs && Object.keys(toolArgs).length > 0 ? toolArgs : undefined,
        result: undefined,
      }
      break
    }
    case 'chart':
      block = { type: 'chart', chartType: '', data: null }
      break
    case 'card':
      block = { type: 'card', cardType: '', data: null }
      break
    case 'citation':
      block = { type: 'citation', sources: [] }
      break
    case 'task_list':
      block = { type: 'task_list', tasks: [] }
      break
    default:
      block = { type: 'text', content: '' }
  }
  if (origin) {
    block.origin = origin
  } else if (block.type === 'text') {
    block.origin = { phase: 'result', placement: 'standalone' }
  }
  return block
}

/** 将 delta 应用到对应 block */
function applyDelta(block: ContentBlock, delta: Record<string, unknown>): void {
  const deltaType = delta['type'] as string
  switch (deltaType) {
    case 'text_delta':
      if (block.type === 'text') {
        block.content += (delta['text'] as string) ?? ''
      }
      break
    case 'thinking_delta':
      if (block.type === 'thinking') {
        block.content += (delta['thinking'] as string) ?? ''
      }
      break
    case 'code_delta':
      if (block.type === 'tool_call') {
        // 追加代码到 args.code (流式代码展示)
        if (!block.args) block.args = {}
        const existing = (block.args['code'] as string) ?? ''
        block.args = { ...block.args, code: existing + ((delta['code'] as string) ?? '') }
      }
      break
    case 'args_delta':
      if (block.type === 'tool_call') {
        if (!block.args) block.args = {}
        const existing = (block.args['raw'] as string) ?? ''
        block.args = { ...block.args, raw: existing + ((delta['args_json'] as string) ?? '') }
      }
      break
  }
}

/** 最终化 block (ContentBlockEnd 时携带的完整数据) */
function finalizeBlock(block: ContentBlock, endData?: Record<string, unknown>): void {
  if (!endData) return
  switch (block.type) {
    case 'tool_call':
      if (endData['result'] != null) block.result = endData['result'] as string
      if (endData['error'] != null) block.result = `Error: ${endData['error'] as string}`
      break
    case 'chart':
      if (endData['spec'] != null) {
        const spec = endData['spec'] as Record<string, unknown>
        block.chartType = (spec['chart_type'] as string) ?? (spec['type'] as string) ?? ''
        block.data = spec
      }
      break
    case 'card':
      if (endData['spec'] != null) {
        const spec = endData['spec'] as Record<string, unknown>
        block.cardType = (spec['card_type'] as string) ?? ''
        block.data = spec
      }
      break
    case 'citation':
      if (endData['sources'] != null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        block.sources = endData['sources'] as any[]
      }
      break
    case 'task_list':
      if (endData['tasks'] != null) {
        block.tasks = normalizeTaskList(endData['tasks']) as unknown as typeof block.tasks
      }
      break
  }
}

function normalizeTaskStatus(status: unknown): ChatTask['status'] {
  const raw = String(status ?? '').toLowerCase()
  if (raw === 'completed') return 'completed'
  if (raw === 'in_progress' || raw === 'in-progress') return 'in-progress'
  return 'not-started'
}

function normalizeTaskList(value: unknown): ChatTask[] {
  if (!Array.isArray(value)) return []
  const raw = value
    .map((item) => {
      const record = (item ?? {}) as Record<string, unknown>
      const title = typeof record['title'] === 'string' && record['title'].trim().length > 0
        ? record['title']
        : (typeof record['content'] === 'string' ? record['content'] : '')
      return {
        title,
        status: normalizeTaskStatus(record['status']),
      }
    })
    .filter((t) => t.title.trim().length > 0)
  // 去重: 按 title 保留最后出现的 (最新状态)
  if (raw.length > 1) {
    const seen = new Map<string, number>()
    const deduped: ChatTask[] = []
    for (const task of raw) {
      const key = task.title.trim()
      const idx = seen.get(key)
      if (idx !== undefined) {
        deduped[idx] = task
      } else {
        seen.set(key, deduped.length)
        deduped.push(task)
      }
    }
    if (deduped.length < raw.length) return deduped
  }
  return raw
}

function normalizeBlocks(blocks: ContentBlock[] | undefined): ContentBlock[] | undefined {
  if (!Array.isArray(blocks)) return blocks
  return blocks.map((block) => {
    if (block.type === 'task_list') {
      return {
        ...block,
        tasks: normalizeTaskList(block.tasks) as unknown as typeof block.tasks,
      }
    }
    return block
  })
}

// ── Store ──

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  messages: [],
  tasks: [],
  selectedModelId: DEFAULT_MODEL.id,
  showThinking: true,
  isStreaming: false,
  isLoadingSession: false,
  abortController: null,

  setSelectedModelId: (modelId: string) => set({ selectedModelId: modelId }),
  setShowThinking: (show: boolean) => set({ showThinking: show }),

  sendMessage: async (text: string) => {
    const state = get()
    if (state.isStreaming) return

    // 确保有 session ID
    let sessionId = state.activeSessionId
    if (!sessionId) {
      sessionId = crypto.randomUUID()
      set({ activeSessionId: sessionId })
    }

    // 添加用户消息
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    }

    // 创建空的 assistant 占位消息
    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    }

    const abortController = new AbortController()

    set((s) => ({
      messages: [...s.messages, userMsg, assistantMsg],
      isStreaming: true,
      abortController,
    }))

    const assistantMsgId = assistantMsg.id
    const blocks: ContentBlock[] = []

    // ── 逐字符缓冲渲染 ──
    // text_delta 追加到 raw buffer，rAF 循环按帧释放字符到 block.content
    const CHARS_PER_FRAME = 4  // 每帧释放字符数 (60fps × 4 = 240 chars/sec)
    const _textBuffers = new Map<number, { raw: string; displayed: number }>()
    let _rafId: number | null = null
    let _streaming = true
    let _dirty = false  // 非 text delta 已修改 blocks，需刷新 React state

    const _flushMessage = () => {
      const textContent = blocks
        .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
        .map((b) => b.content)
        .join('')
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: textContent, blocks: [...blocks] }
            : m
        ),
      }))
    }

    /** rAF 渲染循环 — 从缓冲区逐帧释放字符 */
    const _renderLoop = () => {
      _rafId = null

      // 从每个 text buffer 释放字符
      let changed = false
      for (const [idx, buf] of _textBuffers) {
        if (buf.displayed < buf.raw.length) {
          const release = Math.min(CHARS_PER_FRAME, buf.raw.length - buf.displayed)
          buf.displayed += release
          if (blocks[idx] && blocks[idx]!.type === 'text') {
            (blocks[idx] as Extract<ContentBlock, { type: 'text' }>).content = buf.raw.slice(0, buf.displayed)
          }
          changed = true
        }
      }

      if (changed || _dirty) {
        _dirty = false
        _flushMessage()
      }

      // 继续循环: 仍在流式中或缓冲区有剩余
      const hasBuffered = [..._textBuffers.values()].some(b => b.displayed < b.raw.length)
      if (_streaming || hasBuffered) {
        _rafId = requestAnimationFrame(_renderLoop)
      }
    }

    /** 立即刷新所有缓冲区（用于结构事件和流式结束） */
    const _flushBuffers = () => {
      for (const [idx, buf] of _textBuffers) {
        buf.displayed = buf.raw.length
        if (blocks[idx] && blocks[idx]!.type === 'text') {
          (blocks[idx] as Extract<ContentBlock, { type: 'text' }>).content = buf.raw
        }
      }
    }

    /** 确保 rAF 循环在运行 */
    const _ensureLoop = () => {
      if (_rafId === null) {
        _rafId = requestAnimationFrame(_renderLoop)
      }
    }

    /** 立即刷新（结构/控制事件） */
    const updateMessage = (immediate = false) => {
      if (immediate) {
        if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null }
        _flushBuffers()
        _flushMessage()
        _ensureLoop()
      }
      // non-immediate: 不需要手动调度, _renderLoop 每帧自动执行
    }

    try {
      await sendToAgent({
        message: text,
        sessionId,
        modelId: get().selectedModelId,
        showThinking: get().showThinking,
        signal: abortController.signal,
        onEvent: (event: SSEEvent) => {
          const data = event.data

          switch (event.event) {
            // ── 控制事件 ──
            case 'RunStarted': {
              const serverSessionId = data['session_id'] as string | undefined
              if (serverSessionId) {
                set({ activeSessionId: serverSessionId })
                // 阶段 2: 乐观添加新 session 到列表（用用户消息前 15 字作标题）
                set((s) => {
                  if (s.sessions.some((ses) => ses.session_id === serverSessionId)) return s
                  const preview = text.replace(/\s+/g, ' ').trim().slice(0, 15) || '新对话'
                  return {
                    sessions: [
                      {
                        session_id: serverSessionId,
                        session_name: preview,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                      },
                      ...s.sessions,
                    ],
                  }
                })
              }
              break
            }
            case 'RunCompleted': {
              _streaming = false
              updateMessage(true)
              set({ isStreaming: false, abortController: null })
              // 阶段 3: 延迟刷新 session 列表，等待后端标题 hook 写入 DB
              setTimeout(() => { void get().loadSessions() }, 2000)
              break
            }
            case 'RunError': {
              _streaming = false
              const errContent = (data['content'] as string) ?? '发生错误'
              blocks.length = 0
              blocks.push({ type: 'text', content: `**Error:** ${errContent}`, origin: { phase: 'result', placement: 'standalone' } })
              updateMessage(true)
              set({ isStreaming: false, abortController: null })
              break
            }

            // ── Block 事件 ──
            case 'ContentBlockStart': {
              const index = data['index'] as number
              const blockInfo = data['block'] as Record<string, unknown>
              blocks[index] = initBlock(blockInfo)
              updateMessage(true)
              break
            }
            case 'ContentBlockDelta': {
              const index = data['index'] as number
              const delta = data['delta'] as Record<string, unknown>
              if (!blocks[index]) break

              const deltaType = delta['type'] as string
              if (deltaType === 'text_delta' && blocks[index]!.type === 'text') {
                // 缓冲 text delta — rAF 循环按帧释放
                let buf = _textBuffers.get(index)
                if (!buf) { buf = { raw: '', displayed: 0 }; _textBuffers.set(index, buf) }
                buf.raw += (delta['text'] as string) ?? ''
                _ensureLoop()
              } else {
                // 非 text delta（thinking, code 等）— 直接应用 + 标记脏
                applyDelta(blocks[index]!, delta)
                _dirty = true
                _ensureLoop()
              }
              break
            }
            case 'ContentBlockEnd': {
              const index = data['index'] as number
              const endBlock = data['block'] as Record<string, unknown> | undefined
              if (blocks[index]) {
                finalizeBlock(blocks[index]!, endBlock)
                updateMessage(true)
                if (blocks[index]?.type === 'task_list') {
                  set({ tasks: [...blocks[index].tasks] })
                }
              }
              break
            }

            default:
              break
          }
        },
      })

      // 流正常结束 — 确保 isStreaming 复位
      set({ isStreaming: false, abortController: null })
    } catch (err) {
      _streaming = false
      if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null }
      if (err instanceof DOMException && err.name === 'AbortError') {
        // 用户主动取消 — 立即刷新已有缓冲
        _flushBuffers()
        _flushMessage()
        set({ isStreaming: false, abortController: null })
        return
      }

      // 网络错误等
      const errorText = err instanceof Error ? err.message : '连接失败'
      blocks.length = 0
      blocks.push({ type: 'text', content: `**Error:** ${errorText}`, origin: { phase: 'result', placement: 'standalone' } })
      _flushMessage()
      set({ isStreaming: false, abortController: null })
    }
  },

  stopStreaming: () => {
    const { abortController, activeSessionId } = get()
    if (abortController) {
      abortController.abort()
    }
    if (activeSessionId) {
      cancelSessionRun(activeSessionId)
    }
    set({ isStreaming: false, abortController: null })
  },

  loadSessions: async () => {
    try {
      const sessions = await listSessions()
      set({ sessions })
    } catch (err) {
      console.error('[chatStore] Failed to load sessions:', err)
    }
  },

  switchSession: async (sessionId: string) => {
    set({ activeSessionId: sessionId, messages: [], tasks: [], isStreaming: false, isLoadingSession: true })
    try {
      const detail = await getSession(sessionId)
      let latestTasks = normalizeTaskList(detail.todo_list)
      // Block 协议: 后端直接返回 messages + blocks
      const serverMessages = detail.messages
      if (serverMessages && serverMessages.length > 0) {
        const messages: Message[] = serverMessages.map((msg) => ({
          id: crypto.randomUUID(),
          role: msg.role,
          content: msg.content ?? '',
          blocks: normalizeBlocks(msg.blocks),
          timestamp: new Date(),
        }))
        // 历史回放中，使用最后一个 task_list 作为任务面板状态
        for (const message of messages) {
          const b = message.blocks ?? []
          for (const block of b) {
            if (block.type === 'task_list') {
              latestTasks = [...block.tasks]
            }
          }
        }
        set({ messages, tasks: latestTasks, isLoadingSession: false })
      } else {
        set({ tasks: latestTasks, isLoadingSession: false })
      }
    } catch (err) {
      console.error('[chatStore] Failed to load session:', err)
      set({ isLoadingSession: false })
    }
  },

  createNewSession: () => {
    set({
      activeSessionId: null,
      messages: [],
      tasks: [],
      isStreaming: false,
    })
  },

  deleteSession: async (sessionId: string) => {
    try {
      await apiDeleteSession(sessionId)
      set((s) => ({
        sessions: s.sessions.filter((ses) => ses.session_id !== sessionId),
        ...(s.activeSessionId === sessionId
          ? { activeSessionId: null, messages: [], tasks: [] }
          : {}),
      }))
    } catch (err) {
      console.error('[chatStore] Failed to delete session:', err)
    }
  },

  renameSession: async (sessionId: string, name: string) => {
    try {
      await apiRenameSession(sessionId, name)
      set((s) => ({
        sessions: s.sessions.map((ses) =>
          ses.session_id === sessionId ? { ...ses, session_name: name } : ses,
        ),
      }))
    } catch (err) {
      console.error('[chatStore] Failed to rename session:', err)
    }
  },
}))
