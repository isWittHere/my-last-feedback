import * as React from 'react'
import { cn } from '@/lib/cn'

export interface DividerProps extends React.HTMLAttributes<HTMLDivElement> {}

const Divider = React.forwardRef<HTMLDivElement, DividerProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('w-full h-0 border-t border-[var(--border)]', className)}
      role="separator"
      {...props}
    />
  )
)
Divider.displayName = 'Divider'

export { Divider }
