import { useState, useEffect, type ChangeEvent } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
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
      {/* Push notifications */}
      <NotificationsSection />

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
                      {t.isFreeEtf && (
                        <span className="ml-1 text-green-500 font-medium">FREE</span>
                      )}
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
