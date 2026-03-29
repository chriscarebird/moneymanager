// Types
export type {
  User,
  UserSettings,
  Holding,
  PortfolioSnapshot,
  SnapshotSource,
  TargetAllocation,
  UberEquity,
  UberEquityType,
  UberRSUGrant,
  RSUGrantStatus,
  PendingTransfer,
  TransferStatus,
  CashBalance,
  TransactionHistory,
  TransactionAction,
  AdviceLog,
  AdviceType,
  Notification,
  NotificationType,
  DeGiroETFList,
  DeGiroMonthlyTradeTracker,
  MonthlyTrade,
  TradeDirection,
} from './types/index.js';

export type { ApiResponse } from './types/api.js';

// Calculations — vesting
export type { VestingEvent, VestingSchedule } from './calculations/vesting.js';
export {
  parseVestingFormula,
  computeVestingSchedule,
  getVestedCount,
  getNextVestingEvent,
} from './calculations/vesting.js';

// Calculations — concentration
export type { ConcentrationAnalysis } from './calculations/concentration.js';
export {
  calculateConcentration,
  getTotalUberValueUsdCents,
  getTotalPortfolioValueEurCents,
} from './calculations/concentration.js';

// Calculations — rebalancing
export type { RebalancingAction, RebalancingPlan } from './calculations/rebalancing.js';
export { computeRebalancingPlan, getCurrentAllocations } from './calculations/rebalancing.js';

// Calculations — fair use
export type { FairUseStatus } from './calculations/fairuse.js';
export { checkFairUse, optimiseTradeOrder, calculateTotalFees } from './calculations/fairuse.js';
