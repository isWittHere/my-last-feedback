import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-mono text-sm font-medium rounded-[8px] transition-all duration-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--text)] text-[var(--bg)] border border-[var(--text)] hover:bg-transparent hover:text-[var(--text)]',
        hatch:
          'bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)] hatch-btn hover:border-[var(--accent-blue)] hover:text-[var(--accent-blue)]',
        outline:
          'border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-card-hover)]',
        ghost:
          'bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-card-hover)]',
        link:
          'text-[var(--text-muted)] underline-offset-4 hover:underline hover:text-[var(--text)] p-0 h-auto',
      },
      size: {
        default: 'h-10 px-6 py-2',
        sm: 'h-8 px-4 text-xs',
        lg: 'h-12 px-8 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
