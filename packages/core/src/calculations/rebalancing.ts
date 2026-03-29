import type { Holding, TargetAllocation } from '../types/index.js';

/**
 * A single rebalancing action to bring portfolio to target allocation.
 */
export interface RebalancingAction {
  etfIsin: string;
  etfName: string;
  action: 'buy' | 'sell' | 'hold';
  /** Current allocation percentage (0–100) */
  currentPct: number;
  /** Target allocation percentage (0–100) */
  targetPct: number;
  /** Drift from target (positive = overweight, negative = underweight) */
  driftPct: number;
  /** Amount to buy/sell in EUR cents (positive = buy, negative = sell) */
  amountEurCents: number;
  /** Number of shares to buy/sell (approximate) */
  sharesDelta: number;
}

/**
 * Full rebalancing recommendation.
 */
export interface RebalancingPlan {
  /** Total portfolio value at time of calculation (EUR cents) */
  totalValueEurCents: number;
  /** Amount available to invest (EUR cents) */
  availableCashEurCents: number;
  actions: RebalancingAction[];
  /** Maximum drift across all positions */
  maxDriftPct: number;
  /** Whether rebalancing is recommended (drift > threshold) */
  rebalancingRecommended: boolean;
}

/**
 * Compute a rebalancing plan to bring the current holdings to the target allocations.
 *
 * Algorithm:
 * 1. Calculate current value per ETF
 * 2. Calculate target value per ETF (total × targetPct)
 * 3. Compute delta (buy/sell amount)
 * 4. If cash available, prioritize buying underweight positions
 * 5. Flag plan as recommended if max drift > driftThresholdPct
 *
 * @param holdings - Current portfolio holdings
 * @param targets - Target allocations
 * @param availableCashEurCents - Cash available to invest (EUR cents)
 * @param driftThresholdPct - Minimum drift to trigger recommendation (e.g. 5)
 * @returns Rebalancing plan
 *
 * @example
 * computeRebalancingPlan(holdings, targets, 100000, 5)
 * // => { rebalancingRecommended: true, actions: [...], maxDriftPct: 8.3 }
 */
export function computeRebalancingPlan(
  holdings: Holding[],
  targets: TargetAllocation[],
  availableCashEurCents: number,
  driftThresholdPct: number,
): RebalancingPlan {
  // TODO Phase 1B: implement full rebalancing algorithm
  void holdings;
  void targets;
  void availableCashEurCents;
  void driftThresholdPct;

  return {
    totalValueEurCents: 0,
    availableCashEurCents,
    actions: [],
    maxDriftPct: 0,
    rebalancingRecommended: false,
  };
}

/**
 * Calculate the current allocation percentages for each ETF.
 *
 * @param holdings - Current holdings
 * @returns Map of ISIN → current allocation %
 *
 * @example
 * getCurrentAllocations([
 *   { isin: 'IE00B3RBWM25', valueCents: 1537500 },
 *   { isin: 'IE00B3XXRP09', valueCents: 284700 },
 * ])
 * // => { 'IE00B3RBWM25': 84.3, 'IE00B3XXRP09': 15.7 }
 */
export function getCurrentAllocations(holdings: Holding[]): Map<string, number> {
  // TODO Phase 1B: implement
  const total = holdings.reduce((sum, h) => sum + h.valueCents, 0);
  if (total === 0) return new Map();

  return new Map(holdings.map((h) => [h.isin, (h.valueCents / total) * 100]));
}
