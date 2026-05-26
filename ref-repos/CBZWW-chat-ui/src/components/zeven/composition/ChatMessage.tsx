import { useState, useMemo, memo } from 'react'
import { motion } from 'framer-motion'
import { Copy, Check, ArrowCounterClockwise, ThumbsUp, ThumbsDown } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'
import { MarkdownBlock } from './chat/MarkdownBlock'
import { ThinkingBlock } from './chat/ThinkingBlock'
import { ToolCallBlock } from './chat/ToolCallBlock'
import { ChartBlock } from './chat/ChartBlock'
import { CardBlock } from './chat/CardBlock'
import { CitationBlock, type CitationSource } from './chat/CitationBlock'
import { TaskListBlock, type TaskItem } from './chat/TaskListBlock'
import { ProcessGroup } from './chat/ProcessGroup'

/** Block 来源元数据 */
export interface BlockOrigin {
  /** 所属阶段: process = 中间过程, result = 最终结果 */
  phase: 'process' | 'result'
  /** 展示方式: inline = 被文本引用的内嵌, standalone = 独立 block */
  placement: 'inline' | 'standalone'
  /** 分组 ID: 同一 tool_call 产出的 blocks 共享同一 group_id */
  group_id?: string
}

export type ContentBlock =
  | { type: 'text'; content: string; origin?: BlockOrigin }
  | { type: 'thinking'; content: string; origin?: BlockOrigin }
  | { type: 'tool_call'; name: string; args?: Record<string, unknown>; result?: string; origin?: BlockOrigin }
  | { type: 'chart'; chartType: string; data: unknown; origin?: BlockOrigin }
  | { type: 'card'; cardType: string; data: unknown; origin?: BlockOrigin }
  | { type: 'citation'; sources: CitationSource[]; origin?: BlockOrigin }
  | { type: 'task_list'; tasks: TaskItem[]; origin?: BlockOrigin }

export interface ChatMessageData {
  id: string
  role: 'user' | 'assistant'
  content: string
  blocks?: ContentBlock[]
  timestamp?: Date
}

export interface ChatMessageProps {
  message: ChatMessageData
  isStreaming?: boolean
  /** 是否播放入场动画（批量加载历史消息时可设为 false） */
  animated?: boolean
  className?: string
}

