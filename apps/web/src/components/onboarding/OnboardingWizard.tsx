import { useState, type FormEvent } from 'react';
import { api } from '../../lib/api.js';
import {
  registerPushNotifications,
} from '../../lib/pushNotifications.js';

type Props = {
  userId: string;
  onComplete: () => void;
};

const TOTAL_STEPS = 6;

// Reference 7-ETF portfolio defaults
const DEFAULT_ALLOCATIONS = [
  { isin: 'IE00B3RBWM25', name: 'VWRL', pct: 35, exchange: 'XETRA', isFreeEtf: true, assetClass: 'Global Equity' },
  { isin: 'IE00B3XXRP09', name: 'VUSA', pct: 20, exchange: 'XETRA', isFreeEtf: true, assetClass: 'US Equity' },
  { isin: 'IE00BF4RFH31', name: 'IUSN', pct: 15, exchange: 'XETRA', isFreeEtf: true, assetClass: 'Small Cap' },
  { isin: 'IE00B4WXJJ64', name: 'VAGE', pct: 10, exchange: 'XETRA', isFreeEtf: true, assetClass: 'Bonds' },
  { isin: 'IE00B3ZW0K18', name: 'IAEX', pct: 10, exchange: 'XETRA', isFreeEtf: true, assetClass: 'NL Equity' },
  { isin: 'IE0032077012', name: 'EQQQ', pct: 5, exchange: 'XETRA', isFreeEtf: false, assetClass: 'Nasdaq' },
  { isin: 'IE00B52MJD48', name: 'BJL8', pct: 5, exchange: 'XETRA', isFreeEtf: false, assetClass: 'EM' },
];

