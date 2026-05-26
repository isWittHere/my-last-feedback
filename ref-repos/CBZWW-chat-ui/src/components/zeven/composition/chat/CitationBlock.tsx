import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CaretRight, Quotes } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'

export interface CitationSource {
  title: string
  url?: string
  snippet?: string
}

interface CitationBlockProps {
  sources: CitationSource[]
  className?: string
}

export function CitationBlock({ sources, className }: CitationBlockProps) {
  const [expanded, setExpanded] = useState(false)

  if (sources.length === 0) return null

  return (
    <div className={cn(className)}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 py-1.5 text-xs font-mono text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
      >
        <motion.span
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ duration: 0.2 }}
          className="inline-flex"
        >
          <CaretRight size={12} />
        </motion.span>
        <Quotes size={14} className="text-[var(--accent-purple)]" />
        <span className="text-[var(--accent-purple)]">
          引用来源 ({sources.length})
        </span>
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
            <div className="mt-1 border border-[var(--border)] bg-[var(--bg-secondary)] divide-y divide-[var(--border)]">
              {sources.map((source, i) => (
                <div key={i} className="px-3 py-2 flex gap-2">
                  <span className="text-[10px] font-mono text-[var(--text-dim)] mt-0.5 shrink-0">
                    [{i + 1}]
                  </span>
                  <div className="min-w-0">
                    {source.url ? (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-mono text-[var(--accent-blue)] hover:underline underline-offset-2 break-all"
                      >
                        {source.title}
                      </a>
                    ) : (
                      <span className="text-xs font-mono text-[var(--text)]">
                        {source.title}
                      </span>
                    )}
                    {source.snippet && (
                      <p className="text-[11px] text-[var(--text-dim)] mt-0.5 line-clamp-2">
                        {source.snippet}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
