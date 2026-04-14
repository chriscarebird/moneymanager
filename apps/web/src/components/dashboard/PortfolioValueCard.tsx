import type { PortfolioSnapshot, UberEquity, LivePrices } from '../../lib/api.js';
import { totalEtfEurCents, totalUberEurCents, formatEur, DEFAULT_FX_RATE } from '../../lib/calc.js';

type Props = {
  snapshot: PortfolioSnapshot | null;
  equity: UberEquity[];
  livePrices?: LivePrices | null;
  fxRate?: number;
};

export function PortfolioValueCard({ snapshot, equity, livePrices, fxRate }: Props) {
  const rate = fxRate ?? DEFAULT_FX_RATE;
  const etfEur = snapshot ? totalEtfEurCents(snapshot) : 0;
  const uberEur = totalUberEurCents(equity, rate);
  const totalEur = etfEur + uberEur;

  const uberLivePriceCents = livePrices?.uberUsdCents;
  const isLive = !!livePrices;

  return (
    <div className="bg-slate-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-1">
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">
          Total Portfolio
        </p>
        {isLive && (
          <span className="text-xs text-green-500 font-medium">● Live FX</span>
        )}
      </div>
      <p className="text-3xl font-bold text-white">{formatEur(totalEur)}</p>
      <div className="flex gap-4 mt-3 text-sm">
        <div>
          <span className="text-slate-500">DeGiro </span>
          <span className="text-slate-300 font-medium">{formatEur(etfEur)}</span>
        </div>
        <div>
          <span className="text-slate-500">Morgan Stanley </span>
          <span className="text-slate-300 font-medium">{formatEur(uberEur)}</span>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-1">
        <p className="text-slate-600 text-xs">FX: 1 USD = {rate.toFixed(4)} EUR</p>
        {uberLivePriceCents && (
          <p className="text-slate-600 text-xs">
            UBER: ${(uberLivePriceCents / 100).toFixed(2)}
          </p>
        )}
      </div>
    </div>
  );
}
