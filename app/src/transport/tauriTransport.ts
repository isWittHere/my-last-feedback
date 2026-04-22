/**
 * Tauri transport adapter (Phase 0 skeleton).
 *
 * Wraps `@tauri-apps/api/core` `invoke` + `@tauri-apps/api/event` `listen` to
 * satisfy the shared `Transport` interface. Fully implemented in Phase 2 when
 * call-sites are migrated from raw `invoke(...)`.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen as tauriListen } from '@tauri-apps/api/event';
import type { Transport } from './index';

export const tauriTransport: Transport = {
  kind: 'tauri',
  invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) =>
    invoke<T>(cmd, args),
  listen: <T = unknown>(event: string, cb: (payload: T) => void) => {
    let unlistenPromise = tauriListen<T>(event, (e) => cb(e.payload));
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  },
};
