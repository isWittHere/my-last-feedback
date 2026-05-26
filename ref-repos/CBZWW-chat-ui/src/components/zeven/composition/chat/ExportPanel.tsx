import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, DownloadSimple, Eye, Spinner, ImageSquare } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'
import html2canvas from 'html2canvas'
import Plotly from 'plotly.js-dist-min'

// ── Types ──

export interface ExportConfig {
  ratio: string
  fontSize: number
  dpi: number
  theme: 'dark' | 'light'
  range: 'all' | 'selected'
  selectedIds: string[]
  format: 'png' | 'jpeg'
  quality: number
  includeCharts: boolean
  includeCards: boolean
  includeTitle: boolean
  includeTimestamp: boolean
}

interface ExportPanelProps {
  open: boolean
  onClose: () => void
  /** CSS selector for the scroll container that holds messages */
  scrollSelector: string
  sessionTitle?: string
}

// ── Constants ──

const RATIOS: Record<string, { w: number; h: number; label: string }> = {
  '16:9': { w: 1920, h: 1080, label: '16:9' },
  '4:3': { w: 1440, h: 1080, label: '4:3' },
  'a4-v': { w: 794, h: 1123, label: 'A4 竖' },
  'a4-h': { w: 1123, h: 794, label: 'A4 横' },
}

const FONT_SIZES = [12, 14, 16, 18]
const DPI_OPTIONS = [1, 2, 3]

const DEFAULT_CONFIG: ExportConfig = {
  ratio: '16:9',
  fontSize: 14,
  dpi: 2,
  theme: 'dark',
  range: 'all',
  selectedIds: [],
  format: 'png',
  quality: 0.95,
  includeCharts: true,
  includeCards: true,
  includeTitle: true,
  includeTimestamp: false,
}

// ── Helpers ──

function getWidth(ratio: string): number {
  return RATIOS[ratio]?.w ?? 1920
}

/** CSS variable value from current theme */
function cssVar(name: string, fallback = ''): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

/** Build theme colors for export container */
function themeColors(theme: 'dark' | 'light') {
  if (theme === 'light') {
    return {
      bg: '#ffffff',
      bgSecondary: '#f5f5f5',
      bgCard: '#ffffff',
      text: '#1a1a1a',
      textMuted: '#4a4a4a',
      textDim: '#999999',
      border: '#e0e0e0',
      accent: '#4e7bef',
      accentGreen: '#16a34a',
      accentOrange: '#d97706',
    }
  }
  return {
    bg: '#0a0a0a',
    bgSecondary: cssVar('--bg-secondary', '#141414'),
    bgCard: cssVar('--bg-card', '#1a1a1a'),
    text: cssVar('--text', '#e0e0e0'),
    textMuted: cssVar('--text-muted', '#b0b0b0'),
    textDim: cssVar('--text-dim', '#666666'),
    border: cssVar('--border', '#2a2a2a'),
    accent: cssVar('--accent', '#4e7bef'),
    accentGreen: cssVar('--accent-green', '#3fb950'),
    accentOrange: cssVar('--accent-orange', '#d29922'),
  }
}

/** Apply theme CSS variables to an element */
function applyThemeVars(el: HTMLElement, theme: 'dark' | 'light') {
  const c = themeColors(theme)
  el.style.setProperty('--bg', c.bg)
  el.style.setProperty('--bg-secondary', c.bgSecondary)
  el.style.setProperty('--bg-card', c.bgCard)
  el.style.setProperty('--text', c.text)
  el.style.setProperty('--text-muted', c.textMuted)
  el.style.setProperty('--text-dim', c.textDim)
  el.style.setProperty('--border', c.border)
  el.style.setProperty('--accent', c.accent)
  el.style.setProperty('--accent-green', c.accentGreen)
  el.style.setProperty('--accent-orange', c.accentOrange)
}

// ── Export Logic ──

