/**
 * Core domain types for InvestPilot.
 * All money values are integers in cents (smallest currency unit).
 * All dates are ISO 8601 strings in UTC.
 */

// ── User ─────────────────────────────────────────────────────────────────────

export interface UserSettings {
  /** Target EUR cash buffer to keep uninvested */
  cashBufferEurCents: number;
  /** Single-stock concentration limit as a percentage (0–100) */
  concentrationLimitPct: number;
  /** Default exchange for ETF purchases */
  preferredExchange: string;
  /** Base currency for display */
  baseCurrency: 'EUR' | 'USD';
}

export interface User {
  id: string;
  name: string;
  settings: UserSettings;
}

// ── Portfolio Snapshot ────────────────────────────────────────────────────────

export type SnapshotSource = 'screenshot' | 'manual';

export interface Holding {
  snapshotId: string;
  assetType: 'ETF' | 'Stock';
  name: string;
  isin: string;
  quantity: number;
  /** Price in cents (EUR) */
  priceCents: number;
  /** Total value in cents (EUR) = quantity × price */
  valueCents: number;
  exchange: string;
}

export interface PortfolioSnapshot {
  id: string;
  date: string; // ISO 8601
  source: SnapshotSource;
  rawImageUrl: string | null;
  holdings: Holding[];
}

// ── Target Allocation ─────────────────────────────────────────────────────────

export interface TargetAllocation {
  id: string;
  assetClass: string;
  etfIsin: string;
  etfName: string;
  /** Target allocation percentage (0–100) */
  targetPct: number;
  exchange: string;
  isFreeEtf: boolean;
  active: boolean;
}

// ── Uber Equity ───────────────────────────────────────────────────────────────

export type UberEquityType = 'RSU' | 'ESPP' | 'Direct_Shares';

export interface UberEquity {
  type: UberEquityType;
  sharesHeld: number;
  sharesAvailableToTransact: number;
  /** Market value in USD cents */
  marketValueUsdCents: number;
  holdingPeriodActive: boolean;
}

export type RSUGrantStatus = 'active' | 'fully_vested' | 'forfeited';

export interface UberRSUGrant {
  grantId: string;
  totalRsus: number;
  vestingCommencementDate: string; // ISO 8601
  /**
   * Vesting formula description.
   * e.g. "3/48 at month 3, then 1/48 monthly"
   */
  vestingFormula: string;
  dateOfGrant: string; // ISO 8601
  sourceDocumentUrl: string | null;
  status: RSUGrantStatus;
}

// ── Pending Transfer ──────────────────────────────────────────────────────────

export type TransferStatus = 'pending' | 'completed';

export interface PendingTransfer {
  id: string;
  source: string;
  destination: string;
  /** Amount in USD cents */
  amountUsdCents: number | null;
  /** Amount in EUR cents */
  amountEurCents: number | null;
  /** FX rate as a float (e.g. 0.92 for USD→EUR) */
  fxRate: number | null;
  status: TransferStatus;
  dateInitiated: string; // ISO 8601
  dateCompleted: string | null; // ISO 8601
}

// ── Cash Balance ──────────────────────────────────────────────────────────────

export interface CashBalance {
  id: string;
  /** Amount in EUR cents */
  amountCents: number;
  dateUpdated: string; // ISO 8601
  notes: string | null;
}

// ── Transaction History ───────────────────────────────────────────────────────

export type TransactionAction = 'buy' | 'sell';

export interface TransactionHistory {
  id: string;
  date: string; // ISO 8601
  action: TransactionAction;
  asset: string;
  quantity: number;
  /** Price per unit in cents */
  priceCents: number;
  /** Transaction fee in cents */
  feeCents: number;
  exchange: string;
}

// ── Advice Log ────────────────────────────────────────────────────────────────

export type AdviceType = 'RSU' | 'rebalance' | 'strategy' | 'DCA';

export interface AdviceLog {
  id: string;
  date: string; // ISO 8601
  type: AdviceType;
  recommendationText: string;
  wasFollowed: boolean | null;
}

// ── Notification ──────────────────────────────────────────────────────────────

export type NotificationType =
  | 'rsu_vesting'
  | 'rebalance_due'
  | 'transfer_reminder'
  | 'monthly_review'
  | 'trading_window_open'
  | 'trading_window_missing'
  | 'market_dip'
  | 'monthly_investment'
  | 'transfer_followup'
  | 'transfer_arrived'
  | 'dca_scheduled'
  | 'portfolio_drift'
  | 'quarterly_review';

export interface Notification {
  id: string;
  type: NotificationType;
  scheduledDate: string; // ISO 8601
  sent: boolean;
  message: string;
}

// ── DeGiro ETF List ───────────────────────────────────────────────────────────

export interface DeGiroETFList {
  isin: string;
  name: string;
  exchange: string;
  isCoreSelection: boolean;
  /** Typical spread in basis points */
  typicalSpreadBps: number | null;
  /** Average daily volume (shares) */
  avgDailyVolume: number | null;
}

// ── DeGiro Monthly Trade Tracker ──────────────────────────────────────────────

export type TradeDirection = 'buy' | 'sell';

export interface MonthlyTrade {
  direction: TradeDirection;
  /** Amount in EUR cents */
  amountCents: number;
  wasFree: boolean;
}

export interface DeGiroMonthlyTradeTracker {
  id: string;
  isin: string;
  /** Month in YYYY-MM format */
  month: string;
  transactions: MonthlyTrade[];
}
