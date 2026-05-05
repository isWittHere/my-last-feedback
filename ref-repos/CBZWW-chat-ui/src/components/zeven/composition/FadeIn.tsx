import { motion, type HTMLMotionProps } from 'framer-motion'
import { cn } from '@/lib/cn'

export interface FadeInProps extends HTMLMotionProps<'div'> {
  /** Delay in seconds */
  delay?: number
  /** Y-axis offset in px */
  y?: number
  /** Duration in seconds */
  duration?: number
  /** Trigger on viewport intersection (default: false → trigger on mount) */
  inView?: boolean
}

export function FadeIn({
  delay = 0,
  y = 24,
  duration = 0.6,
  inView = false,
  className,
  children,
  ...props
}: FadeInProps) {
  const motionProps = inView
    ? {
        initial: { opacity: 0, y },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true },
        transition: { duration, delay, ease: 'easeOut' as const },
      }
    : {
        initial: { opacity: 0, y },
        animate: { opacity: 1, y: 0 },
        transition: { duration, delay, ease: 'easeOut' as const },
      }

  return (
    <motion.div className={cn(className)} {...motionProps} {...props}>
      {children}
    </motion.div>
  )
}
