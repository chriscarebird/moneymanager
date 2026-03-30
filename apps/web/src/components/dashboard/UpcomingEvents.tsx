import type { UberRSUGrant } from '../../lib/api.js';
import { nextVestEvent } from '../../lib/calc.js';

type Props = { grants: UberRSUGrant[]; cashCents: number };

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysUntil(d: Date): number {
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

export function UpcomingEvents({ grants, cashCents }: Props) {
  const now = new Date();

  // Collect next vest per active grant
  const vestEvents = grants
    .filter((g) => g.status === 'active')
    .flatMap((g) => {
      const ev = nextVestEvent(g, now);
      if (!ev) return [];
      return [{ type: 'vest' as const, date: ev.date, shares: ev.shares, grantId: g.grantId }];
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 3);

  return (
    <div className="bg-slate-800 rounded-2xl p-5">
      <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-3">
        Upcoming Events
      </p>

      {vestEvents.length === 0 && <p className="text-slate-500 text-sm">No upcoming vest events</p>}

      <div className="space-y-2">
        {vestEvents.map((ev, i) => {
          const days = daysUntil(ev.date);
          return (
            <div
              key={i}
              className="flex items-center justify-between py-1.5 border-b border-slate-700 last:border-0"
            >
              <div>
                <p className="text-sm text-white font-medium">
                  {ev.shares} RSU vest · {ev.grantId}
                </p>
                <p className="text-xs text-slate-500">{formatDate(ev.date)}</p>
              </div>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  days <= 14 ? 'bg-amber-900 text-amber-300' : 'bg-slate-700 text-slate-400'
                }`}
              >
                {days}d
              </span>
            </div>
          );
        })}

        {cashCents > 0 && (
          <div className="flex items-center justify-between py-1.5">
            <div>
              <p className="text-sm text-white font-medium">Cash available to invest</p>
              <p className="text-xs text-slate-500">DeGiro account</p>
            </div>
            <span className="text-sm font-semibold text-green-400">
              €{(cashCents / 100).toFixed(0)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
