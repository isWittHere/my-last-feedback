import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

const gridVariants = cva('grid', {
  variants: {
    cols: {
      1: 'grid-cols-1',
      2: 'grid-cols-1 md:grid-cols-2',
      3: 'grid-cols-1 md:grid-cols-3',
      4: 'grid-cols-2 md:grid-cols-4',
    },
    gap: {
      none: 'gap-0',
      sm: 'gap-4',
      default: 'gap-8',
      lg: 'gap-12 md:gap-16',
      px: 'gap-px',
    },
    align: {
      start: 'items-start',
      center: 'items-center',
      stretch: 'items-stretch',
    },
  },
  defaultVariants: {
    cols: 2,
    gap: 'default',
    align: 'start',
  },
})

export interface GridProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof gridVariants> {}

const Grid = React.forwardRef<HTMLDivElement, GridProps>(
  ({ className, cols, gap, align, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(gridVariants({ cols, gap, align, className }))}
      {...props}
    />
  )
)
Grid.displayName = 'Grid'

export { Grid, gridVariants }
