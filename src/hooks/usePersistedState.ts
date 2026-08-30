import {
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from "react";

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
function useLocalStorageSnapshot<T>(compute: () => T, serverValue: T): T {
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

/**
 * Mutable state seeded from a browser-only source, hydration-safe.
 *
 * Combines `useLocalStorageSnapshot` with the "adjusting state during
 * rendering" pattern (see https://react.dev/learn/you-might-not-need-an-effect)
 * so the real persisted value replaces the SSR-safe default as soon as it's
 * known, in the same render pass — no effect, no setState-in-effect flag,
 * no flicker. After that one-time sync, `setValue` behaves like normal
 * `useState` for interactive updates.
 */
export function usePersistedState<T>(
  compute: () => T,
  serverValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const persisted = useLocalStorageSnapshot(compute, serverValue);
  const [value, setValue] = useState(persisted);
  const [synced, setSynced] = useState(persisted);

  if (persisted !== synced) {
    setSynced(persisted);
    setValue(persisted);
  }

  return [value, setValue];
}
