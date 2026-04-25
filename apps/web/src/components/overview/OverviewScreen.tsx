import type { PortfolioSnapshot, UberEquity, UberRSUGrant, LivePrices } from '../../lib/api.js';
import { PortfolioValueCard } from '../dashboard/PortfolioValueCard.js';
import { UpcomingEvents } from '../dashboard/UpcomingEvents.js';
import { AdvisorScreen } from '../advisor/AdvisorScreen.js';

type Props = {
  snapshot: PortfolioSnapshot | null;
  equity: UberEquity[];
  livePrices: LivePrices | null;
  fxRate: number;
  grants: UberRSUGrant[];
  cashCents: number;
};

export function OverviewScreen({ snapshot, equity, livePrices, fxRate, grants, cashCents }: Props) {
  return (
    <div className="space-y-4 pb-6">
      <PortfolioValueCard
        snapshot={snapshot}
        equity={equity}
        livePrices={livePrices}
        fxRate={fxRate}
      />

      {/* Industry Exposure placeholder */}
      <div className="bg-slate-800 rounded-2xl p-5">
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-2">
          Industry Exposure & Risk Analysis
        </p>
        <p className="text-slate-600 text-sm">Placeholder — coming soon</p>
      </div>

      <UpcomingEvents grants={grants} cashCents={cashCents} />

      {/* Quarterly Review */}
      <div>
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-3 px-1">
          Quarterly Review
        </p>
        <AdvisorScreen restrictToMode="strategy" />
      </div>
    </div>
  );
}
