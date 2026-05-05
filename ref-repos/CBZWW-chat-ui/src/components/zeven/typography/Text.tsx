import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

const textVariants = cva('', {
  variants: {
    variant: {
      body: 'text-base leading-[1.6] text-[var(--text)]',
      subtitle: 'text-lg leading-[1.6] text-[var(--text-muted)]',
      caption: 'text-xs leading-[1.5] text-[var(--text-dim)]',
      mono: 'font-mono text-sm text-[var(--text-muted)]',
      muted: 'text-sm text-[var(--text-muted)]',
      dim: 'text-sm text-[var(--text-dim)]',
      accent: 'font-mono font-normal text-[var(--accent-blue)]',
      number: 'font-mono text-sm',
      label: 'font-mono text-xs uppercase tracking-wider text-[var(--text-muted)]',
    },
    size: {
      xs: 'text-xs',
      sm: 'text-sm',
      base: 'text-base',
      lg: 'text-lg',
      xl: 'text-xl',
    },
  },
  defaultVariants: {
    variant: 'body',
  },
})

export interface TextProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof textVariants> {
  as?: 'p' | 'span' | 'div' | 'small' | 'strong' | 'em'
}

const Text = React.forwardRef<HTMLElement, TextProps>(
  ({ className, variant, size, as: Tag = 'p', ...props }, ref) => {
    return (
      <Tag
        ref={ref as React.Ref<HTMLParagraphElement>}
        className={cn(textVariants({ variant, size, className }))}
        {...props}
      />
    )
  }
)
Text.displayName = 'Text'

export { Text, textVariants }
