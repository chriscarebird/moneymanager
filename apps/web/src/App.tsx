import { useState, useEffect, type ChangeEvent, type FormEvent } from 'react';
import { LayoutDashboard, Upload, RefreshCw, TrendingUp, Settings, Bot, BarChart2 } from 'lucide-react';
import { UploadFlow } from './components/upload/UploadFlow.js';
import { PortfolioValueCard } from './components/dashboard/PortfolioValueCard.js';
import { PortfolioHistoryChart } from './components/dashboard/PortfolioHistoryChart.js';
import { Box3Widget } from './components/dashboard/Box3Widget.js';
import { AllocationDonut } from './components/dashboard/AllocationDonut.js';
import { ConcentrationGauge } from './components/dashboard/ConcentrationGauge.js';
import { VestingProjectionChart } from './components/dashboard/VestingProjectionChart.js';
import { UpcomingEvents } from './components/dashboard/UpcomingEvents.js';
import { EquityScreen } from './components/equity/EquityScreen.js';
import { RebalanceScreen } from './components/rebalance/RebalanceScreen.js';
import { SettingsScreen } from './components/settings/SettingsScreen.js';
import { AdvisorScreen } from './components/advisor/AdvisorScreen.js';
import { TradingWindowFlow } from './components/advisor/TradingWindowFlow.js';
import { PerformanceScreen } from './components/analytics/PerformanceScreen.js';
import { OnboardingWizard } from './components/onboarding/OnboardingWizard.js';
import {
  useLatestSnapshot,
  useUberEquity,
  useRSUGrants,
  useTargetAllocations,
  useCashBalance,
  useNextTradingWindow,
  useLivePrices,
  useSnapshotHistory,
  useTransactionHistory,
  useMSSnapshotHistory,
} from './hooks/useData.js';
import { api } from './lib/api.js';
import { totalEtfEurCents, totalUberEurCents } from './lib/calc.js';
import { registerSW } from './sw.js';

// ── Auth ──────────────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: (username: string) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      }).then(async (r) => {
        const json = (await r.json()) as { error: string | null };
        if (!r.ok || json.error) throw new Error(json.error ?? 'Login failed');
      });
      onLogin(username);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="bg-slate-800 rounded-2xl p-8 w-full max-w-sm shadow-xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">InvestPilot</h1>
          <p className="text-slate-400 mt-2 text-sm">Personal Investment Advisor</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="user1 or user2"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Main app shell ────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'upload' | 'rebalance' | 'equity' | 'advisor' | 'analytics' | 'settings';

