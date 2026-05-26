/**
 * ZEVEN Motion Presets — reusable framer-motion animation configs
 */
import type { Variants } from 'framer-motion'

/** Fade up on enter */
export const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: 'easeOut' as const },
}

/** Fade up triggered by viewport intersection */
export const fadeUpInView = {
  initial: { opacity: 0, y: 32 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.6, delay: 0.1 },
}

/** Stagger children container */
export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
    },
  },
}

/** Stagger child item */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
}

/** Scale up on hover */
export const scaleOnHover = {
  whileHover: { scale: 1.02 },
  transition: { type: 'spring' as const, stiffness: 300, damping: 20 },
}

/** Delayed fade-in (hero text cascade) */
export function delayedFade(delay: number) {
  return {
    initial: { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, delay, ease: 'easeOut' as const },
  }
}
