import { useState } from 'react';
import { Calendar, TrendingDown, Send, CheckCircle2, Clock, RefreshCw, ArrowRight } from 'lucide-react';
import { api } from '../../lib/api.js';
import type { TradingWindow } from '../../lib/api.js';

type Props = {
  window: TradingWindow | null;
  onWindowSaved: () => void;
};

// ── Date entry (no window configured) ────────────────────────────────────────

function NoWindowState({ onSaved }: { onSaved: () => void }) {
  const [quarter, setQuarter] = useState('');
  const [openDate, setOpenDate] = useState('');
  const [closeDate, setCloseDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Auto-derive quarter from openDate
  function deriveQuarter(date: string): string {
    if (!date) return '';
    const d = new Date(date);
    const q = Math.ceil((d.getMonth() + 1) / 3);
    return `${d.getFullYear()}-Q${q}`;
  }

  async function save() {
    const q = quarter || deriveQuarter(openDate);
    if (!q || !openDate) { setError('Quarter and open date required'); return; }
    setSaving(true);
    setError('');
    try {
      await api.saveTradingWindow({
        quarter: q,
        openDate: new Date(openDate).toISOString(),
        ...(closeDate ? { closeDate: new Date(closeDate).toISOString() } : {}),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-slate-800 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2 text-amber-400">
        <Calendar size={18} />
        <p className="font-medium text-sm">No upcoming trading window configured</p>
      </div>
      <p className="text-slate-400 text-xs">
        Enter the next Morgan Stanley Uber trading window dates to receive reminders and sell advice.
      </p>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-slate-400 block mb-1">Window opens</label>
          <input
            type="date"
            value={openDate}
            onChange={(e) => { setOpenDate(e.target.value); setQuarter(deriveQuarter(e.target.value)); }}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Window closes (optional)</label>
          <input
            type="date"
            value={closeDate}
            onChange={(e) => setCloseDate(e.target.value)}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Quarter (auto-filled)</label>
          <input
            type="text"
            value={quarter}
            onChange={(e) => setQuarter(e.target.value)}
            placeholder="2026-Q2"
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <button
        onClick={save}
        disabled={saving || !openDate}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
      >
        {saving ? <RefreshCw size={14} className="animate-spin" /> : <Calendar size={14} />}
        {saving ? 'Saving…' : 'Save Trading Window'}
      </button>
    </div>
  );
}

// ── Scheduled state ───────────────────────────────────────────────────────────

function ScheduledState({ window, onAdvance }: { window: TradingWindow; onAdvance: () => void }) {
  const openDate = new Date(window.openDate);
  const now = new Date();
  const daysUntil = Math.ceil((openDate.getTime() - now.getTime()) / 86400_000);

  return (
    <div className="bg-slate-800 rounded-2xl p-5 space-y-3">
      <div className="flex items-center gap-2 text-blue-400">
        <Clock size={18} />
        <p className="font-medium text-sm">Trading window scheduled — {window.quarter}</p>
      </div>
      <div className="bg-slate-700 rounded-xl p-4 text-center">
        <p className="text-3xl font-bold text-white">{daysUntil}</p>
        <p className="text-slate-400 text-sm">days until window opens</p>
        <p className="text-slate-500 text-xs mt-1">
          Opens {openDate.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>
      <p className="text-slate-500 text-xs">
        You'll receive a push notification on the day the window opens. You can also mark it open early.
      </p>
      <button
        onClick={onAdvance}
        className="w-full text-sm text-slate-400 hover:text-white border border-slate-600 hover:border-slate-500 rounded-xl py-2 transition-colors"
      >
        Mark as Open Now
      </button>
    </div>
  );
}

// ── Window open — sell advisory flow ─────────────────────────────────────────

function WindowOpenState({ window, onAdvance }: { window: TradingWindow; onAdvance: (state: string, extra?: Record<string, unknown>) => void }) {
  const [uberPrice, setUberPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [advice, setAdvice] = useState<string | null>(null);
  const [parsedAdvice, setParsedAdvice] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');

  async function generateAdvice() {
    setLoading(true);
    setError('');
    try {
      const priceCents = uberPrice ? Math.round(parseFloat(uberPrice) * 100) : undefined;
      const result = await api.getUberSellAdvice(priceCents);
      const json = JSON.stringify(result);
      setAdvice(json);
      setParsedAdvice(result as unknown as Record<string, unknown>);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Advisory error');
    } finally {
      setLoading(false);
    }
  }

  async function markSold() {
    if (!advice) return;
    const rec = parsedAdvice?.['recommendation'] as Record<string, unknown> | undefined;
    const sharesSold = rec?.['sharesToSell'] as number | undefined;
    const proceeds = rec?.['proceedsUsdCents'] as number | undefined;
    onAdvance('sold', { adviceJson: advice, sharesSold, proceedsUsdCents: proceeds });
  }

  return (
    <div className="bg-slate-800 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2 text-green-400">
        <TrendingDown size={18} />
        <p className="font-medium text-sm">Window is open — {window.quarter}</p>
      </div>

      <div>
        <label className="text-xs text-slate-400 block mb-1">Current Uber price (USD, optional)</label>
        <input
          type="number"
          value={uberPrice}
          onChange={(e) => setUberPrice(e.target.value)}
          placeholder="e.g. 69.21 — leave blank to fetch live"
          className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <button
        onClick={generateAdvice}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
      >
        {loading ? <><RefreshCw size={14} className="animate-spin" /> Generating…</> : <>Generate Sell Recommendation</>}
      </button>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      {parsedAdvice && (
        <div className="space-y-3">
          <div className="bg-slate-700 rounded-xl p-4">
            <p className="text-sm font-medium text-white mb-1">
              {String((parsedAdvice['recommendation'] as Record<string, unknown>)?.['action'] ?? 'Recommendation')}
            </p>
            <p className="text-xs text-slate-400">
              {String((parsedAdvice['recommendation'] as Record<string, unknown>)?.['rationale'] ?? '')}
            </p>
          </div>
          {Boolean(parsedAdvice['marketContext']) && (
            <div className="bg-slate-700/50 rounded-xl p-3">
              <p className="text-xs text-slate-400 font-medium mb-1">Market Context</p>
              <p className="text-xs text-slate-300">
                {String((parsedAdvice['marketContext'] as Record<string, unknown>)?.['priceAssessment'] ?? '')}
              </p>
            </div>
          )}
          <button
            onClick={markSold}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
          >
            <CheckCircle2 size={16} /> Mark as Sold — Initiate Transfer
          </button>
        </div>
      )}
    </div>
  );
}

// ── Transfer tracking ────────────────────────────────────────────────────────

function TransferState({
  window,
  onConfirmArrived,
}: {
  window: TradingWindow;
  onConfirmArrived: () => void;
}) {
  return (
    <div className="bg-slate-800 rounded-2xl p-5 space-y-3">
      <div className="flex items-center gap-2 text-amber-400">
        <Send size={18} />
        <p className="font-medium text-sm">Transfer in progress — {window.quarter}</p>
      </div>
      {window.proceedsUsdCents && (
        <div className="bg-slate-700 rounded-xl p-3 text-center">
          <p className="text-slate-400 text-xs mb-1">Expected proceeds</p>
          <p className="text-xl font-bold text-white">
            ${(window.proceedsUsdCents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </p>
        </div>
      )}
      <p className="text-slate-500 text-xs">
        Morgan Stanley → DeGiro transfer is pending. It typically takes 2–5 business days.
      </p>
      <button
        onClick={onConfirmArrived}
        className="w-full flex items-center justify-center gap-2 bg-green-700 hover:bg-green-600 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
      >
        <CheckCircle2 size={16} /> Funds Have Arrived
      </button>
    </div>
  );
}

// ── Transfer arrived — auto-generate buy orders ───────────────────────────────

function TransferArrivedState({ window, onComplete }: { window: TradingWindow; onComplete: () => void }) {
  const [loading, setLoading] = useState(false);
  const [advice, setAdvice] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');

  async function generateBuyOrders() {
    if (!window.proceedsUsdCents) { setError('No proceeds amount stored'); return; }
    setLoading(true);
    setError('');
    try {
      // DCA advice using proceeds (assume ~0.92 FX rate if no live rate)
      const eurCents = Math.round(window.proceedsUsdCents * 0.92);
      const result = await api.getDCAAdvice(eurCents);
      setAdvice(result as unknown as Record<string, unknown>);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-slate-800 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2 text-green-400">
        <CheckCircle2 size={18} />
        <p className="font-medium text-sm">Transfer arrived! — {window.quarter}</p>
      </div>
      <p className="text-slate-400 text-xs">
        Generate ETF buy orders to deploy the proceeds according to your target allocation.
      </p>
      <button
        onClick={generateBuyOrders}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
      >
        {loading ? <RefreshCw size={14} className="animate-spin" /> : <ArrowRight size={14} />}
        {loading ? 'Generating…' : 'Generate Buy Orders'}
      </button>
      {error && <p className="text-red-400 text-xs">{error}</p>}
      {advice && (
        <div className="bg-slate-700 rounded-xl p-4 space-y-2">
          <p className="text-sm font-medium text-white">{String(advice['summary'] ?? '')}</p>
          <p className="text-xs text-slate-400">{String(advice['recommendation'] ?? '')}</p>
          <button
            onClick={onComplete}
            className="w-full mt-2 text-sm bg-green-700 hover:bg-green-600 text-white py-2 rounded-xl transition-colors"
          >
            Mark All Orders Executed — Complete Cycle
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function TradingWindowFlow({ window, onWindowSaved }: Props) {
  async function advance(state: string, extra?: Record<string, unknown>) {
    if (!window) return;
    try {
      await api.advanceTradingWindow(window.id, state, extra);
      onWindowSaved();
    } catch (err) {
      console.error('Advance window state failed:', err);
    }
  }

  if (!window || window.state === 'complete') {
    if (window?.state === 'complete') {
      return (
        <div className="bg-slate-800 rounded-2xl p-5 text-center space-y-2">
          <CheckCircle2 size={32} className="text-green-400 mx-auto" />
          <p className="text-white font-medium">Trading cycle complete</p>
          <p className="text-slate-500 text-xs">Great job! Set the next window date when it's announced.</p>
          <button onClick={onWindowSaved} className="text-xs text-blue-400 hover:text-blue-300">
            Configure next window →
          </button>
        </div>
      );
    }
    return <NoWindowState onSaved={onWindowSaved} />;
  }

  if (window.state === 'scheduled') {
    return <ScheduledState window={window} onAdvance={() => advance('open')} />;
  }

  if (window.state === 'open' || window.state === 'advice_ready') {
    return <WindowOpenState window={window} onAdvance={(state, extra) => advance(state, extra)} />;
  }

  if (window.state === 'sold' || window.state === 'transfer_pending') {
    return (
      <TransferState
        window={window}
        onConfirmArrived={() => advance('transfer_arrived')}
      />
    );
  }

  if (window.state === 'transfer_arrived') {
    return <TransferArrivedState window={window} onComplete={() => advance('complete')} />;
  }

  return null;
}
