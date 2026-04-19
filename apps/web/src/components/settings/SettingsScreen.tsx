import { useState, useEffect, type ChangeEvent } from 'react';
import { Bell, BellOff, Loader2, Trash2, Plus, ClipboardPaste } from 'lucide-react';
import type { TargetAllocation, CashBalance } from '../../lib/api.js';
import { api } from '../../lib/api.js';
import { formatPct } from '../../lib/calc.js';
import {
  getPushPermissionState,
  registerPushNotifications,
  unregisterPushNotifications,
  type PushPermissionState,
} from '../../lib/pushNotifications.js';

type Props = {
  targets: TargetAllocation[];
  cash: CashBalance;
  onSaved: () => void;
};

// ── Notification preferences ──────────────────────────────────────────────────

function NotificationsSection() {
  const [permState, setPermState] = useState<PushPermissionState>('default');
  const [subscribing, setSubscribing] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [schedulerResult, setSchedulerResult] = useState<string | null>(null);

  useEffect(() => {
    setPermState(getPushPermissionState());
  }, []);

  async function subscribe() {
    setSubscribing(true);
    const ok = await registerPushNotifications();
    setPermState(getPushPermissionState());
    if (!ok && Notification.permission !== 'denied') {
      setPermState('default');
    }
    setSubscribing(false);
  }

  async function unsubscribe() {
    setSubscribing(true);
    await unregisterPushNotifications();
    setPermState(getPushPermissionState());
    setSubscribing(false);
  }

  async function sendTest() {
    try {
      await api.sendTestPush();
      setTestSent(true);
      setTimeout(() => setTestSent(false), 3000);
    } catch {
      /* ignore */
    }
  }

  async function runScheduler() {
    try {
      const result = await api.runScheduler();
      const scheduled = result.scheduled.length;
      const pushed = result.pushed.length;
      setSchedulerResult(`Scheduled: ${scheduled}, Pushed immediately: ${pushed}`);
      setTimeout(() => setSchedulerResult(null), 5000);
    } catch {
      setSchedulerResult('Scheduler error');
    }
  }

  const isGranted = permState === 'granted';
  const isDenied = permState === 'denied';
  const isUnsupported = permState === 'unsupported';

  return (
    <div className="bg-slate-800 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Bell size={16} className={isGranted ? 'text-green-400' : 'text-slate-500'} />
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">
          Push Notifications
        </p>
        <span
          className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${
            isGranted
              ? 'bg-green-500/20 text-green-400'
              : isDenied
                ? 'bg-red-500/20 text-red-400'
                : isUnsupported
                  ? 'bg-slate-700 text-slate-500'
                  : 'bg-amber-500/20 text-amber-400'
          }`}
        >
          {isGranted ? 'Active' : isDenied ? 'Blocked' : isUnsupported ? 'Not supported' : 'Off'}
        </span>
      </div>

      {isUnsupported ? (
        <p className="text-slate-500 text-xs">
          Push notifications are not supported in this browser.
        </p>
      ) : isDenied ? (
        <p className="text-slate-500 text-xs">
          Notifications are blocked. Enable them in your browser settings, then reload the page.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-slate-500 text-xs">
            Receive alerts for trading windows, monthly DCA reminders, RSU vesting events, and portfolio drift.
          </p>

          {isGranted ? (
            <div className="space-y-2">
              <button
                onClick={sendTest}
                className="w-full text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 py-2 rounded-xl transition-colors"
              >
                {testSent ? '✓ Sent! Check your notifications' : 'Send Test Notification'}
              </button>
              <button
                onClick={runScheduler}
                className="w-full text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 py-2 rounded-xl transition-colors"
              >
                Run Notification Scheduler
              </button>
              {schedulerResult && (
                <p className="text-xs text-green-400 text-center">{schedulerResult}</p>
              )}
              <button
                onClick={unsubscribe}
                disabled={subscribing}
                className="w-full flex items-center justify-center gap-2 text-sm text-red-400 hover:text-red-300 py-2 transition-colors"
              >
                <BellOff size={14} /> Disable Notifications
              </button>
            </div>
          ) : (
            <button
              onClick={subscribe}
              disabled={subscribing}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
            >
              {subscribing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Bell size={14} />
              )}
              {subscribing ? 'Enabling…' : 'Enable Push Notifications'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main settings screen ──────────────────────────────────────────────────────

export function SettingsScreen({ targets, cash, onSaved }: Props) {
  const [cashInput, setCashInput] = useState(cash ? String(cash.amountCents / 100) : '');
  const [cashSaving, setCashSaving] = useState(false);
  const [cashMsg, setCashMsg] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPct, setEditPct] = useState('');
  const [editIsin, setEditIsin] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // Add-single form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addIsin, setAddIsin] = useState('');
  const [addName, setAddName] = useState('');
  const [addPct, setAddPct] = useState('');
  const [addExchange, setAddExchange] = useState('XETRA');
  const [addFree, setAddFree] = useState(true);
  const [addSaving, setAddSaving] = useState(false);
  const [addMsg, setAddMsg] = useState('');

  // Bulk paste
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteMsg, setPasteMsg] = useState('');
  const [pasteSaving, setPasteSaving] = useState(false);

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
    const isin = editIsin.trim().toUpperCase();
    if (!isin || isin.length < 10) {
      setMsg('Invalid ISIN');
      return;
    }
    setSaving(true);
    try {
      await api.saveTarget({ ...target, targetPct: pct, etfIsin: isin });
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

  async function deleteAllocation(id: string) {
    setDeletingId(id);
    try {
      await api.deleteTarget(id);
      onSaved();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  }

  async function addAllocation() {
    const pct = parseFloat(addPct);
    const isin = addIsin.trim().toUpperCase();
    const name = addName.trim();
    const exchange = addExchange.trim() || 'XETRA';

    if (!isin || isin.length < 10) { setAddMsg('Invalid ISIN'); return; }
    if (!name) { setAddMsg('Name required'); return; }
    if (isNaN(pct) || pct < 0 || pct > 100) { setAddMsg('Invalid target %'); return; }

    setAddSaving(true);
    setAddMsg('');
    try {
      await api.saveTarget({
        assetClass: 'Equity',
        etfIsin: isin,
        etfName: name,
        targetPct: pct,
        exchange,
        isFreeEtf: addFree,
        active: true,
      });
      setAddMsg('Added');
      setAddIsin('');
      setAddName('');
      setAddPct('');
      setAddExchange('XETRA');
      setAddFree(true);
      setShowAddForm(false);
      onSaved();
    } catch (err) {
      setAddMsg(err instanceof Error ? err.message : 'Error');
    } finally {
      setAddSaving(false);
    }
  }

  /**
   * Bulk paste format (one per line):
   *   ISIN, ETF Name, TargetPct[, Exchange[, isFree]]
   * Example:
   *   IE00B3RBWM25, VWRL, 60, XETRA, true
   *   IE00B3XXRP09, VUSA, 20
   */
  async function bulkPaste() {
    const lines = pasteText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));

    if (lines.length === 0) { setPasteMsg('Nothing to import'); return; }

    setPasteSaving(true);
    setPasteMsg('');
    let ok = 0;
    let errors = 0;

    for (const line of lines) {
      const parts = line.split(',').map((p) => p.trim());
      const isin = (parts[0] ?? '').toUpperCase();
      const name = parts[1] ?? '';
      const pct = parseFloat(parts[2] ?? '0');
      const exchange = parts[3] ?? 'XETRA';
      const isFree = parts[4] !== undefined ? parts[4].toLowerCase() !== 'false' : true;

      if (!isin || isin.length < 10 || !name || isNaN(pct)) {
        errors++;
        continue;
      }

      try {
        await api.saveTarget({
          assetClass: 'Equity',
          etfIsin: isin,
          etfName: name,
          targetPct: pct,
          exchange,
          isFreeEtf: isFree,
          active: true,
        });
        ok++;
      } catch {
        errors++;
      }
    }

    setPasteMsg(`Imported ${ok}${errors > 0 ? `, ${errors} failed` : ''}`);
    if (ok > 0) {
      setPasteText('');
      setShowPaste(false);
      onSaved();
    }
    setPasteSaving(false);
  }

  return (
    <div className="space-y-4 pb-6">
      {/* Push notifications */}
      <NotificationsSection />

      {/* Data export */}
      <div className="bg-slate-800 rounded-2xl p-5">
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-3">
          Export Data
        </p>
        <div className="space-y-2">
          <a
            href="/api/export/portfolio.csv"
            download
            className="flex w-full items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm py-2.5 rounded-xl transition-colors"
          >
            Download Portfolio CSV
          </a>
          <a
            href="/api/export/transactions.csv"
            download
            className="flex w-full items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm py-2.5 rounded-xl transition-colors"
          >
            Download Transaction History CSV
          </a>
        </div>
      </div>

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

        {msg && <p className="text-xs text-amber-400 mb-2">{msg}</p>}

        <div className="space-y-2">
          {targets.map((t) => (
            <div
              key={t.id}
              className={`py-2 border-b border-slate-700 last:border-0 ${!t.active ? 'opacity-40' : ''}`}
            >
              {editingId === t.id ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <p className="flex-1 text-sm text-white truncate">
                      {t.etfName.split('(')[0]?.trim()}
                    </p>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs text-slate-500 hover:text-white px-1"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="text"
                      value={editIsin}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        setEditIsin(e.target.value.toUpperCase())
                      }
                      placeholder="ISIN"
                      className="w-32 bg-slate-600 rounded px-2 py-1 text-white text-xs font-mono"
                    />
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
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{t.etfName.split('(')[0]?.trim()}</p>
                    <p className="text-xs text-slate-500">
                      {t.etfIsin} · {t.exchange}
                      {t.isFreeEtf && (
                        <span className="ml-1 text-green-500 font-medium">FREE</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-medium text-white">{formatPct(t.targetPct)}</span>
                    <button
                      onClick={() => {
                        setEditingId(t.id);
                        setEditPct(String(t.targetPct));
                        setEditIsin(t.etfIsin);
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
                    <button
                      onClick={() => deleteAllocation(t.id)}
                      disabled={deletingId === t.id}
                      className="text-slate-600 hover:text-red-400 disabled:opacity-30 transition-colors"
                      title="Delete allocation"
                    >
                      <Trash2 size={13} />
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

        {/* Add single allocation */}
        <div className="mt-4 pt-4 border-t border-slate-700">
          {showAddForm ? (
            <div className="space-y-2">
              <p className="text-slate-400 text-xs font-medium mb-2">Add Allocation</p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={addIsin}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setAddIsin(e.target.value)}
                  placeholder="ISIN (e.g. IE00B3RBWM25)"
                  className="col-span-2 bg-slate-700 rounded-lg px-3 py-2 text-white text-sm border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text"
                  value={addName}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setAddName(e.target.value)}
                  placeholder="ETF Name"
                  className="col-span-2 bg-slate-700 rounded-lg px-3 py-2 text-white text-sm border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={addPct}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setAddPct(e.target.value)}
                    placeholder="Target %"
                    className="flex-1 bg-slate-700 rounded-lg px-3 py-2 text-white text-sm border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-slate-400 text-sm">%</span>
                </div>
                <input
                  type="text"
                  value={addExchange}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setAddExchange(e.target.value)}
                  placeholder="Exchange"
                  className="bg-slate-700 rounded-lg px-3 py-2 text-white text-sm border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addFree}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setAddFree(e.target.checked)}
                  className="accent-green-500"
                />
                Free ETF (no transaction fee)
              </label>
              {addMsg && (
                <p className={`text-xs ${addMsg === 'Added' ? 'text-green-400' : 'text-amber-400'}`}>
                  {addMsg}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={addAllocation}
                  disabled={addSaving}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                >
                  {addSaving ? '…' : 'Add'}
                </button>
                <button
                  onClick={() => { setShowAddForm(false); setAddMsg(''); }}
                  className="px-4 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm py-2 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : showPaste ? (
            <div className="space-y-2">
              <p className="text-slate-400 text-xs font-medium mb-1">Bulk Paste</p>
              <p className="text-slate-500 text-xs mb-2">
                One per line: <code className="text-slate-400">ISIN, Name, Target%, Exchange, isFree</code>
              </p>
              <textarea
                value={pasteText}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setPasteText(e.target.value)}
                rows={5}
                placeholder={'IE00B3RBWM25, VWRL, 60, XETRA, true\nIE00B3XXRP09, VUSA, 20'}
                className="w-full bg-slate-700 rounded-lg px-3 py-2 text-white text-xs border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
              {pasteMsg && (
                <p className={`text-xs ${pasteMsg.includes('failed') ? 'text-amber-400' : 'text-green-400'}`}>
                  {pasteMsg}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={bulkPaste}
                  disabled={pasteSaving}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                >
                  {pasteSaving ? '…' : 'Import'}
                </button>
                <button
                  onClick={() => { setShowPaste(false); setPasteMsg(''); }}
                  className="px-4 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm py-2 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => { setShowAddForm(true); setShowPaste(false); }}
                className="flex-1 flex items-center justify-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs py-2 rounded-lg transition-colors"
              >
                <Plus size={13} /> Add ISIN
              </button>
              <button
                onClick={() => { setShowPaste(true); setShowAddForm(false); }}
                className="flex-1 flex items-center justify-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs py-2 rounded-lg transition-colors"
              >
                <ClipboardPaste size={13} /> Bulk Paste
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
