import { useState, useEffect, useCallback } from 'react';
import {
  api,
  type PortfolioSnapshot,
  type UberEquity,
  type UberRSUGrant,
  type TargetAllocation,
  type CashBalance,
  type TradingWindow,
  type LivePrices,
} from '../lib/api.js';

type AsyncState<T> = { data: T | null; loading: boolean; error: string | null };

function useAsync<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
): AsyncState<T> & { refetch: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });

  const run = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    fetcher()
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((err: unknown) =>
        setState({
          data: null,
          loading: false,
          error: err instanceof Error ? err.message : 'Error',
        }),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
  }, [run]);

  return { ...state, refetch: run };
}

export function useLatestSnapshot() {
  return useAsync<PortfolioSnapshot | null>(() => api.getLatestSnapshot());
}

export function useUberEquity() {
  return useAsync<UberEquity[]>(() => api.getUberEquity());
}

export function useRSUGrants() {
  return useAsync<UberRSUGrant[]>(() => api.getRSUGrants());
}

export function useTargetAllocations() {
  return useAsync<TargetAllocation[]>(() => api.getTargets());
}

export function useCashBalance() {
  return useAsync<CashBalance>(() => api.getCash());
}

export function useNextTradingWindow() {
  return useAsync<TradingWindow | null>(() => api.getNextTradingWindow());
}

/** Polls live market prices every 5 minutes. Pass null to skip. */
export function useLivePrices(enabled = true) {
  const [state, setState] = useState<AsyncState<LivePrices>>({
    data: null,
    loading: enabled,
    error: null,
  });

  const fetch = useCallback(() => {
    if (!enabled) return;
    setState((s) => ({ ...s, loading: true }));
    api
      .getLivePrices()
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((err: unknown) =>
        setState({ data: null, loading: false, error: err instanceof Error ? err.message : 'Error' }),
      );
  }, [enabled]);

  useEffect(() => {
    fetch();
    if (!enabled) return;
    const interval = setInterval(fetch, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetch, enabled]);

  return { ...state, refetch: fetch };
}
