import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

const badgeVariants = cva(
  'inline-flex items-center font-mono text-xs font-medium border transition-colors',
  {
    variants: {
      variant: {
        default: 'border-[var(--border)] text-[var(--text-muted)] bg-transparent',
        accent: 'border-[var(--accent-blue)] text-[var(--accent-blue)] bg-transparent',
        success: 'border-[var(--accent-green)] text-[var(--accent-green)] bg-transparent',
        warning: 'border-[var(--accent-orange)] text-[var(--accent-orange)] bg-transparent',
        error: 'border-[var(--accent-red)] text-[var(--accent-red)] bg-transparent',
        filled: 'border-[var(--text)] bg-[var(--text)] text-[var(--bg)]',
      },
      size: {
        sm: 'px-2 py-0.5 text-[10px]',
        default: 'px-3 py-1',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, size, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(badgeVariants({ variant, size, className }))}
      {...props}
    />
  )
)
Badge.displayName = 'Badge'

export { Badge, badgeVariants }
