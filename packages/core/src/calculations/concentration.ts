import type { UberEquity, PortfolioSnapshot } from '../types/index.js';
import type { VestingSchedule } from './vesting.js';

/** Full concentration analysis for the combined portfolio. */
export interface ConcentrationAnalysis {
  /** Total portfolio value in EUR cents */
  totalValueEurCents: number;
  /** Uber equity value in USD cents (sum of all passed positions) */
  uberEquityUsdCents: number;
  /** Uber equity value converted to EUR cents */
  uberEquityEurCents: number;
  /** Uber as % of total portfolio (0–100) */
  uberConcentrationPct: number;
  /** True if concentration exceeds the supplied limit */
  isOverLimit: boolean;
  /**
   * Suggested amount to sell (USD cents) to bring concentration to exactly
   * concentrationLimitPct. Zero if not over limit.
   */
  suggestedSellUsdCents: number;
}

/**
 * A single point in the forward-looking concentration projection.
 */
export interface ConcentrationProjectionPoint {
  /** ISO 8601 date of this projection */
  atDate: string;
  /** Calendar months from the asOfDate */
  monthsFromNow: number;
  /** Additional shares vested between asOfDate and atDate */
  additionalSharesVested: number;
  /** Projected Uber value in USD cents at this point */
  projectedUberUsdCents: number;
  /** Projected Uber concentration % at this point */
  projectedUberPct: number;
}

/**
 * Calculate the total market value of all Uber equity positions in USD cents.
 */
export function getTotalUberValueUsdCents(uberEquity: UberEquity[]): number {
  return uberEquity.reduce((sum, e) => sum + e.marketValueUsdCents, 0);
}

/**
 * Calculate the total ETF/holdings value from a snapshot in EUR cents.
 */
export function getSnapshotValueEurCents(snapshot: PortfolioSnapshot): number {
  return snapshot.holdings.reduce((sum, h) => sum + h.valueCents, 0);
}

/**
 * Calculate total portfolio value in EUR cents (ETF holdings + Uber converted).
 *
 * @param snapshot - Portfolio snapshot containing ETF holdings
 * @param uberEquity - Uber equity positions to include (caller decides available vs all)
 * @param usdToEurRate - e.g. 0.92
 */
export function getTotalPortfolioValueEurCents(
  snapshot: PortfolioSnapshot,
  uberEquity: UberEquity[],
  usdToEurRate: number,
): number {
  const etfValue = getSnapshotValueEurCents(snapshot);
  const uberUsd = getTotalUberValueUsdCents(uberEquity);
  return etfValue + Math.round(uberUsd * usdToEurRate);
}

/**
 * Calculate Uber concentration and suggest a sell amount if over limit.
 *
 * Caller controls which Uber positions to include:
 * - Pass only transactable positions (type !== 'RSU' or sharesAvailableToTransact > 0)
 *   for "available only" concentration used in sell decisions.
 * - Pass all positions for total-portfolio view.
 *
 * Sell amount formula (derived so concentration reaches exactly the limit):
 *   sellEUR = (uberEUR − limit × totalEUR) / (1 − limit)
 *
 * @param snapshot - Latest DeGiro portfolio snapshot
 * @param uberEquity - Uber positions to include
 * @param concentrationLimitPct - e.g. 20 (for 20%)
 * @param usdToEurRate - e.g. 0.92
 */
export function calculateConcentration(
  snapshot: PortfolioSnapshot,
  uberEquity: UberEquity[],
  concentrationLimitPct: number,
  usdToEurRate: number,
): ConcentrationAnalysis {
  const etfValueEurCents = getSnapshotValueEurCents(snapshot);
  const uberEquityUsdCents = getTotalUberValueUsdCents(uberEquity);
  const uberEquityEurCents = Math.round(uberEquityUsdCents * usdToEurRate);
  const totalValueEurCents = etfValueEurCents + uberEquityEurCents;

  const uberConcentrationPct =
    totalValueEurCents > 0 ? (uberEquityEurCents / totalValueEurCents) * 100 : 0;

  const limitFraction = concentrationLimitPct / 100;
  const isOverLimit = uberConcentrationPct > concentrationLimitPct;

  let suggestedSellUsdCents = 0;
  if (isOverLimit) {
    // Solve: (uberEUR − sellEUR) / (totalEUR − sellEUR) = limitFraction
    const sellEurCents = Math.ceil(
      (uberEquityEurCents - limitFraction * totalValueEurCents) / (1 - limitFraction),
    );
    suggestedSellUsdCents = Math.ceil(sellEurCents / usdToEurRate);
  }

  return {
    totalValueEurCents,
    uberEquityUsdCents,
    uberEquityEurCents,
    uberConcentrationPct,
    isOverLimit,
    suggestedSellUsdCents,
  };
}

/**
 * Project Uber concentration at future dates assuming no selling occurs.
 *
 * For each projection point:
 * 1. Sum future vesting events up to that date (shares × current Uber price)
 * 2. Add to current Uber value
 * 3. ETF portfolio assumed static (no new purchases)
 *
 * @param currentSnapshotEurCents - Current ETF portfolio value in EUR cents
 * @param currentUberUsdCents - Current Uber equity value in USD cents
 * @param vestingSchedules - All active RSU grant schedules
 * @param uberPriceUsdCents - Current Uber share price in USD cents (e.g. 6928 = $69.28)
 * @param usdToEurRate - e.g. 0.92
 * @param asOfDate - ISO 8601 reference date (defaults to today)
 * @param projectionMonths - Months ahead to project (default: [3, 6, 12])
 */
export function projectConcentrations(
  currentSnapshotEurCents: number,
  currentUberUsdCents: number,
  vestingSchedules: VestingSchedule[],
  uberPriceUsdCents: number,
  usdToEurRate: number,
  asOfDate?: string,
  projectionMonths?: number[],
): ConcentrationProjectionPoint[] {
  const months = projectionMonths ?? [3, 6, 12];
  const asOf = asOfDate ? new Date(asOfDate) : new Date();

  return months.map((m) => {
    const targetDate = new Date(
      Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + m, asOf.getUTCDate()),
    );

    // Sum all future vesting events up to targetDate across all grants
    let additionalSharesVested = 0;
    for (const schedule of vestingSchedules) {
      for (const event of schedule.events) {
        const eventDate = new Date(event.date);
        if (eventDate > asOf && eventDate <= targetDate) {
          additionalSharesVested += event.sharesVesting;
        }
      }
    }

    const additionalUberUsdCents = additionalSharesVested * uberPriceUsdCents;
    const projectedUberUsdCents = currentUberUsdCents + additionalUberUsdCents;
    const projectedUberEurCents = Math.round(projectedUberUsdCents * usdToEurRate);
    const projectedTotalEurCents = currentSnapshotEurCents + projectedUberEurCents;
    const projectedUberPct =
      projectedTotalEurCents > 0 ? (projectedUberEurCents / projectedTotalEurCents) * 100 : 0;

    return {
      atDate: targetDate.toISOString(),
      monthsFromNow: m,
      additionalSharesVested,
      projectedUberUsdCents,
      projectedUberPct,
    };
  });
}
