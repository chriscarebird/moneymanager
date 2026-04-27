import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { PortfolioSnapshot, TransactionHistory, EtfSectorRow } from '../../lib/api.js';
import { formatEur } from '../../lib/calc.js';
import { api } from '../../lib/api.js';

type Props = {
  snapshot: PortfolioSnapshot | null;
  transactions: TransactionHistory[];
  cashCents: number;
  loading: boolean;
  etfSectors: EtfSectorRow[];
  onSectorsRefreshed: () => void;
};

// ── Calculations ──────────────────────────────────────────────────────────────

interface PositionPnL {
  isin: string;
  name: string;
  ticker: string;
  currentValueCents: number;
  costBasisCents: number;
  gainCents: number;
  gainPct: number;
  costBasisEstimated: boolean;
}

function computeUnrealisedPnL(
  snapshot: PortfolioSnapshot,
  transactions: TransactionHistory[],
  etfSectors: EtfSectorRow[],
): PositionPnL[] {
  const tickerMap = new Map(etfSectors.map((s) => [s.isin, s.ticker]));

  return snapshot.holdings.map((holding) => {
    const matched = transactions.filter(
      (tx) => (tx.isin && tx.isin === holding.isin) || (!tx.isin && tx.asset === holding.name),
    );
    const buys = matched.filter((tx) => tx.action === 'buy');

    if (buys.length === 0) {
      return {
        isin: holding.isin,
        name: holding.name,
        ticker: tickerMap.get(holding.isin) ?? '',
        currentValueCents: holding.valueCents,
        costBasisCents: holding.valueCents,
        gainCents: 0,
        gainPct: 0,
        costBasisEstimated: true,
      };
    }

    const totalQtyBought = buys.reduce((s, tx) => s + tx.quantity, 0);
    const totalCostCents = buys.reduce((s, tx) => s + tx.quantity * tx.priceCents + tx.feeCents, 0);
    const avgCostPerUnit = totalQtyBought > 0 ? totalCostCents / totalQtyBought : 0;
    const costBasisCents = Math.round(avgCostPerUnit * holding.quantity);
    const gainCents = holding.valueCents - costBasisCents;
    const gainPct = costBasisCents > 0 ? (gainCents / costBasisCents) * 100 : 0;

    return {
      isin: holding.isin,
      name: holding.name,
      ticker: tickerMap.get(holding.isin) ?? '',
      currentValueCents: holding.valueCents,
      costBasisCents,
      gainCents,
      gainPct,
      costBasisEstimated: false,
    };
  });
}

interface RealisedResult {
  totalGainCents: number;
  bySell: { isin: string; gainCents: number }[];
}

function computeRealisedPnL(transactions: TransactionHistory[]): RealisedResult {
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const lots = new Map<string, Array<{ qty: number; costPerUnit: number }>>();
  let totalGainCents = 0;
  const bySell: { isin: string; gainCents: number }[] = [];

  for (const tx of sorted) {
    if (!tx.isin) continue;
    const isinLots = lots.get(tx.isin) ?? [];
    lots.set(tx.isin, isinLots);

    if (tx.action === 'buy') {
      // costPerUnit includes fee distributed across shares
      const costPerUnit = tx.quantity > 0 ? (tx.quantity * tx.priceCents + tx.feeCents) / tx.quantity : tx.priceCents;
      isinLots.push({ qty: tx.quantity, costPerUnit });
    } else if (tx.action === 'sell') {
      const sellPricePerShare = tx.priceCents;
      let sharesToSell = tx.quantity;
      let gain = 0;
      while (sharesToSell > 0 && isinLots.length > 0) {
        const lot = isinLots[0]!;
        const used = Math.min(lot.qty, sharesToSell);
        gain += Math.round((sellPricePerShare - lot.costPerUnit) * used);
        lot.qty -= used;
        sharesToSell -= used;
        if (lot.qty === 0) isinLots.shift();
      }
      totalGainCents += gain;
      bySell.push({ isin: tx.isin, gainCents: gain });
    }
  }

  return { totalGainCents, bySell };
}

interface SectorBar {
  sector: string;
  pct: number;
}

