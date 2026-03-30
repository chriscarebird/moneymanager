import type { Holding, TargetAllocation } from '../types/index.js';

/** A single buy/sell/hold action in a rebalancing plan. */
export interface RebalancingAction {
  etfIsin: string;
  etfName: string;
  action: 'buy' | 'sell' | 'hold';
  /** Current value of this position in EUR cents */
  currentValueEurCents: number;
  /** Target value of this position in EUR cents */
  targetValueEurCents: number;
  /** Current allocation % (0–100) */
  currentPct: number;
  /** Target allocation % (0–100) */
  targetPct: number;
  /** Positive = overweight, negative = underweight */
  driftPct: number;
  /** EUR cents to buy (positive) or sell (negative). Zero for hold. */
  amountEurCents: number;
  /** Whole shares to trade (positive = buy, negative = sell) */
  sharesDelta: number;
  /** Estimated transaction fee in EUR cents */
  estimatedFeeCents: number;
  /** True if this order was skipped because it fell below minimum order size */
  skipped: boolean;
}

/** Complete rebalancing recommendation. */
export interface RebalancingPlan {
  /** Total ETF portfolio value at time of calculation (EUR cents, excl. cash) */
  totalValueEurCents: number;
  /** Cash available to invest (EUR cents) */
  availableCashEurCents: number;
  actions: RebalancingAction[];
  /** Maximum absolute drift across all positions */
  maxDriftPct: number;
  /** True if any position drifts more than driftThresholdPct */
  rebalancingRecommended: boolean;
  /** Total estimated transaction fees for this plan */
  totalFeeCents: number;
  /** Total EUR cents actually being deployed (after rounding to whole shares) */
  totalDeployedEurCents: number;
}

/**
 * Standard DeGiro fee per transaction (~€2.00 flat).
 * Used when a more specific fee is not available.
 */
export const DEGIRO_DEFAULT_FEE_CENTS = 200;

/**
 * Minimum order value as EUR cents.
 * Trades below this are skipped (€2 fee would exceed 1% of a <€200 order).
 */
export const MINIMUM_ORDER_EUR_CENTS = 20_000;

/**
 * Calculate current allocation percentages per ISIN.
 *
 * @returns Map of ISIN → allocation % (0–100)
 */
export function getCurrentAllocations(holdings: Holding[]): Map<string, number> {
  const total = holdings.reduce((sum, h) => sum + h.valueCents, 0);
  if (total === 0) return new Map();
  return new Map(holdings.map((h) => [h.isin, (h.valueCents / total) * 100]));
}

/**
 * Compute a rebalancing plan to bring holdings towards target allocations.
 *
 * Algorithm:
 * 1. Compute total investable = current holdings + available cash
 * 2. For each target, derive target EUR value
 * 3. Determine delta (target − current) per position
 * 4. Prioritise buying underweight positions with new cash; avoid selling
 * 5. Round down to whole shares; skip orders below minimum size
 * 6. If cash is insufficient to fill all underweight positions proportionally,
 *    allocate cash in proportion to each position's percentage shortfall
 *
 * @param holdings - Current ETF holdings (must have priceCents > 0)
 * @param targets - Desired target allocations (active only)
 * @param availableCashEurCents - New cash to invest (EUR cents)
 * @param driftThresholdPct - Trigger rebalancingRecommended if any drift > this
 * @param currentPrices - Optional price overrides per ISIN (EUR cents/share).
 *   Falls back to holding.priceCents. Required for ISINs not in holdings.
 * @param minimumOrderEurCents - Override the default minimum order size
 */