async function buildExportView(
  config: ExportConfig,
  scrollSelector: string,
  sessionTitle?: string,
): Promise<HTMLDivElement> {
  const container = document.createElement('div')
  const width = getWidth(config.ratio)
  const c = themeColors(config.theme)

  container.style.cssText = `
    position: fixed; left: -9999px; top: 0;
    width: ${width}px;
    font-size: ${config.fontSize}px;
    background: ${c.bg};
    color: ${c.text};
    padding: 40px;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    line-height: 1.6;
  `
  applyThemeVars(container, config.theme)

  // Optional title header
  if (config.includeTitle && sessionTitle) {
    const header = document.createElement('div')
    header.style.cssText = `
      margin-bottom: 24px; padding-bottom: 16px;
      border-bottom: 1px solid ${c.border};
    `
    const h1 = document.createElement('h1')
    h1.textContent = sessionTitle
    h1.style.cssText = `
      font-size: ${config.fontSize * 1.5}px; font-weight: 700;
      color: ${c.text}; margin: 0;
    `
    header.appendChild(h1)
    container.appendChild(header)
  }

  // Collect assistant message elements
  const scrollContainer = document.querySelector(scrollSelector)
  if (!scrollContainer) return container

  const allMsgEls = scrollContainer.querySelectorAll<HTMLElement>('[data-role="assistant"]')
  const msgEls = config.range === 'all'
    ? Array.from(allMsgEls)
    : Array.from(allMsgEls).filter(el => config.selectedIds.includes(el.dataset.msgId ?? ''))

  for (const msgEl of msgEls) {
    const clone = msgEl.cloneNode(true) as HTMLElement

    // Remove thinking blocks
    clone.querySelectorAll('[data-block-id]').forEach(blockEl => {
      const inner = blockEl.querySelector('[class*="ThinkingBlock"], [class*="thinking"]')
      if (inner) blockEl.remove()
    })

    // Remove tool call blocks
    clone.querySelectorAll('[data-block-id]').forEach(blockEl => {
      const inner = blockEl.querySelector('[class*="ToolCallBlock"], [class*="tool-call"]')
      if (inner) blockEl.remove()
    })

    // Remove action buttons (copy, retry, vote)
    clone.querySelectorAll('button').forEach(btn => {
      // Keep expand/collapse buttons for charts/cards, remove action buttons
      const isActionBtn = btn.closest('.group\\/msg') && !btn.closest('[class*="Chart"], [class*="Card"]')
      if (isActionBtn && (btn.title === '复制' || btn.title === '重试' || btn.title === '赞' || btn.title === '踩')) {
        btn.remove()
      }
    })

    // Convert Plotly charts to static images if includeCharts
    if (config.includeCharts) {
      const chartContainers = clone.querySelectorAll<HTMLElement>('.js-plotly-plot')
      const originalCharts = msgEl.querySelectorAll<HTMLElement>('.js-plotly-plot')
      for (let ci = 0; ci < chartContainers.length; ci++) {
        const origChart = originalCharts[ci]
        if (origChart) {
          try {
            const imgData = await Plotly.toImage(origChart, {
              format: 'png',
              width: width - 80,
              height: 400,
              scale: config.dpi,
            })
            const img = document.createElement('img')
            img.src = imgData
            img.style.cssText = 'width: 100%; border-radius: 8px;'
            chartContainers[ci]!.replaceWith(img)
          } catch {
            // Keep original if conversion fails
          }
        }
      }
    } else {
      // Remove chart blocks
      clone.querySelectorAll('.js-plotly-plot').forEach(el => {
        const blockWrapper = el.closest('[data-block-id]')
        if (blockWrapper) blockWrapper.remove()
      })
    }

    // Remove card blocks if not included
    if (!config.includeCards) {
      clone.querySelectorAll('[data-block-id]').forEach(blockEl => {
        const inner = blockEl.querySelector('[class*="CardBlock"], [class*="card-block"]')
        if (inner) blockEl.remove()
      })
    }

    // Style adjustments
    clone.style.fontSize = `${config.fontSize}px`
    clone.style.marginBottom = '16px'
    // Remove framer-motion transform styles
    clone.style.transform = 'none'
    clone.style.opacity = '1'

    container.appendChild(clone)
  }

  // Optional timestamp footer
  if (config.includeTimestamp) {
    const footer = document.createElement('div')
    footer.style.cssText = `
      margin-top: 24px; padding-top: 16px;
      border-top: 1px solid ${c.border};
      font-size: ${config.fontSize * 0.75}px;
      color: ${c.textDim};
      text-align: right;
    `
    footer.textContent = `Generated ${new Date().toLocaleString()}`
    container.appendChild(footer)
  }

  return container
}

