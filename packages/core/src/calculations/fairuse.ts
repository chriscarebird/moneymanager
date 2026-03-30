import type { DeGiroMonthlyTradeTracker, MonthlyTrade } from '../types/index.js';

/**
 * DeGiro core selection fair-use policy (per §3.4 of the spec):
 *
 * 1. The FIRST transaction per ISIN per calendar month is always free.
 * 2. SUBSEQUENT transactions in the SAME direction remain free if:
 *    a. Each is ≥ €1,000, AND
 *    b. No opposite-direction or sub-€1,000 transaction has broken the chain.
 * 3. Once the chain is broken (by a sub-€1,000 or opposite-direction trade),
 *    ALL further transactions that month are charged (~€2.00 flat fee).
 */

/** Minimum amount in EUR cents for a subsequent free trade (€1,000). */
export const FREE_CHAIN_MIN_CENTS = 100_000;

/** Standard DeGiro fee when a trade is not free (€2.00 flat). */
export const CHARGED_FEE_CENTS = 200;

/** Status of free-trade availability for one ISIN in one month. */
export interface FairUseStatus {
  isin: string;
  /** YYYY-MM */
  month: string;
  /** Trades executed so far this month */
  executedTradeCount: number;
  /** How many of those were free */
  freeTradesUsed: number;
  /** True if a qualifying next trade (same direction, ≥€1,000) would be free */
  hasFreeTrade: boolean;
  /** Estimated fee for next trade if NOT a qualifying free trade */
  estimatedFeeCents: number;
  /** True if the free-trade chain has been broken this month */
  chainBroken: boolean;
  /**
   * Direction required for any subsequent free trade.
   * Null if no trades have been made (next trade can be any direction).
   */
  requiredDirection: 'buy' | 'sell' | null;
}

/**
 * Evaluate the fair-use state for one ISIN given its recorded trades.
 *
 * Replays all trades in the tracker to determine:
 * - Whether the chain is intact
 * - The direction lock-in from the first trade
 * - Whether the NEXT qualifying trade (same direction, ≥€1,000) would be free
 *
 * @param tracker - Monthly trade tracker for the ISIN
 * @param month - Month to evaluate in YYYY-MM format
 */
export function checkFairUse(tracker: DeGiroMonthlyTradeTracker, month: string): FairUseStatus {
  const trades = tracker.transactions;
  const base: FairUseStatus = {
    isin: tracker.isin,
    month,
    executedTradeCount: trades.length,
    freeTradesUsed: 0,
    hasFreeTrade: true, // no trades yet → first trade is free
    estimatedFeeCents: 0,
    chainBroken: false,
    requiredDirection: null,
  };

  if (trades.length === 0) {
    return base;
  }

  // Replay trades to determine chain state
  let chainBroken = false;
  let freeTradesUsed = 0;
  let firstDirection: 'buy' | 'sell' | null = null;

  for (const trade of trades) {
    if (firstDirection === null) {
      // First trade is always free
      firstDirection = trade.direction;
      freeTradesUsed++;
    } else if (!chainBroken) {
      // Check if this subsequent trade is eligible for free
      const sameDirection = trade.direction === firstDirection;
      const aboveMinimum = trade.amountCents >= FREE_CHAIN_MIN_CENTS;

      if (sameDirection && aboveMinimum) {
        freeTradesUsed++;
      } else {
        // Chain broken — this trade and all subsequent ones are charged
        chainBroken = true;
      }
    }
    // If chain already broken, trade is charged — nothing to update
  }

  // Would the NEXT trade be free?
  // Yes if: chain not broken AND (no trades yet OR same direction AND ≥€1,000)
  // Since we already have trades, "hasFreeTrade" means a same-direction ≥€1,000 trade would be free
  const hasFreeTrade = !chainBroken;

  return {
    isin: tracker.isin,
    month,
    executedTradeCount: trades.length,
    freeTradesUsed,
    hasFreeTrade,
    estimatedFeeCents: chainBroken ? CHARGED_FEE_CENTS : 0,
    chainBroken,
    requiredDirection: firstDirection,
  };
}

/**
 * Determine whether a proposed new trade would be free given current month state.
 *
 * @param status - Result of checkFairUse for this ISIN
 * @param proposedDirection - Direction of the proposed trade
 * @param proposedAmountCents - Amount of the proposed trade in EUR cents
 */
export function wouldBeFree(
  status: FairUseStatus,
  proposedDirection: 'buy' | 'sell',
  proposedAmountCents: number,
): boolean {
  if (status.chainBroken) return false;

  // No prior trades → first trade is always free
  if (status.executedTradeCount === 0) return true;

  // Subsequent trade: must be same direction AND ≥€1,000
  return (
    proposedDirection === status.requiredDirection && proposedAmountCents >= FREE_CHAIN_MIN_CENTS
  );
}

