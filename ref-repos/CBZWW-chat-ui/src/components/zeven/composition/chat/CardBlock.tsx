import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CaretRight, CreditCard } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'

// ── Types ──

interface CardSpec {
  type: 'data_card'
  card_type: string
  title: string
  subtitle?: string
  data: Record<string, unknown>
  options?: {
    palette?: string
    layout?: string
    interactive?: boolean
    compact?: boolean
  }
}

interface CardBlockProps {
  cardType: string
  data: unknown
  className?: string
  /** 内联引用模式：折叠标题和边框仅在 hover 时显示 */
  inline?: boolean  /** 隐藏折叠 toggle（ArtifactStrip 展开区使用） */
  noToggle?: boolean  /** 缩略图模式：无标题行、无内部 Header，直接显示内容体 */
  thumbnail?: boolean
}

// ── Color helpers ──

/** Safe string coercion for JSX rendering */
function str(v: unknown): string {
  return String(v ?? '')
}

const TREND_COLORS = {
  up: 'var(--accent-green)',
  down: '#ef4444',
  flat: 'var(--text-dim)',
} as const

function trendArrow(trend: string): string {
  if (trend === 'up') return '↑'
  if (trend === 'down') return '↓'
  return '→'
}

function riskColor(level: string): string {
  switch (level) {
    case 'low': return 'rgba(63,185,80,0.12)'
    case 'medium': return 'rgba(209,153,34,0.12)'
    case 'high': return 'rgba(239,68,68,0.12)'
    default: return 'rgba(239,68,68,0.2)'
  }
}

function riskTextColor(level: string): string {
  switch (level) {
    case 'low': return 'var(--accent-green)'
    case 'medium': return 'var(--accent-orange)'
    case 'high': return '#ef4444'
    default: return '#ef4444'
  }
}

function scoreColor(score: number): string {
  if (score >= 80) return 'var(--accent-green)'
  if (score >= 60) return 'var(--accent-orange)'
  return '#ef4444'
}

function confidenceBadge(level: string) {
  const colors: Record<string, { bg: string; text: string }> = {
    high: { bg: 'rgba(63,185,80,0.12)', text: 'var(--accent-green)' },
    medium: { bg: 'rgba(209,153,34,0.12)', text: 'var(--accent-orange)' },
    low: { bg: 'rgba(239,68,68,0.12)', text: '#ef4444' },
  }
  return colors[level] ?? colors.medium
}

// ── Sparkline SVG ──

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null
  const w = 100, h = 28
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * h
    return `${x},${y}`
  }).join(' ')
  const areaPoints = `0,${h} ${points} ${w},${h}`

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-[28px]">
      <polyline points={areaPoints} fill={color} opacity={0.1} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── KPI Card ──

