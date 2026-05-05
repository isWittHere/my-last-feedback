import { useState } from 'react'
import { CaretDown } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'
import { motion, AnimatePresence } from 'framer-motion'

export interface FAQItem {
  question: string
  answer: string
}

export interface FAQSectionProps {
  items: FAQItem[]
  className?: string
}

function FAQAccordion({ item, isOpen, onToggle }: { item: FAQItem; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-[var(--border)]">
      <button
        onClick={onToggle}
        className={cn(
          'w-full flex items-center justify-between gap-4 py-5 px-1 text-left hover:hatch-45',
          'text-sm font-mono text-[var(--text)] hover:text-[var(--accent-blue)] hover:hatch-45 transition-colors'
        )}
      >
        <span>{item.question}</span>
        <CaretDown
          size={14}
          className={cn(
            'flex-shrink-0 text-[var(--text-muted)] transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <p className="px-1 pb-5 text-sm text-[var(--text-muted)] leading-relaxed">
              {item.answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function FAQSection({ items, className }: FAQSectionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <div className={cn('max-w-2xl mx-auto', className)}>
      <div className="border-t border-[var(--border)]">
        {items.map((item, index) => (
          <FAQAccordion
            key={index}
            item={item}
            isOpen={openIndex === index}
            onToggle={() => setOpenIndex(openIndex === index ? null : index)}
          />
        ))}
      </div>
    </div>
  )
}
