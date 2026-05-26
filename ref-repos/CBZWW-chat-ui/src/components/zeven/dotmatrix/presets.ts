/**
 * 7×7 点阵动画预设
 * 从 CBZWW_logo_animation/index.html 迁移
 */

export const LOGO = [
  [1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 1, 0, 1],
  [1, 0, 1, 0, 1, 0, 1],
  [1, 0, 1, 1, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1],
]

const E = (): number[][] =>
  Array.from({ length: 7 }, () => Array(7).fill(0))

const C = (p: number[][]): number[][] => p.map((r) => [...r])

// --- Hidden corners (rounded square shape) ---
const HIDDEN_INDICES = new Set([0, 6, 42, 48]) // 4 corners of 7×7

export { E, C, HIDDEN_INDICES }

export type AnimationPreset = {
  id: string
  title: string
  interval?: number
  rawLevel?: boolean
  noSmoothing?: boolean
  gen: () => Generator<number[][], void, unknown>
}

// ========== LOADING ANIMATIONS ==========

export const scanLoading: AnimationPreset = {
  id: 'scan',
  title: '逐行扫描',
  gen: function* () {
    for (let i = 0; i < 3; i++) yield E()
    for (let r = 0; r < 7; r++) {
      const f = E()
      for (let pr = 0; pr < r; pr++)
        for (let c = 0; c < 7; c++) f[pr]![c] = LOGO[pr]![c]!
      for (let c = 0; c < 7; c++) f[r]![c] = 2
      yield f
      const f2 = E()
      for (let pr = 0; pr <= r; pr++)
        for (let c = 0; c < 7; c++) f2[pr]![c] = LOGO[pr]![c]!
      yield f2
    }
    for (let i = 0; i < 12; i++) yield C(LOGO)
    for (let r = 6; r >= 0; r--) {
      const f = C(LOGO)
      for (let c = 0; c < 7; c++) f[r]![c] = 2
      yield f
      const f2 = C(LOGO)
      for (let rr = r; rr < 7; rr++)
        for (let c = 0; c < 7; c++) f2[rr]![c] = 0
      yield f2
    }
    for (let i = 0; i < 4; i++) yield E()
  },
}

export const centerLoading: AnimationPreset = {
  id: 'center',
  title: '中心扩散',
  gen: function* () {
    for (let i = 0; i < 3; i++) yield E()
    for (let dist = 0; dist <= 3; dist++) {
      const f1 = E()
      for (let r = 0; r < 7; r++)
        for (let c = 0; c < 7; c++) {
          const d = Math.max(Math.abs(r - 3), Math.abs(c - 3))
          if (d < dist) f1[r]![c] = LOGO[r]![c]!
          else if (d === dist) f1[r]![c] = LOGO[r]![c]! ? 2 : 0
        }
      yield f1
      const f2 = E()
      for (let r = 0; r < 7; r++)
        for (let c = 0; c < 7; c++) {
          const d = Math.max(Math.abs(r - 3), Math.abs(c - 3))
          if (d <= dist) f2[r]![c] = LOGO[r]![c]!
        }
      yield f2
      yield f2
    }
    for (let i = 0; i < 12; i++) yield C(LOGO)
    for (let dist = 3; dist >= 0; dist--) {
      const f = E()
      for (let r = 0; r < 7; r++)
        for (let c = 0; c < 7; c++) {
          const d = Math.max(Math.abs(r - 3), Math.abs(c - 3))
          if (d < dist) f[r]![c] = LOGO[r]![c]!
          else if (d === dist) f[r]![c] = 2
        }
      yield f
      const f2 = E()
      for (let r = 0; r < 7; r++)
        for (let c = 0; c < 7; c++) {
          const d = Math.max(Math.abs(r - 3), Math.abs(c - 3))
          if (d < dist) f2[r]![c] = LOGO[r]![c]!
        }
      yield f2
    }
    for (let i = 0; i < 4; i++) yield E()
  },
}

// ========== LOOP ANIMATIONS ==========

