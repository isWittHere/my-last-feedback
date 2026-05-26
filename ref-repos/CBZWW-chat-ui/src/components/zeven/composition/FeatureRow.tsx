import * as React from 'react'
import { cn } from '@/lib/cn'
import { Heading } from '@/components/zeven/typography/Heading'
import { Text } from '@/components/zeven/typography/Text'
import { FadeIn } from './FadeIn'

export interface FeatureRowProps {
  /** Section index (displayed as 01, 02, ...) */
  index?: number
  title: string
  subtitle?: string
  description: string
  /** Icon element rendered above the index */
  icon?: React.ReactNode
  /** Content rendered on the right side */
  children: React.ReactNode
  className?: string
  /** Reverse layout (visualization left, text right) */
  reverse?: boolean
}

export function FeatureRow({
  index,
  title,
  subtitle,
  description,
  icon,
  children,
  className,
  reverse = false,
}: FeatureRowProps) {
  return (
    <FadeIn inView y={32} className={className}>
      <div className={cn('grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-center')}>
        {/* Text side */}
        <div className={cn(reverse && 'md:order-2')}>
          {icon && <div className="mb-4">{icon}</div>}
          {index != null && (
            <Text variant="mono" size="xs" className="uppercase mb-3" style={{ letterSpacing: '0.5px' }}>
              {String(index).padStart(2, '0')}
            </Text>
          )}
          <Heading level={3}>{title}</Heading>
          {subtitle && (
            <Text variant="accent" size="lg" className="mb-6">
              {subtitle}
            </Text>
          )}
          <Text variant="muted" className="max-w-md" style={{ lineHeight: 1.8 }}>
            {description}
          </Text>
        </div>

        {/* Visualization side */}
        <div className={cn('flex flex-col justify-center', reverse && 'md:order-1')}>
          {children}
        </div>
      </div>
    </FadeIn>
  )
}
