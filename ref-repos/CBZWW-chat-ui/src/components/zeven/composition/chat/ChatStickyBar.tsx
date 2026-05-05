interface ChatStickyBarProps {
  content: string | null
  onScrollTo: () => void
}

export function ChatStickyBar({ content, onScrollTo }: ChatStickyBarProps) {
  if (!content) return null

  return (
    <>
      <div
        className="hatch-btn-hover-gray bg-[var(--bg)] cursor-pointer transition-colors"
        onClick={onScrollTo}
      >
        <div className="mx-auto max-w-3xl px-4 py-2">
          <div className="w-fit max-w-[80%] ml-auto text-left text-sm text-[var(--text-muted)] font-mono">
            {content}
          </div>
        </div>
      </div>
      <div className="h-6 bg-gradient-to-b from-[var(--bg)] to-transparent pointer-events-none" />
    </>
  )
}
