import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { UberEquity, UberRSUGrant } from '../../lib/api.js';
import type { MSSnapshotHistoryPoint } from '../../lib/api.js';
import { formatUsd, DEFAULT_FX_RATE } from '../../lib/calc.js';
import { VestingEventTable } from './VestingEventTable.js';
import { useVestingEvents } from '../../hooks/useData.js';

type Props = {
  equity: UberEquity[];
  grants: UberRSUGrant[];
  msHistory: MSSnapshotHistoryPoint[];
  loading: boolean;
  onVestingUpdated: () => void;
  uberPriceUsdCents: number | null;
};

function parseFormula(formula: string): { cliffMonth: number; denom: number } {
  const m = formula.match(/(\d+)\/(\d+)\s+at\s+month\s+(\d+)/i);
  if (!m) return { cliffMonth: 3, denom: 48 };
  return { cliffMonth: parseInt(m[3]!, 10), denom: parseInt(m[2]!, 10) };
}

function vestingChartData(grant: UberRSUGrant) {
  const start = new Date(grant.vestingCommencementDate);
  const { cliffMonth, denom } = parseFormula(grant.vestingFormula);
  const now = new Date();
  const points: { month: string; vested: number; unvested: number }[] = [];

  for (let m = cliffMonth; m <= denom; m += 1) {
    const date = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + m, start.getUTCDate()),
    );
    const cumul = Math.floor((grant.totalRsus * m) / denom);
    const prev = m === cliffMonth ? 0 : Math.floor((grant.totalRsus * (m - 1)) / denom);
    const shares = cumul - prev;
    const isVested = date <= now;
    points.push({
      month: date.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
      vested: isVested ? shares : 0,
      unvested: isVested ? 0 : shares,
    });
  }
  return points;
}

const TYPE_LABELS: Record<UberEquity['type'], string> = {
  RSU: 'RSU (unvested)',
  ESPP: 'ESPP',
  Direct_Shares: 'Direct Shares',
};

// ── Per-grant card with lazy-loaded vesting events ────────────────────────────

