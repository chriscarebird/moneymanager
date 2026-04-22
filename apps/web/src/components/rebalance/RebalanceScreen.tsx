import { useState, useEffect } from 'react';
import type { PortfolioSnapshot, TargetAllocation, EtfScore } from '../../lib/api.js';
import { api } from '../../lib/api.js';
import { totalEtfEurCents, formatEur, formatPct } from '../../lib/calc.js';

type Props = {
  snapshot: PortfolioSnapshot | null;
  targets: TargetAllocation[];
  cashCents: number;
  loading: boolean;
};

const CHARGED_FEE_CENTS = 200; // €2.00 per paid trade

type Trade = {
  isin: string;
  name: string;
  action: 'buy';
  amountCents: number;
  driftPct: number;
  executed: boolean;
  isFreeEtf: boolean;
  estimatedFeeCents: number;
};

const MIN_ORDER_CENTS = 20_000; // €200 — fee overhead threshold

/**
 * Buy-only rebalancing: never force a sell.
 * Deploys available cash into the most underweight positions proportionally,
 * capped at each position's full shortfall.  Skips orders below €200 to avoid
 * paying the €2 DeGiro fee on a trivially small trade.
 *
 * The denominator for all % calculations is (current ETF value + cash) so
 * drift figures reflect where the portfolio lands once cash is deployed.
 */
function computeTrades(
  snapshot: PortfolioSnapshot,
  targets: TargetAllocation[],
  cashCents: number,
): Trade[] {
  // Use investable total (ETF + cash) so drift reflects post-deployment state
  const investable = totalEtfEurCents(snapshot) + cashCents;
  if (investable === 0 || cashCents <= 0) return [];

  const activeTargets = targets.filter((t) => t.active);

  // Find underweight positions and their shortfall vs target
  const underweight = activeTargets.flatMap((target) => {
    const holding = snapshot.holdings.find((h) => h.isin === target.etfIsin);
    const actualCents = holding?.valueCents ?? 0;
    const targetCents = Math.round((target.targetPct / 100) * investable);
    const shortfall = targetCents - actualCents;
    const driftPct = (actualCents / investable) * 100 - target.targetPct;
    return shortfall > 0 ? [{ target, shortfall, driftPct }] : [];
  });

  if (underweight.length === 0) return [];

  // Proportionally split cash across shortfalls, capped per position
  const totalShortfall = underweight.reduce((s, u) => s + u.shortfall, 0);
  const trades: Trade[] = [];

  for (const { target, shortfall, driftPct } of underweight) {
    const proportion = shortfall / totalShortfall;
    const buyAmount = Math.min(Math.round(cashCents * proportion), shortfall);
    if (buyAmount < MIN_ORDER_CENTS) continue;

    trades.push({
      isin: target.etfIsin,
      name: target.etfName,
      action: 'buy',
      amountCents: buyAmount,
      driftPct,
      executed: false,
      isFreeEtf: target.isFreeEtf,
      estimatedFeeCents: target.isFreeEtf ? 0 : CHARGED_FEE_CENTS,
    });
  }

  // Most underweight position first
  trades.sort((a, b) => a.driftPct - b.driftPct);
  return trades;
}