function KpiCard({ data }: { data: Record<string, unknown> }) {
  const metrics = (data.metrics as Array<Record<string, unknown>>) ?? []
  return (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(140px, 1fr))` }}>
      {metrics.map((m, i) => {
        const trend = (m.trend as string) ?? 'flat'
        const color = TREND_COLORS[trend as keyof typeof TREND_COLORS] ?? TREND_COLORS.flat
        return (
          <div key={i} className="p-3 rounded-md bg-[var(--bg-secondary)]">
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-dim)] mb-1.5">
              {str(m.label)}
            </div>
            <div className="text-xl font-bold tracking-tight">{str(m.value)}</div>
            {m.change != null && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <span
                  className="inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-sm"
                  style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
                >
                  {trendArrow(trend)} {str(m.change)}
                </span>
                {m.period != null && <span className="text-[10px] text-[var(--text-dim)]">{str(m.period)}</span>}
              </div>
            )}
            {m.sparkline != null && (
              <div className="mt-1">
                <Sparkline data={m.sparkline as number[]} color={color} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Profile Card ──

function ProfileCard({ data }: { data: Record<string, unknown> }) {
  const tags = (data.tags as string[]) ?? []
  const priceTarget = data.price_target as Record<string, string> | undefined

  return (
    <div>
      <div className="flex gap-4 mb-3">
        <div className="flex-1">
          <div className="text-base font-bold">{str(data.company)}</div>
          <div className="text-xs font-semibold mt-0.5" style={{ color: 'var(--accent)' }}>
            {str(data.ticker)}{data.exchange ? ` · ${str(data.exchange)}` : ''}
          </div>
          {!!(data.sector || data.industry) && (
            <div className="text-[11px] text-[var(--text-dim)] mt-1">
              {[data.sector, data.industry].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
        {data.rating != null && (
          <div
            className="self-start px-2.5 py-1 rounded text-[11px] font-bold"
            style={{
              color: 'var(--accent-green)',
              background: 'rgba(63,185,80,0.12)',
            }}
          >
            {str(data.rating)}
            {data.rating_score != null && ` ${data.rating_score}`}
          </div>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { label: 'Market Cap', value: data.market_cap },
          { label: 'P/E', value: data.pe_ratio },
          { label: 'Div Yield', value: data.dividend_yield },
        ].filter(item => item.value).map((item, i) => (
          <div key={i} className="text-center p-2 rounded-md bg-[var(--bg-secondary)]">
            <div className="text-[10px] text-[var(--text-dim)] mb-1">{item.label}</div>
            <div className="text-sm font-semibold">{str(item.value)}</div>
          </div>
        ))}
      </div>

      {/* Price target */}
      {priceTarget && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-[var(--bg-secondary)] mb-3 text-xs">
          <span className="text-[var(--text-dim)]">Target</span>
          <span className="text-[var(--accent-green)] font-mono">{priceTarget.low}</span>
          <div className="flex-1 h-1 rounded-full bg-[var(--border)] relative">
            <div className="absolute inset-y-0 left-[20%] right-[20%] rounded-full bg-[var(--accent-green)]" style={{ opacity: 0.3 }} />
          </div>
          <span className="font-semibold font-mono">{priceTarget.base}</span>
          <div className="flex-1 h-1 rounded-full bg-[var(--border)]" />
          <span className="text-[var(--accent-orange)] font-mono">{priceTarget.high}</span>
        </div>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag, i) => (
            <span key={i} className="px-2 py-0.5 rounded-sm text-[10px] font-semibold border"
              style={{
                color: 'var(--accent)',
                background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
                borderColor: 'color-mix(in srgb, var(--accent) 20%, transparent)',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Comparison Card ──

function ComparisonCard({ data }: { data: Record<string, unknown> }) {
  const columns = (data.columns as string[]) ?? []
  const rows = (data.rows as Array<Record<string, unknown>>) ?? []
  const summary = data.summary as string | undefined

  return (
    <div>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th key={i} className={cn(
                'px-2.5 py-2 font-semibold text-[11px] uppercase tracking-wider text-[var(--text-dim)] border-b border-[var(--border)]',
                i === 0 ? 'text-left' : 'text-right'
              )}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => {
            const values = (row.values as string[]) ?? []
            const highlight = row.highlight as number | undefined
            return (
              <tr key={ri} className="border-b border-[var(--border)] last:border-b-0">
                <td className="px-2.5 py-2 font-medium text-[var(--text-muted)]">
                  {str(row.metric)}
                </td>
                {values.map((v, ci) => (
                  <td key={ci} className={cn(
                    'px-2.5 py-2 text-right',
                    ci === highlight && 'font-semibold rounded-sm',
                  )} style={ci === highlight ? {
                    color: 'var(--accent-green)',
                    background: 'rgba(63,185,80,0.06)',
                  } : undefined}>
                    {v}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
      {summary && (
        <div className="mt-2.5 px-2.5 py-2 text-[11px] text-[var(--text-dim)] rounded bg-[var(--bg-secondary)] border-l-2"
          style={{ borderLeftColor: 'var(--accent)' }}>
          {summary}
        </div>
      )}
    </div>
  )
}

// ── Financial Table Card ──

function FinancialTableCard({ data }: { data: Record<string, unknown> }) {
  const headers = (data.headers as string[]) ?? []
  const sections = (data.sections as Array<Record<string, unknown>>) ?? []
  const footnotes = (data.footnotes as string[]) ?? []

  return (
    <div>
      <table className="w-full text-xs border-collapse font-mono">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} className={cn(
                'px-2 py-1.5 font-semibold text-[10px] text-[var(--text-dim)] border-b-2 border-[var(--border)]',
                i === 0 ? 'text-left' : 'text-right'
              )}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sections.map((section, si) => (
            <React.Fragment key={`section-${si}`}>
              <tr>
                <td colSpan={headers.length}
                  className="px-2 py-1.5 font-bold text-[11px] uppercase tracking-wider text-[var(--text-muted)] bg-[var(--bg-secondary)]">
                  {str(section.title)}
                </td>
              </tr>
              {((section.rows as Array<Record<string, unknown>>) ?? []).map((row, ri) => {
                const indent = (row.indent as number) ?? 0
                return (
                  <tr key={`r-${si}-${ri}`} className="border-b border-[var(--border)]/30">
                    <td className={cn(
                      'px-2 py-1 text-[var(--text-muted)]',
                      !!row.bold && 'font-bold text-[var(--text)]',
                    )} style={{ paddingLeft: `${8 + indent * 14}px` }}>
                      {str(row.label)}
                    </td>
                    {((row.values as string[]) ?? []).map((v, vi) => (
                      <td key={vi} className={cn(
                        'px-2 py-1 text-right',
                        !!row.bold && 'font-bold text-[var(--text)]',
                        !!row.highlight_trend && parseFloat(v) > 0 && 'text-[var(--accent-green)]',
                      )}>
                        {v}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </React.Fragment>
          ))}
        </tbody>
      </table>
      {footnotes.length > 0 && (
        <div className="mt-2 text-[10px] text-[var(--text-dim)] space-y-0.5">
          {footnotes.map((fn, i) => <div key={i}>{fn}</div>)}
        </div>
      )}
    </div>
  )
}

// ── Rating Card ──

function RatingCard({ data }: { data: Record<string, unknown> }) {
  const score = (data.overall_score as number) ?? 0
  const rating = (data.overall_rating as string) ?? ''
  const factors = (data.factors as Array<Record<string, unknown>>) ?? []
  const priceTarget = data.price_target as Record<string, string> | undefined

  // SVG gauge
  const radius = 42, circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  const color = scoreColor(score)

  return (
    <div>
      <div className="flex items-center gap-5 mb-4">
        {/* Gauge */}
        <div className="relative w-[90px] h-[90px] shrink-0">
          <svg className="w-full h-full" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="45" cy="45" r={radius} fill="none"
              stroke="var(--border)" strokeWidth="6" />
            <circle cx="45" cy="45" r={radius} fill="none"
              stroke={color} strokeWidth="6" strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-extrabold" style={{ color }}>{score}</span>
            <span className="text-[10px] text-[var(--text-dim)]">/ 100</span>
          </div>
        </div>
        {/* Label */}
        <div>
          <div className="text-base font-bold">{rating}</div>
          {data.analysts != null && (
            <div className="text-[11px] text-[var(--text-dim)] mt-1">
              Based on {str(data.analysts)} analyst{Number(data.analysts) > 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      {/* Factors */}
      <div className="space-y-2 mb-4">
        {factors.map((f, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--text-muted)] w-20 shrink-0 truncate">
              {str(f.name)}
            </span>
            <div className="flex-1 h-1.5 rounded-full bg-[var(--border)]">
              <div className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Number(f.score)}%`,
                  background: scoreColor(Number(f.score)),
                }} />
            </div>
            <span className="text-[11px] font-semibold w-7 text-right">
              {Number(f.score)}
            </span>
          </div>
        ))}
      </div>

      {/* Price target */}
      {priceTarget && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-[var(--bg-secondary)] text-xs">
          <span className="text-[var(--text-dim)]">Target</span>
          <span className="font-mono">{priceTarget.low}</span>
          <div className="flex-1 h-1 rounded-full bg-[var(--border)] relative">
            <div className="absolute inset-y-0 rounded-full"
              style={{
                left: '15%', right: '15%',
                background: `linear-gradient(90deg, var(--accent-green), var(--accent-orange))`,
                opacity: 0.3,
              }} />
          </div>
          <span className="font-semibold font-mono">{priceTarget.base}</span>
          <div className="flex-1 h-1 rounded-full bg-[var(--border)]" />
          <span className="font-mono">{priceTarget.high}</span>
        </div>
      )}
    </div>
  )
}

