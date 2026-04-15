/** Typed API client — thin wrapper around fetch */

type ApiResponse<T> = { data: T | null; error: string | null };

async function apiFetch<T>(path: string, init?: Parameters<typeof fetch>[1]): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (json.error) throw new Error(json.error);
  return json.data as T;
}

// ── Types mirrored from @investpilot/core (avoid importing in browser) ────────

export type Holding = {
  snapshotId: string;
  assetType: 'ETF' | 'Stock';
  name: string;
  isin: string;
  quantity: number;
  priceCents: number;
  valueCents: number;
  exchange: string;
};

export type PortfolioSnapshot = {
  id: string;
  date: string;
  source: 'screenshot' | 'manual';
  rawImageUrl: string | null;
  holdings: Holding[];
};

export type UberEquity = {
  type: 'RSU' | 'ESPP' | 'Direct_Shares';
  sharesHeld: number;
  sharesAvailableToTransact: number;
  marketValueUsdCents: number;
  holdingPeriodActive: boolean;
};

export type UberRSUGrant = {
  grantId: string;
  totalRsus: number;
  vestingCommencementDate: string;
  vestingFormula: string;
  dateOfGrant: string;
  sourceDocumentUrl: string | null;
  status: 'active' | 'fully_vested' | 'forfeited';
};

export type TargetAllocation = {
  id: string;
  assetClass: string;
  etfIsin: string;
  etfName: string;
  targetPct: number;
  exchange: string;
  isFreeEtf: boolean;
  active: boolean;
};

export type CashBalance = { amountCents: number; dateUpdated: string } | null;

export type PendingTransfer = {
  id: string;
  source: string;
  destination: string;
  amountUsdCents: number | null;
  amountEurCents: number | null;
  fxRate: number | null;
  status: 'pending' | 'completed';
  dateInitiated: string;
  dateCompleted: string | null;
};

