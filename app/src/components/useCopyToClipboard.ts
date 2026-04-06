import { useCallback, useRef, useState } from "react";

/**
 * Reusable hook for copy-to-clipboard with auto-reset feedback state.
 * @param timeout ms before `copied` resets to false (default 1500)
 */
export function useCopyToClipboard(timeout = 1500) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const copy = useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), timeout);
      });
    },
    [timeout],
  );

  return { copied, copy } as const;
}
