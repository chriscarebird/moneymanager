import { useState } from 'react';

/**
 * InvestPilot App Shell
 *
 * Phase 1A: Routing placeholder — full routing will be implemented in Phase 3.
 * Expected routes:
 *   /           → Dashboard (portfolio overview)
 *   /login      → Login page
 *   /portfolio  → Portfolio snapshots
 *   /equity     → Uber equity & RSU tracker
 *   /advice     → AI advisory
 *   /settings   → App settings
 */

type Route = 'login' | 'dashboard' | 'portfolio' | 'equity' | 'advice' | 'settings';

export function App() {
  const [currentRoute, setCurrentRoute] = useState<Route>('login');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const navigate = (route: Route) => {
    setCurrentRoute(route);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="bg-slate-800 rounded-2xl p-8 w-full max-w-md shadow-xl">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white">InvestPilot</h1>
            <p className="text-slate-400 mt-2">Personal Investment Advisor</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Username</label>
              <input
                type="text"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="user1 or user2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
              <input
                type="password"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>
            <button
              onClick={() => {
                setIsAuthenticated(true);
                navigate('dashboard');
              }}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Sign In
            </button>
          </div>
          <p className="text-center text-slate-500 text-xs mt-6">
            Phase 1A — Auth wired in Phase 2
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Navigation */}
      <nav className="bg-slate-800 border-b border-slate-700 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">InvestPilot</h1>
          <div className="flex gap-4">
            {(['dashboard', 'portfolio', 'equity', 'advice', 'settings'] as Route[]).map(
              (route) => (
                <button
                  key={route}
                  onClick={() => navigate(route)}
                  className={`px-3 py-1 rounded-md text-sm font-medium capitalize transition-colors ${
                    currentRoute === route
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {route}
                </button>
              ),
            )}
            <button
              onClick={() => {
                setIsAuthenticated(false);
                navigate('login');
              }}
              className="px-3 py-1 rounded-md text-sm font-medium text-slate-400 hover:text-red-400 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <RouteContent route={currentRoute} />
      </main>
    </div>
  );
}

function RouteContent({ route }: { route: Route }) {
  const placeholders: Record<Route, { title: string; description: string }> = {
    login: { title: 'Login', description: 'Authentication screen' },
    dashboard: {
      title: 'Dashboard',
      description: 'Portfolio overview, equity summary, and AI recommendations',
    },
    portfolio: {
      title: 'Portfolio',
      description: 'DeGiro ETF holdings, snapshots, and rebalancing tools',
    },
    equity: {
      title: 'Uber Equity',
      description: 'RSU vesting schedule, ESPP, and direct shares tracker',
    },
    advice: { title: 'AI Advice', description: 'Claude-powered investment advisory' },
    settings: { title: 'Settings', description: 'App configuration and preferences' },
  };

  const page = placeholders[route];

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="bg-slate-800 rounded-2xl p-12 max-w-lg w-full">
        <h2 className="text-2xl font-bold text-white mb-3">{page.title}</h2>
        <p className="text-slate-400">{page.description}</p>
        <p className="text-slate-600 text-sm mt-6">
          Phase 1A scaffold — implementation in Phase 3
        </p>
      </div>
    </div>
  );
}
