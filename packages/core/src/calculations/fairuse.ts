import type { DeGiroMonthlyTradeTracker } from '../types/index.js';

/**
 * DeGiro "core selection" ETFs can be traded once per month for free.
 * After the first trade, subsequent trades in the same month incur fees.
 * This module tracks and enforces fair-use compliance.
 */

/**
 * Result of a fair-use check.
 */
export interface FairUseStatus {
  isin: string;
  month: string; // YYYY-MM
  /** Number of free trades used this month */
  freeTradesUsed: number;
  /** Whether another free trade is available */
  hasFreeTrade: boolean;
  /** Estimated fee for next trade if not free (EUR cents) */
  estimatedFeeCents: number;
}

/**
 * Check whether an ETF is eligible for a free trade this month.
 *
 * DeGiro core selection ETFs: first trade per month is free.
 * Subsequent trades in the same month incur the standard fee (~€2.00).
 *
 * @param tracker - Monthly trade tracker for the ETF
 * @param month - Month to check in YYYY-MM format
 * @returns Fair-use status
 *
 * @example
 * checkFairUse(tracker, '2026-03')
 * // => { hasFreeTrade: true, freeTradesUsed: 0, estimatedFeeCents: 0 }
 */
export function checkFairUse(
  tracker: DeGiroMonthlyTradeTracker,
  month: string,
): FairUseStatus {
  // TODO Phase 1B: implement
  void tracker;
  void month;

  return {
    isin: tracker.isin,
    month,
    freeTradesUsed: 0,
    hasFreeTrade: true,
    estimatedFeeCents: 0,
  };
}

/**
 * Determine the optimal order of ETF purchases to maximize free trades.
 *
 * Strategy:
 * 1. If an ETF has a free trade available this month, prioritise it
 * 2. Batch trades to use free slots efficiently
 * 3. Return ordered list with estimated fees
 *
 * @param isins - List of ISINs to trade
 * @param trackers - Monthly trade trackers for all ETFs
 * @param month - Current month in YYYY-MM format
 * @returns Ordered trade list with fee estimates
 *
 * @example
 * optimiseTradeOrder(['IE00B3RBWM25', 'IE00B3XXRP09'], trackers, '2026-03')
 * // => [{ isin: 'IE00B3RBWM25', isFree: true, feeCents: 0 }, ...]
 */
export function optimiseTradeOrder(
  isins: string[],
  trackers: DeGiroMonthlyTradeTracker[],
  month: string,
): Array<{ isin: string; isFree: boolean; feeCents: number }> {
  // TODO Phase 1B: implement
  void trackers;
  void month;

  return isins.map((isin) => ({ isin, isFree: false, feeCents: 200 }));
}

/**
 * Calculate the total transaction fees for a set of trades.
 *
 * @param trades - Trade list with fee estimates
 * @returns Total fee in EUR cents
 *
 * @example
 * calculateTotalFees([{ feeCents: 0 }, { feeCents: 200 }])
 * // => 200
 */
export function calculateTotalFees(
  trades: Array<{ feeCents: number }>,
): number {
  return trades.reduce((sum, t) => sum + t.feeCents, 0);
}
