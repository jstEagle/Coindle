import { useCallback, useRef, useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * Reads a browser-only value (e.g. localStorage) without the setState-in-effect
 * pattern. `getServerSnapshot` renders during SSR and the client's hydration
 * pass so markup matches; React then re-renders with the real `compute()`
 * result immediately after hydration, with no manual effect required.
 *
 * The result of `compute` is cached for the lifetime of the hook instance —
 * this is a one-shot read, not a live subscription to external changes.
 */
export function useLocalStorageSnapshot<T>(compute: () => T, serverValue: T): T {
  const cache = useRef<{ value: T } | null>(null);

  const getSnapshot = useCallback(() => {
    if (cache.current === null) {
      cache.current = { value: compute() };
    }
    return cache.current.value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getServerSnapshot = useCallback(() => serverValue, [serverValue]);

  return useSyncExternalStore(noopSubscribe, getSnapshot, getServerSnapshot);
}
