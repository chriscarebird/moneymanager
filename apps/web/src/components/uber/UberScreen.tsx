import type { UberEquity, UberRSUGrant, MSSnapshotHistoryPoint, TradingWindow } from '../../lib/api.js';
import { EquityScreen } from '../equity/EquityScreen.js';
import { TradingWindowFlow } from '../advisor/TradingWindowFlow.js';

type Props = {
  equity: UberEquity[];
  grants: UberRSUGrant[];
  msHistory: MSSnapshotHistoryPoint[];
  loading: boolean;
  onVestingUpdated: () => void;
  tradingWindow: TradingWindow | null;
  onWindowSaved: () => void;
  uberPriceUsdCents: number | null;
};

export function UberScreen({
  equity, grants, msHistory, loading, onVestingUpdated, tradingWindow, onWindowSaved, uberPriceUsdCents,
}: Props) {
  return (
    <div className="space-y-4 pb-6">
      <EquityScreen
        equity={equity}
        grants={grants}
        msHistory={msHistory}
        loading={loading}
        onVestingUpdated={onVestingUpdated}
        uberPriceUsdCents={uberPriceUsdCents}
      />
      <TradingWindowFlow window={tradingWindow} onWindowSaved={onWindowSaved} />
    </div>
  );
}
