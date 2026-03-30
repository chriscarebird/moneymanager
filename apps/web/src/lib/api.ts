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
};
