import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/cn'
import type { ContentBlock } from '../ChatMessage'
import { ChartBlock } from './ChartBlock'
import { CardBlock } from './CardBlock'

interface ArtifactStripProps {
  /** standalone chart/card blocks */
  blocks: ContentBlock[]
  className?: string
}

/** 提取 block 的展示标题 */
function getBlockTitle(block: ContentBlock): string {
  if (block.type === 'chart' && block.data) {
    const spec = block.data as Record<string, unknown>
    let title = spec['title'] as string | undefined
    if (!title) {
      const layout = spec['layout'] as Record<string, unknown> | undefined
      const lt = layout?.['title']
      title = typeof lt === 'string' ? lt : (lt as Record<string, unknown>)?.['text'] as string | undefined
    }
    return title || '图表'
  }
  if (block.type === 'card' && block.data) {
    const spec = block.data as Record<string, unknown>
    return (spec['title'] as string) || '卡片'
  }
  return ''
}

/**
 * 产物缩略图 grid — 无卡片背景，纯缩略图 + 标题
 *
 * 硬规则 4: grid 排布
 * 硬规则 2/5: 无卡片背景，无额外装饰
 */
export function ArtifactStrip({ blocks, className }: ArtifactStripProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  if (blocks.length === 0) return null

  return (
    <div className={cn(className)}>
      {/* 缩略图 grid */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,180px))] gap-2">
        {blocks.map((block, i) => (
          <div
            key={i}
            role="button"
            tabIndex={0}
            onClick={() => setSelectedIndex(selectedIndex === i ? null : i)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedIndex(selectedIndex === i ? null : i) } }}
            className={cn(
              'w-full aspect-[16/10] overflow-hidden rounded cursor-pointer',
              'border transition-colors duration-150',
              selectedIndex === i
                ? 'border-[var(--accent-blue)]'
                : 'border-[var(--border)] hover:border-[var(--text-dim)]'
            )}
            title={getBlockTitle(block)}
          >
            <div className="w-full h-full pointer-events-none scale-[0.5] origin-top-left" style={{ width: '200%', height: '200%' }}>
              {block.type === 'chart' && (
                <ChartBlock chartType={block.chartType} data={block.data} thumbnail />
              )}
              {block.type === 'card' && (
                <CardBlock cardType={block.cardType} data={block.data} thumbnail />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 点击展开: 全尺寸视图 (无卡片背景) */}
      <AnimatePresence>
        {selectedIndex !== null && blocks[selectedIndex] && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="mt-2">
              {blocks[selectedIndex]!.type === 'chart' && (
                <ChartBlock
                  chartType={(blocks[selectedIndex] as Extract<ContentBlock, { type: 'chart' }>).chartType}
                  data={(blocks[selectedIndex] as Extract<ContentBlock, { type: 'chart' }>).data}
                  noToggle
                />
              )}
              {blocks[selectedIndex]!.type === 'card' && (
                <CardBlock
                  cardType={(blocks[selectedIndex] as Extract<ContentBlock, { type: 'card' }>).cardType}
                  data={(blocks[selectedIndex] as Extract<ContentBlock, { type: 'card' }>).data}
                  noToggle
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