export type TradingWindow = {
  id: string;
  userId: string;
  quarter: string;
  openDate: string;
  closeDate: string | null;
  state: 'scheduled' | 'open' | 'advice_ready' | 'sold' | 'transfer_pending' | 'transfer_arrived' | 'complete';
  adviceJson: string | null;
  sharesSold: number | null;
  proceedsUsdCents: number | null;
  transferId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LivePrices = {
  uberUsdCents: number | null;
  fxRateUsdEur: number | null;
  etfPricesEurCents: Record<string, number>;
  fetchedAt: string;
};

export type AdviceResponse = {
  adviceId?: string;
  summary: string;
  recommendation: string;
  actions: Array<{
    priority: 'high' | 'medium' | 'low';
    action: string;
    rationale: string;
    amountCents?: number;
  }>;
  risks?: string[];
  notes?: string;
};

export type TransactionHistory = {
  id: string;
  date: string;
  action: 'buy' | 'sell';
  asset: string;
  isin: string;
  quantity: number;
  priceCents: number;
  feeCents: number;
  exchange: string;
};

export type SnapshotHistoryPoint = {
  date: string;
  totalValueCents: number;
};

export type EtfScore = {
  isin: string;
  name: string;
  exchange: string;
  isCoreSelection: boolean;
  typicalSpreadBps: number | null;
  avgDailyVolume: number | null;
};

export type NotificationPrefs = {
  tradingWindowEnabled: boolean;
  monthlyInvestmentEnabled: boolean;
  vestingAlertsEnabled: boolean;
  driftAlertsEnabled: boolean;
  quarterlyReviewEnabled: boolean;
};

// ── Portfolio ─────────────────────────────────────────────────────────────────

export const api = {
  getLatestSnapshot: () => apiFetch<PortfolioSnapshot | null>('/api/portfolio/snapshots/latest'),
  getSnapshots: () => apiFetch<Omit<PortfolioSnapshot, 'holdings'>[]>('/api/portfolio/snapshots'),
  saveSnapshot: (body: unknown) =>
    apiFetch<{ id: string }>('/api/portfolio/snapshots', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getUberEquity: () => apiFetch<UberEquity[]>('/api/portfolio/uber'),
  getRSUGrants: () => apiFetch<UberRSUGrant[]>('/api/portfolio/rsu-grants'),

  // ── Settings ────────────────────────────────────────────────────────────────

  getTargets: () => apiFetch<TargetAllocation[]>('/api/settings/targets'),
  saveTarget: (body: unknown) =>
    apiFetch<{ id: string }>('/api/settings/targets', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteTarget: (id: string) => apiFetch<null>(`/api/settings/targets/${id}`, { method: 'DELETE' }),

  getCash: () => apiFetch<CashBalance>('/api/settings/cash'),
  setCash: (amountCents: number) =>
    apiFetch<null>('/api/settings/cash', {
      method: 'PUT',
      body: JSON.stringify({ amountCents }),
    }),

  // ── Advice ──────────────────────────────────────────────────────────────────

  getRebalanceAdvice: (cashCents?: number) =>
    apiFetch<AdviceResponse>('/api/advice/rebalance', {
      method: 'POST',
      body: JSON.stringify({ cashCents }),
    }),

  getRSUAdvice: (uberPriceUsdCents?: number) =>
    apiFetch<AdviceResponse>('/api/advice/rsu', {
      method: 'POST',
      body: JSON.stringify({ uberPriceUsdCents }),
    }),

  getDCAAdvice: (amountEurCents: number) =>
    apiFetch<AdviceResponse>('/api/advice/dca', {
      method: 'POST',
      body: JSON.stringify({ amountEurCents }),
    }),

  getStrategyAdvice: (uberPriceUsdCents?: number, fxRate?: number) =>
    apiFetch<AdviceResponse>('/api/advice/strategy', {
      method: 'POST',
      body: JSON.stringify({ uberPriceUsdCents, fxRate }),
    }),

  getUberSellAdvice: (uberPriceUsdCents?: number, fxRate?: number) =>
    apiFetch<AdviceResponse>('/api/advice/uber-sell', {
      method: 'POST',
      body: JSON.stringify({ uberPriceUsdCents, fxRate }),
    }),

  getAdviceLog: () =>
    apiFetch<Array<{ id: string; date: string; type: string; recommendationText: string; wasFollowed: boolean | null; stale: boolean }>>('/api/advice/log'),

  markAdviceFollowed: (id: string, wasFollowed: boolean) =>
    apiFetch<null>(`/api/advice/log/${id}/followed`, {
      method: 'PATCH',
      body: JSON.stringify({ wasFollowed }),
    }),

  // ── Transfers ────────────────────────────────────────────────────────────────

  getTransfers: () => apiFetch<PendingTransfer[]>('/api/transfers'),
  createTransfer: (body: unknown) =>
    apiFetch<{ id: string }>('/api/transfers', { method: 'POST', body: JSON.stringify(body) }),
  updateTransferStatus: (id: string, status: 'pending' | 'completed') =>
    apiFetch<null>(`/api/transfers/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  // ── Trading Windows ──────────────────────────────────────────────────────────

  getTradingWindows: () => apiFetch<TradingWindow[]>('/api/trading-windows'),
  getNextTradingWindow: () => apiFetch<TradingWindow | null>('/api/trading-windows/next'),
  saveTradingWindow: (body: { quarter: string; openDate: string; closeDate?: string }) =>
    apiFetch<{ id: string }>('/api/trading-windows', { method: 'POST', body: JSON.stringify(body) }),
  advanceTradingWindow: (id: string, state: string, extra?: Record<string, unknown>) =>
    apiFetch<{ transferId: string | null }>(`/api/trading-windows/${id}/state`, {
      method: 'PATCH',
      body: JSON.stringify({ state, ...extra }),
    }),

  // ── Market data (Phase 2B) ────────────────────────────────────────────────

  getLivePrices: () => apiFetch<LivePrices>('/api/market/prices'),
  getEtfScores: (isins: string[]) =>
    apiFetch<EtfScore[]>(`/api/market/etf-scores?isins=${isins.join(',')}`),

  // ── History & transactions (Phase 3) ─────────────────────────────────────
  getSnapshotHistory: () =>
    apiFetch<SnapshotHistoryPoint[]>('/api/portfolio/snapshots/history'),
  getTransactions: () => apiFetch<TransactionHistory[]>('/api/portfolio/transactions'),
  saveTransaction: (body: Omit<TransactionHistory, 'id'>) =>
    apiFetch<{ id: string }>('/api/portfolio/transactions', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // ── Notifications (Phase 2C) ─────────────────────────────────────────────

  getPushSubscriptions: () =>
    apiFetch<Array<{ id: string; endpoint: string; createdAt: string }>>('/api/notifications/subscriptions'),
  sendTestPush: () => apiFetch<{ sent: boolean }>('/api/notifications/test', { method: 'POST', body: '{}' }),
  runScheduler: () => apiFetch<{ scheduled: string[]; pushed: string[]; skipped: string[] }>('/api/notifications/scheduler/run', { method: 'POST', body: '{}' }),
  getPendingNotifications: () => apiFetch<unknown[]>('/api/notifications/pending'),
};
