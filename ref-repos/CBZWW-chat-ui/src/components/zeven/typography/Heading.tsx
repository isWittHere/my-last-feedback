import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

const headingVariants = cva('text-[var(--text)]', {
  variants: {
    level: {
      1: 'text-[36px] md:text-[64px] font-medium leading-[1.2] mb-8 md:mb-12',
      2: 'text-[28px] md:text-[40px] font-normal leading-[1.2] tracking-[-0.02em] mb-3',
      3: 'text-[24px] md:text-[32px] font-normal leading-[1.2] mb-4',
      4: 'text-[20px] md:text-[24px] font-normal leading-[1.3] mb-3',
      5: 'text-[16px] md:text-[18px] font-normal leading-[1.4] mb-2',
      6: 'text-[14px] md:text-[16px] font-normal leading-[1.4] mb-2',
    },
    mono: {
      true: 'font-mono',
      false: '',
    },
  },
  defaultVariants: {
    level: 2,
    mono: false,
  },
})

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6
type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

export interface HeadingProps
  extends React.HTMLAttributes<HTMLHeadingElement>,
    Omit<VariantProps<typeof headingVariants>, 'level'> {
  level?: HeadingLevel
  as?: HeadingTag
}

const Heading = React.forwardRef<HTMLHeadingElement, HeadingProps>(
  ({ className, level = 2, as, mono, ...props }, ref) => {
    const Tag: HeadingTag = as ?? `h${level}`
    return (
      <Tag
        ref={ref}
        className={cn(headingVariants({ level, mono, className }))}
        {...props}
      />
    )
  }
)
Heading.displayName = 'Heading'

export { Heading, headingVariants }
