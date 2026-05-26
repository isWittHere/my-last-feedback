import type { SessionListMode } from "../sessionNavigationSettings";

export function SessionNavigationModeIcon({ mode }: { mode: SessionListMode }) {
  return (
    <span className={`session-nav-mode-icon session-nav-mode-icon-${mode}`} aria-hidden="true">
      {mode !== "topbarStats" ? <span className="session-nav-mode-divider" /> : null}
      {mode === "topbarStats" ? (
        <span className="session-nav-mode-bars">
          <span />
          <span />
          <span />
        </span>
      ) : null}
    </span>
  );
}
