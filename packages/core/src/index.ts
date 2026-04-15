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
export type {
  VestingEvent,
  VestingSchedule,
  VestingFormulaParams,
} from './calculations/vesting.js';
export {
  parseVestingFormula,
  addCalendarMonths,
  computeVestingSchedule,
  stackVestingSchedules,
  getVestedCount,
  getNextVestingEvent,
} from './calculations/vesting.js';

// Calculations — concentration
export type {
  ConcentrationAnalysis,
  ConcentrationProjectionPoint,
} from './calculations/concentration.js';
export {
  calculateConcentration,
  getTotalUberValueUsdCents,
  getTotalPortfolioValueEurCents,
  getSnapshotValueEurCents,
  projectConcentrations,
} from './calculations/concentration.js';

// Calculations — rebalancing
export type { RebalancingAction, RebalancingPlan } from './calculations/rebalancing.js';
export {
  computeRebalancingPlan,
  getCurrentAllocations,
  DEGIRO_DEFAULT_FEE_CENTS,
  MINIMUM_ORDER_EUR_CENTS,
} from './calculations/rebalancing.js';

// Calculations — performance / P&L
export type { PositionPnL } from './calculations/performance.js';
export { computePositionPnL } from './calculations/performance.js';

// Calculations — fair use
export type { FairUseStatus } from './calculations/fairuse.js';
export {
  checkFairUse,
  wouldBeFree,
  annotateTradeFees,
  optimiseTradeOrder,
  calculateTotalFees,
  emptyTracker,
  withTrade,
  FREE_CHAIN_MIN_CENTS,
  CHARGED_FEE_CENTS,
} from './calculations/fairuse.js';
