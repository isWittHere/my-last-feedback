import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'
import { DotMatrix } from '../dotmatrix/DotMatrix'

export interface StatItem {
  value: string
  label: string
  icon?: number[][]
}

export interface StatGridProps {
  items: StatItem[]
  compact?: boolean
  className?: string
}

export function StatGrid({ items, compact, className }: StatGridProps) {
  return (
    <motion.div
      className={cn(
        'relative z-20 grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--border)] overflow-hidden',
        !compact && 'border-y border-[var(--border)]',
        className
      )}
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
    >
      {items.map((stat) => (
        <div
          key={stat.label}
          className={cn(
            'bg-[var(--bg-card)] text-center group min-w-0 flex flex-col items-center',
            compact ? 'p-4' : 'p-8'
          )}
        >
          {stat.icon && (
            <div className={cn('opacity-40 group-hover:opacity-70 transition-opacity', compact ? 'mb-1.5 scale-75' : 'mb-3')}>
              <DotMatrix frame={stat.icon} size="sm" />
            </div>
          )}
          <div className={cn(
            'font-mono font-normal mb-1 text-[var(--text)] group-hover:text-[var(--accent-blue)] transition-colors truncate',
            compact ? 'text-lg md:text-xl' : 'text-3xl md:text-4xl mb-2'
          )}>
            {stat.value}
          </div>
          <div className={cn(
            'text-[var(--text-muted)]',
            compact ? 'text-xs' : 'text-sm'
          )}>
            {stat.label}
          </div>
        </div>
      ))}
    </motion.div>
  )
}
