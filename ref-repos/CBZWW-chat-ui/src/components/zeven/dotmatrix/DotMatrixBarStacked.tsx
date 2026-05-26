import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'

export interface StackedSegment {
  label: string
  value: number
  color: string
}

export interface StackedBarItem {
  label: string
  segments: StackedSegment[]
  displayLabel?: string
  highlight?: boolean
}

export interface DotMatrixBarStackedConfig {
  dotSize?: number
  dotGap?: number
  rows?: number
  inactiveColor?: string
}

export interface DotMatrixBarStackedProps {
  items: StackedBarItem[]
  maxValue: number
  config?: DotMatrixBarStackedConfig
  className?: string
  hovered?: boolean
  legend?: boolean
}

const defaults: Required<DotMatrixBarStackedConfig> = {
  dotSize: 4,
  dotGap: 2,
  rows: 3,
  inactiveColor: 'var(--dot-lv1)',
}

/** Single dot column with color determined by segment */
function DotColumn({
  color,
  cfg,
  flickerSet,
  colIndex,
}: {
  color: string
  cfg: Required<DotMatrixBarStackedConfig>
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
              background: color,
              opacity: dimmed ? 0.5 : 1,
              transition: 'opacity 0.5s ease-in-out',
            }}
          />
        )
      })}
    </div>
  )
}

export function DotMatrixBarStacked({ items, maxValue, config, className, hovered, legend = true }: DotMatrixBarStackedProps) {
  const cfg = { ...defaults, ...config }

  const [flickerSet, setFlickerSet] = useState<Set<string>>(new Set())
  const timersRef = useRef<number[]>([])

  const highlightedItem = items.find((i) => i.highlight)
  const highlightTotal = highlightedItem
    ? highlightedItem.segments.reduce((s, seg) => s + seg.value, 0)
    : 0

  useEffect(() => {
    if (!hovered || highlightTotal <= 0) {
      setFlickerSet(new Set())
      timersRef.current.forEach((t) => clearTimeout(t))
      timersRef.current = []
      return
    }

    const addFlickers = () => {
      const count = 2 + Math.floor(Math.random() * 3)
      for (let i = 0; i < count; i++) {
        const col = Math.floor(Math.random() * highlightTotal)
        const row = Math.floor(Math.random() * cfg.rows)
        const key = `${col}-${row}`
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
  }, [hovered, highlightTotal, cfg.rows])

  /** Build color array for each column index */
  function buildColorMap(item: StackedBarItem): string[] {
    const colors: string[] = []
    for (const seg of item.segments) {
      for (let i = 0; i < seg.value; i++) {
        colors.push(seg.color)
      }
    }
    return colors
  }

  // Collect unique segments for legend
  const legendItems = items[0]?.segments.map((s) => ({ label: s.label, color: s.color })) ?? []

  return (
    <div className={cn('flex flex-col gap-4 overflow-hidden', className)}>
      {items.map((item) => {
        const colorMap = buildColorMap(item)
        const totalUsed = colorMap.length

        return (
          <div key={item.label} className="flex items-center gap-2 min-w-0">
            <span
              className={cn(
                'font-mono text-xs w-10 md:w-14 text-left shrink-0',
                item.highlight ? 'text-[var(--accent-blue)]' : 'text-[var(--text-muted)]'
              )}
            >
              {item.label}
            </span>

            <div className="flex flex-1 min-w-0 overflow-x-auto scrollbar-hide" style={{ gap: `${cfg.dotGap}px` }}>
              {Array.from({ length: maxValue }).map((_, i) => {
                const color = i < totalUsed
                  ? (colorMap[i] ?? cfg.inactiveColor)
                  : cfg.inactiveColor
                return (
                  <DotColumn
                    key={i}
                    color={color}
                    cfg={cfg}
                    flickerSet={item.highlight ? flickerSet : undefined}
                    colIndex={i}
                  />
                )
              })}
            </div>

            <span
              className={cn(
                'font-mono text-xs md:text-sm w-10 md:w-14 shrink-0 text-right',
                item.highlight ? 'text-[var(--accent-blue)]' : 'text-[var(--text-muted)]'
              )}
            >
              {item.displayLabel}
            </span>
          </div>
        )
      })}

      {legend && legendItems.length > 0 && (
        <div className="flex items-center gap-4 mt-1">
          {legendItems.map((l) => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div
                style={{ width: cfg.dotSize + 2, height: cfg.dotSize + 2, background: l.color }}
              />
              <span className="font-mono text-xs text-[var(--text-muted)]">{l.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
