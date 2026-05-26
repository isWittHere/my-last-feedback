import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

const inputVariants = cva(
  'flex w-full border bg-transparent font-mono text-sm text-[var(--text)] placeholder:text-[var(--text-dim)] transition-colors duration-300 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'border-[var(--border)] focus:border-[var(--accent-blue)]',
        error: 'border-[var(--accent-red)] focus:border-[var(--accent-red)]',
      },
      inputSize: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 py-1 text-xs',
        lg: 'h-12 px-5 py-3',
      },
    },
    defaultVariants: {
      variant: 'default',
      inputSize: 'default',
    },
  }
)

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {
  error?: string
  helper?: string
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, variant, inputSize, error, helper, ...props }, ref) => {
    const effectiveVariant = error ? 'error' : variant
    return (
      <div className="flex flex-col gap-1">
        <input
          className={cn(inputVariants({ variant: effectiveVariant, inputSize, className }))}
          ref={ref}
          {...props}
        />
        {error && (
          <span className="text-xs text-[var(--accent-red)] font-mono">{error}</span>
        )}
        {!error && helper && (
          <span className="text-xs text-[var(--text-dim)] font-mono">{helper}</span>
        )}
      </div>
    )
  }
)
Input.displayName = 'Input'

export { Input, inputVariants }
