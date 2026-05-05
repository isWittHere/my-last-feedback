import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CaretRight, Lightbulb } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'

interface ThinkingBlockProps {
  content: string
  /** 为 true 时自动展开；从 true 变为 false 时自动折叠 */
  isStreaming?: boolean
  className?: string
}

export function ThinkingBlock({ content, className, isStreaming }: ThinkingBlockProps) {
  // 流式时自动展开；流式结束变 false 时自动折叠
  const [expanded, setExpanded] = useState(isStreaming === true)

  useEffect(() => {
    if (isStreaming === true) {
      setExpanded(true)
    } else if (isStreaming === false) {
      setExpanded(false)
    }
  }, [isStreaming])

  return (
    <div className={cn(className)}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="group flex items-center gap-2 py-1.5 text-xs font-mono text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
      >
        <motion.span
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ duration: 0.2 }}
          className="inline-flex"
        >
          <CaretRight size={12} />
        </motion.span>
        <Lightbulb size={14} className="text-[var(--text-muted)] group-hover:text-[var(--text)] transition-colors" />
        <span>思考过程</span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-1 border-l-2 border-[var(--accent-blue)] bg-[var(--bg-secondary)] px-3 py-2 text-xs font-mono leading-relaxed text-[var(--text-dim)] whitespace-pre-wrap">
              {content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