const TABS: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { id: 'upload', label: 'Upload', icon: Upload },
  { id: 'rebalance', label: 'Rebalance', icon: RefreshCw },
  { id: 'equity', label: 'Equity', icon: TrendingUp },
  { id: 'advisor', label: 'Advisor', icon: Bot },
  { id: 'analytics', label: 'Analytics', icon: BarChart2 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

function AppShell({ userId, onLogout }: { userId: string; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [onboardingDone, setOnboardingDone] = useState(
    () => Boolean(localStorage.getItem(`investpilot_onboarded_${userId}`)),
  );

  const snapshot = useLatestSnapshot();
  const equity = useUberEquity();
  const grants = useRSUGrants();
  const targets = useTargetAllocations();
  const cash = useCashBalance();
  const tradingWindow = useNextTradingWindow();
  const livePrices = useLivePrices(true);
  const snapshotHistory = useSnapshotHistory();
  const transactions = useTransactionHistory();
  const msHistory = useMSSnapshotHistory();

  function refetchAll() {
    snapshot.refetch();
    equity.refetch();
    grants.refetch();
    targets.refetch();
    cash.refetch();
    tradingWindow.refetch();
    livePrices.refetch();
    snapshotHistory.refetch();
    transactions.refetch();
    msHistory.refetch();
  }

  const cashCents = cash.data?.amountCents ?? 0;
  // Use live FX rate if available, fall back to default
  const fxRate = livePrices.data?.fxRateUsdEur ?? 0.92;

  // Onboarding detection: show wizard when no snapshot and no targets
  const isLoaded = !snapshot.loading && !targets.loading;
  const isNewUser =
    isLoaded &&
    !snapshot.data &&
    (targets.data ?? []).length === 0 &&
    !onboardingDone;

  // Total portfolio value for Box 3 widget (ETF cents + equity converted to EUR)
  const totalPortfolioEurCents =
    (snapshot.data ? totalEtfEurCents(snapshot.data) : 0) +
    totalUberEurCents(equity.data ?? [], fxRate);

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-3 flex items-center justify-between shrink-0">
        <h1 className="text-lg font-bold text-white">InvestPilot</h1>
        <div className="flex items-center gap-3">
          {livePrices.data && (
            <span className="text-xs text-slate-500">
              FX {fxRate.toFixed(4)}
            </span>
          )}
          <button
            onClick={onLogout}
            className="text-slate-400 hover:text-red-400 text-sm transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Onboarding wizard */}
      {isNewUser && (
        <OnboardingWizard
          userId={userId}
          onComplete={() => { setOnboardingDone(true); refetchAll(); }}
        />
      )}

      {/* Content — scrollable */}
      <main className="flex-1 overflow-y-auto px-4 pt-4 pb-24">
        {/* ── Dashboard ─────────────────────────────────────────────── */}
        {tab === 'dashboard' && (
          <div className="space-y-4 max-w-lg mx-auto">
            <PortfolioValueCard
              snapshot={snapshot.data ?? null}
              equity={equity.data ?? []}
              livePrices={livePrices.data ?? null}
              fxRate={fxRate}
            />
            <PortfolioHistoryChart history={snapshotHistory.data ?? []} />
            <Box3Widget totalPortfolioEurCents={totalPortfolioEurCents} />
            <AllocationDonut snapshot={snapshot.data ?? null} targets={targets.data ?? []} />
            <ConcentrationGauge
              snapshot={snapshot.data ?? null}
              equity={equity.data ?? []}
              fxRate={fxRate}
            />
            <VestingProjectionChart
              snapshot={snapshot.data ?? null}
              equity={equity.data ?? []}
              grants={grants.data ?? []}
              fxRate={fxRate}
            />
            <UpcomingEvents grants={grants.data ?? []} cashCents={cashCents} />
          </div>
        )}

        {/* ── Upload ────────────────────────────────────────────────── */}
        {tab === 'upload' && (
          <div className="max-w-lg mx-auto">
            <UploadFlow onSaved={refetchAll} />
          </div>
        )}

        {/* ── Rebalance ─────────────────────────────────────────────── */}
        {tab === 'rebalance' && (
          <div className="max-w-lg mx-auto">
            <RebalanceScreen
              snapshot={snapshot.data ?? null}
              targets={targets.data ?? []}
              cashCents={cashCents}
              loading={snapshot.loading || targets.loading}
            />
          </div>
        )}

        {/* ── Equity ────────────────────────────────────────────────── */}
        {tab === 'equity' && (
          <div className="max-w-lg mx-auto">
            <EquityScreen
              equity={equity.data ?? []}
              grants={grants.data ?? []}
              msHistory={msHistory.data ?? []}
              loading={equity.loading || grants.loading}
              onVestingUpdated={grants.refetch}
            />
          </div>
        )}

        {/* ── Advisor ───────────────────────────────────────────────── */}
        {tab === 'advisor' && (
          <div className="max-w-lg mx-auto space-y-4">
            {/* Trading window workflow sits above the advisor chat */}
            <TradingWindowFlow
              window={tradingWindow.data ?? null}
              onWindowSaved={() => { tradingWindow.refetch(); refetchAll(); }}
            />
            <AdvisorScreen />
          </div>
        )}

        {/* ── Analytics ─────────────────────────────────────────────── */}
        {tab === 'analytics' && (
          <div className="max-w-lg mx-auto">
            <PerformanceScreen
              snapshot={snapshot.data ?? null}
              transactions={transactions.data ?? []}
              snapshotHistory={snapshotHistory.data ?? []}
              loading={snapshot.loading || transactions.loading}
            />
          </div>
        )}

        {/* ── Settings ──────────────────────────────────────────────── */}
        {tab === 'settings' && (
          <div className="max-w-lg mx-auto">
            <SettingsScreen
              targets={targets.data ?? []}
              cash={cash.data ?? null}
              onSaved={refetchAll}
            />
          </div>
        )}
      </main>

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700 flex safe-area-inset-bottom">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex flex-col items-center py-2 gap-0.5 transition-colors ${
              tab === id ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Icon size={20} strokeWidth={tab === id ? 2.5 : 1.5} />
            <span className="text-[10px] font-medium">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export function App() {
  const [authed, setAuthed] = useState(false);
  const [userId, setUserId] = useState('user1');

  async function checkAuth() {
    try {
      await api.getTargets();
      setAuthed(true);
    } catch {
      setAuthed(false);
    }
  }

  // Register service worker and check session on mount
  useEffect(() => {
    registerSW();
    void checkAuth();
  }, []);

  if (!authed) {
    return (
      <LoginScreen
        onLogin={(username) => {
          setUserId(username);
          setAuthed(true);
        }}
      />
    );
  }

  return <AppShell userId={userId} onLogout={() => setAuthed(false)} />;
}
