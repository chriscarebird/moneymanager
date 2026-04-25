import { useState, useEffect, type ChangeEvent } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import type { CashBalance } from '../../lib/api.js';
import { api } from '../../lib/api.js';
import {
  getPushPermissionState,
  registerPushNotifications,
  unregisterPushNotifications,
  type PushPermissionState,
} from '../../lib/pushNotifications.js';

type Props = {
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

export function SettingsScreen({ cash, onSaved }: Props) {
  const [cashInput, setCashInput] = useState(cash ? String(cash.amountCents / 100) : '');
  const [cashSaving, setCashSaving] = useState(false);
  const [cashMsg, setCashMsg] = useState('');

  async function saveCash() {
    const cents = Math.round(parseFloat(cashInput) * 100);
    if (isNaN(cents) || cents < 0) { setCashMsg('Invalid amount'); return; }
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

  return (
    <div className="space-y-4 pb-6">
      <NotificationsSection />

      {/* Data export */}
      <div className="bg-slate-800 rounded-2xl p-5">
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-3">Export Data</p>
        <div className="space-y-2">
          <a href="/api/export/portfolio.csv" download className="flex w-full items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm py-2.5 rounded-xl transition-colors">
            Download Portfolio CSV
          </a>
          <a href="/api/export/transactions.csv" download className="flex w-full items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm py-2.5 rounded-xl transition-colors">
            Download Transaction History CSV
          </a>
        </div>
      </div>

      {/* Cash balance */}
      <div className="bg-slate-800 rounded-2xl p-5">
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-3">Cash Available (EUR)</p>
        <div className="flex gap-2">
          <input type="number" value={cashInput} onChange={(e: ChangeEvent<HTMLInputElement>) => setCashInput(e.target.value)} className="flex-1 bg-slate-700 rounded-lg px-3 py-2 text-white text-sm border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="500.00" />
          <button onClick={saveCash} disabled={cashSaving} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            {cashSaving ? '…' : 'Save'}
          </button>
        </div>
        {cashMsg && <p className="text-xs text-green-400 mt-1">{cashMsg}</p>}
      </div>
    </div>
  );
}
