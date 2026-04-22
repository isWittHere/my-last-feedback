/**
 * Transport abstraction (Phase 0 skeleton).
 *
 * The desktop Tauri shell invokes Rust commands via `@tauri-apps/api/core`'s
 * `invoke`. The mobile PWA / Android APP shell will hit `/api/*` via HTTP+WSS.
 *
 * Plan: migrate call-sites from direct `invoke(...)` to `transport.invoke(...)`
 * so the same React code can serve both shells.
 *
 * See MLC_MLFB远程反馈_方案B_v0.2_*.md §3.2.
 */

export interface Transport {
  /** Call a named command with a JSON-serialisable argument bag. */
  invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T>;

  /** Subscribe to a named event; returns an unsubscribe function. */
  listen<T = unknown>(event: string, cb: (payload: T) => void): () => void;

  /** Transport kind for UI hints (e.g., show "Pair device" only on desktop). */
  readonly kind: 'tauri' | 'web';
}

// Runtime selection is deferred to later phases (Phase 2+). For now this file
// merely declares the interface so other modules can import the type.
