import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { PortfolioSnapshot, TargetAllocation } from '../../lib/api.js';
import { totalEtfEurCents } from '../../lib/calc.js';

type Props = {
  snapshot: PortfolioSnapshot | null;
  targets: TargetAllocation[];
};

const COLORS = [
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#64748b', // slate
];

export function AllocationDonut({ snapshot, targets }: Props) {
  if (!snapshot || snapshot.holdings.length === 0) {
    return (
      <div className="bg-slate-800 rounded-2xl p-5">
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-3">
          Allocation
        </p>
        <p className="text-slate-500 text-sm">No portfolio data</p>
      </div>
    );
  }

  const total = totalEtfEurCents(snapshot);
  const activeTargets = targets.filter((t) => t.active);

  // Actual holdings as pie data
  const actualData = snapshot.holdings.map((h) => ({
    name: h.name.split(' ').slice(0, 3).join(' '),
    isin: h.isin,
    value: h.valueCents,
    pct: total > 0 ? (h.valueCents / total) * 100 : 0,
  }));

  // Target data for inner ring
  const targetData = activeTargets.map((t) => ({
    name: t.etfName.split(' ').slice(0, 3).join(' '),
    isin: t.etfIsin,
    value: t.targetPct,
    pct: t.targetPct,
  }));

  return (
    <div className="bg-slate-800 rounded-2xl p-5">
      <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-1">
        Allocation (Actual vs Target)
      </p>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            {/* Outer ring = actual */}
            <Pie
              data={actualData}
              dataKey="value"
              cx="50%"
              cy="50%"
              outerRadius={72}
              innerRadius={50}
              strokeWidth={0}
            >
              {actualData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]!} />
              ))}
            </Pie>
            {/* Inner ring = target */}
            <Pie
              data={targetData}
              dataKey="value"
              cx="50%"
              cy="50%"
              outerRadius={44}
              innerRadius={28}
              strokeWidth={0}
              opacity={0.4}
            >
              {targetData.map((_d, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]!} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: '#1e293b',
                border: '1px solid #334155',
                color: '#f1f5f9',
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-slate-500 text-center">Outer = actual · Inner = target</p>
    </div>
  );
}
