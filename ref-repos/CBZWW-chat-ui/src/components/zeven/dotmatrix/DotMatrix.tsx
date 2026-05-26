import { useEffect, useRef, useState, useCallback } from 'react'
import { cn } from '@/lib/cn'
import { LOGO, HIDDEN_INDICES, type AnimationPreset, allPresets } from './presets'

export type DotMatrixSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const sizeMap: Record<DotMatrixSize, { cell: number; gap: number; inset: number }> = {
  xs: { cell: 3, gap: 0.5, inset: 0.5 },
  sm: { cell: 4, gap: 1.5, inset: 0.5 },
  md: { cell: 5, gap: 2, inset: 1 },
  lg: { cell: 8, gap: 3, inset: 1 },
  xl: { cell: 12, gap: 4, inset: 1.5 },
}

interface DotMatrixProps {
  /** Animation preset name or custom preset */
  animation?: string | AnimationPreset
  /** Size variant */
  size?: DotMatrixSize
  /** Static frame (if no animation) — defaults to LOGO */
  frame?: number[][]
  /** Whether to play the animation */
  playing?: boolean
  /** Loop the animation */
  loop?: boolean
  /** Interval between frames in ms */
  interval?: number
  /** Custom class name */
  className?: string
  /** Color scheme — monochrome uses CSS variables */
  colorScheme?: 'monochrome' | 'accent'
  /** 非循环动画播放完成回调 */
  onComplete?: () => void
}

export function DotMatrix({
  animation,
  size = 'md',
  frame: staticFrame,
  playing = true,
  loop = true,
  interval: customInterval,
  className,
  colorScheme = 'monochrome',
  onComplete,
}: DotMatrixProps) {
  const [currentFrame, setCurrentFrame] = useState<number[][]>(
    staticFrame ?? LOGO
  )
  const generatorRef = useRef<Generator<number[][], void, unknown> | null>(null)
  const timerRef = useRef<number | null>(null)
  const onCompleteRef = useRef<(() => void) | undefined>(onComplete)

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  const getPreset = useCallback((): AnimationPreset | null => {
    if (!animation) return null
    if (typeof animation === 'string') return allPresets[animation] ?? null
    return animation
  }, [animation])

  useEffect(() => {
    if (!animation || !playing) {
      if (staticFrame) setCurrentFrame(staticFrame)
      return
    }

    const preset = getPreset()
    if (!preset) return

    const frameInterval = customInterval ?? preset.interval ?? 80

    const startAnimation = () => {
      generatorRef.current = preset.gen()

      const tick = () => {
        const gen = generatorRef.current
        if (!gen) return

        const result = gen.next()
        if (result.done) {
          if (loop) {
            generatorRef.current = preset.gen()
            timerRef.current = window.setTimeout(tick, frameInterval)
          } else {
            onCompleteRef.current?.()
          }
          return
        }
        setCurrentFrame(result.value)
        timerRef.current = window.setTimeout(tick, frameInterval)
      }

      tick()
    }

    startAnimation()

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      generatorRef.current = null
    }
  }, [animation, playing, loop, customInterval, getPreset, staticFrame])

  const { cell, gap, inset } = sizeMap[size]
  const gridSize = cell * 7 + gap * 6

  const getLevelColor = (level: number): string => {
    if (colorScheme === 'accent') {
      switch (level) {
        case 1: return 'rgba(100, 193, 182, 0.1)'
        case 2: return 'rgba(100, 193, 182, 0.25)'
        case 3: return 'rgba(100, 193, 182, 0.5)'
        case 4: return 'rgba(100, 193, 182, 0.85)'
        default: return 'transparent'
      }
    }
    switch (level) {
      case 1: return 'var(--dot-lv1)'
      case 2: return 'var(--dot-lv2)'
      case 3: return 'var(--dot-lv3)'
      case 4: return 'var(--dot-lv4)'
      default: return 'transparent'
    }
  }

  const dots: React.ReactNode[] = []
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      const idx = r * 7 + c
      const isHidden = HIDDEN_INDICES.has(idx)
      const level = currentFrame[r]?.[c] ?? 0
      const dotSize = cell - inset * 2

      dots.push(
        <div
          key={idx}
          style={{
            width: dotSize,
            height: dotSize,
            margin: inset,
            borderRadius: '36%',
            background: isHidden ? 'transparent' : getLevelColor(level),
            visibility: isHidden ? 'hidden' : 'visible',
            transition: 'background 0.08s ease',
          }}
        />
      )
    }
  }

  return (
    <div
      className={cn('inline-block', className)}
      style={{
        display: 'inline-grid',
        gridTemplateColumns: `repeat(7, ${cell}px)`,
        gridAutoRows: `${cell}px`,
        gap: `${gap}px`,
        width: gridSize,
        height: gridSize,
      }}
    >
      {dots}
    </div>
  )
}