export const spinnerLoop: AnimationPreset = {
  id: 'spinner',
  title: '旋转追逐',
  gen: function* () {
    const path: [number, number][] = []
    for (let c = 0; c < 7; c++) path.push([0, c])
    for (let r = 1; r < 7; r++) path.push([r, 6])
    for (let c = 5; c >= 0; c--) path.push([6, c])
    for (let r = 5; r >= 1; r--) path.push([r, 0])
    const len = path.length
    for (let frame = 0; frame < len * 3; frame++) {
      const f = E()
      for (let r = 2; r <= 4; r++)
        for (let c = 2; c <= 4; c++) if (LOGO[r]![c]) f[r]![c] = 1
      const head = frame % len
      for (let k = 0; k < 3; k++) {
        const idx = (head - k + len) % len
        const p = path[idx]!
        f[p[0]]![p[1]] = 1
      }
      const dimIdx = (head - 3 + len) % len
      const dp = path[dimIdx]!
      if (!f[dp[0]]![dp[1]]) f[dp[0]]![dp[1]] = 2
      yield f
    }
  },
}

export const waveLoop: AnimationPreset = {
  id: 'wave',
  title: '波浪扫描',
  gen: function* () {
    for (let frame = 0; frame < 60; frame++) {
      const f = E()
      for (let r = 0; r < 7; r++)
        for (let c = 0; c < 7; c++) {
          if (!LOGO[r]![c]) continue
          const phase = (frame - c * 2 + 60) % 14
          if (phase < 4) f[r]![c] = 1
          else if (phase < 6) f[r]![c] = 2
        }
      yield f
    }
  },
}

export const ecgLoop: AnimationPreset = {
  id: 'ecg',
  title: '心电图',
  rawLevel: true,
  noSmoothing: true,
  interval: 55,
  gen: function* () {
    const ECG = [4, 4, 3, 4, 5, 0, 6, 4, 4, 3, 2, 3, 4, 4]
    const colRows = new Array(7).fill(4)
    const framesPerCol = 5
    const totalCols = ECG.length * 4
    for (let t = 0; t < totalCols * framesPerCol; t++) {
      const scanCol = Math.floor(t / framesPerCol) % 7
      if (t % framesPerCol === 0) {
        const colIdx = Math.floor(t / framesPerCol)
        colRows[scanCol] = ECG[colIdx % ECG.length]
      }
      const f = E()
      for (let c = 0; c < 7; c++) {
        const age = (scanCol - c + 7) % 7
        const row = colRows[c] as number
        if (age === 0) f[row]![c] = 4
        else if (age === 1) f[row]![c] = 3
        else if (age <= 3) f[row]![c] = 2
        else if (age <= 5) f[row]![c] = 1
      }
      yield f
    }
  },
}

// ========== VECTOR SDF UTILITIES ==========

const vectorSDF = {
  circle: (px: number, py: number, cx: number, cy: number, r: number) =>
    Math.hypot(px - cx, py - cy) - r,
  box: (px: number, py: number, cx: number, cy: number, w: number, h: number) => {
    const dx = Math.abs(px - cx) - w
    const dy = Math.abs(py - cy) - h
    return Math.min(Math.max(dx, dy), 0.0) + Math.hypot(Math.max(dx, 0.0), Math.max(dy, 0.0))
  },
  smoothUnion: (d1: number, d2: number, k: number) => {
    const h = Math.max(k - Math.abs(d1 - d2), 0.0) / k
    return Math.min(d1, d2) - h * h * k * 0.25
  },
  union: (d1: number, d2: number) => Math.min(d1, d2),
  mix: (d1: number, d2: number, a: number) => d1 * (1 - a) + d2 * a,
}

