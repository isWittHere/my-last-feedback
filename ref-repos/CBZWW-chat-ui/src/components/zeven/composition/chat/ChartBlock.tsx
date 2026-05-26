import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CaretRight, ChartBar } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'
import { useTheme } from '@/lib/theme'
import Plotly from 'plotly.js-dist-min'

interface ChartBlockProps {
  chartType: string
  data: unknown
  className?: string
  /** 内联引用模式：边框仅在 hover 时显示 */
  inline?: boolean
  /** 隐藏折叠 toggle（ArtifactStrip 展开区使用） */
  noToggle?: boolean
  /** 缩略图模式：无标题行、静态图表、无交互 */
  thumbnail?: boolean
}

/** 从 CSS 变量中读取当前值 */
function cssVar(name: string, fallback = ''): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

export function ChartBlock({ chartType, data, className, inline, noToggle, thumbnail }: ChartBlockProps) {
  const [expanded, setExpanded] = useState(true)
  const chartRef = useRef<HTMLDivElement>(null)
  const plotlyRendered = useRef(false)
  const { theme } = useTheme()

  /** 渲染 Plotly 图表 */
  const renderChart = useCallback(() => {
    if (!chartRef.current || !data || typeof data !== 'object') return

    const spec = data as Record<string, unknown>
    const rawTraces = (spec['data'] as Plotly.Data[]) ?? []
    const rawLayout = (spec['layout'] as Record<string, unknown>) ?? {}
    const title = (spec['title'] as string) ?? (rawLayout['title'] as string) ?? ''

    // 深色/浅色主题适配
    const textColor = cssVar('--text', '#ffffff')
    const borderColor = cssVar('--border', '#333333')
    const gridColor = theme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'

    // Hover label 跟随主题
    const hoverBg = theme === 'light' ? 'rgba(255,255,255,0.95)' : 'rgba(20,20,20,0.95)'
    const hoverBorder = theme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)'
    const hoverTextColor = theme === 'light' ? '#333333' : '#eeeeee'

    // 为每条 trace 注入 hoverlabel 样式 + hovertemplate，确保颜色跟随主题
    const traces = rawTraces.map(t => {
      const tr = t as Record<string, unknown>
      return {
        ...t,
        // hovertemplate 合并数据和名称到单个气泡，空 <extra> 消除分裂的第二标签
        hovertemplate: tr.hovertemplate ?? '<b>%{fullData.name}</b><br>%{x}: %{y}<extra></extra>',
        hoverlabel: {
          bgcolor: hoverBg,
          bordercolor: hoverBorder,
          font: { color: hoverTextColor, family: "'Inter', system-ui, sans-serif", size: 12 },
        },
      }
    })

    const layout: Partial<Plotly.Layout> = {
      ...rawLayout,
      title: thumbnail ? undefined : (title ? { text: title, font: { color: textColor, size: 14 } } : undefined),
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { color: textColor, family: "'Inter', system-ui, sans-serif", size: thumbnail ? 8 : 11 },
      margin: thumbnail
        ? { l: 28, r: 6, t: 8, b: 24 }
        : { l: 50, r: 20, t: title ? 40 : 20, b: 80 },
      hoverlabel: {
        bgcolor: hoverBg,
        bordercolor: hoverBorder,
        font: { color: hoverTextColor, family: "'Inter', system-ui, sans-serif", size: 12 },
        align: 'left',
        namelength: -1,
      },
      xaxis: {
        ...(rawLayout['xaxis'] as object ?? {}),
        gridcolor: gridColor,
        linecolor: borderColor,
        zerolinecolor: borderColor,
        ...(thumbnail ? { tickfont: { size: 7 }, showticklabels: true } : {}),
      },
      yaxis: {
        ...(rawLayout['yaxis'] as object ?? {}),
        gridcolor: gridColor,
        linecolor: borderColor,
        zerolinecolor: borderColor,
        ...(thumbnail ? { tickfont: { size: 7 } } : {}),
      },
      legend: thumbnail
        ? { font: { color: textColor, size: 7 }, orientation: 'h', y: -0.2, x: 0 }
        : { ...(rawLayout['legend'] as object ?? {}), font: { color: textColor, size: 10 } },
      autosize: true,
    } as Partial<Plotly.Layout>

    const config: Partial<Plotly.Config> = {
      responsive: true,
      displayModeBar: thumbnail ? false : 'hover',
      displaylogo: false,
      staticPlot: thumbnail ? true : false,
      modeBarButtonsToRemove: [
        'sendDataToCloud', 'lasso2d', 'select2d',
      ] as Plotly.ModeBarDefaultButtons[],
    }

    Plotly.newPlot(chartRef.current, traces, layout, config)
    plotlyRendered.current = true
  }, [data, theme])

  // 在展开或数据变化时渲染
  useEffect(() => {
    if (expanded) {
      // 延迟一帧让动画完成后再渲染，避免尺寸为 0
      const raf = requestAnimationFrame(() => {
        renderChart()
      })
      return () => cancelAnimationFrame(raf)
    }
  }, [expanded, renderChart])

  // 清理
  useEffect(() => {
    return () => {
      if (chartRef.current && plotlyRendered.current) {
        Plotly.purge(chartRef.current)
      }
    }
  }, [])

  // 优先从 data.layout.title / data.title 提取图表标题
  const spec = (data && typeof data === 'object') ? data as Record<string, unknown> : null
  const rawLayout = spec?.['layout'] as Record<string, unknown> | undefined
  const layoutTitle = rawLayout?.['title']
  const chartTitle =
    (typeof layoutTitle === 'string' ? layoutTitle : (layoutTitle as Record<string, unknown>)?.['text'] as string)
    || (spec?.['title'] as string)
    || ''
  const label = chartTitle || chartType || '图表'

  // 缩略图模式：直接渲染裸图表，无标题行、无交互、无动画
  if (thumbnail) {
    return (
      <div className={cn('w-full h-full overflow-hidden', className)}>
        <div ref={chartRef} className="w-full h-full" />
      </div>
    )
  }

  return (
    <div className={cn('group/chart', className)}>
      {!(inline || noToggle) && (
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 py-1.5 text-xs font-mono text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
      >
        <motion.span
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ duration: 0.2 }}
          className="inline-flex"
        >
          <CaretRight size={12} />
        </motion.span>
        <ChartBar size={14} className="text-[var(--accent-green)]" />
        <span className="text-[var(--accent-green)]">{label}</span>
      </button>
      )}

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className={cn(
              "mt-1 border border-[var(--border)] rounded-lg overflow-hidden",
              inline && "border-transparent group-hover/chart:border-[var(--border)] transition-colors duration-200"
            )}>
              <div
                ref={chartRef}
                className="w-full min-h-[300px]"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
