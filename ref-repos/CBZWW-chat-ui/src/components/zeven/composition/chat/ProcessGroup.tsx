import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CaretRight, ChatTeardropDots, Wrench, ListChecks, CheckCircle, Circle, Spinner,
  ChartBar, Cards, SquaresFour, MagnifyingGlass, Microscope, BookOpen,
  PuzzlePiece, WarningCircle, FlagCheckered, Rows, List,
} from '@phosphor-icons/react'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'
import type { ContentBlock } from '../ChatMessage'
import { ArtifactStrip } from './ArtifactStrip'
import { MarkdownBlock } from './MarkdownBlock'
import type { TaskItem } from './TaskListBlock'

/** 语义 → 图标映射表，后端传语义词，前端决定图标 */
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

function getStepIcon(step: StepItem): PhosphorIcon {
  if (step.kind === 'thinking') return ChatTeardropDots
  if (step.kind === 'task_list') return ListChecks
  if (step.kind === 'artifacts') {
    const hasChart = step.artifactBlocks?.some(b => b.type === 'chart')
    const hasCard = step.artifactBlocks?.some(b => b.type === 'card')
    if (hasChart && hasCard) return SquaresFour
    if (hasCard) return Cards
    return ChartBar
  }
  return getToolIcon(step.args?.icon as string | undefined)
}

interface ProcessGroupProps {
  blocks: ContentBlock[]
  isStreaming: boolean
  className?: string
}

interface StepItem {
  kind: 'thinking' | 'tool' | 'task_list' | 'artifacts'
  label: string
  /** thinking 内容 */
  detail?: string
  /** tool 参数 (原始 args 对象) */
  args?: Record<string, unknown>
  /** tool 结果 (原始 result 字符串) */
  result?: string
  /** task_list 任务项 */
  tasks?: TaskItem[]
  /** 产物 blocks (图表/卡片) */
  artifactBlocks?: ContentBlock[]
}

/** 清理 result JSON: 移除已有独立 block 渲染的冗余字段 */
function cleanResultForDisplay(raw: string): string {
  try {
    const obj = JSON.parse(raw)
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return raw
    delete obj.todo_list; delete obj.charts; delete obj.cards; delete obj.sandbox_state
    if (typeof obj.output === 'string') {
      const cleaned = obj.output.replace(/Todo list updated\s*\([^)]*\)\.\s*/g, '').replace(/^\s*\[[xX \-~]\]\s+.+$/gm, '').trim()
      if (cleaned) obj.output = cleaned; else delete obj.output
    }
    if (typeof obj.stdout === 'string') {
      const cleaned = obj.stdout.replace(/Todo list updated\s*\([^)]*\)\.\s*/g, '').replace(/^\s*\[[xX \-~]\]\s+.+$/gm, '').trim()
      if (cleaned) obj.stdout = cleaned; else delete obj.stdout
    }
    if (obj.error === null || obj.error === undefined) delete obj.error
    if (Array.isArray(obj.progress_logs) && obj.progress_logs.length === 0) delete obj.progress_logs
    if (Array.isArray(obj.tool_errors) && obj.tool_errors.length === 0) delete obj.tool_errors
    delete obj.execution_time_ms; delete obj.tool_calls_count
    const keys = Object.keys(obj)
    if (keys.length === 1 && (keys[0] === 'output' || keys[0] === 'stdout')) return String(obj[keys[0]!])
    if (keys.length === 0) return raw
    return JSON.stringify(obj, null, 2)
  } catch { return raw }
}

function prettyArgs(obj: Record<string, unknown>): string {
  const json = JSON.stringify(obj, null, 2)
  return json.replace(/("(?:[^"\\]|\\.)*")/g, (m) =>
    m.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  )
}

