import { useEffect, useLayoutEffect, useState, useRef, useMemo, Fragment } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { codeToHtml } from 'shiki'
import { cn } from '@/lib/cn'
import { useTheme } from '@/lib/theme'
import type { ContentBlock } from '../ChatMessage'
import { ChartBlock } from './ChartBlock'
import { CardBlock } from './CardBlock'

interface MarkdownBlockProps {
  content: string
  /** 同一 assistant 消息中的所有 blocks，用于解析 ![...](chart:...) 引用 */
  siblingBlocks?: ContentBlock[]
  /** 正在流式输出中 — 显示闪烁光标 */
  isStreaming?: boolean
  className?: string
}

/** 匹配 chart 或 card 内联引用：![title](chart:...) 或 ![title](card:...) */
const ANY_REF_RE = /!\[[^\]]*\]\((?:chart|card):(?:[^()]*\([^()]*\))*[^()]*\)/g
/** 带捕获组的版本，用于拆分文本和提取引用类型+标题 */
const ANY_REF_SPLIT_RE = /!\[([^\]]*)\]\((chart|card):((?:[^()]*\([^()]*\))*[^()]*)\)/
const LPA_TAIL_RE = /<(sdk_reference|sdk_quick_reference|environment_details|user_memory|retrieval_tracker|todo|company_context|sub_agent_status|user_files|critical_reminders|session_title|citation_instructions)>[\s\S]*?<\/\1>/gi
/** 首轮标题生成指令（非 XML，追加在用户消息末尾） */
const TITLE_INSTRUCTION_RE = /\n*\[FIRST_TURN_ONLY\][\s\S]*?之后的对话轮无需再生成标题。/gi

/** 标准化图表标题用于模糊匹配 */
function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, '').toLowerCase()
}

/** 在 sibling blocks 中查找匹配的 chart block (优先 standalone 源) */
function findChartBlock(refTitle: string, blocks: ContentBlock[]): Extract<ContentBlock, { type: 'chart' }> | null {
  const refNorm = normalizeTitle(refTitle)
  let fallback: Extract<ContentBlock, { type: 'chart' }> | null = null
  for (const block of blocks) {
    if (block.type !== 'chart' || !block.data) continue
    const spec = block.data as Record<string, unknown>
    // 提取 chart title
    let chartTitle = (spec['title'] as string) ?? ''
    if (!chartTitle) {
      const layout = spec['layout'] as Record<string, unknown> | undefined
      if (layout) {
        const lt = layout['title']
        chartTitle = typeof lt === 'string' ? lt : (lt as Record<string, unknown>)?.['text'] as string ?? ''
      }
    }
    if (!chartTitle) continue
    const chartNorm = normalizeTitle(chartTitle)
    // 精确或前缀匹配
    if (chartNorm === refNorm || chartNorm.startsWith(refNorm) || refNorm.startsWith(chartNorm)) {
      const typed = block as Extract<ContentBlock, { type: 'chart' }>
      // 优先返回 standalone 源 block
      if (block.origin?.placement === 'standalone' || !block.origin) return typed
      if (!fallback) fallback = typed
    }
  }
  return fallback
}

/** 在 sibling blocks 中查找匹配的 card block (优先 standalone 源) */
function findCardBlock(refTitle: string, blocks: ContentBlock[]): Extract<ContentBlock, { type: 'card' }> | null {
  const refNorm = normalizeTitle(refTitle)
  let fallback: Extract<ContentBlock, { type: 'card' }> | null = null
  for (const block of blocks) {
    if (block.type !== 'card' || !block.data) continue
    const spec = block.data as Record<string, unknown>
    const cardTitle = (spec['title'] as string) ?? ''
    if (!cardTitle) continue
    const cardNorm = normalizeTitle(cardTitle)
    if (cardNorm === refNorm || cardNorm.startsWith(refNorm) || refNorm.startsWith(cardNorm)) {
      const typed = block as Extract<ContentBlock, { type: 'card' }>
      if (block.origin?.placement === 'standalone' || !block.origin) return typed
      if (!fallback) fallback = typed
    }
  }
  return fallback
}

