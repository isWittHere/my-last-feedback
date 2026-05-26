import { useMemo, useEffect, useState, useRef, useCallback } from 'react'
import {
  Wrench, ChatTeardropDots,
  MagnifyingGlass, Microscope, BookOpen, PuzzlePiece, WarningCircle, FlagCheckered,
} from '@phosphor-icons/react'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'
import type { OutlineItem } from '@/data/chatMocks'
import type { Message } from '@/store/chatStore'

const SEMANTIC_ICON_MAP: Record<string, PhosphorIcon> = {
  search: MagnifyingGlass,
  analyze: Microscope,
  read: BookOpen,
  generate: PuzzlePiece,
  check: WarningCircle,
  finalize: FlagCheckered,
}

function getToolIcon(hint?: string): PhosphorIcon {
  return (hint && SEMANTIC_ICON_MAP[hint]) || Wrench
}

interface ChatOutlineListProps {
  /** Static outline (fallback) */
  outline?: OutlineItem[]
  /** Current messages to generate outline from */
  messages?: Message[]
  /** 消息滚动容器的 CSS 选择器 */
  scrollSelector?: string
  /** 流式输出时跳过大纲重算（避免每帧 O(n) 遍历） */
  isStreaming?: boolean
  className?: string
}

/**
 * 每个 outline item 对应一个 DOM 锚点。锚点 ID 的规则：
 * - user item      → data-msg-id="{msgId}"
 * - tool/thinking  → data-block-id="{msgId}-{bi}"
 *
 * buildOutline 生成 item.anchorAttr 和 item.anchorValue 用于 querySelector。
 */

interface AnchoredOutlineItem extends OutlineItem {
  anchorAttr: string
  anchorValue: string
}

function buildOutline(messages: Message[]): AnchoredOutlineItem[] {
  const items: AnchoredOutlineItem[] = []

  for (const msg of messages) {
    if (msg.role === 'user' && msg.content.trim()) {
      items.push({
        id: `outline-user-${msg.id}`,
        level: 1,
        title: msg.content.length > 40 ? msg.content.slice(0, 40) + '…' : msg.content,
        msgId: msg.id,
        anchorAttr: 'data-msg-id',
        anchorValue: msg.id,
      })
    }

    if (msg.role === 'assistant' && msg.blocks) {
      for (let bi = 0; bi < msg.blocks.length; bi++) {
        const block = msg.blocks[bi]!
        const blockVal = `${msg.id}-${bi}`
        if (block.type === 'tool_call' && block.name) {
          const toolLabel = (block.args?.label as string) || block.name
          items.push({
            id: `outline-tool-${msg.id}-${bi}`,
            level: 2,
            title: toolLabel,
            iconType: 'tool',
            iconHint: block.args?.icon as string | undefined,
            msgId: msg.id,
            blockId: blockVal,
            anchorAttr: 'data-block-id',
            anchorValue: blockVal,
          })
        }
        if (block.type === 'thinking' && block.content) {
          const nl = block.content.indexOf('\n')
          const firstLine = (nl >= 0 ? block.content.slice(0, nl) : block.content).trim()
          if (firstLine.length > 0) {
            items.push({
              id: `outline-think-${msg.id}-${bi}`,
              level: 2,
              title: firstLine.length > 30 ? firstLine.slice(0, 30) + '…' : firstLine,
              iconType: 'thinking',
              msgId: msg.id,
              blockId: blockVal,
              anchorAttr: 'data-block-id',
              anchorValue: blockVal,
            })
          }
        }

      }
    }
  }

  return items
}