async function executeExport(
  config: ExportConfig,
  scrollSelector: string,
  sessionTitle?: string,
): Promise<Blob> {
  const exportView = await buildExportView(config, scrollSelector, sessionTitle)
  document.body.appendChild(exportView)

  // Wait a frame for layout
  await new Promise(r => requestAnimationFrame(r))

  const c = themeColors(config.theme)
  const canvas = await html2canvas(exportView, {
    scale: config.dpi,
    useCORS: true,
    backgroundColor: c.bg,
    width: getWidth(config.ratio),
    windowWidth: getWidth(config.ratio),
    logging: false,
  })

  document.body.removeChild(exportView)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('Canvas to blob failed')),
      `image/${config.format}`,
      config.quality,
    )
  })
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Component ──

export function ExportPanel({ open, onClose, scrollSelector, sessionTitle }: ExportPanelProps) {
  const [config, setConfig] = useState<ExportConfig>({ ...DEFAULT_CONFIG })
  const [exporting, setExporting] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Clean up preview URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const updateConfig = useCallback(<K extends keyof ExportConfig>(key: K, value: ExportConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }))
    // Invalidate preview when config changes
    setPreviewUrl(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }, [])

  const handlePreview = useCallback(async () => {
    setExporting(true)
    try {
      const previewConfig = { ...config, dpi: 1 } // Lower DPI for preview
      const blob = await executeExport(previewConfig, scrollSelector, sessionTitle)
      const url = URL.createObjectURL(blob)
      setPreviewUrl(prev => {
        if (prev) URL.revokeObjectURL(prev)
        return url
      })
    } catch (err) {
      console.error('Export preview failed:', err)
    } finally {
      setExporting(false)
    }
  }, [config, scrollSelector, sessionTitle])

  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      const blob = await executeExport(config, scrollSelector, sessionTitle)
      const timestamp = new Date().toISOString().slice(0, 10)
      const filename = `zeven-report-${timestamp}.${config.format}`
      downloadBlob(blob, filename)
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setExporting(false)
    }
  }, [config, scrollSelector, sessionTitle])

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed top-14 right-0 bottom-0 z-50 w-80 border-l border-[var(--border)] bg-[var(--bg-secondary)] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <ImageSquare size={18} className="text-[var(--accent)]" />
                <span className="text-sm font-semibold">导出报告图片</span>
              </div>
              <button onClick={onClose} className="p-1 text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Options */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              {/* Ratio */}
              <OptionGroup label="比例">
                <div className="flex gap-1.5">
                  {Object.entries(RATIOS).map(([key, { label }]) => (
                    <button
                      key={key}
                      onClick={() => updateConfig('ratio', key)}
                      className={cn(
                        'px-2.5 py-1 rounded text-[11px] font-medium transition-colors',
                        config.ratio === key
                          ? 'bg-[var(--accent)] text-white'
                          : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text)]'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </OptionGroup>

              {/* Font size */}
              <OptionGroup label="字号">
                <div className="flex gap-1.5">
                  {FONT_SIZES.map(size => (
                    <button
                      key={size}
                      onClick={() => updateConfig('fontSize', size)}
                      className={cn(
                        'px-2.5 py-1 rounded text-[11px] font-medium transition-colors',
                        config.fontSize === size
                          ? 'bg-[var(--accent)] text-white'
                          : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text)]'
                      )}
                    >
                      {size}px
                    </button>
                  ))}
                </div>
              </OptionGroup>

              {/* DPI */}
              <OptionGroup label="清晰度">
                <div className="flex gap-1.5">
                  {DPI_OPTIONS.map(dpi => (
                    <button
                      key={dpi}
                      onClick={() => updateConfig('dpi', dpi)}
                      className={cn(
                        'px-2.5 py-1 rounded text-[11px] font-medium transition-colors',
                        config.dpi === dpi
                          ? 'bg-[var(--accent)] text-white'
                          : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text)]'
                      )}
                    >
                      {dpi}x
                    </button>
                  ))}
                </div>
              </OptionGroup>

              {/* Theme */}
              <OptionGroup label="主题">
                <div className="flex gap-1.5">
                  {(['dark', 'light'] as const).map(theme => (
                    <button
                      key={theme}
                      onClick={() => updateConfig('theme', theme)}
                      className={cn(
                        'px-2.5 py-1 rounded text-[11px] font-medium transition-colors',
                        config.theme === theme
                          ? 'bg-[var(--accent)] text-white'
                          : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text)]'
                      )}
                    >
                      {theme === 'dark' ? '深色' : '浅色'}
                    </button>
                  ))}
                </div>
              </OptionGroup>

              {/* Format */}
              <OptionGroup label="格式">
                <div className="flex gap-1.5">
                  {(['png', 'jpeg'] as const).map(fmt => (
                    <button
                      key={fmt}
                      onClick={() => updateConfig('format', fmt)}
                      className={cn(
                        'px-2.5 py-1 rounded text-[11px] font-medium transition-colors',
                        config.format === fmt
                          ? 'bg-[var(--accent)] text-white'
                          : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text)]'
                      )}
                    >
                      {fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
              </OptionGroup>

              {/* Toggles */}
              <OptionGroup label="内容">
                <div className="space-y-2">
                  <Toggle label="包含图表" checked={config.includeCharts} onChange={v => updateConfig('includeCharts', v)} />
                  <Toggle label="包含卡片" checked={config.includeCards} onChange={v => updateConfig('includeCards', v)} />
                  <Toggle label="显示标题" checked={config.includeTitle} onChange={v => updateConfig('includeTitle', v)} />
                  <Toggle label="显示时间" checked={config.includeTimestamp} onChange={v => updateConfig('includeTimestamp', v)} />
                </div>
              </OptionGroup>

              {/* Preview area */}
              {previewUrl && (
                <div className="border border-[var(--border)] rounded-lg overflow-hidden">
                  <div className="text-[10px] text-[var(--text-dim)] px-2 py-1 bg-[var(--bg-card)]">预览</div>
                  <img
                    src={previewUrl}
                    alt="Export preview"
                    className="w-full"
                    style={{ maxHeight: '300px', objectFit: 'contain', background: config.theme === 'dark' ? '#0a0a0a' : '#ffffff' }}
                  />
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="flex items-center gap-2 px-4 py-3 border-t border-[var(--border)]">
              <button
                onClick={handlePreview}
                disabled={exporting}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-colors',
                  'bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)]',
                  exporting && 'opacity-50 cursor-not-allowed'
                )}
              >
                {exporting ? <Spinner size={14} className="animate-spin" /> : <Eye size={14} />}
                预览
              </button>
              <button
                onClick={handleExport}
                disabled={exporting}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-colors',
                  'bg-[var(--accent)] text-white hover:brightness-110',
                  exporting && 'opacity-50 cursor-not-allowed'
                )}
              >
                {exporting ? <Spinner size={14} className="animate-spin" /> : <DownloadSimple size={14} />}
                导出 {config.format.toUpperCase()}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ── Sub-components ──

function OptionGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)] mb-1.5">
        {label}
      </div>
      {children}
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-xs text-[var(--text-muted)]">{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative w-8 h-4.5 rounded-full transition-colors',
          checked ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
        )}
        style={{ height: '18px' }}
      >
        <span
          className={cn(
            'absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform shadow-sm',
            checked ? 'translate-x-[14px]' : 'translate-x-0.5'
          )}
          style={{ width: '14px', height: '14px' }}
        />
      </button>
    </label>
  )
}
