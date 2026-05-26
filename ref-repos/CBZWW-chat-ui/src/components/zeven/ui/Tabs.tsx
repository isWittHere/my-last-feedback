import { cn } from '@/lib/cn'

export interface TabsProps {
  tabs: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
  className?: string
}

function Tabs({ tabs, value, onChange, className }: TabsProps) {
  return (
    <div className={cn('flex border-b border-[var(--border)]', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={cn(
            'flex-1 py-3 font-mono text-sm font-medium transition-colors border-b-2',
            value === tab.value
              ? 'text-[var(--text)] border-[var(--text)]'
              : 'text-[var(--text-muted)] border-transparent hover:text-[var(--text)]'
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export { Tabs }