function blendSectors(snapshot: PortfolioSnapshot, etfSectors: EtfSectorRow[]): SectorBar[] {
  const sectorMap = new Map(etfSectors.map((s) => [s.isin, s]));
  const equityHoldings = snapshot.holdings.filter((h) => {
    const s = sectorMap.get(h.isin);
    return !s?.isBond;
  });
  const equityTotal = equityHoldings.reduce((s, h) => s + h.valueCents, 0);
  if (equityTotal === 0) return [];

  const blended: Record<string, number> = {};
  for (const h of equityHoldings) {
    const s = sectorMap.get(h.isin);
    if (!s || Object.keys(s.sectors).length === 0) continue;
    const weight = h.valueCents / equityTotal;
    for (const [sector, pct] of Object.entries(s.sectors)) {
      blended[sector] = (blended[sector] ?? 0) + pct * weight;
    }
  }

  return Object.entries(blended)
    .map(([sector, pct]) => ({ sector, pct: Math.round(pct * 10) / 10 }))
    .sort((a, b) => b.pct - a.pct);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-slate-700 rounded-xl p-3">
      <p className="text-slate-400 text-[10px] font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className="text-white font-bold text-base leading-tight">{value}</p>
      {sub && <p className="text-slate-500 text-[10px] mt-0.5">{sub}</p>}
    </div>
  );
}

