import type { PortfolioSnapshot, TargetAllocation } from '../../lib/api.js';

type Props = {
  snapshot: PortfolioSnapshot | null;
  targets: TargetAllocation[];
};

export function AllocationBarChart({ snapshot, targets }: Props) {
  const activeTargets = targets.filter((t) => t.active);

  if (activeTargets.length === 0) {
    return (
      <div className="bg-slate-800 rounded-2xl p-5">
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-3">
          Allocation vs Target
        </p>
        <p className="text-slate-500 text-sm text-center py-4">No target allocations set</p>
      </div>
    );
  }

  const total = snapshot?.holdings.reduce((s, h) => s + h.valueCents, 0) ?? 0;

  const rows = activeTargets.map((t) => {
    const holding = snapshot?.holdings.find((h) => h.isin === t.etfIsin);
    const actualPct = total > 0 && holding ? (holding.valueCents / total) * 100 : 0;
    const targetPct = t.targetPct;
    const name = t.etfName.split('(')[0]?.trim() ?? t.etfName;
    return { name, actualPct, targetPct, isin: t.etfIsin };
  });

  const maxPct = Math.max(...rows.map((r) => Math.max(r.actualPct, r.targetPct)), 10);

  return (
    <div className="bg-slate-800 rounded-2xl p-5">
      <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-4">
        Allocation vs Target
      </p>

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.isin}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-white text-xs truncate flex-1 mr-2">{row.name}</span>
              <div className="flex items-center gap-2 shrink-0 text-xs">
                <span className="text-blue-400 font-medium">{row.actualPct.toFixed(1)}%</span>
                <span className="text-slate-500">/</span>
                <span className="text-slate-400">{row.targetPct.toFixed(1)}%</span>
              </div>
            </div>
            <div className="relative h-4 bg-slate-700 rounded-full overflow-hidden">
              {/* Target bar (background outline) */}
              <div
                className="absolute inset-y-0 left-0 rounded-full border border-slate-500 bg-transparent"
                style={{ width: `${(row.targetPct / maxPct) * 100}%` }}
              />
              {/* Actual bar */}
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-all ${
                  row.actualPct < row.targetPct * 0.85
                    ? 'bg-amber-500/70'
                    : row.actualPct > row.targetPct * 1.15
                      ? 'bg-red-500/70'
                      : 'bg-blue-500/70'
                }`}
                style={{ width: `${(row.actualPct / maxPct) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-700">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-blue-500/70" />
          <span className="text-slate-400 text-xs">Actual</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm border border-slate-500" />
          <span className="text-slate-400 text-xs">Target</span>
        </div>
      </div>
    </div>
  );
}
