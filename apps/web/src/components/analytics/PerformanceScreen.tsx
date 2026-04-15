import type { PortfolioSnapshot, TransactionHistory, SnapshotHistoryPoint } from '../../lib/api.js';
import { formatEur } from '../../lib/calc.js';
import { PortfolioHistoryChart } from '../dashboard/PortfolioHistoryChart.js';

type Props = {
  snapshot: PortfolioSnapshot | null;
  transactions: TransactionHistory[];
  snapshotHistory: SnapshotHistoryPoint[];
  loading: boolean;
};

interface PositionPnL {
  isin: string;
  name: string;
  currentValueCents: number;
  costBasisCents: number;
  gainCents: number;
  gainPct: number;
  costBasisEstimated: boolean;
}

function computePnL(
  snapshot: PortfolioSnapshot,
  transactions: TransactionHistory[],
): PositionPnL[] {
  return snapshot.holdings.map((holding) => {
    const matched = transactions.filter(
      (tx) =>
        (tx.isin && tx.isin === holding.isin) ||
        (!tx.isin && tx.asset === holding.name),
    );
    const buys = matched.filter((tx) => tx.action === 'buy');

    if (buys.length === 0) {
      return {
        isin: holding.isin,
        name: holding.name,
        currentValueCents: holding.valueCents,
        costBasisCents: holding.valueCents,
        gainCents: 0,
        gainPct: 0,
        costBasisEstimated: true,
      };
    }

    const totalQtyBought = buys.reduce((s, tx) => s + tx.quantity, 0);
    const totalCostCents = buys.reduce(
      (s, tx) => s + tx.quantity * tx.priceCents + tx.feeCents,
      0,
    );
    const avgCostPerUnit = totalQtyBought > 0 ? totalCostCents / totalQtyBought : 0;
    const costBasisCents = Math.round(avgCostPerUnit * holding.quantity);
    const gainCents = holding.valueCents - costBasisCents;
    const gainPct = costBasisCents > 0 ? (gainCents / costBasisCents) * 100 : 0;

    return {
      isin: holding.isin,
      name: holding.name,
      currentValueCents: holding.valueCents,
      costBasisCents,
      gainCents,
      gainPct,
      costBasisEstimated: false,
    };
  });
}

export function PerformanceScreen({
  snapshot,
  transactions,
  snapshotHistory,
  loading,
}: Props) {
  if (loading) return <div className="p-6 text-slate-400">Loading…</div>;

  const pnl = snapshot ? computePnL(snapshot, transactions) : [];
  const totalGainCents = pnl.reduce((s, p) => s + p.gainCents, 0);
  const totalCurrentCents = pnl.reduce((s, p) => s + p.currentValueCents, 0);
  const totalGainPct =
    totalCurrentCents - totalGainCents > 0
      ? (totalGainCents / (totalCurrentCents - totalGainCents)) * 100
      : 0;

  return (
    <div className="space-y-4 pb-6">
      {/* Portfolio growth chart */}
      <PortfolioHistoryChart history={snapshotHistory} />

      {/* P&L summary */}
      {snapshot && (
        <div className="bg-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">
              Unrealised P&L
            </p>
            <div className="text-right">
              <span
                className={`text-sm font-bold ${totalGainCents >= 0 ? 'text-green-400' : 'text-red-400'}`}
              >
                {totalGainCents >= 0 ? '+' : ''}
                {formatEur(totalGainCents)}
              </span>
              <span
                className={`text-xs ml-1.5 ${totalGainCents >= 0 ? 'text-green-500' : 'text-red-500'}`}
              >
                ({totalGainPct >= 0 ? '+' : ''}
                {totalGainPct.toFixed(1)}%)
              </span>
            </div>
          </div>

          <div className="space-y-2">
            {pnl.map((p) => (
              <div
                key={p.isin}
                className="flex items-center justify-between py-2 border-b border-slate-700 last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm truncate">{p.name.split('(')[0]?.trim()}</p>
                  <p className="text-slate-500 text-xs">
                    {p.costBasisEstimated ? (
                      <span className="text-amber-600">Cost basis unknown — add transactions</span>
                    ) : (
                      <>Cost {formatEur(p.costBasisCents)}</>
                    )}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-white text-sm font-medium">{formatEur(p.currentValueCents)}</p>
                  <p
                    className={`text-xs ${p.gainCents >= 0 ? 'text-green-400' : 'text-red-400'}`}
                  >
                    {p.gainCents >= 0 ? '+' : ''}
                    {formatEur(p.gainCents)} ({p.gainPct >= 0 ? '+' : ''}
                    {p.gainPct.toFixed(1)}%)
                  </p>
                </div>
              </div>
            ))}
          </div>

          {transactions.length === 0 && (
            <p className="text-amber-500 text-xs mt-3">
              No transactions recorded yet. Cost basis is estimated from current prices.
            </p>
          )}
        </div>
      )}

      {!snapshot && (
        <div className="p-6 text-center">
          <p className="text-slate-400">No portfolio snapshot</p>
          <p className="text-slate-600 text-sm mt-1">Upload a DeGiro screenshot first</p>
        </div>
      )}

      {/* Transaction history */}
      {transactions.length > 0 && (
        <div className="bg-slate-800 rounded-2xl p-5">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-3">
            Recent Transactions ({transactions.length})
          </p>
          <div className="space-y-1.5">
            {transactions.slice(0, 20).map((tx) => (
              <div key={tx.id} className="flex items-center justify-between text-sm py-1">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span
                    className={`text-xs font-bold px-1.5 py-0.5 rounded shrink-0 ${
                      tx.action === 'buy'
                        ? 'bg-blue-900 text-blue-300'
                        : 'bg-red-900 text-red-300'
                    }`}
                  >
                    {tx.action.toUpperCase()}
                  </span>
                  <span className="text-white truncate">{tx.asset.split('(')[0]?.trim()}</span>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-white font-medium">
                    {formatEur(tx.quantity * tx.priceCents)}
                  </span>
                  <span className="text-slate-500 text-xs ml-1.5">
                    {tx.date.slice(0, 10)}
                  </span>
                </div>
              </div>
            ))}
            {transactions.length > 20 && (
              <p className="text-slate-600 text-xs pt-1">
                + {transactions.length - 20} more — download CSV for full history
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