function renderSDF(sceneFn: (x: number, y: number) => number, edge = 0.28): number[][] {
  const f = E()
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      const dC = sceneFn(c, r)
      const dL = sceneFn(c - 0.16, r)
      const dR = sceneFn(c + 0.16, r)
      const dU = sceneFn(c, r - 0.16)
      const dD = sceneFn(c, r + 0.16)
      const avgD = (dC * 2 + dL + dR + dU + dD) / 6.0
      const innerBias = 0.14
      const normalized = 1 - Math.max(0, Math.min(1, (avgD + innerBias) / (edge + innerBias)))
      const decayed = normalized * normalized
      let level = Math.round(decayed * 4)
      level = Math.max(0, Math.min(4, level))
      f[r]![c] = level
    }
  }
  return f
}

// ========== APPLICATION ANIMATIONS ==========

/** 流体融合 — Thinking state */
export const metaballs: AnimationPreset = {
  id: 'metaballs',
  title: '流体融合',
  gen: function* () {
    for (let cy = 0; cy < 10; cy++) {
      const frames = 60
      for (let t = 0; t < frames; t++) {
        const p = t / frames
        const a1 = p * Math.PI * 2
        const a2 = p * Math.PI * 2 * -1.5
        const a3 = p * Math.PI * 2 * 2.0
        const x1 = 3 + Math.cos(a1) * 3
        const y1 = 3 + Math.sin(a1) * 3
        const x2 = 3 + Math.sin(a2) * 2.5
        const y2 = 3 + Math.cos(a2) * 2.5
        const x3 = 3 + Math.cos(a3) * 2
        const y3 = 3 + Math.sin(a3) * 3

        yield renderSDF((x, y) => {
          const d1 = vectorSDF.circle(x, y, x1, y1, 1.8)
          const d2 = vectorSDF.circle(x, y, x2, y2, 1.5)
          const d3 = vectorSDF.circle(x, y, x3, y3, 1.3)
          const d4 = vectorSDF.circle(x, y, 3, 3, 1.5)
          let fusion = vectorSDF.smoothUnion(d1, d2, 2.0)
          fusion = vectorSDF.smoothUnion(fusion, d3, 2.0)
          return vectorSDF.smoothUnion(fusion, d4, 2.5)
        }, 0.3)
      }
    }
  },
}

/** 全域形变 — Tool call state */
export const morph: AnimationPreset = {
  id: 'morph',
  title: '全域形变',
  gen: function* () {
    for (let cy = 0; cy < 10; cy++) {
      const frames = 60
      for (let t = 0; t < frames; t++) {
        const p = t / frames
        const blend = (Math.sin(p * Math.PI * 2 - Math.PI / 2) + 1) / 2
        const scale = 1.0 + Math.sin(p * Math.PI * 2) * 0.8

        yield renderSDF((x, y) => {
          const box = Math.max(
            vectorSDF.box(x, y, 3, 3, 2.8 * scale, 2.8 * scale),
            -vectorSDF.box(x, y, 3, 3, 1.5 * scale, 1.5 * scale),
          )
          const circle = Math.abs(vectorSDF.circle(x, y, 3, 3, 3.2 * scale)) - 0.8
          return vectorSDF.mix(box, circle, blend)
        }, 0.3)
      }
    }
  },
}

/** 能量场 — Tool call state */
export const ripple: AnimationPreset = {
  id: 'ripple',
  title: '能量场',
  gen: function* () {
    for (let cy = 0; cy < 10; cy++) {
      const frames = 40
      for (let t = 0; t < frames; t++) {
        const p = t / frames
        yield renderSDF((x, y) => {
          const dx = Math.abs(x - 3)
          const dy = Math.abs(y - 3)
          const dist = Math.max(dx, dy) * 0.5 + Math.hypot(dx, dy) * 0.5
          const wave = Math.sin(dist * 2.0 - p * Math.PI * 2 * 1.2)
          return wave * 0.9
        }, 0.42)
      }
    }
  },
}