/**
 * Given a list of proposed trades, annotate each with its expected fee.
 *
 * This simulates executing the trades in order and tracks chain breakage
 * across the sequence — useful for planning a rebalancing cycle.
 *
 * @param trades - Proposed trades in execution order
 * @param trackers - Existing monthly trackers for each ISIN
 * @param month - YYYY-MM
 */
export function annotateTradeFees(
  trades: Array<{ isin: string; direction: 'buy' | 'sell'; amountCents: number }>,
  trackers: Map<string, DeGiroMonthlyTradeTracker>,
  month: string,
): Array<{
  isin: string;
  direction: 'buy' | 'sell';
  amountCents: number;
  isFree: boolean;
  feeCents: number;
}> {
  // Build a mutable copy of chain state per ISIN
  const stateByIsin = new Map<
    string,
    { chainBroken: boolean; firstDirection: 'buy' | 'sell' | null; tradeCount: number }
  >();

  // Initialise from existing trackers
  for (const [isin, tracker] of trackers) {
    const status = checkFairUse(tracker, month);
    stateByIsin.set(isin, {
      chainBroken: status.chainBroken,
      firstDirection: status.requiredDirection,
      tradeCount: status.executedTradeCount,
    });
  }

  return trades.map((trade) => {
    const existing = stateByIsin.get(trade.isin) ?? {
      chainBroken: false,
      firstDirection: null,
      tradeCount: 0,
    };

    let isFree: boolean;

    if (existing.chainBroken) {
      isFree = false;
    } else if (existing.tradeCount === 0) {
      // First trade this month — always free
      isFree = true;
      existing.firstDirection = trade.direction;
    } else {
      const sameDir = trade.direction === existing.firstDirection;
      const aboveMin = trade.amountCents >= FREE_CHAIN_MIN_CENTS;
      isFree = sameDir && aboveMin;
      if (!isFree) {
        existing.chainBroken = true;
      }
    }

    existing.tradeCount++;
    stateByIsin.set(trade.isin, existing);

    return {
      ...trade,
      isFree,
      feeCents: isFree ? 0 : CHARGED_FEE_CENTS,
    };
  });
}

/**
 * Order a list of proposed trades to maximise free transactions.
 *
 * Strategy:
 * - Trades for ISINs with no prior activity this month go first (all free)
 * - Trades for ISINs with prior same-direction activity go next (chain intact)
 * - Trades that would break a chain go last (will be charged)
 *
 * @param trades - Proposed trades
 * @param trackers - Existing monthly trackers
 * @param month - YYYY-MM
 */
export function optimiseTradeOrder(
  trades: Array<{ isin: string; direction: 'buy' | 'sell'; amountCents: number }>,
  trackers: Map<string, DeGiroMonthlyTradeTracker>,
  month: string,
): Array<{
  isin: string;
  direction: 'buy' | 'sell';
  amountCents: number;
  isFree: boolean;
  feeCents: number;
}> {
  const statusByIsin = new Map<string, FairUseStatus>();
  for (const [isin, tracker] of trackers) {
    statusByIsin.set(isin, checkFairUse(tracker, month));
  }

  // Score each trade: 0 = free (new ISIN), 1 = free (chain intact), 2 = will break chain
  const scored = trades.map((trade) => {
    const status = statusByIsin.get(trade.isin);
    let score: number;
    if (!status || status.executedTradeCount === 0) {
      score = 0; // First trade, always free
    } else if (
      !status.chainBroken &&
      trade.direction === status.requiredDirection &&
      trade.amountCents >= FREE_CHAIN_MIN_CENTS
    ) {
      score = 1; // Chain intact, qualifying trade
    } else {
      score = 2; // Will be charged or break chain
    }
    return { trade, score };
  });

  const ordered = scored.sort((a, b) => a.score - b.score).map((s) => s.trade);

  return annotateTradeFees(ordered, trackers, month);
}

/**
 * Calculate the total transaction fees for a set of annotated trades.
 */
export function calculateTotalFees(trades: Array<{ feeCents: number }>): number {
  return trades.reduce((sum, t) => sum + t.feeCents, 0);
}

// ── Compatibility helpers for external callers ────────────────────────────────

/**
 * Build an empty MonthlyTrade tracker for an ISIN.
 */
export function emptyTracker(isin: string, month: string): DeGiroMonthlyTradeTracker {
  return { id: `${isin}-${month}`, isin, month, transactions: [] };
}

/**
 * Return a new tracker with an additional trade appended.
 */
export function withTrade(
  tracker: DeGiroMonthlyTradeTracker,
  trade: MonthlyTrade,
): DeGiroMonthlyTradeTracker {
  return { ...tracker, transactions: [...tracker.transactions, trade] };
}