function GrantCard({
  grant,
  onVestingUpdated,
  livePriceUsdCents,
}: {
  grant: UberRSUGrant;
  onVestingUpdated: () => void;
  livePriceUsdCents: number | null;
}) {
  const vestingEvents = useVestingEvents(grant.grantId);
  const data = vestingChartData(grant);
  const vested = data.reduce((s, d) => s + d.vested, 0);
  const total = grant.totalRsus;
  const pct = total > 0 ? Math.round((vested / total) * 100) : 0;

  function handleEventUpdated() {
    vestingEvents.refetch();
    onVestingUpdated();
  }

  return (
    <div className="bg-slate-800 rounded-2xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-white font-semibold">{grant.grantId}</p>
          <p className="text-xs text-slate-500">
            {grant.totalRsus} RSUs · Started{' '}
            {new Date(grant.vestingCommencementDate).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </p>
          <p className="text-xs text-slate-600 mt-0.5">{grant.vestingFormula}</p>
        </div>
        <span className="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded-full">
          {pct}% vested
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-slate-700 rounded-full mb-4">
        <div className="h-1.5 bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
      </div>

      {/* Vesting bar chart */}
      <div className="h-28 mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
            <XAxis
              dataKey="month"
              tick={{ fill: '#475569', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis tick={{ fill: '#475569', fontSize: 9 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{
                background: '#1e293b',
                border: '1px solid #334155',
                color: '#f1f5f9',
                fontSize: 11,
              }}
            />
            <Bar dataKey="vested" stackId="a" fill="#3b82f6" name="Vested" />
            <Bar dataKey="unvested" stackId="a" fill="#1e3a5f" radius={[2, 2, 0, 0]} name="Upcoming" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-slate-600 mb-3">Blue = vested · Dark = upcoming (monthly view)</p>

      {/* Vesting event table */}
      <div className="border-t border-slate-700 pt-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-medium text-slate-400">Vesting schedule</p>
          <p className="text-xs text-slate-600">Tax rate is editable — click to change</p>
        </div>
        {vestingEvents.loading ? (
          <p className="text-xs text-slate-500 mt-2">Loading events…</p>
        ) : (
          <VestingEventTable
            grantId={grant.grantId}
            events={vestingEvents.data ?? []}
            onUpdated={handleEventUpdated}
            livePriceUsdCents={livePriceUsdCents}
          />
        )}
      </div>
    </div>
  );
}

// ── MS equity history chart ────────────────────────────────────────────────────

function MSHistoryChart({ history }: { history: MSSnapshotHistoryPoint[] }) {
  if (history.length < 2) return null;

  const data = history.map((p) => ({
    date: new Date(p.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }),
    totalK: Math.round(p.totalUsdCents / 10000) / 10, // thousands, 1 dp
  }));

  return (
    <div className="bg-slate-800 rounded-2xl p-5">
      <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-3">
        MS Equity — value over time
      </p>
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 0, right: 4, left: -28, bottom: 0 }}>
            <XAxis
              dataKey="date"
              tick={{ fill: '#475569', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#475569', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `$${v}k`}
            />
            <Tooltip
              contentStyle={{
                background: '#1e293b',
                border: '1px solid #334155',
                color: '#f1f5f9',
                fontSize: 11,
              }}
              formatter={(v: unknown) => [`$${v as number}k`, 'Total']}
            />
            <Line
              type="monotone"
              dataKey="totalK"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 3, fill: '#3b82f6' }}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function EquityScreen({ equity, grants, msHistory, loading, onVestingUpdated, uberPriceUsdCents }: Props) {
  if (loading) {
    return <div className="p-6 text-slate-400">Loading equity data…</div>;
  }

  const totalUsdCents = equity.reduce((s, e) => s + e.marketValueUsdCents, 0);
  const totalEurCents = Math.round(totalUsdCents * DEFAULT_FX_RATE);

  return (
    <div className="space-y-4 pb-6">
      {/* Current positions summary */}
      <div className="bg-slate-800 rounded-2xl p-5">
        <div className="flex items-start justify-between mb-1">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">
            Uber Equity Total
          </p>
          {uberPriceUsdCents !== null && (
            <span className="text-xs font-mono bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
              UBER ${(uberPriceUsdCents / 100).toFixed(2)}
            </span>
          )}
        </div>
        <p className="text-2xl font-bold text-white">{formatUsd(totalUsdCents)}</p>
        <p className="text-slate-500 text-sm">
          ≈ €{(totalEurCents / 100).toFixed(0)} @ {DEFAULT_FX_RATE} FX
        </p>

        <div className="mt-4 space-y-2">
          {equity.length === 0 && (
            <p className="text-slate-500 text-sm">
              No positions yet — upload a Morgan Stanley screenshot.
            </p>
          )}
          {equity.map((e) => (
            <div
              key={e.type}
              className="flex items-center justify-between py-2 border-b border-slate-700 last:border-0"
            >
              <div>
                <p className="text-sm text-white font-medium">{TYPE_LABELS[e.type]}</p>
                <p className="text-xs text-slate-500">
                  {e.sharesHeld} shares · {e.sharesAvailableToTransact} available
                  {e.holdingPeriodActive && ' · Holding period'}
                </p>
              </div>
              <p className="text-sm font-semibold text-white">{formatUsd(e.marketValueUsdCents)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* MS equity value history chart */}
      <MSHistoryChart history={msHistory} />

      {/* RSU grant cards with vesting event tables */}
      {grants.map((g) => (
        <GrantCard key={g.grantId} grant={g} onVestingUpdated={onVestingUpdated} livePriceUsdCents={uberPriceUsdCents} />
      ))}

      {grants.length === 0 && (
        <div className="bg-slate-800 rounded-2xl p-5 text-center">
          <p className="text-slate-400 text-sm">No RSU grants found</p>
          <p className="text-slate-600 text-xs mt-1">Upload a grant document from the Upload tab</p>
        </div>
      )}
    </div>
  );
}
