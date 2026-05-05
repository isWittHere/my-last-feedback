import * as React from 'react'
import { cn } from '@/lib/cn'

export interface HatchDividerProps extends React.HTMLAttributes<HTMLDivElement> {
  height?: number
}

const HatchDivider = React.forwardRef<HTMLDivElement, HatchDividerProps>(
  ({ className, height = 24, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('hatch-divider w-full', className)}
      style={{ height }}
      {...props}
    />
  )
)
HatchDivider.displayName = 'HatchDivider'

export { HatchDivider }
