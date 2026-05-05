import { useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/cn'

interface HatchHeroProps {
  className?: string
  /** Scale factor for blob sizes (default 1.0) */
  blobScale?: number
  /** Animation speed multiplier (default 1.0) */
  speed?: number
  /** Spacing between hatching lines in px (default 5) */
  lineSpacing?: number
  /** Line opacity 0-1 (default 0.22) */
  lineAlpha?: number
  /** Override all blob shapes (default 'mixed' uses each blob's defined shape) */
  shape?: 'square' | 'diamond' | 'circle' | 'hexagon' | 'mixed'
  /** Whether the animation loop is running (default true). Set false to pause and save CPU. */
  active?: boolean
}

/* ─── Metaball blob definition ─────────────────────────── */
type BlobShape = 'square' | 'diamond' | 'circle' | 'hexagon'

interface Blob {
  cx: number; cy: number; r: number
  vx: number; vy: number; phase: number
  angle: number // preferred hatch angle: 0, 45, 90, 135
  shape: BlobShape // distance metric
}

const BLOBS: Blob[] = [
  { cx: 0.2,  cy: 0.3,  r: 0.28, vx: 0.25,  vy: 0.15, phase: 0,   angle: 45,  shape: 'square'  },
  { cx: 0.72, cy: 0.35, r: 0.26, vx: -0.2,  vy: 0.3,  phase: 1.5, angle: 135, shape: 'diamond' },
  { cx: 0.5,  cy: 0.55, r: 0.30, vx: 0.15,  vy: -0.25, phase: 3,  angle: 0,   shape: 'square'  },
  { cx: 0.12, cy: 0.65, r: 0.24, vx: 0.3,   vy: 0.1,  phase: 4.2, angle: 90,  shape: 'diamond' },
  { cx: 0.82, cy: 0.2,  r: 0.22, vx: -0.15, vy: 0.2,  phase: 2.1, angle: 45,  shape: 'square'  },
  { cx: 0.4,  cy: 0.15, r: 0.25, vx: 0.1,   vy: 0.25, phase: 5,   angle: 135, shape: 'diamond' },
  { cx: 0.6,  cy: 0.75, r: 0.23, vx: -0.2,  vy: -0.15, phase: 0.8, angle: 0,  shape: 'square'  },
]

/** Distance function for each blob shape */
function blobDistance(dx: number, dy: number, shape: BlobShape): number {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  switch (shape) {
    case 'square':   return Math.max(ax, ay)                    // Chebyshev (L∞)
    case 'diamond':  return ax + ay                             // Manhattan (L1)
    case 'circle':   return Math.sqrt(dx * dx + dy * dy)        // Euclidean (L2)
    case 'hexagon': {
      // Flat-top hex: max of 3 axes at 60° intervals
      const c = 0.866025  // cos(30°) = √3/2
      const s = 0.5       // sin(30°)
      return Math.max(ax, Math.abs(dx * c + dy * s), Math.abs(-dx * s + dy * c))
    }
  }
}

const GRID_RES = 8       // field sampling resolution (px)
const LINE_SPACING = 7   // spacing between parallel lines (px)
const THRESHOLD = 0.15   // field threshold (squared falloff, lower than 1/r²)
const LINE_ALPHA = 0.22
const LINE_WIDTH = 0.7
const FRAME_INTERVAL = 33 // ms between frames (~30fps)

const ANGLES = [0, 45, 90, 135]

/**
 * Fluid hatching hero — cyber-style metaball field with square/diamond shapes
 * rendered with continuous directional hatching lines (0°, 45°, 90°, 135°).
 * Lines are continuous inside, with gaps at edges.
 */
export function HatchHero({ className, blobScale = 1, speed = 1, lineSpacing: lineSpacingProp, lineAlpha: lineAlphaProp, shape = 'mixed', active = true }: HatchHeroProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const propsRef = useRef({ blobScale, speed, lineSpacing: lineSpacingProp ?? LINE_SPACING, lineAlpha: lineAlphaProp ?? LINE_ALPHA, shape })
  propsRef.current = { blobScale, speed, lineSpacing: lineSpacingProp ?? LINE_SPACING, lineAlpha: lineAlphaProp ?? LINE_ALPHA, shape }

  const draw = useCallback((ctx: CanvasRenderingContext2D, t: number) => {
    const dpr = window.devicePixelRatio || 1
    const cw = ctx.canvas.width / dpr
    const ch = ctx.canvas.height / dpr

    ctx.clearRect(0, 0, cw, ch)

    const { blobScale: scale, speed: spd, lineSpacing: ls, lineAlpha: la, shape: shapeOverride } = propsRef.current
    const time = t * 0.0003 * spd

    // Read line color from CSS variable
    const lineRgb = getComputedStyle(ctx.canvas).getPropertyValue('--canvas-line-rgb').trim() || '255, 255, 255'

    // Animated blob positions — slight grid-snappy motion
    const aBlobs = BLOBS.map((b) => {
      const rawX = (b.cx + Math.sin(time * b.vx + b.phase) * 0.1) * cw
      const rawY = (b.cy + Math.cos(time * b.vy + b.phase) * 0.08) * ch
      const r = b.r * scale * Math.min(cw, ch)
      const blobShape = shapeOverride === 'mixed' ? b.shape : shapeOverride
      return {
        x: rawX,
        y: rawY,
        r,
        shape: blobShape,
        angle: b.angle,
      }
    })

    // Pre-compute per-angle contribution grids for smooth cross-hatching in overlap zones
    const gridCols = Math.ceil(cw / GRID_RES) + 1
    const gridRows = Math.ceil(ch / GRID_RES) + 1
    const fieldGrid = new Float32Array(gridCols * gridRows)
    // Per-angle contribution: how much field each angle contributes at each grid point
    const angleContribGrids = ANGLES.map(() => new Float32Array(gridCols * gridRows))

    for (let gy = 0; gy < gridRows; gy++) {
      for (let gx = 0; gx < gridCols; gx++) {
        const px = gx * GRID_RES
        const py = gy * GRID_RES
        let field = 0

        for (let bi = 0; bi < aBlobs.length; bi++) {
          const b = aBlobs[bi]!
          const dx = px - b.x
          const dy = py - b.y

          const dist = blobDistance(dx, dy, b.shape)

          const contrib = dist < b.r ? (1 - dist / b.r) ** 2 : 0
          field += contrib
          // Accumulate contribution to corresponding angle grid
          const angleIdx = ANGLES.indexOf(b.angle)
          const contribGrid = angleIdx >= 0 ? angleContribGrids[angleIdx] : undefined
          if (contribGrid) {
            const gi = gy * gridCols + gx
            contribGrid[gi] = (contribGrid[gi] ?? 0) + contrib
          }
        }

        fieldGrid[gy * gridCols + gx] = field
      }
    }

    // Helper: sample field at a point (bilinear from grid)
    const sampleField = (px: number, py: number) => {
      const gx = px / GRID_RES
      const gy = py / GRID_RES
      const x0 = Math.floor(gx)
      const y0 = Math.floor(gy)
      const x1 = Math.min(x0 + 1, gridCols - 1)
      const y1 = Math.min(y0 + 1, gridRows - 1)
      const fx = gx - x0
      const fy = gy - y0
      const v00 = fieldGrid[y0 * gridCols + x0]!
      const v10 = fieldGrid[y0 * gridCols + x1]!
      const v01 = fieldGrid[y1 * gridCols + x0]!
      const v11 = fieldGrid[y1 * gridCols + x1]!
      return v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) +
             v01 * (1 - fx) * fy + v11 * fx * fy
    }

    // Helper: sample per-angle contribution (bilinear)
    const sampleAngleContrib = (px: number, py: number, angleIdx: number) => {
      const grid = angleContribGrids[angleIdx]!
      const gx = px / GRID_RES
      const gy = py / GRID_RES
      const x0 = Math.floor(gx)
      const y0 = Math.floor(gy)
      const x1 = Math.min(x0 + 1, gridCols - 1)
      const y1 = Math.min(y0 + 1, gridRows - 1)
      const fx = gx - x0
      const fy = gy - y0
      const v00 = grid[y0 * gridCols + x0]!
      const v10 = grid[y0 * gridCols + x1]!
      const v01 = grid[y1 * gridCols + x0]!
      const v11 = grid[y1 * gridCols + x1]!
      return v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) +
             v01 * (1 - fx) * fy + v11 * fx * fy
    }

    // Draw continuous hatching lines for each angle — cross-hatch with gradient in overlap zones
    ctx.lineWidth = LINE_WIDTH
    // Soft edge factor: field values from THRESHOLD to THRESHOLD*3 produce 0→1 alpha ramp
    const edgeSoft = THRESHOLD * 3

    for (let ai = 0; ai < ANGLES.length; ai++) {
      const angle = ANGLES[ai]!
      const rad = (angle * Math.PI) / 180
      const cos = Math.cos(rad)
      const sin = Math.sin(rad)

      // Direction perpendicular to line (for spacing)
      const perpX = cos    // perpendicular direction
      const perpY = sin

      // Line direction
      const dirX = -sin
      const dirY = cos

      // Diagonal length for line extent
      const diag = Math.hypot(cw, ch)

      // How many parallel lines to draw
      const count = Math.ceil(diag / ls)

      const stepSize = 5  // sampling step along each line (px)

      for (let li = -count; li <= count; li++) {
        const baseX = cw / 2 + perpX * li * ls
        const baseY = ch / 2 + perpY * li * ls

        const totalSteps = Math.ceil(diag / stepSize)
        let prevX = 0
        let prevY = 0
        let prevAlpha = 0

        for (let si = -totalSteps; si <= totalSteps; si++) {
          const sx = baseX + dirX * si * stepSize
          const sy = baseY + dirY * si * stepSize

          // Skip if out of canvas bounds
          if (sx < -10 || sx > cw + 10 || sy < -10 || sy > ch + 10) {
            prevAlpha = 0
            continue
          }

          const fieldVal = sampleField(sx, sy)
          const angleContrib = sampleAngleContrib(sx, sy, ai)

          // Alpha based on this angle's contribution with edge softness
          let alpha = 0
          if (fieldVal >= THRESHOLD && angleContrib > 0) {
            // Edge ramp based on overall field
            const edgeAlpha = Math.min(1, (fieldVal - THRESHOLD) / (edgeSoft - THRESHOLD))
            // Weight by this angle's proportion of total contribution (smooth cross-fade)
            const weight = angleContrib / fieldVal
            alpha = edgeAlpha * weight
          }

          // Draw a short segment from prev point to current if both have alpha
          if (alpha > 0 && prevAlpha > 0) {
            const segAlpha = Math.min(alpha, prevAlpha) * la
            ctx.strokeStyle = `rgba(${lineRgb},${segAlpha.toFixed(3)})`
            ctx.beginPath()
            ctx.moveTo(prevX, prevY)
            ctx.lineTo(sx, sy)
            ctx.stroke()
          }

          prevX = sx
          prevY = sy
          prevAlpha = alpha
        }
      }
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()
    window.addEventListener('resize', resize)

    if (!active) {
      // Clear canvas when paused
      const dpr = window.devicePixelRatio || 1
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
      return () => window.removeEventListener('resize', resize)
    }

    let lastFrameTime = 0

    const loop = (t: number) => {
      if (t - lastFrameTime >= FRAME_INTERVAL) {
        draw(ctx, t)
        lastFrameTime = t
      }
      animRef.current = requestAnimationFrame(loop)
    }

    animRef.current = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [draw, active])

  return (
    <canvas
      ref={canvasRef}
      className={cn('absolute inset-0 w-full h-full', className)}
    />
  )
}
