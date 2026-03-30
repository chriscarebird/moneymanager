import { useState, type ChangeEvent } from 'react';
import type { TargetAllocation, CashBalance } from '../../lib/api.js';
import { api } from '../../lib/api.js';
import { formatPct } from '../../lib/calc.js';

type Props = {
  targets: TargetAllocation[];
  cash: CashBalance;
  onSaved: () => void;
};

export function SettingsScreen({ targets, cash, onSaved }: Props) {
  const [cashInput, setCashInput] = useState(cash ? String(cash.amountCents / 100) : '');
  const [cashSaving, setCashSaving] = useState(false);
  const [cashMsg, setCashMsg] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPct, setEditPct] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const total = targets.reduce((s, t) => s + (t.active ? t.targetPct : 0), 0);

  async function saveCash() {
    const cents = Math.round(parseFloat(cashInput) * 100);
    if (isNaN(cents) || cents < 0) {
      setCashMsg('Invalid amount');
      return;
    }
    setCashSaving(true);
    try {
      await api.setCash(cents);
      setCashMsg('Saved');
      onSaved();
    } catch (err) {
      setCashMsg(err instanceof Error ? err.message : 'Error');
    } finally {
      setCashSaving(false);
    }
  }

  async function saveAllocation(target: TargetAllocation) {
    const pct = parseFloat(editPct);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      setMsg('Invalid %');
      return;
    }
    setSaving(true);
    try {
      await api.saveTarget({ ...target, targetPct: pct });
      setMsg('Saved');
      setEditingId(null);
      onSaved();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(target: TargetAllocation) {
    try {
      await api.saveTarget({ ...target, active: !target.active });
      onSaved();
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-4 pb-6">
      {/* Cash balance */}
      <div className="bg-slate-800 rounded-2xl p-5">
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-3">
          Cash Available (EUR)
        </p>
        <div className="flex gap-2">
          <input
            type="number"
            value={cashInput}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setCashInput(e.target.value)}
            className="flex-1 bg-slate-700 rounded-lg px-3 py-2 text-white text-sm border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="500.00"
          />
          <button
            onClick={saveCash}
            disabled={cashSaving}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            {cashSaving ? '…' : 'Save'}
          </button>
        </div>
        {cashMsg && <p className="text-xs text-green-400 mt-1">{cashMsg}</p>}
      </div>

      {/* Target allocations */}
      <div className="bg-slate-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">
            Target Allocations
          </p>
          <span
            className={`text-xs font-medium ${Math.abs(total - 100) < 0.1 ? 'text-green-400' : 'text-amber-400'}`}
          >
            {formatPct(total)} total
          </span>
        </div>

        {msg && <p className="text-xs text-green-400 mb-2">{msg}</p>}

        <div className="space-y-2">
          {targets.map((t) => (
            <div
              key={t.id}
              className={`py-2 border-b border-slate-700 last:border-0 ${!t.active ? 'opacity-40' : ''}`}
            >
              {editingId === t.id ? (
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-sm text-white truncate">
                    {t.etfName.split('(')[0]?.trim()}
                  </p>
                  <input
                    type="number"
                    value={editPct}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setEditPct(e.target.value)}
                    className="w-16 bg-slate-600 rounded px-2 py-1 text-white text-sm text-right"
                  />
                  <span className="text-slate-400 text-sm">%</span>
                  <button
                    onClick={() => saveAllocation(t)}
                    disabled={saving}
                    className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded"
                  >
                    {saving ? '…' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-xs text-slate-500 hover:text-white px-1"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{t.etfName.split('(')[0]?.trim()}</p>
                    <p className="text-xs text-slate-500">
                      {t.etfIsin} · {t.exchange}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-medium text-white">{formatPct(t.targetPct)}</span>
                    <button
                      onClick={() => {
                        setEditingId(t.id);
                        setEditPct(String(t.targetPct));
                        setMsg('');
                      }}
                      className="text-xs text-slate-500 hover:text-blue-400"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => toggleActive(t)}
                      className="text-xs text-slate-500 hover:text-slate-300"
                    >
                      {t.active ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {targets.length === 0 && (
          <p className="text-slate-500 text-sm text-center py-4">No target allocations set yet</p>
        )}
      </div>
    </div>
  );
}