function extractSteps(blocks: ContentBlock[]): StepItem[] {
  const steps: StepItem[] = []
  for (const b of blocks) {
    if (b.type === 'thinking') {
      steps.push({ kind: 'thinking', label: '思考', detail: b.content || undefined })
    } else if (b.type === 'tool_call') {
      steps.push({
        kind: 'tool',
        label: (b.args?.label as string) || b.name,
        args: b.args || undefined,
        result: b.result || undefined,
      })
    } else if (b.type === 'task_list' && b.tasks?.length) {
      const done = b.tasks.filter((t: TaskItem) => t.status === 'completed').length
      steps.push({
        kind: 'task_list',
        label: `待办事项 (${done}/${b.tasks.length})`,
        tasks: b.tasks,
      })
    } else if ((b.type === 'chart' || b.type === 'card') && b.origin?.placement !== 'inline') {
      const last = steps[steps.length - 1]
      if (last?.kind === 'artifacts') {
        last.artifactBlocks!.push(b)
        last.label = formatArtifactLabel(last.artifactBlocks!)
      } else {
        steps.push({
          kind: 'artifacts',
          label: formatArtifactLabel([b]),
          artifactBlocks: [b],
        })
      }
    }
  }
  return steps
}

function formatArtifactLabel(blocks: ContentBlock[]): string {
  const cc = blocks.filter(b => b.type === 'chart').length
  const dc = blocks.filter(b => b.type === 'card').length
  const parts: string[] = []
  if (cc > 0) parts.push(`${cc} 个图表`)
  if (dc > 0) parts.push(`${dc} 个卡片`)
  return parts.join('、') || '产物'
}



