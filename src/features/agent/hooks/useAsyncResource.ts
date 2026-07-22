import { useCallback, useEffect, useState } from 'react';

/**
 * Minimal async-resource hook.
 *
 * The project ships no data-fetching library, and this is not the moment to add
 * one: the Agent Portal needs read-only fetch-on-mount with loading/error/empty
 * states, which is ~40 lines. If caching, retries or invalidation are ever
 * required, replace this hook's body with TanStack Query — every consumer keeps
 * the same `{ data, error, isLoading, reload }` shape.
 */
export interface AsyncResource<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
  /** Re-runs the fetch, e.g. from a "Réessayer" button. */
  reload: () => void;
}

export function useAsyncResource<T>(
  fetcher: () => Promise<T>,
  /**
   * Values the fetch depends on. Same contract as a `useEffect` dependency
   * array — the fetcher re-runs when one changes.
   */
  deps: readonly unknown[],
): AsyncResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  // The fetcher is typically an inline arrow; deps are supplied by the caller.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fetcher, deps);

  useEffect(() => {
    /*
     * Guards against a slow response from a previous `deps` value overwriting a
     * newer one, and against setting state after unmount. Without this, opening
     * case A then quickly case B can leave A's data on screen.
     */
    let active = true;

    setIsLoading(true);
    setError(null);

    run()
      .then((result) => {
        if (!active) return;
        setData(result);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setData(null);
        setError(cause instanceof Error ? cause : new Error(String(cause)));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [run, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return { data, error, isLoading, reload };
}
