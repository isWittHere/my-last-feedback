import { useState, useRef, useCallback } from 'react'
import { CaretDown, Check } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'
import { useClickOutside } from '@/lib/useClickOutside'
import { MODELS, MODEL_PROVIDERS, type Model } from '@/constants/models'

interface ModelPickerProps {
  selectedModel: Model
  onSelect: (model: Model) => void
}

export function ModelPicker({ selectedModel, onSelect }: ModelPickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])
  useClickOutside(ref, close, open)

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs font-mono text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--bg-card)] transition-colors"
      >
        {selectedModel.label}
        <CaretDown size={11} weight="bold" />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-1 min-w-[176px] rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] shadow-lg overflow-hidden z-50">
          {MODEL_PROVIDERS.map((provider) => {
            const providerModels = MODELS.filter((m) => m.tag === provider)
            return (
              <div key={provider}>
                <div className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">
                  {provider}
                </div>
                {providerModels.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => {
                      onSelect(model)
                      setOpen(false)
                    }}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-1.5 text-xs font-mono transition-colors',
                      model.id === selectedModel.id
                        ? 'hatch-btn text-[var(--accent-blue)] bg-[var(--bg-card)]'
                        : 'text-[var(--text)] hover:bg-[var(--bg-card)]',
                    )}
                  >
                    {model.label}
                    {model.id === selectedModel.id && (
                      <Check size={12} weight="bold" className="ml-auto shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