function GainText({ cents, pct }: { cents: number; pct?: number }) {
  const color = cents >= 0 ? 'text-green-400' : 'text-red-400';
  return (
    <span className={color}>
      {cents >= 0 ? '+' : ''}{formatEur(cents)}
      {pct !== undefined && ` (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PortfolioAnalytics({ snapshot, transactions, cashCents, loading, etfSectors, onSectorsRefreshed }: Props) {
  const [refreshing, setRefreshing] = useState(false);

  if (loading) return <div className="bg-slate-800 rounded-2xl p-5 text-slate-400 text-sm">Loading…</div>;
  if (!snapshot) return null;

  const pnl = computeUnrealisedPnL(snapshot, transactions, etfSectors);
  const { totalGainCents: realisedGainCents } = computeRealisedPnL(transactions);
  const sectorBars = blendSectors(snapshot, etfSectors);

  const totalEtfCents = snapshot.holdings.reduce((s, h) => s + h.valueCents, 0);
  const totalPortfolioCents = totalEtfCents + cashCents;

  const totalInvestedCents = pnl.filter((p) => !p.costBasisEstimated).reduce((s, p) => s + p.costBasisCents, 0);
  const totalUnrealisedGain = pnl.reduce((s, p) => s + p.gainCents, 0);
  const totalCurrentCents = pnl.reduce((s, p) => s + p.currentValueCents, 0);
  const totalUnrealisedPct =
    totalCurrentCents - totalUnrealisedGain > 0
      ? (totalUnrealisedGain / (totalCurrentCents - totalUnrealisedGain)) * 100
      : 0;

  const hasTransactions = transactions.length > 0;
  const isins = snapshot.holdings.map((h) => h.isin);

  async function handleRefreshSectors() {
    setRefreshing(true);
    try {
      await api.refreshSectors(isins);
      onSectorsRefreshed();
    } finally {
      setRefreshing(false);
    }
  }

  // Sector source caption
  const sectorMap = new Map(etfSectors.map((s) => [s.isin, s]));
  const unknownIsins = snapshot.holdings.filter((h) => !sectorMap.has(h.isin)).map((h) => h.isin);
  const bondIsins = snapshot.holdings.filter((h) => sectorMap.get(h.isin)?.isBond).map((h) => h.isin);
  const lastUpdated = etfSectors.length > 0
    ? etfSectors.reduce((latest, s) => (s.updatedAt > latest ? s.updatedAt : latest), '')
    : null;

  return (
    <div className="space-y-4">
      {/* 4-stat header */}
      <div className="bg-slate-800 rounded-2xl p-5">
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-3">
          DeGIRO Portfolio
        </p>
        <div className="grid grid-cols-2 gap-2">
          <StatCard
            label="Total portfolio"
            value={formatEur(totalPortfolioCents)}
            sub={`as of ${snapshot.date.slice(0, 10)}`}
          />
          <StatCard
            label="Total invested"
            value={hasTransactions ? formatEur(totalInvestedCents) : '—'}
            sub={hasTransactions ? 'cost basis (excl. cash)' : 'add transactions'}
          />
          <StatCard
            label="Unrealised P&L"
            value={hasTransactions
              ? `${totalUnrealisedGain >= 0 ? '+' : ''}${formatEur(totalUnrealisedGain)}`
              : '—'}
            {...(hasTransactions ? { sub: `${totalUnrealisedPct >= 0 ? '+' : ''}${totalUnrealisedPct.toFixed(1)}% since purchase` } : {})}
          />
          <StatCard
            label="Realised P&L"
            value={hasTransactions
              ? `${realisedGainCents >= 0 ? '+' : ''}${formatEur(realisedGainCents)}`
              : '—'}
            {...(hasTransactions && realisedGainCents === 0 ? { sub: 'no sells yet' } : {})}
          />
        </div>
      </div>

      {/* P&L by holding */}
      <div className="bg-slate-800 rounded-2xl p-5">
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-3">
          Unrealised P&L by Holding
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left pb-2 text-slate-500 font-medium">Holding</th>
                <th className="text-right pb-2 text-slate-500 font-medium">Cost basis</th>
                <th className="text-right pb-2 text-slate-500 font-medium">Value</th>
                <th className="text-right pb-2 text-slate-500 font-medium">P&L</th>
                <th className="text-right pb-2 text-slate-500 font-medium">%</th>
              </tr>
            </thead>
            <tbody>
              {pnl.map((p) => (
                <tr key={p.isin} className="border-b border-slate-700 last:border-0">
                  <td className="py-2 pr-2">
                    <p className="text-white font-medium">{p.ticker || p.name.split('(')[0]?.trim()}</p>
                    {p.costBasisEstimated && (
                      <p className="text-amber-600 text-[10px]">Cost basis unknown</p>
                    )}
                  </td>
                  <td className="py-2 text-right text-slate-400">
                    {p.costBasisEstimated ? '—' : formatEur(p.costBasisCents)}
                  </td>
                  <td className="py-2 text-right text-white">{formatEur(p.currentValueCents)}</td>
                  <td className="py-2 text-right">
                    {p.costBasisEstimated ? (
                      <span className="text-slate-500">—</span>
                    ) : (
                      <GainText cents={p.gainCents} />
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {p.costBasisEstimated ? (
                      <span className="text-slate-500">—</span>
                    ) : (
                      <span className={p.gainPct >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {p.gainPct >= 0 ? '+' : ''}{p.gainPct.toFixed(1)}%
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-600">
                <td className="pt-2 text-slate-400 font-medium">Total</td>
                <td className="pt-2 text-right text-slate-400">{hasTransactions ? formatEur(totalInvestedCents) : '—'}</td>
                <td className="pt-2 text-right text-white font-medium">{formatEur(totalEtfCents)}</td>
                <td className="pt-2 text-right">
                  {hasTransactions ? <GainText cents={totalUnrealisedGain} /> : <span className="text-slate-500">—</span>}
                </td>
                <td className="pt-2 text-right">
                  {hasTransactions ? (
                    <span className={totalUnrealisedGain >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {totalUnrealisedPct >= 0 ? '+' : ''}{totalUnrealisedPct.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {!hasTransactions && (
          <p className="text-amber-500 text-xs mt-3">
            No transactions yet — upload a DeGiro transaction export from the Upload tab.
          </p>
        )}
      </div>

      {/* Sector allocation */}
      <div className="bg-slate-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">
            Sector Allocation
          </p>
          <button
            onClick={handleRefreshSectors}
            disabled={refreshing}
            className="flex items-center gap-1 text-slate-500 hover:text-blue-400 transition-colors disabled:opacity-50"
            title="Refresh sector data from live sources"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            <span className="text-[10px]">Refresh</span>
          </button>
        </div>

        {sectorBars.length === 0 ? (
          <p className="text-slate-500 text-sm">No sector data available — click Refresh to load.</p>
        ) : (
          <div className="space-y-1.5">
            {sectorBars.map(({ sector, pct }) => (
              <div key={sector} className="flex items-center gap-2">
                <div className="w-36 shrink-0 text-slate-400 text-[11px] truncate">{sector}</div>
                <div className="flex-1 bg-slate-700 rounded-full h-2.5">
                  <div
                    className="h-2.5 bg-blue-500 rounded-full"
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
                <div className="w-10 text-right text-slate-400 text-[11px]">{pct.toFixed(1)}%</div>
              </div>
            ))}
          </div>
        )}

        {/* Caption */}
        <div className="mt-3 space-y-0.5">
          {bondIsins.length > 0 && (
            <p className="text-slate-600 text-[10px]">Bond ETFs excluded: {bondIsins.join(', ')}</p>
          )}
          {unknownIsins.length > 0 && (
            <p className="text-slate-600 text-[10px]">Sector data unavailable for: {unknownIsins.join(', ')}</p>
          )}
          {lastUpdated && (
            <p className="text-slate-600 text-[10px]">
              Sources: {[...new Set(etfSectors.map((s) => s.source))].join(', ')} · Updated {lastUpdated.slice(0, 10)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
