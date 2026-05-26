import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

const containerVariants = cva(
  'mx-auto border-l border-r border-[var(--border)]',
  {
    variants: {
      maxWidth: {
        sm: 'max-w-[640px]',
        md: 'max-w-[768px]',
        lg: 'max-w-[1024px]',
        xl: 'max-w-[1280px]',
        full: 'max-w-none border-l-0 border-r-0',
      },
      padding: {
        none: '',
        default: 'px-6',
        lg: 'px-8 md:px-12',
      },
    },
    defaultVariants: {
      maxWidth: 'lg',
      padding: 'none',
    },
  }
)

export interface ContainerProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof containerVariants> {}

const Container = React.forwardRef<HTMLDivElement, ContainerProps>(
  ({ className, maxWidth, padding, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(containerVariants({ maxWidth, padding, className }))}
      {...props}
    />
  )
)
Container.displayName = 'Container'

export { Container, containerVariants }
