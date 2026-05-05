import { cn } from '@/lib/cn'

type IconName = 'thinking' | 'tool' | 'chart' | 'card' | 'citation'

const ICON_PATTERNS: Record<IconName, number[][]> = {
  thinking: [
    [0, 4, 4, 4, 0],
    [4, 0, 4, 0, 4],
    [0, 4, 4, 4, 0],
    [0, 0, 4, 0, 0],
    [0, 0, 4, 0, 0],
  ],
  tool: [
    [0, 4, 0, 4, 0],
    [0, 4, 0, 4, 0],
    [0, 4, 4, 4, 0],
    [0, 0, 4, 0, 0],
    [0, 0, 4, 0, 0],
  ],
  chart: [
    [0, 0, 0, 0, 4],
    [0, 0, 0, 4, 4],
    [0, 0, 4, 4, 4],
    [0, 4, 4, 4, 4],
    [4, 4, 4, 4, 4],
  ],
  card: [
    [4, 4, 4, 4, 4],
    [4, 0, 0, 0, 4],
    [4, 4, 4, 4, 4],
    [4, 0, 4, 0, 4],
    [4, 4, 4, 4, 4],
  ],
  citation: [
    [4, 4, 4, 4, 4],
    [4, 0, 0, 0, 4],
    [4, 4, 4, 4, 4],
    [4, 0, 0, 0, 4],
    [4, 4, 4, 4, 4],
  ],
}

interface DotIconProps {
  icon: IconName
  color?: string
  className?: string
}

export function DotIcon({ icon, color, className }: DotIconProps) {
  const pattern = ICON_PATTERNS[icon]
  // Match CbzwwAnimatedLogo canvas metrics: DISPLAY=24, G=7, CELL=24/7≈3.43, DOT=CELL*0.55≈1.89
  const cellSize = 24 / 7  // ≈3.43px per cell (same as logo)
  const dotSize = cellSize * 0.55  // ≈1.89px dot (same as logo)
  const gridSize = cellSize * 5

  return (
    <div
      className={cn('inline-block shrink-0', className)}
      style={{
        width: gridSize,
        height: gridSize,
        position: 'relative',
      }}
    >
      {pattern.flatMap((row, r) =>
        row.map((level, c) => (
          <div
            key={`${r}-${c}`}
            style={{
              position: 'absolute',
              left: c * cellSize + (cellSize - dotSize) / 2,
              top: r * cellSize + (cellSize - dotSize) / 2,
              width: dotSize,
              height: dotSize,
              borderRadius: '36%',
              background: level > 0
                ? (color ?? 'var(--dot-lv4)')
                : 'transparent',
              opacity: level > 0 ? level / 4 : 0,
            }}
          />
        ))
      )}
    </div>
  )
}

export type { IconName as DotIconName }
