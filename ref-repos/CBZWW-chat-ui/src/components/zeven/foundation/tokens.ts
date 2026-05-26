/**
 * ZEVEN Design Tokens — JS-side design system constants
 * CSS variables remain authoritative (globals.css), this provides typed access for JS logic
 */

export const colors = {
  bg: 'var(--bg)',
  bgSecondary: 'var(--bg-secondary)',
  bgCard: 'var(--bg-card)',
  bgCardHover: 'var(--bg-card-hover)',
  text: 'var(--text)',
  textMuted: 'var(--text-muted)',
  textDim: 'var(--text-dim)',
  border: 'var(--border)',
  borderHover: 'var(--border-hover)',
  accent: 'var(--accent)',
  accentBlue: 'var(--accent-blue)',
  accentGold: 'var(--accent-gold)',
  accentGreen: 'var(--accent-green)',
  accentRed: 'var(--accent-red)',
  accentPurple: 'var(--accent-purple)',
  accentOrange: 'var(--accent-orange)',
} as const

export const fonts = {
  sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
} as const

export const breakpoints = {
  xs: 479,
  sm: 767,
  md: 1023,
  lg: 1439,
} as const

export const containerWidth = 1024

export const spacing = {
  sectionY: '5rem',   // py-20
  sectionX: '1.5rem', // px-6
} as const
