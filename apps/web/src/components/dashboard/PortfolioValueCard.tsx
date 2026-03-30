import type { PortfolioSnapshot, UberEquity } from '../../lib/api.js';
import { totalEtfEurCents, totalUberEurCents, formatEur, DEFAULT_FX_RATE } from '../../lib/calc.js';

type Props = {
  snapshot: PortfolioSnapshot | null;
  equity: UberEquity[];
};

export function PortfolioValueCard({ snapshot, equity }: Props) {
  const etfEur = snapshot ? totalEtfEurCents(snapshot) : 0;
  const uberEur = totalUberEurCents(equity, DEFAULT_FX_RATE);
  const totalEur = etfEur + uberEur;

  return (
    <div className="bg-slate-800 rounded-2xl p-5">
      <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-1">
        Total Portfolio
      </p>
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
      <p className="text-slate-600 text-xs mt-1">FX rate: 1 USD = {DEFAULT_FX_RATE} EUR</p>
    </div>
  );
}
