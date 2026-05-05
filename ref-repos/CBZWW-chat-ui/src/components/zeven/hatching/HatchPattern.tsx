import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

const hatchPatternVariants = cva('', {
  variants: {
    pattern: {
      '45': 'hatch-45',
      '135': 'hatch-135',
      cross: 'hatch-cross',
      hero: 'hatch-hero-bg',
      auth: 'hatch-auth-bg',
    },
    density: {
      dense: 'hatch-dense',
      default: '',
      sparse: 'hatch-sparse',
    },
    interactive: {
      true: 'hatch-interactive',
      false: '',
    },
  },
  defaultVariants: {
    pattern: '45',
    density: 'default',
    interactive: false,
  },
})

export interface HatchPatternProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof hatchPatternVariants> {}

const HatchPattern = React.forwardRef<HTMLDivElement, HatchPatternProps>(
  ({ className, pattern, density, interactive, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(hatchPatternVariants({ pattern, density, interactive, className }))}
      {...props}
    />
  )
)
HatchPattern.displayName = 'HatchPattern'

export { HatchPattern, hatchPatternVariants }