export function ChatOutlineList({ outline, messages, scrollSelector, isStreaming, className }: ChatOutlineListProps) {
  // 用 ref 记住上次非流式时的大纲，streaming 期间跳过重算
  const lastOutlineRef = useRef<AnchoredOutlineItem[]>([])
  const dynamicOutline = useMemo(
    () => {
      if (isStreaming) return lastOutlineRef.current
      const next = messages && messages.length > 0 ? buildOutline(messages) : (outline ?? []) as AnchoredOutlineItem[]
      lastOutlineRef.current = next
      return next
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, outline, isStreaming],
  )

  // 用 ref 持有 dynamicOutline 以避免 updateActive useCallback 频繁重建
  const dynamicOutlineRef = useRef<AnchoredOutlineItem[]>(dynamicOutline)
  dynamicOutlineRef.current = dynamicOutline

  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(null)
  const rafRef = useRef(0)

  /**
   * 滚动跟踪算法：在滚动容器中，找到最后一个"顶部已滚过容器顶部 + offset"的锚点元素。
   * 类似 scrollspy：当前活跃的是最后一个已经过顶部的锚点。
   */
  const updateActive = useCallback(() => {
    if (dynamicOutlineRef.current.length === 0) return

    const container = scrollSelector ? document.querySelector(scrollSelector) : null
    if (!container) return

    const containerTop = container.getBoundingClientRect().top
    // 锚点只要其顶部滚到容器顶部以下 60px（给一点缓冲），就算"已到达"
    const threshold = containerTop + 60

    let lastPassedId: string | null = null
    for (const item of dynamicOutlineRef.current) {
      const el = container.querySelector(`[${item.anchorAttr}="${item.anchorValue}"]`)
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (rect.top <= threshold) {
        lastPassedId = item.id
      } else {
        // 锚点按文档顺序排列，一旦一个锚点还没到达，后面的也不会
        break
      }
    }

    setActiveOutlineId(lastPassedId)
  }, [scrollSelector])

  // 注册 scroll 监听（只在 scrollSelector 变化时重建，不随 outline 变化调整）
  useEffect(() => {
    const container = scrollSelector ? document.querySelector(scrollSelector) : null
    if (!container) return

    const onScroll = () => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(updateActive)
    }
    container.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      container.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(rafRef.current)
    }
  }, [scrollSelector, updateActive])


  const scrollToMessage = useCallback((item: AnchoredOutlineItem | OutlineItem) => {
    const container = scrollSelector ? document.querySelector(scrollSelector) : null
    const anchored = item as AnchoredOutlineItem
    let targetEl: Element | null = null

    if (anchored.anchorAttr && anchored.anchorValue) {
      const escaped = CSS.escape(anchored.anchorValue)
      targetEl = (container ?? document).querySelector(`[${anchored.anchorAttr}="${escaped}"]`)
    }
    if (!targetEl && item.blockId) {
      const escaped = CSS.escape(item.blockId)
      targetEl = (container ?? document).querySelector(`[data-block-id="${escaped}"]`)
    }
    if (!targetEl && item.msgId) {
      const escaped = CSS.escape(item.msgId)
      targetEl = (container ?? document).querySelector(`[data-msg-id="${escaped}"]`)
    }

    if (!targetEl) return

    targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [scrollSelector])

  return (
    <div className={cn('flex-1 overflow-y-auto p-2 space-y-0.5', className)}>
      {dynamicOutline.length === 0 && (
        <p className="px-3 py-4 text-xs text-[var(--text-dim)] font-mono text-center">
          对话大纲将在交互后自动生成
        </p>
      )}
      {dynamicOutline.map((item) => {
        const isActive = activeOutlineId != null && item.id === activeOutlineId
        return (
          <button
            key={item.id}
            onClick={() => scrollToMessage(item)}
            className={cn(
              'w-full text-left py-1.5 font-mono transition-colors flex items-center gap-1.5 px-3 rounded',
              isActive
                ? 'text-[var(--accent-blue)] hatch-45'
                : 'hover:text-[var(--text)] hover:bg-[var(--bg-card)]',
              item.level === 1
                ? cn('text-xs font-semibold', !isActive && 'text-[var(--text-muted)]')
                : cn('text-[11px]', !isActive && 'text-[var(--text-dim)]'),
            )}
          >
            {item.iconType === 'tool' && (() => { const ToolIcon = getToolIcon(item.iconHint); return <ToolIcon size={12} className={cn('shrink-0', isActive ? 'text-[var(--accent-blue)]' : 'text-[var(--text-dim)]')} /> })()}
            {item.iconType === 'thinking' && <ChatTeardropDots size={12} className={cn('shrink-0', isActive ? 'text-[var(--accent-blue)]' : 'text-[var(--text-dim)]')} />}
            <span className="truncate">{item.title}</span>
          </button>
        )
      })}
    </div>
  )
}
