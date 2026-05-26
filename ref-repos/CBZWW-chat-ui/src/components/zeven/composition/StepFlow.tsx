import { cn } from '@/lib/cn'

export interface StepFlowItem {
  title: string
  description: string
  tag?: string
}

export interface StepFlowProps {
  items: StepFlowItem[]
  className?: string
}

export function StepFlow({ items, className }: StepFlowProps) {
  return (
    <div className={cn('w-full', className)}>
      {/* ── Progress bar ── */}
      <div className="relative flex items-center mb-8">
        {/* Connecting line */}
        <div className="absolute top-1/2 left-0 right-0 h-px bg-[var(--border)] -translate-y-1/2" />
        {/* Hatched fill overlay — left to right */}
        <div className="absolute top-1/2 left-0 right-0 h-2 -translate-y-1/2 hatch-45 opacity-20" />

        {items.map((_, index) => (
          <div
            key={index}
            className="relative flex-1 flex justify-center"
          >
            <div className="w-8 h-8 border border-[var(--border)] bg-[var(--bg)] flex items-center justify-center font-mono text-xs font-bold text-[var(--text)] z-10">
              {String(index + 1).padStart(2, '0')}
            </div>
          </div>
        ))}
      </div>

      {/* ── Step details ── */}
      <div className="grid gap-0" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
        {items.map((step, index) => (
          <div
            key={index}
            className={cn(
              'px-3 text-center',
              index < items.length - 1 && 'border-r border-[var(--border)]',
            )}
          >
            <p className="font-mono text-sm font-semibold text-[var(--text)] mb-1.5">
              {step.title}
            </p>
            <p className="text-xs text-[var(--text-dim)] leading-relaxed">
              {step.description}
            </p>
            {step.tag && (
              <span className="inline-block mt-2 px-2 py-0.5 text-[10px] font-mono border border-[var(--accent-blue)] text-[var(--accent-blue)]">
                {step.tag}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