export function ProcessGroup({ blocks, isStreaming, className }: ProcessGroupProps) {
  const [areaExpanded, setAreaExpanded] = useState(isStreaming)
  const [stepStates, setStepStates] = useState<Record<number, boolean>>({})
  const [showTopShadow, setShowTopShadow] = useState(false)
  const [showBottomShadow, setShowBottomShadow] = useState(false)
  const [displayMode, setDisplayMode] = useState<'timeline' | 'tab'>('tab')
  const [activeTab, setActiveTab] = useState<number>(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const wasStreamingRef = useRef(false)
  const prevStepsLenRef = useRef(0)
  const autoOpenedIdxRef = useRef<number | null>(null)

  const steps = useMemo(() => extractSteps(blocks), [blocks])

  // 流式生命周期 — 只依赖 isStreaming 避免无限循环
  useEffect(() => {
    if (isStreaming) {
      wasStreamingRef.current = true
      setAreaExpanded(true)
    } else if (wasStreamingRef.current) {
      // 流式结束 → 折叠所有步骤 + 延迟折叠区域
      setStepStates(prev => {
        const s: Record<number, boolean> = {}
        Object.keys(prev).forEach(k => { s[Number(k)] = false })
        return s
      })
      setActiveTab(0)
      autoOpenedIdxRef.current = null
      prevStepsLenRef.current = 0
      setShowTopShadow(false)
      setShowBottomShadow(false)
      const t = setTimeout(() => setAreaExpanded(false), 300)
      return () => clearTimeout(t)
    }
  }, [isStreaming])

  // 流式时自动展开/切换最新步骤
  useEffect(() => {
    if (!isStreaming) return
    const count = steps.length
    if (count !== prevStepsLenRef.current && count > 0) {
      const newIdx = count - 1
      if (displayMode === 'tab') {
        setActiveTab(newIdx)
      } else {
        const prevIdx = autoOpenedIdxRef.current
        setStepStates(prev => {
          const s = { ...prev }
          if (prevIdx !== null && prevIdx !== newIdx) s[prevIdx] = false
          s[newIdx] = true
          return s
        })
        autoOpenedIdxRef.current = newIdx
      }
    }
    prevStepsLenRef.current = count
  }, [steps.length, isStreaming, displayMode])

  // 阴影随滚动位置动态显示
  const updateShadows = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setShowTopShadow(el.scrollTop > 0)
    setShowBottomShadow(el.scrollHeight - el.scrollTop - el.clientHeight > 1)
  }, [])

  useEffect(() => {
    if (!isStreaming) return
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', updateShadows, { passive: true })
    updateShadows()
    return () => el.removeEventListener('scroll', updateShadows)
  }, [isStreaming, updateShadows])

  // 流式自动滚底
  useEffect(() => {
    if (isStreaming && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      updateShadows()
    }
  })

  // Tab 模式内容区阴影
  const tabScrollRef = useRef<HTMLDivElement>(null)
  const [showTabTopShadow, setShowTabTopShadow] = useState(false)
  const [showTabBottomShadow, setShowTabBottomShadow] = useState(false)

  const updateTabShadows = useCallback(() => {
    const el = tabScrollRef.current
    if (!el) return
    setShowTabTopShadow(el.scrollTop > 0)
    setShowTabBottomShadow(el.scrollHeight - el.scrollTop - el.clientHeight > 1)
  }, [])

  useEffect(() => {
    const el = tabScrollRef.current
    if (!el) return
    el.scrollTop = 0
    setShowTabTopShadow(false)
    const ro = new ResizeObserver(updateTabShadows)
    el.addEventListener('scroll', updateTabShadows, { passive: true })
    ro.observe(el)
    updateTabShadows()
    return () => {
      el.removeEventListener('scroll', updateTabShadows)
      ro.disconnect()
    }
  }, [activeTab, displayMode, updateTabShadows])

  const toggleStep = useCallback((i: number) => {
    setStepStates(prev => ({ ...prev, [i]: !prev[i] }))
  }, [])

  if (blocks.length === 0) return null

  const tc = steps.filter(s => s.kind === 'tool').length
  const thc = steps.filter(s => s.kind === 'thinking').length
  const ac = steps.reduce((n, s) => n + (s.artifactBlocks?.length ?? 0), 0)
  const isSingleThinking = steps.length === 1 && steps[0]?.kind === 'thinking' && !isStreaming
  const p: string[] = []
  if (tc > 0) p.push(`${tc} 个工具`)
  if (thc > 0) p.push(`${thc} 次思考`)
  if (ac > 0) p.push(`${ac} 个产物`)
  const summary = isStreaming ? '正在工作...' : isSingleThinking ? '已思考' : `已使用 ${p.join('、')}`

  return (
    <div className={cn('relative', className)}>
      {/* 摘要行 */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setAreaExpanded(!areaExpanded)}
          className="group/summary flex items-center gap-1.5 text-sm leading-relaxed text-[var(--text-muted)] hover:text-[var(--text)] transition-colors text-left"
        >
          <span>{summary}</span>
          <CaretRight
            size={12}
            weight="bold"
            className={cn(
              'flex-shrink-0 transition-all duration-150',
              'opacity-0 group-hover/summary:opacity-60',
              areaExpanded && 'rotate-90'
            )}
          />
        </button>
        {steps.length > 0 && !isSingleThinking && (
          <button
            onClick={() => setDisplayMode(m => m === 'timeline' ? 'tab' : 'timeline')}
            className="flex-shrink-0 p-1 text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"
            title={displayMode === 'timeline' ? '切换到标签页模式' : '切换到时间线模式'}
          >
            {displayMode === 'timeline' ? <Rows size={14} /> : <List size={14} />}
          </button>
        )}
      </div>

      {/* 过程区域 */}
      <AnimatePresence>
        {areaExpanded && steps.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {isSingleThinking ? (
              <div className="mt-2 max-h-[280px] overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--border)] scrollbar-track-transparent pr-2">
                <MarkdownBlock content={steps[0]?.detail ?? ''} className="!text-[var(--text-dim)]" />
              </div>
            ) : displayMode === 'timeline' ? (
              <div className="relative">
              {/* 渐变遮罩 — 按滚动位置动态显示 */}
              {showTopShadow && (
                <div className="pointer-events-none absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-[var(--bg)] to-transparent z-10" />
              )}
              {showBottomShadow && (
                <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-[var(--bg)] to-transparent z-10" />
              )}

              <div
                ref={scrollRef}
                className={cn(
                  isStreaming && 'max-h-[320px] overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--border)] scrollbar-track-transparent'
                )}
              >
                {/*
                 * 时间线布局
                 * - 竖线: border-l 在容器左侧
                 * - 图标紧邻竖线右侧 (pl-3)
                 * - 首项 ╭ 折线由两个 border span 组成
                 */}
                <div className="relative ml-5 space-y-2">
                  {/* ╭ 首项折线 */}
                  <div
                    className="absolute border-l border-b border-[var(--border)] rounded-bl -left-3 -top-1.5 w-2 h-4"
                  />

                  {steps.map((step, i) => {
                    const isOpen = stepStates[i] ?? false
                    const isLast = i === steps.length - 1
                    const hasContent = step.kind === 'thinking' ? !!step.detail
                      : step.kind === 'task_list' ? !!step.tasks?.length
                      : step.kind === 'artifacts' ? !!step.artifactBlocks?.length
                      : !!(step.args || step.result)

                    return (
                      <div key={i} className="relative group/step">
                        {!isLast && (
                          <span
                            className="absolute border-l border-[var(--border)]"
                            style={{ left: 7, top: 22, bottom: -9 }}
                          />
                        )}

                        {/* 步骤头: 统一样式 — 裸图标 + 文字 */}
                        <button
                          onClick={() => hasContent && toggleStep(i)}
                          className={cn(
                            'flex items-center gap-1.5 text-sm leading-relaxed w-full text-left',
                            'text-[var(--text-dim)] transition-colors',
                            hasContent ? 'hover:text-[var(--text-muted)] cursor-pointer' : 'cursor-default'
                          )}
                        >
                          {step.kind === 'thinking'
                            ? <ChatTeardropDots size={14} className="flex-shrink-0" />
                            : step.kind === 'task_list'
                              ? <ListChecks size={14} className="flex-shrink-0" />
                              : step.kind === 'artifacts'
                                ? (() => {
                                    const hasChart = step.artifactBlocks?.some(b => b.type === 'chart')
                                    const hasCard = step.artifactBlocks?.some(b => b.type === 'card')
                                    if (hasChart && hasCard) return <SquaresFour size={14} className="flex-shrink-0" />
                                    if (hasCard) return <Cards size={14} className="flex-shrink-0" />
                                    return <ChartBar size={14} className="flex-shrink-0" />
                                  })()
                                : (() => {
                                    const ToolIcon = getToolIcon(step.args?.icon as string | undefined)
                                    return <ToolIcon size={14} className="flex-shrink-0" />
                                  })()
                          }
                          <span className="truncate">{step.label}</span>
                          {hasContent && (
                            <CaretRight
                              size={12}
                              className={cn(
                                'flex-shrink-0 ml-0.5 transition-all duration-150',
                                'opacity-0 group-hover/step:opacity-50',
                                isOpen && 'rotate-90'
                              )}
                            />
                          )}
                        </button>

                        {/* 步骤内容 */}
                        <AnimatePresence>
                          {isOpen && hasContent && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.15 }}
                              className="overflow-hidden"
                            >
                              {step.kind === 'thinking' && step.detail && (
                                <div className="mt-1.5 pl-5 pr-2">
                                  <MarkdownBlock content={step.detail} className="!text-[var(--text-dim)]" />
                                </div>
                              )}
                              {step.kind === 'tool' && (
                                <div className="mt-1.5 ml-5 border border-[var(--border)] bg-[var(--bg-secondary)] rounded overflow-hidden">
                                  {step.args && (
                                    <div className="px-3 py-2">
                                      <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-dim)] mb-1">参数</div>
                                      <pre className="text-xs font-mono text-[var(--text-muted)] overflow-x-auto whitespace-pre-wrap">{prettyArgs(step.args)}</pre>
                                    </div>
                                  )}
                                  {step.result && (
                                    <div className={cn('px-3 py-2', step.args && 'border-t border-[var(--border)]')}>
                                      <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-dim)] mb-1">结果</div>
                                      <pre className="text-xs font-mono text-[var(--text-muted)] overflow-x-auto whitespace-pre-wrap">
                                        {cleanResultForDisplay(step.result).replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r')}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              )}
                              {step.kind === 'task_list' && step.tasks && (
                                <div className="mt-1.5 ml-5 border border-[var(--border)] bg-[var(--bg-secondary)] py-1 rounded">
                                  {step.tasks.map((task, ti) => (
                                    <div key={ti} className="flex items-center gap-2 py-1 px-3 text-sm">
                                      {task.status === 'completed' && <CheckCircle size={16} weight="fill" className="text-[var(--text-dim)] shrink-0" />}
                                      {task.status === 'in-progress' && <Spinner size={16} className="text-[var(--accent-blue)] shrink-0 animate-spin [animation-duration:7s]" />}
                                      {task.status === 'not-started' && <Circle size={16} className="text-[var(--text-muted)] shrink-0" />}
                                      <span className={cn(
                                        'text-sm',
                                        task.status === 'completed' ? 'text-[var(--text-dim)]'
                                          : task.status === 'in-progress' ? 'text-[var(--accent-blue)]'
                                          : 'text-[var(--text-muted)]'
                                      )}>{task.title}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {step.kind === 'artifacts' && step.artifactBlocks && (
                                <div className="mt-1.5 ml-5">
                                  <ArtifactStrip blocks={step.artifactBlocks} />
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
            ) : (
              /* ─── Tab 模式 ─── */
              <div>
                {/* Tab 条 */}
                <div className="flex flex-wrap gap-1 mt-2">
                  {steps.map((step, i) => {
                    const StepIcon = getStepIcon(step)
                    return (
                      <button
                        key={i}
                        onClick={() => setActiveTab(i)}
                        className={cn(
                          'flex items-center gap-1 px-2 py-0.5 text-xs font-mono border rounded-sm transition-colors',
                          activeTab === i
                            ? 'border-[var(--border)] hatch-45 text-[var(--accent-blue)]'
                            : 'border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)]'
                        )}
                      >
                        <StepIcon size={11} />
                        <span>{step.label}</span>
                      </button>
                    )
                  })}
                </div>
                {/* 激活 Tab 内容面板 */}
                {(() => {
                  const activeStep = steps[activeTab]
                  const needsScroll = !activeStep || (activeStep.kind !== 'artifacts')
                  return (
                    <div className="mt-2 relative">
                      {needsScroll && showTabTopShadow && (
                        <div className="pointer-events-none absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-[var(--bg)] to-transparent z-10" />
                      )}
                      {needsScroll && showTabBottomShadow && (
                        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-[var(--bg)] to-transparent z-10" />
                      )}
                      <div
                        ref={needsScroll ? tabScrollRef : undefined}
                        className={needsScroll
                          ? "max-h-[280px] overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--border)] scrollbar-track-transparent"
                          : ""}
                      >
                        {(() => {
                            const step = steps[activeTab]
                            if (!step) return null
                            const hasContent = step.kind === 'thinking' ? !!step.detail
                              : step.kind === 'task_list' ? !!step.tasks?.length
                              : step.kind === 'artifacts' ? !!step.artifactBlocks?.length
                              : !!(step.args || step.result)
                            if (!hasContent) return null
                        return (
                          <div key={activeTab}>
                        {step.kind === 'thinking' && step.detail && (
                          <div className="pr-2">
                            <MarkdownBlock content={step.detail} className="!text-[var(--text-dim)]" />
                          </div>
                        )}
                        {step.kind === 'tool' && (
                          <div className="border border-[var(--border)] bg-[var(--bg-secondary)] rounded overflow-hidden">
                            {step.args && (
                              <div className="px-3 py-2">
                                <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-dim)] mb-1">参数</div>
                                <pre className="text-xs font-mono text-[var(--text-muted)] overflow-x-auto whitespace-pre-wrap">{prettyArgs(step.args)}</pre>
                              </div>
                            )}
                            {step.result && (
                              <div className={cn('px-3 py-2', step.args && 'border-t border-[var(--border)]')}>
                                <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-dim)] mb-1">结果</div>
                                <pre className="text-xs font-mono text-[var(--text-muted)] overflow-x-auto whitespace-pre-wrap">
                                  {cleanResultForDisplay(step.result).replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r')}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                        {step.kind === 'task_list' && step.tasks && (
                          <div className="border border-[var(--border)] bg-[var(--bg-secondary)] py-1 rounded">
                            {step.tasks.map((task, ti) => (
                              <div key={ti} className="flex items-center gap-2 py-1 px-3 text-sm">
                                {task.status === 'completed' && <CheckCircle size={16} weight="fill" className="text-[var(--text-dim)] shrink-0" />}
                                {task.status === 'in-progress' && <Spinner size={16} className="text-[var(--accent-blue)] shrink-0 animate-spin [animation-duration:7s]" />}
                                {task.status === 'not-started' && <Circle size={16} className="text-[var(--text-muted)] shrink-0" />}
                                <span className={cn(
                                  'text-sm',
                                  task.status === 'completed' ? 'text-[var(--text-dim)]'
                                    : task.status === 'in-progress' ? 'text-[var(--accent-blue)]'
                                    : 'text-[var(--text-muted)]'
                                )}>{task.title}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {step.kind === 'artifacts' && step.artifactBlocks && (
                          <ArtifactStrip blocks={step.artifactBlocks} />
                        )}
                          </div>
                        )
                      })()}
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