/** 四角衍射 — Tool call state */
export const kaleidoscope: AnimationPreset = {
  id: 'kaleidoscope',
  title: '四角衍射',
  gen: function* () {
    for (let cy = 0; cy < 10; cy++) {
      const frames = 60
      for (let t = 0; t < frames; t++) {
        const p = t / frames
        const a = p * Math.PI * 2

        const kFrame = renderSDF((x, y) => {
          const foldedX = 3 + Math.abs(x - 3)
          const foldedY = 3 + Math.abs(y - 3)
          const cx = 3 + Math.sin(a) * 3.5
          const cyPos = 3 + Math.cos(a) * 3.5
          const shape1 = vectorSDF.circle(foldedX, foldedY, cx, cyPos, 1.2)
          const cx2 = 3 + Math.cos(a * 1.5) * 2.5
          const cyPos2 = 3 + Math.sin(a * 1.5) * 2.5
          const shape2 = Math.abs(vectorSDF.box(foldedX, foldedY, cx2, cyPos2, 1.0, 1.0)) - 0.2
          const corePulse = vectorSDF.box(x, y, 3, 3, 1.0 + Math.sin(a) * 1.0, 1.0 + Math.sin(a) * 1.0) - 0.2
          const scene = vectorSDF.smoothUnion(shape1, shape2, 1.5)
          return vectorSDF.union(scene, corePulse)
        }, 0.25)
        for (let cr = 2; cr <= 4; cr++)
          for (let cc = 2; cc <= 4; cc++) kFrame[cr]![cc] = 0
        yield kFrame
      }
    }
  },
}

/** 骇客降临 — Output state */
export const matrixRain: AnimationPreset = {
  id: 'matrix_rain',
  title: '骇客降临',
  interval: 50,
  rawLevel: true,
  noSmoothing: true,
  gen: function* () {
    const streams = Array.from({ length: 7 }, (_, col) => ({
      col,
      y: -col * 1.7,
      speed: 0.22 + (col % 3) * 0.04,
      tail: 4,
    }))

    for (let cycle = 0; cycle < 50; cycle++) {
      for (let t = 0; t < 90; t++) {
        const frame = E()
        for (const s of streams) {
          const head = Math.floor(s.y)
          for (let k = 0; k <= s.tail; k++) {
            const row = head - k
            if (row < 0 || row > 6) continue
            if (k === 0) {
              frame[row]![s.col] = 4
            } else {
              const tailLevel = k <= 1 ? 3 : 2
              if (frame[row]![s.col]! < 4) frame[row]![s.col] = Math.max(frame[row]![s.col]!, tailLevel)
            }
          }
          s.y += s.speed
          if (s.y > 7 + s.tail) {
            s.y = -3 - ((t + s.col * 5) % 4)
          }
        }
        yield frame
      }
    }
  },
}

/** 生命游戏:滑翔机 — Output state */
export const glider: AnimationPreset = {
  id: 'glider',
  title: '生命游戏',
  gen: function* () {
    const nextLife = (grid: number[][]) => {
      const out = E()
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          let n = 0
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue
              const rr = (r + dr + 7) % 7
              const cc = (c + dc + 7) % 7
              if (grid[rr]![cc]) n++
            }
          }
          if (grid[r]![c]) out[r]![c] = n === 2 || n === 3 ? 1 : 0
          else out[r]![c] = n === 3 ? 1 : 0
        }
      }
      return out
    }

    let grid = E()
    grid[1]![2] = 1
    grid[2]![3] = 1
    grid[3]![1] = 1
    grid[3]![2] = 1
    grid[3]![3] = 1

    for (let cycle = 0; cycle < 4; cycle++) {
      for (let step = 0; step < 28; step++) {
        yield C(grid)
        grid = nextLife(grid)
      }
    }
  },
}