export function RebalanceScreen({ snapshot, targets, cashCents, loading }: Props) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [computed, setComputed] = useState(false);
  const [etfScores, setEtfScores] = useState<Record<string, EtfScore>>({});

  useEffect(() => {
    const isins = targets.map((t) => t.etfIsin).filter(Boolean);
    if (isins.length === 0) return;
    api.getEtfScores(isins).then((scores) => {
      const map: Record<string, EtfScore> = {};
      for (const s of scores) map[s.isin] = s;
      setEtfScores(map);
    }).catch(() => { /* non-critical */ });
  }, [targets]);

  function compute() {
    if (!snapshot) return;
    setTrades(computeTrades(snapshot, targets, cashCents));
    setComputed(true);
  }

  function toggleExecuted(i: number) {
    setTrades((prev) => prev.map((t, idx) => (idx === i ? { ...t, executed: !t.executed } : t)));
  }

  if (loading) return <div className="p-6 text-slate-400">Loading…</div>;

  if (!snapshot) {
    return (
      <div className="p-6 text-center">
        <p className="text-slate-400">No portfolio snapshot</p>
        <p className="text-slate-600 text-sm mt-1">Upload a DeGiro screenshot first</p>
      </div>
    );
  }

  const pending = trades.filter((t) => !t.executed);
  const done = trades.filter((t) => t.executed);
  const totalFeeCents = trades.reduce((s, t) => s + t.estimatedFeeCents, 0);

  return (
    <div className="space-y-4 pb-6">
      {/* Summary */}
      <div className="bg-slate-800 rounded-2xl p-5">
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-2">
          Rebalance Plan
        </p>
        <div className="flex gap-4 text-sm mb-3 flex-wrap">
          <div>
            <span className="text-slate-500">Portfolio </span>
            <span className="text-white font-medium">{formatEur(totalEtfEurCents(snapshot))}</span>
          </div>
          <div>
            <span className="text-slate-500">Cash </span>
            <span className="text-white font-medium">{formatEur(cashCents)}</span>
          </div>
          {computed && trades.length > 0 && (
            <div>
              <span className="text-slate-500">Est. fees </span>
              <span className={totalFeeCents === 0 ? 'text-green-400 font-medium' : 'text-yellow-400 font-medium'}>
                {totalFeeCents === 0 ? 'FREE' : formatEur(totalFeeCents)}
              </span>
            </div>
          )}
        </div>
        <button
          onClick={compute}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2 rounded-lg transition-colors"
        >
          Compute Trades
        </button>
      </div>

      {/* Drift table */}
      {computed && (
        <div className="bg-slate-800 rounded-2xl p-5">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-3">
            Current vs. Target
          </p>
          <div className="space-y-2">
            {targets
              .filter((t) => t.active)
              .map((t) => {
                const holding = snapshot.holdings.find((h) => h.isin === t.etfIsin);
                const investable = totalEtfEurCents(snapshot) + cashCents;
                const actual = holding && investable > 0 ? (holding.valueCents / investable) * 100 : 0;
                const drift = actual - t.targetPct;
                return (
                  <div key={t.id} className="flex items-center gap-2 text-xs">
                    <div className="flex-1 min-w-0">
                      <p className="text-white truncate">{t.etfName.split('(')[0]?.trim()}</p>
                    </div>
                    <span className="text-slate-400 w-12 text-right">{formatPct(actual, 0)}</span>
                    <span className="text-slate-600">→</span>
                    <span className="text-slate-400 w-12 text-right">
                      {formatPct(t.targetPct, 0)}
                    </span>
                    <span
                      className={`w-14 text-right font-medium ${
                        Math.abs(drift) < 2
                          ? 'text-slate-500'
                          : drift > 0
                            ? 'text-orange-400'
                            : 'text-blue-400'
                      }`}
                    >
                      {drift > 0 ? '+' : ''}
                      {formatPct(drift, 1)}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Unmatched holdings diagnostic */}
      {computed && (() => {
        const activeIsins = new Set(targets.filter((t) => t.active).map((t) => t.etfIsin));
        const unmatched = snapshot.holdings.filter((h) => !activeIsins.has(h.isin));
        if (unmatched.length === 0) return null;
        return (
          <div className="bg-amber-900/30 border border-amber-700/50 rounded-2xl p-5">
            <p className="text-amber-400 text-xs font-medium uppercase tracking-wide mb-2">
              Untracked Holdings
            </p>
            <p className="text-amber-300/70 text-xs mb-3">
              These holdings don't match any active target ISIN — update the ISIN in Settings to include them.
            </p>
            <div className="space-y-1.5">
              {unmatched.map((h) => (
                <div key={h.isin} className="flex items-center justify-between text-xs">
                  <div>
                    <p className="text-white">{h.name.split(' ').slice(0, 4).join(' ')}</p>
                    <p className="text-slate-400 font-mono">{h.isin}</p>
                  </div>
                  <span className="text-slate-300">{formatEur(h.valueCents)}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Trade list */}
      {computed && trades.length === 0 && (
        <div className="bg-slate-800 rounded-2xl p-5 text-center">
          <p className="text-green-400 text-sm font-medium">Nothing to buy this month</p>
          <p className="text-slate-500 text-xs mt-1">
            {cashCents < MIN_ORDER_CENTS
              ? `Add at least €${MIN_ORDER_CENTS / 100} cash to start investing`
              : 'All underweight positions are within the minimum order size'}
          </p>
        </div>
      )}

      {pending.length > 0 && (
        <div className="bg-slate-800 rounded-2xl p-5">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-3">
            Pending Trades ({pending.length})
          </p>
          <div className="space-y-2">
            {trades.map((t, i) =>
              !t.executed ? (
                <div
                  key={i}
                  className="flex items-center justify-between py-2 border-b border-slate-700 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-blue-900 text-blue-300">
                        BUY
                      </span>
                      <span
                        className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                          t.isFreeEtf
                            ? 'bg-green-900 text-green-300'
                            : 'bg-orange-900 text-orange-300'
                        }`}
                      >
                        {t.isFreeEtf ? 'FREE' : `€${(t.estimatedFeeCents / 100).toFixed(0)}`}
                      </span>
                      <p className="text-sm text-white truncate">{t.name.split('(')[0]?.trim()}</p>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {t.isin} · drift {t.driftPct > 0 ? '+' : ''}
                      {formatPct(t.driftPct, 1)}
                    </p>
                    {etfScores[t.isin] && (
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {etfScores[t.isin]!.isCoreSelection && (
                          <span className="text-[10px] bg-teal-900 text-teal-300 px-1 py-0.5 rounded">
                            Core ✓
                          </span>
                        )}
                        {etfScores[t.isin]!.typicalSpreadBps != null && (
                          <span
                            className={`text-[10px] px-1 py-0.5 rounded ${
                              etfScores[t.isin]!.typicalSpreadBps! <= 5
                                ? 'bg-green-900 text-green-300'
                                : etfScores[t.isin]!.typicalSpreadBps! <= 15
                                  ? 'bg-yellow-900 text-yellow-300'
                                  : 'bg-red-900 text-red-300'
                            }`}
                          >
                            Spread {etfScores[t.isin]!.typicalSpreadBps}bps
                          </span>
                        )}
                        {etfScores[t.isin]!.avgDailyVolume != null && (
                          <span className="text-[10px] bg-slate-700 text-slate-400 px-1 py-0.5 rounded">
                            Vol {(etfScores[t.isin]!.avgDailyVolume! / 1_000_000).toFixed(1)}M
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-semibold text-white">
                      {formatEur(t.amountCents)}
                    </span>
                    <button
                      onClick={() => toggleExecuted(i)}
                      className="text-xs bg-slate-700 hover:bg-green-800 text-slate-300 hover:text-green-300 px-2 py-1 rounded transition-colors"
                    >
                      Mark done
                    </button>
                  </div>
                </div>
              ) : null,
            )}
          </div>
        </div>
      )}

      {done.length > 0 && (
        <div className="bg-slate-800 rounded-2xl p-5 opacity-60">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-2">
            Executed ({done.length})
          </p>
          {trades.map((t, i) =>
            t.executed ? (
              <div key={i} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-slate-500 line-through">{t.name.split('(')[0]?.trim()}</span>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">{formatEur(t.amountCents)}</span>
                  <button
                    onClick={() => toggleExecuted(i)}
                    className="text-xs text-slate-600 hover:text-slate-400"
                  >
                    Undo
                  </button>
                </div>
              </div>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
