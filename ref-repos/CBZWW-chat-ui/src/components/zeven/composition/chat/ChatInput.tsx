import { useState, useRef, useCallback, useImperativeHandle, forwardRef, type FormEvent, type KeyboardEvent } from 'react'
import { PaperPlaneRight, PaperclipHorizontal, Plus, Brain } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'
import { MODELS, type Model } from '@/constants/models'
import { useChatStore } from '@/store/chatStore'
import { ModelPicker } from './ModelPicker'

export interface ChatInputHandle {
  focus: () => void
}

interface ChatInputProps {
  isLoading: boolean
  onSend: (text: string) => void
  history?: string[]
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput({ isLoading, onSend, history = [] }, ref) {
  const [input, setInput] = useState('')
  const selectedModelId = useChatStore((s) => s.selectedModelId)
  const showThinking = useChatStore((s) => s.showThinking)
  const setSelectedModelId = useChatStore((s) => s.setSelectedModelId)
  const setShowThinking = useChatStore((s) => s.setShowThinking)
  const selectedModel = MODELS.find((m) => m.id === selectedModelId) ?? MODELS[0]!
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)
  const [draftBeforeHistory, setDraftBeforeHistory] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
  }))

  const autoResize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      const plainArrow = !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey
      const singleLineMode = !input.includes('\n')
      const canUseHistory = plainArrow && (singleLineMode || historyIndex !== null)

      if (e.key === 'ArrowUp') {
        if (canUseHistory && history.length > 0) {
          e.preventDefault()
          if (historyIndex === null) {
            setDraftBeforeHistory(input)
            const nextIdx = history.length - 1
            setHistoryIndex(nextIdx)
            setInput(history[nextIdx] ?? '')
          } else {
            const nextIdx = Math.max(0, historyIndex - 1)
            setHistoryIndex(nextIdx)
            setInput(history[nextIdx] ?? '')
          }
          requestAnimationFrame(() => {
            autoResize()
            const ta = textareaRef.current
            if (ta) {
              const pos = ta.value.length
              ta.setSelectionRange(pos, pos)
            }
          })
          return
        }
      }

      if (e.key === 'ArrowDown') {
        if (canUseHistory && historyIndex !== null) {
          e.preventDefault()
          if (historyIndex < history.length - 1) {
            const nextIdx = historyIndex + 1
            setHistoryIndex(nextIdx)
            setInput(history[nextIdx] ?? '')
          } else {
            setHistoryIndex(null)
            setInput(draftBeforeHistory)
          }
          requestAnimationFrame(() => {
            autoResize()
            const ta = textareaRef.current
            if (ta) {
              const pos = ta.value.length
              ta.setSelectionRange(pos, pos)
            }
          })
          return
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        const form = e.currentTarget.closest('form')
        form?.requestSubmit()
      }
    },
    [history, historyIndex, input, draftBeforeHistory, autoResize],
  )

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    onSend(input.trim())
    setInput('')
    setHistoryIndex(null)
    setDraftBeforeHistory('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  return (
    <div className="px-4 pb-4">
      <div className="mx-auto max-w-3xl">
        <form
          onSubmit={handleSubmit}
          onClick={(e) => {
            const target = e.target as HTMLElement
            if (!target.closest('button, select, [role="button"], .model-picker')) {
              textareaRef.current?.focus()
            }
          }}
          className={cn(
            'relative border border-[var(--border)] rounded-lg bg-[var(--bg-secondary)] flex flex-col transition-colors',
            'focus-within:border-[var(--accent-blue)]',
          )}
        >
          {isLoading && (
            <div className="absolute inset-0 z-10 hatch-45 opacity-30 rounded-lg pointer-events-none" />
          )}
          <div className="px-3 pt-3 pb-1">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                if (historyIndex !== null) {
                  setHistoryIndex(null)
                }
                autoResize()
              }}
              onKeyDown={handleKeyDown}
              placeholder="描述你的问题..."
              rows={1}
              className="w-full bg-transparent text-sm font-mono text-[var(--text)] placeholder:text-[var(--text-dim)] resize-none focus:outline-none disabled:opacity-50 leading-relaxed min-h-[24px] max-h-[200px] overflow-y-auto"
            />
          </div>

          <div className="flex items-center justify-between px-3 py-1.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="p-1.5 rounded text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--bg-card)] transition-colors"
                title="添加附件"
              >
                <PaperclipHorizontal size={16} />
              </button>
              <button
                type="button"
                className="p-1.5 rounded text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--bg-card)] transition-colors"
                title="更多选项"
              >
                <Plus size={16} />
              </button>
              <ModelPicker
                selectedModel={selectedModel}
                onSelect={(m: Model) => setSelectedModelId(m.id)}
              />
              <button
                type="button"
                onClick={() => setShowThinking(!showThinking)}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded text-xs font-mono transition-colors',
                  showThinking
                    ? 'text-[var(--accent-blue)] bg-[var(--bg-card)]'
                    : 'text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--bg-card)]',
                )}
                title={showThinking ? '思考过程: 显示' : '思考过程: 隐藏'}
              >
                <Brain size={14} weight={showThinking ? 'fill' : 'regular'} />
                <span className="hidden sm:inline">思考</span>
              </button>
            </div>

            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className={cn(
                'p-1.5 rounded transition-colors',
                input.trim() && !isLoading
                  ? 'text-[var(--accent-blue)] hover:bg-[var(--bg-card)]'
                  : 'text-[var(--text-dim)] opacity-40 cursor-not-allowed',
              )}
            >
              <PaperPlaneRight size={16} />
            </button>
          </div>
        </form>
      </div>
    </div>
  )
})