// ── Risk Matrix Card ──

function RiskMatrixCard({ data }: { data: Record<string, unknown> }) {
  const risks = (data.risks as Array<Record<string, unknown>>) ?? []
  const levels = ['low', 'medium', 'high']
  const labels = { low: 'Low', medium: 'Med', high: 'High' }

  // Map risks to cells: row=impact(top=high), col=probability
  const cellMap: Record<string, Array<Record<string, unknown>>> = {}
  risks.forEach(r => {
    const key = `${r.probability}-${r.impact}`
    if (!cellMap[key]) cellMap[key] = []
    cellMap[key].push(r)
  })

  // Risk color by intersection severity
  function cellSeverity(prob: string, impact: string): string {
    const pi = levels.indexOf(prob), ii = levels.indexOf(impact)
    const severity = pi + ii
    if (severity >= 4) return riskColor('high')
    if (severity >= 2) return riskColor('medium')
    return riskColor('low')
  }

  return (
    <div>
      <div className="grid gap-px" style={{
        gridTemplateColumns: '50px repeat(3, 1fr)',
        gridTemplateRows: 'auto repeat(3, 60px)',
      }}>
        {/* Header row */}
        <div />
        {levels.map(l => (
          <div key={l} className="text-center text-[10px] font-semibold text-[var(--text-dim)] py-1.5 uppercase">
            {labels[l as keyof typeof labels]}
          </div>
        ))}

        {/* Rows (impact: high → low, top to bottom) */}
        {[...levels].reverse().map(impact => (
          <div key={`row-${impact}`} className="contents">
            <div className="flex items-center text-[10px] font-semibold text-[var(--text-dim)] uppercase">
              {labels[impact as keyof typeof labels]}
            </div>
            {levels.map(prob => {
              const key = `${prob}-${impact}`
              const items = cellMap[key] ?? []
              return (
                <div key={key} className="rounded-sm flex flex-col items-center justify-center gap-1 p-1"
                  style={{ background: items.length > 0 ? cellSeverity(prob, impact) : 'var(--bg-secondary)' }}>
                  {items.map((r, i) => (
                    <div key={i} className="flex flex-col items-center gap-0.5">
                      <div className="w-2 h-2 rounded-full"
                        style={{ background: riskTextColor(impact) }} />
                      <span className="text-[9px] text-[var(--text-muted)] text-center leading-tight max-w-[70px]">
                        {str(r.name)}
                      </span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Axis labels */}
      <div className="flex justify-between mt-1 text-[9px] text-[var(--text-dim)]">
        <span className="ml-[50px]">← Probability →</span>
        <span>Impact ↑</span>
      </div>
    </div>
  )
}

// ── Timeline Card ──

function TimelineCard({ data }: { data: Record<string, unknown> }) {
  const events = (data.events as Array<Record<string, unknown>>) ?? []

  const dotColors: Record<string, string> = {
    earnings: '#6B8BF5',
    product: 'var(--accent-green)',
    regulatory: 'var(--accent-orange)',
    other: 'var(--text-dim)',
  }

  return (
    <div className="relative pl-6">
      {/* Vertical line */}
      <div className="absolute left-2 top-1 bottom-1 w-px bg-[var(--border)]" />

      {events.map((e, i) => {
        const type = (e.type as string) ?? 'other'
        const dotColor = dotColors[type] ?? dotColors.other
        const upcoming = e.upcoming as boolean
        return (
          <div key={i} className="relative mb-3.5 last:mb-0">
            {/* Dot */}
            <div className="absolute -left-[17px] top-1 w-2.5 h-2.5 rounded-full border-2"
              style={{
                borderColor: upcoming ? 'var(--accent-orange)' : dotColor,
                background: upcoming ? 'rgba(209,153,34,0.3)' : `color-mix(in srgb, ${dotColor} 30%, transparent)`,
              }} />
            <div className="text-[10px] text-[var(--text-dim)]">{str(e.date)}</div>
            <div className="text-xs font-semibold">{str(e.title)}</div>
            {e.detail != null && <div className="text-[11px] text-[var(--text-dim)] mt-0.5">{str(e.detail)}</div>}
            {upcoming && <div className="text-[10px] font-semibold mt-0.5" style={{ color: 'var(--accent-orange)' }}>Upcoming</div>}
          </div>
        )
      })}
    </div>
  )
}

// ── Summary Card ──

function SummaryCard({ data }: { data: Record<string, unknown> }) {
  const sections = (data.sections as Array<Record<string, unknown>>) ?? []
  const tags = (data.tags as string[]) ?? []
  const confidence = data.confidence as string | undefined

  return (
    <div>
      <div className="space-y-2.5">
        {sections.map((sec, i) => (
          <div key={i} className="p-3 rounded-md bg-[var(--bg-secondary)]">
            <div className="flex items-center gap-1.5 mb-1.5">
              {sec.icon != null && <span className="text-sm">{str(sec.icon)}</span>}
              <span className="text-xs font-semibold">{str(sec.title)}</span>
            </div>
            <div className="text-xs text-[var(--text-muted)] leading-relaxed">
              {str(sec.content)}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 mt-3">
        {confidence && (() => {
          const badge = confidenceBadge(confidence)
          return (
            <span className="px-2 py-0.5 rounded-sm text-[10px] font-semibold"
              style={{ background: badge?.bg, color: badge?.text }}>
              {confidence.charAt(0).toUpperCase() + confidence.slice(1)} Confidence
            </span>
          )
        })()}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag, i) => (
              <span key={i} className="px-1.5 py-0.5 rounded-sm text-[10px] text-[var(--text-dim)] bg-[var(--bg-secondary)]">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Proportion Bar Card ──

function ProportionBarCard({ data }: { data: Record<string, unknown> }) {
  const segments = (data.segments as Array<Record<string, unknown>>) ?? []
  const totalLabel = data.total_label as string | undefined
  const subBars = (data.sub_bars as Array<Record<string, unknown>>) ?? []

  const total = segments.reduce((sum, seg) => sum + ((seg.value as number) ?? 0), 0)

  // Default color sequence
  const defaultColors = [
    'var(--accent-green)', '#6B8BF5', 'var(--accent-orange)',
    '#a855f7', '#ef4444', '#06b6d4', '#ec4899',
  ]

  return (
    <div>
      {totalLabel && (
        <div className="text-[11px] text-[var(--text-dim)] mb-2 font-medium">{totalLabel}</div>
      )}

      {/* Main bar */}
      <div className="flex h-7 rounded overflow-hidden mb-2">
        {segments.map((seg, i) => {
          const pct = total > 0 ? ((seg.value as number) / total) * 100 : 0
          const color = (seg.color as string) ?? defaultColors[i % defaultColors.length]
          return (
            <div key={i} className="flex items-center justify-center text-[11px] font-semibold text-white relative group/seg"
              style={{
                width: `${pct}%`,
                background: color,
                minWidth: pct > 3 ? undefined : '4px',
              }}
              title={`${str(seg.name)}: ${seg.amount ?? seg.value}`}
            >
              {pct > 8 && <span className="truncate px-1">{str(seg.name)}</span>}
            </div>
          )
        })}
      </div>

      {/* Segment labels */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
        {segments.map((seg, i) => {
          const color = (seg.color as string) ?? defaultColors[i % defaultColors.length]
          return (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <div className="w-2 h-2 rounded-full" style={{ background: color }} />
              <span className="text-[var(--text-muted)] font-medium">{str(seg.name)}</span>
              <span className="text-[var(--text-dim)]">
                {seg.amount ? str(seg.amount) : (seg.value as number).toLocaleString()}
              </span>
            </div>
          )
        })}
      </div>

      {/* Sub-bars */}
      {subBars.map((sb, i) => (
        <div key={i} className="flex items-center gap-2 mt-1.5">
          <div className="flex-1 h-1.5 rounded-full bg-[var(--border)] relative overflow-hidden">
            <div className="h-full rounded-full"
              style={{
                width: `${Number(sb.percentage)}%`,
                background: 'var(--accent-orange)',
                opacity: 0.6,
              }} />
          </div>
          <span className="text-[11px] text-[var(--text-dim)] whitespace-nowrap">
            {str(sb.label)} {Number(sb.percentage)}%
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Card Body Dispatcher ──

function CardBody({ cardType, data }: { cardType: string; data: Record<string, unknown> }) {
  switch (cardType) {
    case 'kpi': return <KpiCard data={data} />
    case 'profile': return <ProfileCard data={data} />
    case 'comparison': return <ComparisonCard data={data} />
    case 'financial_table': return <FinancialTableCard data={data} />
    case 'rating': return <RatingCard data={data} />
    case 'risk_matrix': return <RiskMatrixCard data={data} />
    case 'timeline': return <TimelineCard data={data} />
    case 'summary': return <SummaryCard data={data} />
    case 'proportion_bar': return <ProportionBarCard data={data} />
    default:
      return (
        <pre className="text-[11px] text-[var(--text-dim)] whitespace-pre-wrap break-words overflow-auto max-h-[300px]">
          {JSON.stringify(data, null, 2)}
        </pre>
      )
  }
}

// ── Main Component ──

export function CardBlock({ cardType, data, className, inline, noToggle, thumbnail }: CardBlockProps) {
  const [expanded, setExpanded] = useState(true)

  const spec = useMemo<CardSpec | null>(() => {
    if (!data || typeof data !== 'object') return null
    return data as CardSpec
  }, [data])

  if (!spec) return null

  const resolvedCardType = spec.card_type ?? cardType ?? 'summary'
  const title = spec.title ?? resolvedCardType
  const cardData = spec.data ?? {}

  // 缩略图模式：无标题行、无内部 Header，直接显示内容体
  if (thumbnail) {
    return (
      <div className={cn('w-full h-full overflow-auto', className)}>
        <div className="px-2 py-1.5">
          <CardBody cardType={resolvedCardType} data={cardData} />
        </div>
      </div>
    )
  }

  return (
    <div className={cn('group/card', className)}>
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
        <CreditCard size={14} className="text-[var(--accent)]" />
        <span className="text-[var(--accent)]">{title}</span>
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
              inline && "border-transparent group-hover/card:border-[var(--border)] transition-colors duration-200"
            )}>
              {/* Header */}
              <div className="flex items-center justify-between px-4 pt-3 pb-1">
                <div>
                  <div className="text-[13px] font-semibold">{title}</div>
                  {spec.subtitle && (
                    <div className="text-[11px] text-[var(--text-dim)] mt-0.5">{spec.subtitle}</div>
                  )}
                </div>
                <div className="text-[9px] text-[var(--text-dim)] font-mono uppercase tracking-wider opacity-60">
                  {resolvedCardType.replace('_', ' ')}
                </div>
              </div>

              {/* Body */}
              <div className="px-4 pt-2 pb-3">
                <CardBody cardType={resolvedCardType} data={cardData} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