export function computeRebalancingPlan(
  holdings: Holding[],
  targets: TargetAllocation[],
  availableCashEurCents: number,
  driftThresholdPct: number,
  currentPrices?: Map<string, number>,
  minimumOrderEurCents?: number,
): RebalancingPlan {
  const minOrder = minimumOrderEurCents ?? MINIMUM_ORDER_EUR_CENTS;
  const activeTargets = targets.filter((t) => t.active);

  // Index current holdings by ISIN
  const holdingsByIsin = new Map<string, Holding>(holdings.map((h) => [h.isin, h]));

  // Total current portfolio value (holdings only, not cash)
  const currentTotalEurCents = holdings.reduce((sum, h) => sum + h.valueCents, 0);

  // Total investable = current holdings + cash
  const investableEurCents = currentTotalEurCents + availableCashEurCents;

  // Compute drift for all target positions
  const actions: RebalancingAction[] = [];
  let maxDriftPct = 0;

  for (const target of activeTargets) {
    const holding = holdingsByIsin.get(target.etfIsin);
    const currentValue = holding?.valueCents ?? 0;
    const targetValue = Math.round((investableEurCents * target.targetPct) / 100);
    const currentPct = investableEurCents > 0 ? (currentValue / investableEurCents) * 100 : 0;
    const driftPct = currentPct - target.targetPct;

    if (Math.abs(driftPct) > maxDriftPct) {
      maxDriftPct = Math.abs(driftPct);
    }

    actions.push({
      etfIsin: target.etfIsin,
      etfName: target.etfName,
      action: 'hold', // filled in below
      currentValueEurCents: currentValue,
      targetValueEurCents: targetValue,
      currentPct,
      targetPct: target.targetPct,
      driftPct,
      amountEurCents: 0,
      sharesDelta: 0,
      estimatedFeeCents: 0,
      skipped: false,
    });
  }

  // Allocate available cash to underweight positions only (no forced sells)
  // Calculate total shortfall across all underweight positions
  const underweightActions = actions.filter((a) => a.driftPct < 0);
  const totalShortfallEurCents = underweightActions.reduce(
    (sum, a) => sum + (a.targetValueEurCents - a.currentValueEurCents),
    0,
  );

  let remainingCash = availableCashEurCents;

  for (const action of actions) {
    const shortfall = action.targetValueEurCents - action.currentValueEurCents;
    if (shortfall <= 0) {
      // Position is at or above target — hold (no forced sells)
      action.action = 'hold';
      continue;
    }

    // Allocate proportional share of available cash to this shortfall
    const proportion = totalShortfallEurCents > 0 ? shortfall / totalShortfallEurCents : 0;
    const idealBuy = Math.min(
      Math.round(availableCashEurCents * proportion),
      shortfall,
      remainingCash,
    );

    if (idealBuy <= 0) {
      action.action = 'hold';
      continue;
    }

    // Determine share price for this ETF
    const priceOverride = currentPrices?.get(action.etfIsin);
    const holding = holdingsByIsin.get(action.etfIsin);
    const priceCents = priceOverride ?? holding?.priceCents ?? 0;

    if (priceCents <= 0) {
      // No price available — cannot compute shares
      action.action = 'hold';
      action.skipped = true;
      continue;
    }

    // Round DOWN to whole shares
    const shares = Math.floor(idealBuy / priceCents);
    if (shares <= 0) {
      action.action = 'hold';
      action.skipped = true;
      continue;
    }

    const actualBuy = shares * priceCents;

    // Skip if below minimum order size
    if (actualBuy < minOrder) {
      action.action = 'hold';
      action.skipped = true;
      continue;
    }

    action.action = 'buy';
    action.amountEurCents = actualBuy;
    action.sharesDelta = shares;
    action.estimatedFeeCents = DEGIRO_DEFAULT_FEE_CENTS;
    remainingCash -= actualBuy;
  }

  const totalFeeCents = actions.reduce((sum, a) => sum + a.estimatedFeeCents, 0);
  const totalDeployedEurCents = actions.reduce(
    (sum, a) => sum + (a.action === 'buy' ? a.amountEurCents : 0),
    0,
  );

  return {
    totalValueEurCents: currentTotalEurCents,
    availableCashEurCents,
    actions,
    maxDriftPct,
    rebalancingRecommended: maxDriftPct > driftThresholdPct,
    totalFeeCents,
    totalDeployedEurCents,
  };
}
