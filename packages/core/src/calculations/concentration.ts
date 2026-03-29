import type { UberEquity, PortfolioSnapshot } from '../types/index.js';

/**
 * Concentration analysis result for a portfolio.
 */
export interface ConcentrationAnalysis {
  /** Total portfolio value in EUR cents */
  totalValueEurCents: number;
  /** Uber equity value in USD cents */
  uberEquityUsdCents: number;
  /** Uber equity as % of total portfolio (0–100) */
  uberConcentrationPct: number;
  /** Whether Uber concentration exceeds the limit */
  isOverLimit: boolean;
  /** Suggested amount to sell in USD cents to reach limit */
  suggestedSellUsdCents: number;
}

/**
 * Calculate portfolio concentration, focusing on single-stock (Uber) exposure.
 *
 * Concentration = Uber equity value / total portfolio value × 100
 * If concentration > limit, compute sell amount to bring it back under.
 *
 * All values must be in the same currency for comparison —
 * use usdToEurRate to convert USD → EUR.
 *
 * @param snapshot - Latest portfolio snapshot
 * @param uberEquity - Current Uber equity positions
 * @param concentrationLimitPct - Maximum allowed single-stock % (e.g. 20)
 * @param usdToEurRate - Current USD/EUR exchange rate (e.g. 0.92)
 * @returns Concentration analysis
 *
 * @example
 * calculateConcentration(snapshot, equity, 20, 0.92)
 * // => { uberConcentrationPct: 35.2, isOverLimit: true, suggestedSellUsdCents: 450000 }
 */
export function calculateConcentration(
  snapshot: PortfolioSnapshot,
  uberEquity: UberEquity[],
  concentrationLimitPct: number,
  usdToEurRate: number,
): ConcentrationAnalysis {
  // TODO Phase 1B: implement full calculation
  void snapshot;
  void uberEquity;
  void concentrationLimitPct;
  void usdToEurRate;

  return {
    totalValueEurCents: 0,
    uberEquityUsdCents: 0,
    uberConcentrationPct: 0,
    isOverLimit: false,
    suggestedSellUsdCents: 0,
  };
}

/**
 * Calculate the total value of all Uber equity positions in USD cents.
 *
 * @param uberEquity - Array of Uber equity positions
 * @returns Total market value in USD cents
 *
 * @example
 * getTotalUberValueUsd([
 *   { type: 'Direct_Shares', marketValueUsdCents: 221400, ... },
 *   { type: 'ESPP', marketValueUsdCents: 1231400, ... },
 * ])
 * // => 1452800
 */
export function getTotalUberValueUsdCents(uberEquity: UberEquity[]): number {
  // TODO Phase 1B: implement
  return uberEquity.reduce((sum, equity) => sum + equity.marketValueUsdCents, 0);
}

/**
 * Calculate the total portfolio value in EUR cents,
 * combining ETF holdings and Uber equity (converted at given FX rate).
 *
 * @param snapshot - Portfolio snapshot with ETF holdings
 * @param uberEquity - Uber equity positions
 * @param usdToEurRate - FX rate for USD→EUR conversion
 * @returns Total portfolio value in EUR cents
 */
export function getTotalPortfolioValueEurCents(
  snapshot: PortfolioSnapshot,
  uberEquity: UberEquity[],
  usdToEurRate: number,
): number {
  // TODO Phase 1B: implement
  void uberEquity;
  void usdToEurRate;
  return snapshot.holdings.reduce((sum, h) => sum + h.valueCents, 0);
}
