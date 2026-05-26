import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, Circle, Spinner, CaretRight } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'

export interface ChatTask {
  title: string
  status: 'not-started' | 'in-progress' | 'completed'
}

interface ChatTaskPanelProps {
  tasks: ChatTask[]
  expanded: boolean
  onToggle: () => void
}

export function ChatTaskPanel({ tasks, expanded, onToggle }: ChatTaskPanelProps) {
  if (tasks.length === 0) return null

  const completedCount = tasks.filter((t) => t.status === 'completed').length
  const inProgressTask = tasks.find((t) => t.status === 'in-progress')

  return (
    <div className="px-4">
      <div className="mx-auto max-w-3xl">
        <button
          onClick={onToggle}
          className="flex items-center gap-2 py-1.5 text-xs font-mono text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          <motion.span
            animate={{ rotate: expanded ? 90 : 0 }}
            transition={{ duration: 0.2 }}
            className="inline-flex"
          >
            <CaretRight size={12} />
          </motion.span>
          <span>
            待办事项({completedCount}/{tasks.length})
          </span>
          {!expanded && inProgressTask && (
            <span className="max-w-[18rem] truncate text-[var(--text-muted)]">
              · {inProgressTask.title}
            </span>
          )}
        </button>
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="space-y-0.5 pb-2">
                {tasks.map((task, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 py-0.5 px-1 text-sm font-mono"
                  >
                    {task.status === 'completed' && (
                      <CheckCircle
                        size={16}
                        weight="fill"
                        className="text-[var(--text-dim)] shrink-0"
                      />
                    )}
                    {task.status === 'in-progress' && (
                      <Spinner
                        size={16}
                        className="text-[var(--accent-blue)] shrink-0 animate-spin [animation-duration:7s]"
                      />
                    )}
                    {task.status === 'not-started' && (
                      <Circle
                        size={16}
                        className="text-[var(--text-muted)] shrink-0"
                      />
                    )}
                    <span
                      className={cn(
                        'text-sm',
                        task.status === 'completed'
                            ? 'text-[var(--text-dim)]'
                          : task.status === 'in-progress'
                            ? 'text-[var(--accent-blue)]'
                            : 'text-[var(--text-muted)]',
                      )}
                    >
                      {task.title}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
