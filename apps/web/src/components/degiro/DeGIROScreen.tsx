import type {
  PortfolioSnapshot,
  TargetAllocation,
  TransactionHistory,
  SnapshotHistoryPoint,
} from '../../lib/api.js';
import { AllocationBarChart } from './AllocationBarChart.js';
import { PortfolioHistoryChart } from '../dashboard/PortfolioHistoryChart.js';
import { RebalanceScreen } from '../rebalance/RebalanceScreen.js';
import { TargetAllocationEditor } from './TargetAllocationEditor.js';
import { PortfolioAnalytics } from './PortfolioAnalytics.js';
import { useEtfSectors } from '../../hooks/useData.js';

type Props = {
  snapshot: PortfolioSnapshot | null;
  targets: TargetAllocation[];
  cashCents: number;
  loading: boolean;
  transactions: TransactionHistory[];
  snapshotHistory: SnapshotHistoryPoint[];
  onSaved: () => void;
};

export function DeGIROScreen({
  snapshot, targets, cashCents, loading, transactions, snapshotHistory, onSaved,
}: Props) {
  const etfSectors = useEtfSectors();

  return (
    <div className="space-y-4 pb-6">
      <PortfolioAnalytics
        snapshot={snapshot}
        transactions={transactions}
        cashCents={cashCents}
        loading={loading}
        etfSectors={etfSectors.data ?? []}
        onSectorsRefreshed={etfSectors.refetch}
      />

      <AllocationBarChart snapshot={snapshot} targets={targets} />

      <PortfolioHistoryChart history={snapshotHistory} />

      <RebalanceScreen
        snapshot={snapshot}
        targets={targets}
        cashCents={cashCents}
        loading={loading}
      />

      <TargetAllocationEditor targets={targets} onSaved={onSaved} />

      {!snapshot && !loading && (
        <div className="p-6 text-center">
          <p className="text-slate-400">No portfolio snapshot</p>
          <p className="text-slate-600 text-sm mt-1">Upload a DeGiro screenshot first</p>
        </div>
      )}
    </div>
  );
}
