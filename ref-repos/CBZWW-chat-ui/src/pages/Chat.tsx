import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { List, X, AlignRight, DownloadSimple, Plus } from '@phosphor-icons/react'
import { ChatMessage, cn } from '@/components/zeven'
import { useChatStore } from '@/store/chatStore'

import { ChatHistoryList } from '@/components/zeven/composition/chat/ChatHistoryList'
import { ChatOutlineList } from '@/components/zeven/composition/chat/ChatOutlineList'
import { ChatStickyBar } from '@/components/zeven/composition/chat/ChatStickyBar'
import { ChatTaskPanel } from '@/components/zeven/composition/chat/ChatTaskPanel'
import { ChatInput, type ChatInputHandle } from '@/components/zeven/composition/chat/ChatInput'
import { StreamingIndicator } from '@/components/zeven/composition/chat/StreamingIndicator'
import { ExportPanel } from '@/components/zeven/composition/chat/ExportPanel'
import Logo007 from '@/assets/logo-007.svg'

export function Chat() {
  const messages = useChatStore((s) => s.messages)
  const tasks = useChatStore((s) => s.tasks)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const sessions = useChatStore((s) => s.sessions)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const isLoadingSession = useChatStore((s) => s.isLoadingSession)
  const loadSessions = useChatStore((s) => s.loadSessions)
  const switchSession = useChatStore((s) => s.switchSession)
  const createNewSession = useChatStore((s) => s.createNewSession)
  const deleteSession = useChatStore((s) => s.deleteSession)
  const renameSession = useChatStore((s) => s.renameSession)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [tasksExpanded, setTasksExpanded] = useState(false)
  const [isSettling, setIsSettling] = useState(false)
  const [streamRound, setStreamRound] = useState(0)
  const [stickyUserContent, setStickyUserContent] = useState<string | null>(null)
  const [stickyUserMsgId, setStickyUserMsgId] = useState<string | null>(null)
  const [showChatTopShadow, setShowChatTopShadow] = useState(false)
  const [showChatBottomShadow, setShowChatBottomShadow] = useState(true)
  const [showNewChatBtn, setShowNewChatBtn] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<ChatInputHandle>(null)
  const newChatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 8秒计时器已触发（按钮已重新出现，查到底部则重置） */
  const timerFiredRef = useRef(false)
  const isNearBottomRef = useRef(true)
  /** 流式期间是否保持自动跟随到底部 */
  const shouldAutoFollowRef = useRef(true)
  /** 为 true 时所有消息禁用入场动画（session 切换期间） */
  const suppressAnimRef = useRef(false)
  const prevStreamingRef = useRef(false)
  /** 滚动模式: 'none' 不滚动, 'instant' 瞬间到底, 'smooth' 平滑滚动 */
  const scrollModeRef = useRef<'none' | 'instant' | 'smooth'>('none')

  // 用 ref 持有最新 messages，避免 handleMessagesScroll 因 messages 变化而重建
  const messagesRef = useRef(messages)
  messagesRef.current = messages


  /** 判断滚动容器是否接近底部（距底 ≤ 180px） */
  const checkNearBottom = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight <= 180
  }, [])

  /** 安全地滚动到底部 */
  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  // 流式开始时锁定一次“是否自动跟随到底部”
  useEffect(() => {
    if (isStreaming) {
      shouldAutoFollowRef.current = checkNearBottom()
    }
  }, [isStreaming, checkNearBottom])

  // 消息变化时执行滚动
  useEffect(() => {
    const mode = scrollModeRef.current

    if (mode === 'instant') {
      // session 切换: 仅在真正有消息时才消费该模式
      if (messages.length === 0) return  // 空消息渲染 (switchSession 第一步), 不消费
      scrollModeRef.current = 'none'
      // requestAnimationFrame 确保 DOM 已更新
      requestAnimationFrame(() => {
        scrollToBottom()
        // 动画禁用在 scrollToBottom 之后解除，让首帧渲染完成
        suppressAnimRef.current = false
      })
      return
    }

    if (mode === 'smooth') {
      scrollModeRef.current = 'none'
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      isNearBottomRef.current = true
      return
    }

    // mode === 'none': 流式更新时，仅在底部时滚动
    if (isStreaming && shouldAutoFollowRef.current) {
      // 立即滚，然后用 MutationObserver 监听 DOM 变化
      // 当思考/工具块展开时，再次滚动以保持在底部
      requestAnimationFrame(() => {
        scrollToBottom()
      })
    }

    // 当流式进行时，持续监听 DOM 变化（块展开/闭合会改变高度）
    if (isStreaming) {
      const observer = new MutationObserver(() => {
        if (shouldAutoFollowRef.current) {
          scrollToBottom()
        }
      })
      
      const container = scrollContainerRef.current
      if (container) {
        observer.observe(container, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'data-expanded']
        })
        
        return () => observer.disconnect()
      }
    }
  }, [messages, isStreaming, scrollToBottom])

  // 页面加载时拉取会话列表
  useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  // 封装新建会话，确保每次调用都聚焦输入框
  const handleCreateNewSession = useCallback(() => {
    createNewSession()
    requestAnimationFrame(() => chatInputRef.current?.focus())
  }, [createNewSession])

  // 切换到已有空会话时也自动聚焦
  useEffect(() => {
    if (activeSessionId !== null) {
      const raf = requestAnimationFrame(() => {
        if (useChatStore.getState().messages.length === 0) {
          chatInputRef.current?.focus()
        }
      })
      return () => cancelAnimationFrame(raf)
    }
  }, [activeSessionId])

  // 流式结束后播放一次结算动画
  useEffect(() => {
    if (!prevStreamingRef.current && isStreaming) {
      setStreamRound((v) => v + 1)
    }
    if (prevStreamingRef.current && !isStreaming) {
      setIsSettling(true)
    }
    if (isStreaming) {
      setIsSettling(false)
    }
    prevStreamingRef.current = isStreaming
  }, [isStreaming])

  // Track which user message has scrolled past the top + near-bottom state + visible message for outline
  const updateChatShadows = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    setShowChatTopShadow(el.scrollTop > 0)
    setShowChatBottomShadow(el.scrollHeight - el.scrollTop - el.clientHeight > 1)
  }, [])

  // 新对话按钮可见性：底部时显示；离底部后隐藏，超过8秒再重新显示；8秒后即使继续滚动也保持显示
  const updateNewChatBtnVisibility = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20
    if (atBottom) {
      // 回到底部：重置所有状态，显示按钮
      timerFiredRef.current = false
      setShowNewChatBtn(true)
      if (newChatTimerRef.current) {
        clearTimeout(newChatTimerRef.current)
        newChatTimerRef.current = null
      }
    } else {
      // 不在底部：若8秒计时器已触发，按钮保持显示，不再重新隐藏
      if (timerFiredRef.current) return
      setShowNewChatBtn(false)
      if (!newChatTimerRef.current) {
        newChatTimerRef.current = setTimeout(() => {
          timerFiredRef.current = true
          newChatTimerRef.current = null
          setShowNewChatBtn(true)
        }, 8000)
      }
    }
  }, [])

  const handleMessagesScroll = useCallback(() => {
    updateChatShadows()
    updateNewChatBtnVisibility()
    const nearBottom = checkNearBottom()
    isNearBottomRef.current = nearBottom
    // 流式期间，用户手动滚离底部则关闭自动跟随；回到底部则恢复
    if (isStreaming) {
      shouldAutoFollowRef.current = nearBottom
    }

    const container = scrollContainerRef.current
    if (!container) return
    const containerRect = container.getBoundingClientRect()
    const userEls = container.querySelectorAll('[data-role="user"]')
    let lastContent: string | null = null
    let lastMsgId: string | null = null

    userEls.forEach((el) => {
      const rect = el.getBoundingClientRect()
      if (rect.bottom < containerRect.top + 8) {
        const msgId = el.getAttribute('data-msg-id')
        const msg = messagesRef.current.find((m) => m.id === msgId)
        if (msg) {
          lastContent = msg.content
          lastMsgId = msg.id
        }
      }
    })

    setStickyUserContent((prev) => (prev === lastContent ? prev : lastContent))
    setStickyUserMsgId((prev) => (prev === lastMsgId ? prev : lastMsgId))
  }, [checkNearBottom, isStreaming, updateChatShadows, updateNewChatBtnVisibility])

  // 消息列表变化时（加载/切换session）更新阴影
  useEffect(() => {
    const raf = requestAnimationFrame(updateChatShadows)
    return () => cancelAnimationFrame(raf)
  }, [messages, updateChatShadows])

  // 流式状态变化：开始流时隐藏按钮；结束后检查位置决定是否显示
  useEffect(() => {
    if (isStreaming) {
      timerFiredRef.current = false
      setShowNewChatBtn(false)
      if (newChatTimerRef.current) {
        clearTimeout(newChatTimerRef.current)
        newChatTimerRef.current = null
      }
    } else if (messages.length > 0) {
      // 流结束后重新评估一次
      updateNewChatBtnVisibility()
    }
    return () => {
      if (!isStreaming && newChatTimerRef.current) {
        clearTimeout(newChatTimerRef.current)
        newChatTimerRef.current = null
      }
    }
  }, [isStreaming, messages.length, updateNewChatBtnVisibility])

  const scrollToStickyMessage = useCallback(() => {
    if (!stickyUserMsgId || !scrollContainerRef.current) return
    const el = scrollContainerRef.current.querySelector(`[data-msg-id="${stickyUserMsgId}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [stickyUserMsgId])

  const handleSend = useCallback(
    (text: string) => {
      if (isStreaming) return
      scrollModeRef.current = 'smooth'
      void sendMessage(text)
    },
    [isStreaming, sendMessage],
  )

  /** 切换会话 — 禁用动画 + instant 滚动 */
  const handleSwitchSession = useCallback(
    (id: string) => {
      suppressAnimRef.current = true
      scrollModeRef.current = 'instant'
      void switchSession(id)
    },
    [switchSession],
  )

  const closeAllSidebars = useCallback(() => {
    setSidebarOpen(false)
    setRightSidebarOpen(false)
  }, [])

  const userMessageHistory = useMemo(
    () => messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .filter((t) => t.trim().length > 0),
    [messages],
  )

  const sessionTitle = useMemo(
    () => sessions.find(s => s.session_id === activeSessionId)?.session_name ?? '',
    [sessions, activeSessionId],
  )

  const recentSessions = useMemo(() => {
    return sessions
      .filter(s => s.session_id !== activeSessionId)
      .slice()
      .sort((a, b) => {
        // updated_at/created_at 是后端 Unix 秒级时间戳 (number)，直接比较
        const ta = Number(a.updated_at ?? a.created_at ?? 0) || 0
        const tb = Number(b.updated_at ?? b.created_at ?? 0) || 0
        return tb - ta
      })
      .slice(0, 4)
  }, [sessions, activeSessionId])

  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Left overlay sidebar (mobile, < 2xl) */}
      <aside
        className={cn(
          'w-64 border-r border-[var(--border)] bg-[var(--bg-secondary)] flex flex-col transition-transform duration-300',
          'fixed inset-y-0 left-0 top-14 z-40 2xl:hidden',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-end p-2">
          <button onClick={() => setSidebarOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text)]">
            <X size={16} />
          </button>
        </div>
        <ChatHistoryList
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={(id) => { handleSwitchSession(id); setSidebarOpen(false) }}
          onNewSession={() => { handleCreateNewSession(); setSidebarOpen(false) }}
          onDeleteSession={(id) => void deleteSession(id)}
          onRenameSession={(id, name) => void renameSession(id, name)}
          className="pt-0"
        />
      </aside>

      {/* Right overlay sidebar (mobile, < 2xl) */}
      <aside
        className={cn(
          'w-64 border-l border-[var(--border)] bg-[var(--bg-secondary)] flex flex-col transition-transform duration-300',
          'fixed inset-y-0 right-0 top-14 z-40 2xl:hidden',
          rightSidebarOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="flex items-center justify-end p-2">
          <button onClick={() => setRightSidebarOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text)]">
            <X size={16} />
          </button>
        </div>
        <ChatOutlineList messages={messages} isStreaming={isStreaming} scrollSelector=".chat-scroll-container" className="pt-0" />
      </aside>

      {/* Overlay backdrop */}
      <div
        className={cn(
          'fixed top-14 inset-x-0 bottom-0 z-30 bg-black/30 2xl:hidden transition-opacity duration-300',
          sidebarOpen || rightSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        onClick={closeAllSidebars}
      />

      {/* Centered layout wrapper */}
      <div className="h-full mx-auto max-w-[1024px] relative">
        {/* Desktop left sidebar (2xl+) */}
        <div className="hidden 2xl:flex flex-col absolute right-full top-3 w-64 pr-3 max-h-[calc(100vh-5rem)]">
          <aside className="w-full flex flex-col rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] overflow-hidden max-h-full">
            <ChatHistoryList
              sessions={sessions}
              activeSessionId={activeSessionId}
              onSelectSession={(id) => handleSwitchSession(id)}
              onNewSession={handleCreateNewSession}
              onDeleteSession={(id) => void deleteSession(id)}
              onRenameSession={(id, name) => void renameSession(id, name)}
            />
          </aside>
        </div>

        {/* Desktop right sidebar (2xl+) */}
        <div className="hidden 2xl:flex flex-col absolute left-full top-3 w-64 pl-3 max-h-[calc(100vh-5rem)]">
          <aside className="w-full flex flex-col rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] overflow-hidden max-h-full">
            <ChatOutlineList messages={messages} isStreaming={isStreaming} scrollSelector=".chat-scroll-container" />
          </aside>
        </div>

        {/* Main chat area */}
        <div className="h-full border-l border-r border-[var(--border)] flex flex-col relative">
          {/* Mobile toggle buttons */}
          <button
            className="2xl:hidden absolute top-1.5 left-1.5 p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-card)] transition-colors z-20"
            onClick={() => setSidebarOpen(true)}
          >
            <List size={16} />
          </button>
          <button
            className="2xl:hidden absolute top-1.5 right-1.5 p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-card)] transition-colors z-20"
            onClick={() => setRightSidebarOpen(true)}
          >
            <AlignRight size={16} />
          </button>
          {/* Export button — visible on all sizes, positioned to left of right sidebar toggle */}
          <button
            className="absolute top-1.5 p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-card)] transition-colors z-20 2xl:right-1.5 right-9"
            onClick={() => setExportOpen(true)}
            title="导出报告图片"
          >
            <DownloadSimple size={16} />
          </button>

          {/* Messages */}
          <div className="chat-scroll-container relative flex-1 overflow-y-auto" ref={scrollContainerRef} onScroll={handleMessagesScroll}>
            {/* Top fade gradient (adaptive) */}
            {showChatTopShadow && (
              <div className="sticky top-0 pointer-events-none h-8 bg-gradient-to-b from-[var(--bg)] to-transparent z-[2] -mb-8" />
            )}
            {/* Sticky bar */}
            <div className="sticky top-0 z-10 h-0">
              <ChatStickyBar content={stickyUserContent} onScrollTo={scrollToStickyMessage} />
            </div>

            <div className="mx-auto max-w-3xl px-4 py-6 space-y-6 pb-12">
              {messages.length === 0 && !isLoadingSession ? (
                <div className="flex flex-col items-center justify-center min-h-[50vh] gap-8">
                  <img
                    src={Logo007}
                    alt="007"
                    className="h-10 opacity-60"
                    style={{ filter: 'var(--logo-invert)' }}
                  />
                  {recentSessions.length > 0 ? (
                    <div className="w-full max-w-sm">
                      <div className="flex flex-col gap-0.5">
                        {recentSessions.map(s => (
                          <button
                            key={s.session_id}
                            onClick={() => handleSwitchSession(s.session_id)}
                            className="group flex items-center justify-between px-3 py-2 rounded text-left w-full hover:hatch-45 transition-colors"
                          >
                            <span className="text-sm text-[var(--text)] group-hover:text-[var(--accent-blue)] truncate transition-colors">
                              {s.session_name || '未命名对话'}
                            </span>
                            <span className="text-[10px] text-[var(--text-muted)] group-hover:text-[var(--accent-blue)] shrink-0 ml-3 font-mono transition-colors">
                              {(() => {
                                // updated_at 是 Unix 秒级时间戳 (number)，需要 *1000 转毫秒
                                const raw = Number(s.updated_at ?? s.created_at ?? 0)
                                if (!raw) return ''
                                const d = new Date(raw * 1000)
                                if (isNaN(d.getTime())) return ''
                                const pad = (n: number) => String(n).padStart(2, '0')
                                return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
                              })()}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="w-full max-w-sm text-center space-y-3">
                      <p className="text-sm text-[var(--text-muted)] font-mono">你好，我是 007</p>
                      <p className="text-xs text-[var(--text-dim)] font-mono leading-relaxed">
                        可以帮你解读财报数据、分析业绩趋势、对比行业竞争对手
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <AnimatePresence initial={false}>
                    {messages.map((msg, i) => (
                      <ChatMessage
                        key={msg.id}
                        message={msg}
                        isStreaming={isStreaming && msg.role === 'assistant' && i === messages.length - 1}
                        animated={!suppressAnimRef.current}
                      />
                    ))}
                  </AnimatePresence>

                  <div className="flex justify-start -mt-6 min-h-6 items-center">
                    <div
                      className={cn(
                        'transition-opacity duration-150',
                        isStreaming || isSettling ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'
                      )}
                      aria-hidden={!(isStreaming || isSettling)}
                    >
                      <StreamingIndicator
                        messages={messages}
                        mode={isStreaming ? 'stream' : 'settle'}
                        streamRound={streamRound}
                        onComplete={() => setIsSettling(false)}
                      />
                    </div>
                  </div>

                  <div ref={messagesEndRef} />
                </>
              )}
            </div>
          </div>

          {/* Bottom fade gradient (adaptive) */}
          {showChatBottomShadow && (
            <div className="h-8 bg-gradient-to-t from-[var(--bg)] to-transparent pointer-events-none -mt-8 relative z-[1]" />
          )}

          {/* Task panel */}
          {/* 新对话悬浮按钮：悬浮于输入框上方，不占用消息空间 */}
          <div className="h-0 relative overflow-visible z-10">
            <AnimatePresence>
              {showNewChatBtn && !isLoadingSession && messages.length > 0 && (
                <motion.div
                  key="new-chat-btn"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none"
                >
                  <button
                    onClick={handleCreateNewSession}
                    className="pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono text-[var(--text-muted)] hover:text-[var(--accent-blue)] hover:hatch-45 border border-[var(--border)] bg-[var(--bg)] shadow-sm transition-colors"
                  >
                    <Plus size={14} />
                    新对话
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <ChatTaskPanel
            tasks={tasks}
            expanded={tasksExpanded}
            onToggle={() => setTasksExpanded((v) => !v)}
          />

          {/* Input bar */}
          <ChatInput ref={chatInputRef} isLoading={isStreaming} onSend={handleSend} history={userMessageHistory} />
        </div>
      </div>

      {/* Export panel */}
      <ExportPanel
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        scrollSelector=".chat-scroll-container"
        sessionTitle={sessionTitle}
      />
    </div>
  )
}