function CodeBlock({ code, lang, shikiTheme }: { code: string; lang: string; shikiTheme: string }) {
  const [html, setHtml] = useState('')

  useEffect(() => {
    let cancelled = false
    codeToHtml(code, {
      lang: lang || 'text',
      theme: shikiTheme,
    })
      .then((result) => {
        if (!cancelled) setHtml(result)
      })
      .catch(() => {
        if (!cancelled) setHtml(`<pre><code>${code}</code></pre>`)
      })
    return () => { cancelled = true }
  }, [code, lang, shikiTheme])

  if (!html) {
    return (
      <pre className="bg-[var(--bg-secondary)] border border-[var(--border)] p-4 overflow-x-auto text-sm font-mono text-[var(--text)]">
        <code>{code}</code>
      </pre>
    )
  }

  return (
    <div
      className="[&_pre]:!bg-[var(--bg-secondary)] [&_pre]:border [&_pre]:border-[var(--border)] [&_pre]:p-4 [&_pre]:overflow-x-auto [&_pre]:text-sm [&_pre]:font-mono"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export function MarkdownBlock({ content, siblingBlocks, isStreaming, className }: MarkdownBlockProps) {
  const { theme } = useTheme()
  const shikiTheme = theme === 'light' ? 'github-light-default' : 'github-dark-default'

  // 清理 LPA tail blocks + 标题生成指令
  const contentWithoutLpa = content.replace(LPA_TAIL_RE, '').replace(TITLE_INSTRUCTION_RE, '').trim()

  // 检测是否包含 chart 或 card 内联引用
  const hasAnyRefs = ANY_REF_RE.test(contentWithoutLpa)
  ANY_REF_RE.lastIndex = 0

  const hasChartSiblings = siblingBlocks?.some((b) => b.type === 'chart') ?? false
  const hasCardSiblings = siblingBlocks?.some((b) => b.type === 'card') ?? false

  if (hasAnyRefs && siblingBlocks && (hasChartSiblings || hasCardSiblings)) {
    // 拆分文本为 [text, chart/card, text, ...] 交替段
    type Segment =
      | { type: 'text'; content: string }
      | { type: 'chart'; block: Extract<ContentBlock, { type: 'chart' }> }
      | { type: 'card'; block: Extract<ContentBlock, { type: 'card' }> }
    const segments: Segment[] = []
    let remaining = contentWithoutLpa
    let match: RegExpExecArray | null

    // eslint-disable-next-line no-constant-condition
    while (true) {
      match = ANY_REF_SPLIT_RE.exec(remaining)
      if (!match) break
      const before = remaining.slice(0, match.index).trim()
      if (before) segments.push({ type: 'text', content: before })

      const refKind = match[2] as 'chart' | 'card'  // "chart" or "card"
      const refTitle = (match[3] ?? match[1] ?? '').trim().replace(/\)$/, '')

      if (refKind === 'chart') {
        const chartBlock = findChartBlock(refTitle, siblingBlocks)
        if (chartBlock) {
          segments.push({ type: 'chart', block: chartBlock })
        }
      } else {
        const cardBlock = findCardBlock(refTitle, siblingBlocks)
        if (cardBlock) {
          segments.push({ type: 'card', block: cardBlock })
        }
      }

      remaining = remaining.slice(match.index + match[0].length)
    }
    if (remaining.trim()) segments.push({ type: 'text', content: remaining.trim() })

    if (segments.length > 0) {
      return (
        <div className={className}>
          {segments.map((seg, i) => {
            if (seg.type === 'chart') {
              return <ChartBlock key={`chart-${i}`} chartType={seg.block.chartType} data={seg.block.data} inline />
            }
            if (seg.type === 'card') {
              return <CardBlock key={`card-${i}`} cardType={seg.block.cardType} data={seg.block.data} inline />
            }
            return (
              <Fragment key={`text-${i}`}>
                <MarkdownRenderer content={seg.content} shikiTheme={shikiTheme} />
              </Fragment>
            )
          })}
        </div>
      )
    }
  }

  // 无引用或无匹配 — 剥离引用文本后正常渲染
  const cleanContent = contentWithoutLpa.replace(ANY_REF_RE, '').trim()
  ANY_REF_RE.lastIndex = 0

  if (isStreaming) {
    return <StreamingRenderer content={cleanContent} shikiTheme={shikiTheme} className={className} />
  }
  return <MarkdownRenderer content={cleanContent} shikiTheme={shikiTheme} className={className} />
}

function createMdComponents(shikiTheme: string) {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    code({ className: codeClassName, children, ...props }: any) {
      const match = /language-(\w+)/.exec(codeClassName || '')
      const code = String(children).replace(/\n$/, '')
      if (match) {
        return <CodeBlock code={code} lang={match[1] ?? 'text'} shikiTheme={shikiTheme} />
      }
      return (
        <code
          className="bg-[var(--bg-secondary)] border border-[var(--border)] px-1.5 py-0.5 text-xs font-mono text-[var(--accent-blue)]"
          {...props}
        >
          {children}
        </code>
      )
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    table({ children }: any) {
      return (
        <div className="my-3 rounded-lg overflow-hidden border border-[var(--border)]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse [&_tr:last-child>td]:border-b-0">
              {children}
            </table>
          </div>
        </div>
      )
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    th({ children }: any) {
      return (
        <th className="bg-[var(--bg-secondary)] px-3 py-2 text-left font-mono text-xs uppercase tracking-wider text-[var(--text-muted)] border-b border-r border-[var(--border)] last:border-r-0">
          {children}
        </th>
      )
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    td({ children }: any) {
      return (
        <td className="border-b border-r border-[var(--border)] last:border-r-0 px-3 py-2 text-[var(--text)]">
          {children}
        </td>
      )
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    blockquote({ children }: any) {
      return (
        <blockquote className="border-l-2 border-[var(--text-muted)] pl-4 my-3 text-[var(--text-muted)] italic">
          {children}
        </blockquote>
      )
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    a({ href, children }: any) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--accent-blue)] underline underline-offset-2 hover:text-[var(--accent-blue)]/80"
        >
          {children}
        </a>
      )
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ul({ children }: any) {
      return <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ol({ children }: any) {
      return <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    li({ children }: any) {
      return <li>{children}</li>
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    h1({ children }: any) {
      return <h1 className="text-xl font-semibold mt-4 mb-2 text-[var(--text)]">{children}</h1>
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    h2({ children }: any) {
      return <h2 className="text-lg font-semibold mt-3 mb-2 text-[var(--text)]">{children}</h2>
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    h3({ children }: any) {
      return <h3 className="text-base font-semibold mt-3 mb-1 text-[var(--text)]">{children}</h3>
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    p({ children }: any) {
      return <p className="my-2">{children}</p>
    },
    hr() {
      return <hr className="border-t border-[var(--border)] my-4" />
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    strong({ children }: any) {
      return <strong className="font-semibold text-[var(--text)]">{children}</strong>
    },
  }
}

// ── 流式双区渲染器 ──
// Active zone: 新字符以 DOM span.cr 直接追加 (动画稳定)
// Settled zone: 完成动画的行交给 ReactMarkdown 渲染 (完整 MD 格式)

/** 检查 markdown 文本是否语法闭合 (可安全截断渲染) */
function isMarkdownBalanced(text: string): boolean {
  // 代码块 ``` 必须成对
  const fenceCount = (text.match(/^```/gm) || []).length
  if (fenceCount % 2 !== 0) return false

  // 表格行: 如果最后一行以 | 开头，可能是未完成的表格
  const lines = text.split('\n')
  const lastLine = lines[lines.length - 1]?.trim() ?? ''
  if (lastLine.startsWith('|') && !lastLine.endsWith('|')) return false

  // 粗体 ** 成对 (忽略转义)
  const boldCount = (text.match(/(?<!\\)\*\*/g) || []).length
  if (boldCount % 2 !== 0) return false

  // 行内代码 ` 成对 (忽略 ```)
  const stripped = text.replace(/```[\s\S]*?```/g, '')
  const tickCount = (stripped.match(/(?<!\\)`/g) || []).length
  if (tickCount % 2 !== 0) return false

  return true
}

function StreamingRenderer({ content, shikiTheme, className }: { content: string; shikiTheme: string; className?: string }) {
  const activeRef = useRef<HTMLDivElement>(null)
  const renderedRef = useRef(0)      // 已追加为 DOM span 的字符数
  const settledEndRef = useRef(0)    // 已沉淀到 ReactMarkdown 的字符数
  const [settledText, setSettledText] = useState('')

  const SETTLE_BUFFER = 100  // 保留最后 N 个字符在动画区

  // 追加新字符为 span.cr (同步，避免一帧延迟)
  useLayoutEffect(() => {
    const el = activeRef.current
    if (!el) return
    const start = renderedRef.current
    if (start >= content.length) return

    for (let i = start; i < content.length; i++) {
      const ch = content[i]
      if (ch === '\n') {
        el.appendChild(document.createElement('br'))
      } else {
        const span = document.createElement('span')
        span.className = 'cr'
        span.textContent = ch
        el.appendChild(span)
      }
    }
    renderedRef.current = content.length
  })

  // 沉淀: 完成动画的行迁移到 ReactMarkdown (含语法安全检查)
  useEffect(() => {
    const currentSettled = settledEndRef.current
    const targetEnd = content.length - SETTLE_BUFFER
    if (targetEnd <= currentSettled) return

    // 在 targetEnd 之前找最后一个 \n 行边界
    let boundary = currentSettled
    let search = currentSettled
    while (true) {
      const idx = content.indexOf('\n', search)
      if (idx === -1 || idx + 1 > targetEnd) break
      const candidate = idx + 1
      // 语法安全检查: 确保候选边界处 markdown 语法闭合
      const slice = content.slice(0, candidate)
      if (isMarkdownBalanced(slice)) {
        boundary = candidate
      }
      search = idx + 1
    }
    if (boundary <= currentSettled) return

    // 更新 settled
    settledEndRef.current = boundary
    setSettledText(content.slice(0, boundary))

    // 从 active 区移除已沉淀的 DOM 节点
    const el = activeRef.current
    if (!el) return
    const toRemove = boundary - currentSettled
    for (let i = 0; i < toRemove; i++) {
      if (el.firstChild) el.removeChild(el.firstChild)
    }
  })

  const mdComponents = useMemo(() => createMdComponents(shikiTheme), [shikiTheme])

  return (
    <div className={cn('markdown-content text-sm leading-relaxed text-[var(--text)]', 'is-streaming', className)}>
      {settledText && (
        <div key="s">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {settledText}
          </ReactMarkdown>
        </div>
      )}
      <div key="a" ref={activeRef} className="active-text-zone" />
    </div>
  )
}

// ── 非流式 Markdown 渲染器 ──

function MarkdownRenderer({ content, shikiTheme, className }: { content: string; shikiTheme: string; className?: string }) {
  const mdComponents = useMemo(() => createMdComponents(shikiTheme), [shikiTheme])

  return (
    <div className={cn('markdown-content text-sm leading-relaxed text-[var(--text)]', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={mdComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
