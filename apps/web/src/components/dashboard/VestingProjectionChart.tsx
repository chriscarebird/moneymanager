import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import type { PortfolioSnapshot, UberEquity, UberRSUGrant } from '../../lib/api.js';
import { projectConcentration, CONCENTRATION_TARGET, CONCENTRATION_WARN } from '../../lib/calc.js';

type Props = {
  snapshot: PortfolioSnapshot | null;
  equity: UberEquity[];
  grants: UberRSUGrant[];
  fxRate?: number;
};

/** Median Uber price in USD cents from equity positions */
function estimateUberPrice(equity: UberEquity[]): number {
  const available = equity.filter((e) => e.sharesHeld > 0);
  if (available.length === 0) return 6914; // fallback ~$69.14
  const total = available.reduce((s, e) => s + e.marketValueUsdCents, 0);
  const shares = available.reduce((s, e) => s + e.sharesHeld, 0);
  return shares > 0 ? Math.round(total / shares) : 6914;
}

export function VestingProjectionChart({ snapshot, equity, grants, fxRate }: Props) {
  if (!snapshot) {
    return (
      <div className="bg-slate-800 rounded-2xl p-5">
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-3">
          12-Month Projection
        </p>
        <p className="text-slate-500 text-sm">No portfolio data</p>
      </div>
    );
  }

  const pricePerShare = estimateUberPrice(equity);
  const data = [0, 1, 2, 3, 6, 9, 12].map((m) => {
    const label = m === 0 ? 'Now' : `+${m}m`;
    const pct = projectConcentration(snapshot, equity, grants, pricePerShare, m, fxRate);
    return { label, pct: parseFloat(pct.toFixed(1)) };
  });

  return (
    <div className="bg-slate-800 rounded-2xl p-5">
      <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-3">
        Uber % — 12-Month Projection
      </p>
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fill: '#64748b', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#64748b', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${v}%`}
              domain={['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{
                background: '#1e293b',
                border: '1px solid #334155',
                color: '#f1f5f9',
                fontSize: 12,
              }}
            />
            <ReferenceLine
              y={CONCENTRATION_TARGET}
              stroke="#22c55e"
              strokeDasharray="4 2"
              strokeWidth={1}
            />
            <ReferenceLine
              y={CONCENTRATION_WARN}
              stroke="#f97316"
              strokeDasharray="4 2"
              strokeWidth={1}
            />
            <Line
              type="monotone"
              dataKey="pct"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ fill: '#3b82f6', r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-slate-600 mt-1">
        Green line = {CONCENTRATION_TARGET}% target · Orange = {CONCENTRATION_WARN}% warning
      </p>
    </div>
  );
}
