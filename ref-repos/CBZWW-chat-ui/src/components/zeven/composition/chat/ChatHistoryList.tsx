import { useState } from 'react'
import { Plus, TrashSimple, PencilSimple, Check, XCircle } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'
import type { ZevenSession } from '@/lib/sseClient'
import type { HistoryItem } from '@/data/chatMocks'

interface ChatHistoryListProps {
  /** Real session data from API (preferred) */
  sessions?: ZevenSession[]
  /** Fallback mock history */
  history?: HistoryItem[]
  activeSessionId?: string | null
  onSelectSession?: (sessionId: string) => void
  onNewSession?: () => void
  onDeleteSession?: (sessionId: string) => void
  onRenameSession?: (sessionId: string, name: string) => void
  className?: string
}

export function ChatHistoryList({
  sessions,
  history,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRenameSession,
  className,
}: ChatHistoryListProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  // Prefer real sessions, fallback to mock history
  const items = sessions
    ? sessions.map((s) => ({ id: s.session_id, title: s.session_name || s.session_id.slice(0, 8) }))
    : (history ?? [])

  const startRename = (id: string, currentTitle: string) => {
    setEditingId(id)
    setEditValue(currentTitle)
  }

  const confirmRename = () => {
    if (editingId && editValue.trim()) {
      onRenameSession?.(editingId, editValue.trim())
    }
    setEditingId(null)
  }

  const cancelRename = () => {
    setEditingId(null)
  }

  return (
    <>
      <div className={cn('flex-1 overflow-y-auto p-2 space-y-0.5', className)}>
        {items.length === 0 && (
          <p className="px-3 py-4 text-xs text-[var(--text-dim)] font-mono text-center">
            暂无对话记录
          </p>
        )}
        {items.map((item) => {
          const isEditing = editingId === item.id
          const isActive = activeSessionId === item.id

          if (isEditing) {
            return (
              <div key={item.id} className="flex items-center gap-1 px-2 py-1">
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmRename()
                    if (e.key === 'Escape') cancelRename()
                  }}
                  className="flex-1 min-w-0 bg-[var(--bg)] border border-[var(--border)] px-2 py-1 text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent-blue)]"
                />
                <button onClick={confirmRename} className="p-1 text-[var(--accent-blue)] hover:bg-[var(--bg-card)]">
                  <Check size={12} />
                </button>
                <button onClick={cancelRename} className="p-1 text-[var(--text-dim)] hover:bg-[var(--bg-card)]">
                  <XCircle size={12} />
                </button>
              </div>
            )
          }

          return (
            <div
              key={item.id}
              className={cn(
                'group flex items-center gap-1 rounded transition-colors',
                isActive ? 'hatch-45' : 'hover:bg-[var(--bg-card)]'
              )}
            >
              <button
                onClick={() => onSelectSession?.(item.id)}
                className={cn(
                  'flex-1 min-w-0 text-left px-3 py-2 text-xs font-mono truncate transition-colors',
                  isActive ? 'text-[var(--accent-blue)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                )}
              >
                {item.title}
              </button>
              <div className="flex-shrink-0 flex items-center opacity-0 group-hover:opacity-100 transition-opacity pr-1">
                <button
                  onClick={(e) => { e.stopPropagation(); startRename(item.id, item.title) }}
                  className="p-1 text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"
                  title="重命名"
                >
                  <PencilSimple size={12} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteSession?.(item.id) }}
                  className="p-1 text-[var(--text-dim)] hover:text-red-500 transition-colors"
                  title="删除"
                >
                  <TrashSimple size={12} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex-shrink-0 border-t border-[var(--border)] p-2">
        <button
          type="button"
          onClick={onNewSession}
          className="w-full flex items-center gap-2 px-3 py-2 rounded text-xs font-mono text-[var(--text-muted)] hover:text-[var(--accent-blue)] hover:hatch-45 transition-colors"
        >
          <Plus size={14} />
          新建对话
        </button>
      </div>
    </>
  )
}
