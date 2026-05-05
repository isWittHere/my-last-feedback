import { useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import { DotMatrix } from '../../dotmatrix/DotMatrix'
import { thinkingAnims, outputAnims, toolCallAnims, loadingPresets, type AnimationPreset } from '../../dotmatrix/presets'
import type { Message } from '@/store/chatStore'

type StreamPhase = 'thinking' | 'output' | 'tool_call'

function detectPhase(messages: Message[]): StreamPhase {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!
    if (msg.role !== 'assistant') continue
    const blocks = msg.blocks
    if (!blocks?.length) return 'thinking'
    const last = blocks[blocks.length - 1]!
    if (last.type === 'thinking') return 'thinking'
    if (last.type === 'tool_call') return 'tool_call'
    return 'output'
  }
  return 'thinking'
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

const PHASE_POOL: Record<StreamPhase, AnimationPreset[]> = {
  thinking: thinkingAnims,
  output: outputAnims,
  tool_call: toolCallAnims,
}

interface StreamingIndicatorProps {
  messages: Message[]
  mode?: 'stream' | 'settle'
  streamRound?: number
  onComplete?: () => void
}

export function StreamingIndicator({ messages, mode = 'stream', streamRound = 0, onComplete }: StreamingIndicatorProps) {
  const phase = detectPhase(messages)

  // 每轮流式 + phase 维度稳定，下一轮重新随机
  const animRef = useRef<{ key: string; preset: AnimationPreset } | null>(null)
  const preset = useMemo(() => {
    if (mode !== 'stream') return null
    const key = `${streamRound}:${phase}`
    if (animRef.current?.key === key) return animRef.current.preset
    const p = pickRandom(PHASE_POOL[phase])
    animRef.current = { key, preset: p }
    return p
  }, [phase, mode, streamRound])

  const settleRef = useRef<AnimationPreset | null>(null)
  const settlePreset = useMemo(() => {
    if (mode !== 'settle') {
      settleRef.current = null
      return null
    }
    if (settleRef.current) return settleRef.current
    const p = pickRandom(loadingPresets)
    settleRef.current = p
    return p
  }, [mode])

  const activePreset = mode === 'settle' ? settlePreset : preset
  const shouldLoop = mode !== 'settle'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center gap-1"
    >
      <div className="px-1 py-0">
        {activePreset && (
          <DotMatrix
            animation={activePreset}
            size="xs"
            loop={shouldLoop}
            onComplete={mode === 'settle' ? onComplete : undefined}
          />
        )}
      </div>

    </motion.div>
  )
}