/** 俄罗斯方块 — Output state */
export const tetris: AnimationPreset = {
  id: 'tetris',
  title: '俄罗斯方块',
  interval: 40,
  rawLevel: true,
  noSmoothing: true,
  gen: function* () {
    const PIECES = [
      { s: [[1, 1, 1, 1]], w: 4, h: 1 },
      { s: [[1, 1], [1, 1]], w: 2, h: 2 },
      { s: [[0, 1, 0], [1, 1, 1]], w: 3, h: 2 },
      { s: [[1, 0], [1, 0], [1, 1]], w: 2, h: 3 },
      { s: [[0, 1], [0, 1], [1, 1]], w: 2, h: 3 },
      { s: [[0, 1, 1], [1, 1, 0]], w: 3, h: 2 },
      { s: [[1, 1, 0], [0, 1, 1]], w: 3, h: 2 },
    ]
    const board = Array.from({ length: 7 }, () => Array(7).fill(0) as number[])
    const pieceSeq = [0, 2, 5, 1, 3, 6, 4, 2, 0, 5, 1, 3, 6, 4, 0, 2]
    let pidx = 0

    for (let cy = 0; cy < 8; cy++) {
      for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) board[r]![c] = 0

      for (let drop = 0; drop < 8; drop++) {
        const p = PIECES[pieceSeq[pidx++ % pieceSeq.length]!]!
        const col = Math.min(7 - p.w, Math.max(0, Math.floor((7 - p.w) * (((drop * 37 + cy * 13) % 7) / 7))))
        let landRow = -1
        for (let testRow = 7 - p.h; testRow >= 0; testRow--) {
          let fits = true
          for (let pr = 0; pr < p.h && fits; pr++)
            for (let pc = 0; pc < p.w && fits; pc++)
              if (p.s[pr]![pc] && board[testRow + pr]![col + pc]) fits = false
          if (fits) {
            landRow = testRow
            break
          }
        }
        if (landRow < 0) continue

        for (let row = 0; row <= landRow; row++) {
          const f = board.map((r) => [...r])
          for (let pr = 0; pr < p.h; pr++)
            for (let pc = 0; pc < p.w; pc++)
              if (p.s[pr]![pc] && row + pr < 7) f[row + pr]![col + pc] = 4
          yield f
        }
        const lv = 2 + (drop % 3)
        for (let pr = 0; pr < p.h; pr++)
          for (let pc = 0; pc < p.w; pc++)
            if (p.s[pr]![pc]) board[landRow + pr]![col + pc] = lv
        for (let h = 0; h < 3; h++) yield board.map((r) => [...r])

        const fullRows: number[] = []
        for (let r = 0; r < 7; r++) if (board[r]!.every((v) => v > 0)) fullRows.push(r)
        if (fullRows.length) {
          for (let fl = 0; fl < 3; fl++) {
            const f = board.map((r) => [...r])
            for (const fr of fullRows) for (let c = 0; c < 7; c++) f[fr]![c] = fl % 2 === 0 ? 4 : 1
            yield f
          }
          for (const fr of fullRows.sort((a, b) => b - a)) {
            board.splice(fr, 1)
            board.unshift(Array(7).fill(0) as number[])
          }
          for (let h = 0; h < 2; h++) yield board.map((r) => [...r])
        }
      }
      for (let h = 0; h < 12; h++) yield board.map((r) => [...r])
    }
  },
}

// ========== STREAMING ANIMATION GROUPS ==========

/** 正在思考 — 使用流体融合 */
export const thinkingAnims: AnimationPreset[] = [metaballs]

/** 正在输出 — 随机选择 */
export const outputAnims: AnimationPreset[] = [tetris, matrixRain]

/** 工具调用 — 随机选择 */
export const toolCallAnims: AnimationPreset[] = [kaleidoscope, morph, ripple]

// ========== ALL PRESETS ==========

export const loadingPresets: AnimationPreset[] = [scanLoading, centerLoading]
export const loopPresets: AnimationPreset[] = [spinnerLoop, waveLoop, ecgLoop]
export const appPresets: AnimationPreset[] = [metaballs, morph, ripple, kaleidoscope, matrixRain, tetris]

export const allPresets: Record<string, AnimationPreset> = {
  scan: scanLoading,
  center: centerLoading,
  spinner: spinnerLoop,
  wave: waveLoop,
  ecg: ecgLoop,
  metaballs,
  morph,
  ripple,
  kaleidoscope,
  matrix_rain: matrixRain,
  tetris,
}