export function OnboardingWizard({ userId, onComplete }: Props) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // Step 2: allocations
  const [allocsDone, setAllocsDone] = useState(false);

  // Step 3: cash buffer
  const [cashEur, setCashEur] = useState('2000');

  // Step 4: trading window
  const [windowDate, setWindowDate] = useState('');

  // Step 5: push
  const [pushDone, setPushDone] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);

  function next() {
    setMsg('');
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  }

  function back() {
    setMsg('');
    setStep((s) => Math.max(s - 1, 1));
  }

  async function applyDefaultAllocations() {
    setSaving(true);
    setMsg('');
    try {
      for (const a of DEFAULT_ALLOCATIONS) {
        await api.saveTarget({
          assetClass: a.assetClass,
          etfIsin: a.isin,
          etfName: a.name,
          targetPct: a.pct,
          exchange: a.exchange,
          isFreeEtf: a.isFreeEtf,
          active: true,
        });
      }
      setAllocsDone(true);
      next();
    } catch {
      setMsg('Failed to save allocations. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function saveCashBuffer(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    try {
      const cents = Math.round(parseFloat(cashEur) * 100);
      if (!isNaN(cents) && cents >= 0) {
        await api.setCash(cents);
      }
      next();
    } catch {
      setMsg('Failed to save cash buffer.');
    } finally {
      setSaving(false);
    }
  }

  async function saveTradingWindow(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    try {
      if (windowDate) {
        const [year, month] = windowDate.split('-');
        const quarter = `${year}-Q${Math.ceil(parseInt(month!) / 3)}`;
        const openDate = `${windowDate}T00:00:00Z`;
        await api.saveTradingWindow({ quarter, openDate });
      }
      next();
    } catch {
      setMsg('Failed to save trading window.');
    } finally {
      setSaving(false);
    }
  }

  async function enablePush() {
    const ok = await registerPushNotifications();
    setPushEnabled(ok);
    setPushDone(true);
  }

  function finish() {
    localStorage.setItem(`investpilot_onboarded_${userId}`, '1');
    onComplete();
  }

  const progress = ((step - 1) / (TOTAL_STEPS - 1)) * 100;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center px-4">
      <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        {/* Progress bar */}
        <div className="h-1 bg-slate-700 rounded-full mb-6">
          <div
            className="h-1 bg-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <p className="text-slate-500 text-xs mb-4">Step {step} of {TOTAL_STEPS}</p>

        {/* Step 1: Welcome */}
        {step === 1 && (
          <div>
            <h2 className="text-xl font-bold text-white mb-2">Welcome to InvestPilot</h2>
            <p className="text-slate-400 text-sm mb-6">
              Let's get your portfolio set up in a few quick steps. This will take about 5 minutes.
            </p>
            <ul className="space-y-2 text-sm text-slate-400 mb-6">
              <li>📊 Set target ETF allocations</li>
              <li>💶 Define your cash buffer</li>
              <li>🕐 Enter your next Uber trading window</li>
              <li>🔔 Enable push notifications</li>
            </ul>
            <button
              onClick={next}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 rounded-xl transition-colors"
            >
              Get Started
            </button>
          </div>
        )}

        {/* Step 2: Target allocations */}
        {step === 2 && (
          <div>
            <h2 className="text-lg font-bold text-white mb-2">Target Allocations</h2>
            <p className="text-slate-400 text-sm mb-4">
              Import the reference 7-ETF portfolio as your starting point. You can adjust these in Settings later.
            </p>
            <div className="space-y-1.5 mb-4">
              {DEFAULT_ALLOCATIONS.map((a) => (
                <div key={a.isin} className="flex justify-between text-xs">
                  <span className="text-slate-300">{a.name}</span>
                  <span className="text-slate-400">{a.pct}%</span>
                </div>
              ))}
            </div>
            {msg && <p className="text-red-400 text-xs mb-2">{msg}</p>}
            {allocsDone ? (
              <p className="text-green-400 text-sm mb-4">Allocations saved!</p>
            ) : (
              <button
                onClick={() => { void applyDefaultAllocations(); }}
                disabled={saving}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl transition-colors mb-2"
              >
                {saving ? 'Saving…' : 'Import Default Portfolio'}
              </button>
            )}
            <div className="flex gap-2">
              <button onClick={back} className="flex-1 text-slate-400 hover:text-white text-sm py-2 transition-colors">
                Back
              </button>
              <button onClick={next} className="flex-1 text-slate-400 hover:text-white text-sm py-2 transition-colors">
                Skip
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Cash buffer */}
        {step === 3 && (
          <form onSubmit={(e) => { void saveCashBuffer(e); }}>
            <h2 className="text-lg font-bold text-white mb-2">Cash Buffer</h2>
            <p className="text-slate-400 text-sm mb-4">
              How much EUR cash do you want to keep uninvested in DeGiro? This is subtracted before computing buy orders.
            </p>
            <div className="mb-4">
              <label className="block text-sm text-slate-300 mb-1">Cash buffer (EUR)</label>
              <input
                type="number"
                min="0"
                step="100"
                value={cashEur}
                onChange={(e) => setCashEur(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="2000"
              />
            </div>
            {msg && <p className="text-red-400 text-xs mb-2">{msg}</p>}
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl transition-colors mb-2"
            >
              {saving ? 'Saving…' : 'Save & Continue'}
            </button>
            <button type="button" onClick={back} className="w-full text-slate-400 hover:text-white text-sm py-2 transition-colors">
              Back
            </button>
          </form>
        )}

        {/* Step 4: Trading window */}
        {step === 4 && (
          <form onSubmit={(e) => { void saveTradingWindow(e); }}>
            <h2 className="text-lg font-bold text-white mb-2">Uber Trading Window</h2>
            <p className="text-slate-400 text-sm mb-4">
              Enter your next Uber trading window open date. InvestPilot will remind you 7 days in advance.
            </p>
            <div className="mb-4">
              <label className="block text-sm text-slate-300 mb-1">Open date</label>
              <input
                type="date"
                value={windowDate}
                onChange={(e) => setWindowDate(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {msg && <p className="text-red-400 text-xs mb-2">{msg}</p>}
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl transition-colors mb-2"
            >
              {saving ? 'Saving…' : windowDate ? 'Save & Continue' : 'Skip for now'}
            </button>
            <button type="button" onClick={back} className="w-full text-slate-400 hover:text-white text-sm py-2 transition-colors">
              Back
            </button>
          </form>
        )}

        {/* Step 5: Push notifications */}
        {step === 5 && (
          <div>
            <h2 className="text-lg font-bold text-white mb-2">Push Notifications</h2>
            <p className="text-slate-400 text-sm mb-4">
              Get alerted when your trading window opens, when RSUs vest, and when monthly DCA is due.
            </p>
            {pushDone ? (
              <p className={`text-sm mb-4 ${pushEnabled ? 'text-green-400' : 'text-slate-400'}`}>
                {pushEnabled ? '✓ Notifications enabled!' : 'Skipped — you can enable them in Settings.'}
              </p>
            ) : (
              <button
                onClick={() => { void enablePush(); }}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 rounded-xl transition-colors mb-2"
              >
                Enable Notifications
              </button>
            )}
            <div className="flex gap-2">
              <button onClick={back} className="flex-1 text-slate-400 hover:text-white text-sm py-2 transition-colors">
                Back
              </button>
              <button
                onClick={next}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium py-2 rounded-xl transition-colors"
              >
                {pushDone ? 'Continue' : 'Skip'}
              </button>
            </div>
          </div>
        )}

        {/* Step 6: Done */}
        {step === 6 && (
          <div className="text-center">
            <div className="text-4xl mb-4">🎉</div>
            <h2 className="text-xl font-bold text-white mb-2">You're all set!</h2>
            <p className="text-slate-400 text-sm mb-2">
              Upload your first DeGiro screenshot from the <strong className="text-white">Upload</strong> tab to see your full dashboard.
            </p>
            <p className="text-slate-500 text-xs mb-6">
              Tip: The Advisor tab generates AI-powered rebalancing and RSU sell recommendations.
            </p>
            <button
              onClick={finish}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-colors"
            >
              Open Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
