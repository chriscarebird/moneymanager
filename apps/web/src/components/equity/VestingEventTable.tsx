import { useState, useEffect } from 'react';
import { api, type VestingEventRow } from '../../lib/api.js';

type Props = {
  grantId: string;
  events: VestingEventRow[];
  onUpdated: () => void;
  livePriceUsdCents: number | null;
};

function formatUsdCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function predictedNetShares(sharesVesting: number, taxRate: number): number {
  return Math.floor(sharesVesting * (1 - taxRate));
}

function predictedGross(sharesVesting: number, priceUsdCents: number): number {
  return sharesVesting * priceUsdCents;
}

type EditingTax = { eventId: string; draft: string };
type MarkVestedForm = { eventId: string; price: string; shares: string };

const STATUS_STYLES: Record<VestingEventRow['status'], string> = {
  upcoming: 'bg-blue-900 text-blue-300',
  vested: 'bg-green-900 text-green-300',
  cancelled: 'bg-slate-700 text-slate-400',
};

function isPast(dateStr: string): boolean {
  return new Date(dateStr) < new Date();
}

export function VestingEventTable({ grantId, events, onUpdated, livePriceUsdCents }: Props) {
  const [editingTax, setEditingTax] = useState<EditingTax | null>(null);
  const [markForm, setMarkForm] = useState<MarkVestedForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPast, setShowPast] = useState(false);

  // Auto-mark past upcoming events as vested on load
  useEffect(() => {
    const pastUpcoming = events.filter(
      (ev) => ev.status === 'upcoming' && isPast(ev.vestingDate),
    );
    if (pastUpcoming.length === 0) return;

    void Promise.all(
      pastUpcoming.map((ev) =>
        api.updateVestingEvent(grantId, ev.id, {
          status: 'vested',
          actualSharesReceived: predictedNetShares(ev.sharesVesting, ev.incomeTaxRate),
        }),
      ),
    ).then(() => onUpdated());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grantId]);

  async function saveTaxRate(eventId: string, rateStr: string) {
    const rate = parseFloat(rateStr);
    if (isNaN(rate) || rate < 0 || rate > 1) return;
    setSaving(true);
    try {
      await api.updateVestingEvent(grantId, eventId, { incomeTaxRate: rate });
      onUpdated();
    } finally {
      setSaving(false);
      setEditingTax(null);
    }
  }

  async function saveVested(eventId: string) {
    if (!markForm) return;
    const priceUsdCents = Math.round(parseFloat(markForm.price) * 100);
    const actualShares = parseInt(markForm.shares, 10);
    if (isNaN(priceUsdCents) || isNaN(actualShares)) return;
    setSaving(true);
    try {
      await api.updateVestingEvent(grantId, eventId, {
        status: 'vested',
        priceUsdCents,
        actualSharesReceived: actualShares,
      });
      onUpdated();
    } finally {
      setSaving(false);
      setMarkForm(null);
    }
  }

  async function cancelEvent(eventId: string) {
    setSaving(true);
    try {
      await api.updateVestingEvent(grantId, eventId, { status: 'cancelled' });
      onUpdated();
    } finally {
      setSaving(false);
    }
  }

  if (events.length === 0) {
    return <p className="text-xs text-slate-500 mt-2">No vesting events generated yet.</p>;
  }

  const sorted = [...events].sort(
    (a, b) => new Date(a.vestingDate).getTime() - new Date(b.vestingDate).getTime(),
  );
  const upcoming = sorted.filter((ev) => !isPast(ev.vestingDate));
  const past = sorted.filter((ev) => isPast(ev.vestingDate));

  function renderRow(ev: VestingEventRow) {
    const net =
      ev.status === 'vested' && ev.actualSharesReceived !== null
        ? ev.actualSharesReceived
        : predictedNetShares(ev.sharesVesting, ev.incomeTaxRate);
    const priceToUse = ev.priceUsdCents ?? livePriceUsdCents;
    const gross = priceToUse !== null ? predictedGross(ev.sharesVesting, priceToUse) : null;
    const netValue = gross !== null ? gross - Math.round(gross * ev.incomeTaxRate) : null;
    const isEditing = editingTax?.eventId === ev.id;
    const isMarking = markForm?.eventId === ev.id;

    return (
      <>
        <tr
          key={ev.id}
          className={`border-b border-slate-700/50 ${ev.status === 'cancelled' ? 'opacity-40' : ''}`}
        >
          <td className="py-1.5 pr-3 text-slate-300 whitespace-nowrap">
            {new Date(ev.vestingDate).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: '2-digit',
            })}
          </td>
          <td className="py-1.5 pr-3 text-right text-white">{ev.sharesVesting}</td>
          <td className="py-1.5 pr-3 text-right">
            {isEditing ? (
              <input
                type="number"
                step="0.001"
                min="0"
                max="1"
                value={editingTax.draft}
                onChange={(e) => setEditingTax({ eventId: ev.id, draft: e.target.value })}
                onBlur={() => void saveTaxRate(ev.id, editingTax.draft)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveTaxRate(ev.id, editingTax.draft);
                  if (e.key === 'Escape') setEditingTax(null);
                }}
                disabled={saving}
                autoFocus
                className="w-16 bg-slate-600 rounded px-1 py-0.5 text-white text-xs text-right"
              />
            ) : (
              <button
                onClick={() =>
                  setEditingTax({ eventId: ev.id, draft: ev.incomeTaxRate.toFixed(3) })
                }
                className="text-blue-400 hover:text-blue-300 underline decoration-dotted"
                title="Click to edit tax rate"
              >
                {(ev.incomeTaxRate * 100).toFixed(1)}%
              </button>
            )}
          </td>
          <td className="py-1.5 pr-3 text-right text-slate-300">{net}</td>
          <td className="py-1.5 pr-3 text-right text-slate-400 whitespace-nowrap">
            {netValue !== null ? formatUsdCents(netValue) : '—'}
          </td>
          <td className="py-1.5 pr-3">
            <span
              className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[ev.status]}`}
            >
              {ev.status}
            </span>
          </td>
          <td className="py-1.5 text-right">
            {ev.status === 'upcoming' && !isPast(ev.vestingDate) && (
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() =>
                    setMarkForm({
                      eventId: ev.id,
                      price: '',
                      shares: String(predictedNetShares(ev.sharesVesting, ev.incomeTaxRate)),
                    })
                  }
                  className="text-green-400 hover:text-green-300 text-xs"
                >
                  Mark vested
                </button>
                <button
                  onClick={() => void cancelEvent(ev.id)}
                  disabled={saving}
                  className="text-slate-500 hover:text-slate-300 text-xs"
                >
                  Cancel
                </button>
              </div>
            )}
            {ev.status === 'vested' && ev.actualSharesReceived !== null && (
              <span className="text-slate-500 text-xs whitespace-nowrap">
                {ev.actualSharesReceived} rcvd
                {ev.priceUsdCents !== null ? ` @ ${formatUsdCents(ev.priceUsdCents)}` : ''}
              </span>
            )}
          </td>
        </tr>
        {isMarking && (
          <tr key={`${ev.id}-form`} className="bg-slate-700/30">
            <td colSpan={7} className="py-2 px-2">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-slate-400 text-xs">Vest actuals:</span>
                <div>
                  <label className="block text-slate-500 text-xs mb-0.5">Uber price (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 72.50"
                    value={markForm.price}
                    onChange={(e) => setMarkForm({ ...markForm, price: e.target.value })}
                    className="w-24 bg-slate-600 rounded px-2 py-1 text-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 text-xs mb-0.5">Shares received</label>
                  <input
                    type="number"
                    value={markForm.shares}
                    onChange={(e) => setMarkForm({ ...markForm, shares: e.target.value })}
                    className="w-20 bg-slate-600 rounded px-2 py-1 text-white text-xs"
                  />
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => void saveVested(ev.id)}
                    disabled={saving || !markForm.price || !markForm.shares}
                    className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-xs px-3 py-1 rounded-lg"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => setMarkForm(null)}
                    className="text-slate-400 hover:text-white text-xs px-2 py-1"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </td>
          </tr>
        )}
      </>
    );
  }

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-xs text-left border-collapse">
        <thead>
          <tr className="text-slate-500 border-b border-slate-700">
            <th className="py-1.5 pr-3 font-medium whitespace-nowrap">Date</th>
            <th className="py-1.5 pr-3 font-medium text-right">Shares</th>
            <th className="py-1.5 pr-3 font-medium text-right whitespace-nowrap">Tax rate</th>
            <th className="py-1.5 pr-3 font-medium text-right whitespace-nowrap">Net shares</th>
            <th className="py-1.5 pr-3 font-medium text-right whitespace-nowrap">Est. value</th>
            <th className="py-1.5 pr-3 font-medium">Status</th>
            <th className="py-1.5 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {upcoming.map((ev) => renderRow(ev))}
        </tbody>
      </table>

      {past.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowPast((v) => !v)}
            className="text-slate-500 hover:text-slate-300 text-xs flex items-center gap-1"
          >
            <span>{showPast ? '▾' : '▸'}</span>
            Past events ({past.length})
          </button>
          {showPast && (
            <table className="w-full text-xs text-left border-collapse mt-2 opacity-60">
              <tbody>{past.map((ev) => renderRow(ev))}</tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
