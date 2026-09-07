import { useCallback, useEffect, useRef, useState } from 'react';

/** Copy-to-clipboard with a self-resetting "copied" flag and a `document.execCommand` fallback. */
export function useCopyToClipboard(resetAfterMs = 1600) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(
    async (text: string, key = 'default') => {
      if (!text) return false;

      let ok = false;
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch {
        // Older browsers / non-secure contexts.
        try {
          const area = document.createElement('textarea');
          area.value = text;
          area.setAttribute('readonly', '');
          area.style.position = 'fixed';
          area.style.opacity = '0';
          document.body.appendChild(area);
          area.select();
          ok = document.execCommand('copy');
          area.remove();
        } catch {
          ok = false;
        }
      }

      if (ok) {
        setCopiedKey(key);
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopiedKey(null), resetAfterMs);
      }
      return ok;
    },
    [resetAfterMs],
  );

  return { copy, copiedKey };
}
