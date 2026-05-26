import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'

export interface BarItem {
  label: string
  value: number
  maxValue: number
  displayLabel?: string
  highlight?: boolean
}

export interface DotMatrixBarConfig {
  /** Width of each dot in px */
  dotSize?: number
  /** Gap between dots in px */
  dotGap?: number
  /** Number of dot rows per bar */
  rows?: number
  /** Color of unfilled dots */
  inactiveColor?: string
  /** Color of active dots */
  activeColor?: string
  /** Color of highlighted active dots */
  highlightColor?: string
}

export interface DotMatrixBarProps {
  items: BarItem[]
  config?: DotMatrixBarConfig
  className?: string
  /** When true, highlighted bar dots randomly flicker like stars */
  hovered?: boolean
}

const defaults: Required<DotMatrixBarConfig> = {
  dotSize: 4,
  dotGap: 2,
  rows: 3,
  inactiveColor: 'var(--dot-lv1)',
  activeColor: 'var(--text-dim)',
  highlightColor: 'var(--accent-blue)',
}

/** Single dot column (multiple rows stacked vertically) */
function DotColumn({
  active,
  highlight,
  cfg,
  flickerSet,
  colIndex,
}: {
  active: boolean
  highlight?: boolean
  cfg: Required<DotMatrixBarConfig>
  flickerSet?: Set<string>
  colIndex: number
}) {
  return (
    <div className="flex flex-col" style={{ gap: `${cfg.dotGap}px` }}>
      {Array.from({ length: cfg.rows }).map((_, row) => {
        const dimmed = flickerSet?.has(`${colIndex}-${row}`) ?? false
        return (
          <div
            key={row}
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

/**
 * Dot matrix bar chart: horizontal bars made of small dot columns.
 * Each bar has `maxValue` columns × `rows` dots. First `value` columns are active.
 */
export function DotMatrixBar({ items, config, className, hovered }: DotMatrixBarProps) {
  const cfg = { ...defaults, ...config }
  const effectiveHighlightColor = cfg.highlightColor
  const maxBlocks = Math.max(...items.map((i) => i.maxValue))

  // Random flicker: each dot dims for a random duration, creating organic asynchronous twinkling
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
        const col = Math.floor(Math.random() * highlightValue)
        const row = Math.floor(Math.random() * cfg.rows)
        const key = `${col}-${row}`

        // Dim this dot
        setFlickerSet((prev) => new Set([...prev, key]))

        // Restore after random duration (600~2000ms)
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
    <div className={cn('flex flex-col gap-6 overflow-hidden', className)}>
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-center gap-2 min-w-0"
        >
          {/* Label */}
          <span
            className={cn(
              'font-mono text-xs w-10 md:w-14 text-left shrink-0',
              item.highlight ? 'text-[var(--text)] font-medium' : 'text-[var(--text-muted)]'
            )}
          >
            {item.label}
          </span>

          {/* Dot bar */}
          <div className="flex flex-1 min-w-0 overflow-x-auto scrollbar-hide" style={{ gap: `${cfg.dotGap}px` }}>
            {Array.from({ length: maxBlocks }).map((_, i) => (
              <DotColumn
                key={i}
                active={i < item.value}
                highlight={item.highlight}
                cfg={{ ...cfg, highlightColor: effectiveHighlightColor }}
                flickerSet={item.highlight ? flickerSet : undefined}
                colIndex={i}
              />
            ))}
          </div>

          {/* Value label */}
          <span
            className={cn(
              'font-mono text-xs md:text-sm w-10 md:w-14 shrink-0 text-right',
              item.highlight ? 'text-[var(--text)] font-medium' : 'text-[var(--text-muted)]'
            )}
          >
            {item.displayLabel ?? `${item.value}x`}
          </span>
        </div>
      ))}
    </div>
  )
}