/** 检测 blocks 中的 text 是否引用了图表 */
const CHART_REF_CHECK = /!\[[^\]]*\]\(chart:/

/** 检测 blocks 中的 text 是否引用了卡片 */
const CARD_REF_CHECK = /!\[[^\]]*\]\(card:/

/** 判断是否应跳过此 block 的独立渲染 (已被内联引用或标记为 inline) */
function shouldSkipStandalone(block: ContentBlock, blocks: ContentBlock[]): boolean {
  // inline blocks 来自历史回放的旧数据 — 直接渲染（不跳过）
  if (block.origin?.placement === 'inline') return false
  // 兼容旧数据: 无 origin 时回退到启发式检测
  if (block.type === 'chart' && !block.origin) {
    return blocks.some(b => b.type === 'text' && CHART_REF_CHECK.test(b.content))
  }
  if (block.type === 'card' && !block.origin) {
    return blocks.some(b => b.type === 'text' && CARD_REF_CHECK.test(b.content))
  }
  return false
}

function renderBlock(block: ContentBlock, index: number, isStreamingBlock = false, allBlocks?: ContentBlock[]) {
  switch (block.type) {
    case 'text':
      return <MarkdownBlock key={index} content={block.content} siblingBlocks={allBlocks} isStreaming={isStreamingBlock} />
    case 'thinking':
      return <ThinkingBlock key={index} content={block.content} isStreaming={isStreamingBlock} />
    case 'tool_call':
      return (
        <ToolCallBlock
          key={index}
          name={block.name}
          args={block.args}
          result={block.result}
          isStreaming={isStreamingBlock}
        />
      )
    case 'chart':
      // 内联 block 由 MarkdownBlock 渲染，此处跳过
      if (allBlocks && shouldSkipStandalone(block, allBlocks)) return null
      return <ChartBlock key={index} chartType={block.chartType} data={block.data} />
    case 'card':
      if (allBlocks && shouldSkipStandalone(block, allBlocks)) return null
      return <CardBlock key={index} cardType={block.cardType} data={block.data} />
    case 'citation':
      return <CitationBlock key={index} sources={block.sources} />
    case 'task_list':
      return <TaskListBlock key={index} tasks={block.tasks} />
    default:
      return null
  }
}

export const ChatMessage = memo(function ChatMessage({ message, isStreaming = false, animated = true, className }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)
  const [vote, setVote] = useState<'up' | 'down' | null>(null)

  // 检测是否有 origin 元数据（新协议 vs 旧数据）
  const hasOrigin = useMemo(
    () => message.blocks?.some(b => b.origin != null) ?? false,
    [message.blocks]
  )

  // 以第一个 result block 为边界拆分消息，保持 process -> result 单向切换
  const { processBlocks, resultBlocks } = useMemo(() => {
    if (!hasOrigin || !message.blocks) return { processBlocks: [], resultBlocks: [] }
    const firstResultIndex = message.blocks.findIndex((block) => block.origin?.phase === 'result')
    if (firstResultIndex < 0) {
      return { processBlocks: message.blocks, resultBlocks: [] }
    }
    return {
      processBlocks: message.blocks.slice(0, firstResultIndex),
      resultBlocks: message.blocks.slice(firstResultIndex),
    }
  }, [message.blocks, hasOrigin])

  const handleCopy = () => {
    let text = message.content
    if (!text && message.blocks?.length) {
      text = message.blocks
        .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
        .map((b) => b.content)
        .join('\n\n')
    }
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <motion.div
      data-role={message.role}
      data-msg-id={message.id}
      initial={animated ? { opacity: 0, y: 12 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={animated ? { duration: 0.3 } : { duration: 0 }}
      className={cn(
        'group/msg flex gap-3',
        isUser ? 'justify-end' : 'justify-start',
        className
      )}
    >
      <div
        className={cn(
          'text-sm leading-relaxed',
          isUser
            ? 'max-w-[80%] px-4 py-3 bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text)]'
            : 'w-full text-[var(--text)] bg-transparent'
        )}
      >
        <div className={cn(!isUser && 'px-4 py-3')}>
          {message.blocks && message.blocks.length > 0 ? (
            <div className="space-y-2">
              {hasOrigin ? (
                <>
                  {processBlocks.length > 0 && (
                    <ProcessGroup blocks={processBlocks} isStreaming={isStreaming} />
                  )}
                  {resultBlocks.map((block, i) => (
                    <div key={`result-${i}`} data-block-id={`${message.id}-r${i}`}>
                      {renderBlock(block, i, isStreaming && i === resultBlocks.length - 1, message.blocks!)}
                    </div>
                  ))}
                </>
              ) : (
                message.blocks.map((block, i) => (
                  <div key={i} data-block-id={`${message.id}-${i}`}>
                    {renderBlock(block, i, isStreaming && i === (message.blocks!.length - 1), message.blocks!)}
                  </div>
                ))
              )}
            </div>
          ) : (
            <MarkdownBlock content={message.content} />
          )}
        </div>
        {!isUser && !isStreaming && (
          <div className="flex items-center gap-1 px-4 pt-1 pb-1 opacity-0 group-hover/msg:opacity-100 transition-opacity duration-200">
            <button
              onClick={handleCopy}
              className="p-1 text-[var(--text-dim)] hover:text-[var(--text-muted)] transition-colors"
              title="复制"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
            <button
              className="p-1 text-[var(--text-dim)] hover:text-[var(--text-muted)] transition-colors"
              title="重试"
            >
              <ArrowCounterClockwise size={14} />
            </button>
            <button
              onClick={() => setVote(vote === 'up' ? null : 'up')}
              className={cn(
                'p-1 transition-colors',
                vote === 'up' ? 'text-[var(--accent-green)]' : 'text-[var(--text-dim)] hover:text-[var(--text-muted)]'
              )}
              title="赞"
            >
              <ThumbsUp size={14} weight={vote === 'up' ? 'fill' : 'regular'} />
            </button>
            <button
              onClick={() => setVote(vote === 'down' ? null : 'down')}
              className={cn(
                'p-1 transition-colors',
                vote === 'down' ? 'text-[var(--accent-orange)]' : 'text-[var(--text-dim)] hover:text-[var(--text-muted)]'
              )}
              title="踩"
            >
              <ThumbsDown size={14} weight={vote === 'down' ? 'fill' : 'regular'} />
            </button>
          </div>
        )}
      </div>
    </motion.div>
  )
})

