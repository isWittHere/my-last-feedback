import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CaretRight, Wrench } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'

interface ToolCallBlockProps {
  name: string
  args?: Record<string, unknown>
  result?: string
  /** 为 true 时自动展开；从 true 变为 false 时自动折叠 */
  isStreaming?: boolean
  className?: string
}

/**
 * 纯展示层清理: 从 JSON result 中移除已有独立 block 渲染的冗余字段,
 * 让 ToolCallBlock 的 <pre> 文本更简洁。
 * 不修改 result 数据本身, 不影响 TaskListBlock/ChartBlock/CardBlock 的渲染。
 */
function cleanResultForDisplay(raw: string): string {
  try {
    const obj = JSON.parse(raw)
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return raw

    // 移除已有独立 block 的字段 (展示冗余)
    delete obj.todo_list
    delete obj.charts
    delete obj.cards
    delete obj.sandbox_state

    // 清理 output 中的 todo checklist 文本 (TaskListBlock 已渲染)
    if (typeof obj.output === 'string') {
      const cleaned = obj.output
        .replace(/Todo list updated\s*\([^)]*\)\.\s*/g, '')
        .replace(/^\s*\[[xX \-~]\]\s+.+$/gm, '')
        .trim()
      if (cleaned) {
        obj.output = cleaned
      } else {
        delete obj.output
      }
    }

    // 清理 stdout 中的 todo checklist 文本 (与 output 对称)
    if (typeof obj.stdout === 'string') {
      const cleaned = obj.stdout
        .replace(/Todo list updated\s*\([^)]*\)\.\s*/g, '')
        .replace(/^\s*\[[xX \-~]\]\s+.+$/gm, '')
        .trim()
      if (cleaned) {
        obj.stdout = cleaned
      } else {
        delete obj.stdout
      }
    }

    // 移除不影响用户理解的内部字段
    if (obj.error === null || obj.error === undefined) delete obj.error
    if (Array.isArray(obj.progress_logs) && obj.progress_logs.length === 0) delete obj.progress_logs
    if (Array.isArray(obj.tool_errors) && obj.tool_errors.length === 0) delete obj.tool_errors
    delete obj.execution_time_ms
    delete obj.tool_calls_count

    const keys = Object.keys(obj)

    // 只剩 output 或 stdout 时直接显示文本内容, 不显示 JSON 包装
    if (keys.length === 1 && (keys[0] === 'output' || keys[0] === 'stdout')) {
      return String(obj[keys[0]!])
    }
    if (keys.length === 0) return raw  // 全部清除时回退显示原始内容

    return JSON.stringify(obj, null, 2)
  } catch {
    return raw
  }
}

export function ToolCallBlock({ name, args, result, className, isStreaming }: ToolCallBlockProps) {
  // 流式时自动展开；流式结束变 false 时自动折叠
  const [expanded, setExpanded] = useState(isStreaming === true)

  useEffect(() => {
    if (isStreaming === true) {
      setExpanded(true)
    } else if (isStreaming === false) {
      setExpanded(false)
    }
  }, [isStreaming])

  const displayResult = useMemo(
    () => (result ? cleanResultForDisplay(result) : ''),
    [result],
  )

  /**
   * 格式化 args 用于显示：
   * 将 JSON stringify 输出中字符串值内的转义序列还原为可读字符
   */
  const prettyArgs = (obj: Record<string, unknown>) => {
    const json = JSON.stringify(obj, null, 2)
    // 匹配完整的 JSON 字符串字面量（含外层引号），还原其中的转义序列
    return json.replace(/("(?:[^"\\]|\\.)*")/g, (match) =>
      match
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
    )
  }

  return (
    <div className={cn(className)}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="group flex items-center gap-2 py-1.5 text-xs font-mono text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
      >
        <motion.span
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ duration: 0.2 }}
          className="inline-flex"
        >
          <CaretRight size={12} />
        </motion.span>
        <Wrench size={14} className="text-[var(--accent-orange)] group-hover:text-[var(--text)] transition-colors" />
        <span className="text-[var(--accent-orange)] group-hover:text-[var(--text)] transition-colors">
          {(args?.label as string) || name}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-1 border border-[var(--border)] bg-[var(--bg-secondary)]">
              {args && (
                <div className="px-3 py-2">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-dim)] mb-1">
                    参数
                  </div>
                  <pre className="text-xs font-mono text-[var(--text-muted)] overflow-x-auto whitespace-pre-wrap">
                    {prettyArgs(args)}
                  </pre>
                </div>
              )}
              {result && (
                <div className="px-3 py-2 border-t border-[var(--border)]">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-dim)] mb-1">
                    结果
                  </div>
                  <pre className="text-xs font-mono text-[var(--text-muted)] overflow-x-auto whitespace-pre-wrap">
                    {displayResult.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r')}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
