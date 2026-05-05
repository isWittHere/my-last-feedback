import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

const sectionVariants = cva('', {
  variants: {
    spacing: {
      none: '',
      sm: 'py-12 px-6',
      default: 'py-20 px-6 md:px-12',
      lg: 'py-24 px-6 md:px-12',
      hero: 'min-h-[65vh] flex items-center justify-center',
    },
  },
  defaultVariants: {
    spacing: 'default',
  },
})

export interface SectionProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof sectionVariants> {}

const Section = React.forwardRef<HTMLElement, SectionProps>(
  ({ className, spacing, ...props }, ref) => (
    <section
      ref={ref}
      className={cn(sectionVariants({ spacing, className }))}
      {...props}
    />
  )
)
Section.displayName = 'Section'

export { Section, sectionVariants }
