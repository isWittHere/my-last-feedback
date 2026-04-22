/**
 * Web transport adapter (Phase 0 skeleton).
 *
 * Translates `transport.invoke(cmdName, args)` into `fetch('/api/<cmdName>')`
 * calls against the MLFB remote server, and multiplexes `/ws` events through
 * `transport.listen`. Fully implemented in Phase 2.
 *
 * See MLC_MLFB远程反馈_方案B_v0.2_*.md §3.2 + §4.
 */

import type { Transport } from './index';

export const webTransport: Transport = {
  kind: 'web',
  invoke: async <T = unknown>(
    _cmd: string,
    _args?: Record<string, unknown>,
  ): Promise<T> => {
    throw new Error(
      '[webTransport] not implemented yet — arrives with Phase 2 auth + HTTP routes',
    );
  },
  listen: <T = unknown>(
    _event: string,
    _cb: (payload: T) => void,
  ): (() => void) => {
    // Phase 2: open single WS to `/ws`, fan out events by `type` field.
    return () => {};
  },
};
