/**
 * dashboard-client/src/hooks/useApi.ts — generic data fetching hook.
 *
 * Port of pi-mega-compact's useApi (trimmed: no retry/backoff, no SSE).
 * Polling is supported via `pollInterval` (ms, 0 = no polling).
 */

import { useState, useEffect, useCallback, useRef } from "react";

export interface UseApiResult<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  refetch: () => void;
  lastFetchedAt: number | null;
}

export interface UseApiOptions {
  /** Polling interval in ms. 0 = no polling. */
  pollInterval?: number;
}

export function useApi<T>(
  fetchFn: () => Promise<T>,
  options: UseApiOptions = {},
): UseApiResult<T> {
  const { pollInterval = 0 } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  const mountedRef = useRef(true);

  const doFetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFn();
      if (mountedRef.current) {
        setData(result);
        setLastFetchedAt(Date.now());
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [fetchFn]);

  useEffect(() => {
    mountedRef.current = true;
    doFetch();
    return () => {
      mountedRef.current = false;
    };
  }, [doFetch]);

  useEffect(() => {
    if (pollInterval <= 0) return;
    const timer = setInterval(doFetch, pollInterval);
    return () => clearInterval(timer);
  }, [doFetch, pollInterval]);

  return { data, error, loading, refetch: doFetch, lastFetchedAt };
}
