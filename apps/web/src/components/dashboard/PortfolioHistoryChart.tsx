import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { SnapshotHistoryPoint } from '../../lib/api.js';
import { formatEur } from '../../lib/calc.js';

type Props = {
  history: SnapshotHistoryPoint[];
};

function formatLabel(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

export function PortfolioHistoryChart({ history }: Props) {
  if (history.length < 2) {
    return (
      <div className="bg-slate-800 rounded-2xl p-5">
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-3">
          Portfolio Growth
        </p>
        <p className="text-slate-500 text-sm">
          Upload at least 2 snapshots to see your growth chart.
        </p>
      </div>
    );
  }

  const data = history.map((pt) => ({
    label: formatLabel(pt.date),
    valueCents: pt.totalValueCents,
  }));

  const minVal = Math.min(...data.map((d) => d.valueCents));
  const maxVal = Math.max(...data.map((d) => d.valueCents));
  const change = data[data.length - 1]!.valueCents - data[0]!.valueCents;
  const isPositive = change >= 0;

  return (
    <div className="bg-slate-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">
          Portfolio Growth
        </p>
        <span className={`text-xs font-semibold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
          {isPositive ? '+' : ''}
          {formatEur(change)}
        </span>
      </div>
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fill: '#64748b', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: '#64748b', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => formatEur(v)}
              domain={[minVal * 0.98, maxVal * 1.02]}
            />
            <Tooltip
              contentStyle={{
                background: '#1e293b',
                border: '1px solid #334155',
                color: '#f1f5f9',
                fontSize: 12,
              }}
              formatter={(value) => [formatEur(Number(value)), 'Portfolio value']}
            />
            <Line
              type="monotone"
              dataKey="valueCents"
              stroke={isPositive ? '#22c55e' : '#ef4444'}
              strokeWidth={2}
              dot={{ fill: isPositive ? '#22c55e' : '#ef4444', r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-slate-600 mt-1">{data.length} snapshots · DeGiro ETF portfolio</p>
    </div>
  );
}
