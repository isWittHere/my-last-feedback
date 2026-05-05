import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'
import type { BarItem, DotMatrixBarConfig } from './DotMatrixBar'

export interface DotMatrixBarVerticalProps {
  items: BarItem[]
  config?: DotMatrixBarConfig
  className?: string
  hovered?: boolean
}

const defaults: Required<DotMatrixBarConfig> = {
  dotSize: 4,
  dotGap: 2,
  rows: 10, // columns of dots per bar (horizontal thickness)
  inactiveColor: 'var(--dot-lv1)',
  activeColor: 'var(--text-dim)',
  highlightColor: 'var(--accent-blue)',
}

/** Single dot row (horizontal strip inside a vertical bar) */
function DotRow({
  active,
  highlight,
  cfg,
  flickerSet,
  rowIndex,
}: {
  active: boolean
  highlight?: boolean
  cfg: Required<DotMatrixBarConfig>
  flickerSet?: Set<string>
  rowIndex: number
}) {
  return (
    <div className="flex" style={{ gap: `${cfg.dotGap}px` }}>
      {Array.from({ length: cfg.rows }).map((_, col) => {
        const dimmed = flickerSet?.has(`${rowIndex}-${col}`) ?? false
        return (
          <div
            key={col}
            style={{
              width: cfg.dotSize,
              height: cfg.dotSize,
              background: active
                ? highlight
                  ? cfg.highlightColor
                  : cfg.activeColor
                : cfg.inactiveColor,
              opacity: active && highlight && dimmed ? 0.5 : 1,
              transition: 'opacity 0.5s ease-in-out',
            }}
          />
        )
      })}
    </div>
  )
}

export function DotMatrixBarVertical({ items, config, className, hovered }: DotMatrixBarVerticalProps) {
  const cfg = { ...defaults, ...config }
  const effectiveHighlightColor = cfg.highlightColor
  const maxBlocks = Math.max(...items.map((i) => i.maxValue))

  const [flickerSet, setFlickerSet] = useState<Set<string>>(new Set())
  const timersRef = useRef<number[]>([])

  const highlightedItem = items.find((i) => i.highlight)
  const highlightValue = highlightedItem?.value ?? 0

  useEffect(() => {
    if (!hovered || highlightValue <= 0) {
      setFlickerSet(new Set())
      timersRef.current.forEach((t) => clearTimeout(t))
      timersRef.current = []
      return
    }

    const addFlickers = () => {
      const count = 2 + Math.floor(Math.random() * 3)
      for (let i = 0; i < count; i++) {
        const row = Math.floor(Math.random() * highlightValue)
        const col = Math.floor(Math.random() * cfg.rows)
        const key = `${row}-${col}`

        setFlickerSet((prev) => new Set([...prev, key]))

        const restoreDelay = 600 + Math.random() * 1400
        const tid = window.setTimeout(() => {
          setFlickerSet((prev) => {
            const next = new Set(prev)
            next.delete(key)
            return next
          })
        }, restoreDelay)
        timersRef.current.push(tid)
      }
    }

    addFlickers()
    const intervalId = setInterval(addFlickers, 800)

    return () => {
      clearInterval(intervalId)
      timersRef.current.forEach((t) => clearTimeout(t))
      timersRef.current = []
    }
  }, [hovered, highlightValue, cfg.rows])

  return (
    <div className={cn('flex items-end justify-between gap-4', className)}>
      {items.map((item) => (
        <div key={item.label} className="flex flex-col items-center gap-2 flex-1 min-w-0">
          {/* Value label on top */}
          <span
            className={cn(
              'font-mono text-xs',
              item.highlight ? 'text-[var(--text)] font-medium' : 'text-[var(--text-muted)]'
            )}
          >
            {item.displayLabel ?? `${item.value}`}
          </span>

          {/* Vertical dot bar (bottom-up) */}
          <div
            className="flex flex-col-reverse"
            style={{ gap: `${cfg.dotGap}px` }}
          >
            {Array.from({ length: maxBlocks }).map((_, i) => (
              <DotRow
                key={i}
                active={i < item.value}
                highlight={item.highlight}
                cfg={{ ...cfg, highlightColor: effectiveHighlightColor }}
                flickerSet={item.highlight ? flickerSet : undefined}
                rowIndex={i}
              />
            ))}
          </div>

          {/* Label at bottom */}
          <span
            className={cn(
              'font-mono text-xs truncate max-w-full',
              item.highlight ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'
            )}
          >
            {item.label}
          </span>
        </div>
      ))}
    </div>
  )
}
